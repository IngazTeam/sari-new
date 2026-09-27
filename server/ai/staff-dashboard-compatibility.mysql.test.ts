import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const provider=vi.hoisted(()=>vi.fn());
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:provider})}));
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {trySendDashboardStaff,reconcileDashboardStaff,runDashboardStaffRecoveryBatch} from './staff-dashboard-reply';
import {readStaffTextCompatibility,staffCompatibilityCustomer} from './staff-dashboard-compatibility';
import {staffCompatibilityKey,canDispatchStaffCompatibility} from './staff-compatibility-authority';
import {sendMerchantWhatsApp} from '../channels/whatsapp/service';
import * as db from '../db';
import {purgeCompletedInboundPayloads} from '../messaging/retention';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';

describe.skipIf(!process.env.DATABASE_URL)('pinned compatibility text transport',()=>{
  let f:Awaited<ReturnType<typeof createDisposableMerchant>>,conv:number,legacyId:number,instance:number,requestId:string;
  const q=async(sql:string,args:any[]=[])=>((await (await getPool())!.execute<any>(sql,args))[0]);
  const input=()=>({conversationId:conv,requestId,message:'عرض تجريبي واضح'}),send=()=>trySendDashboardStaff(f.merchantId,f.userId,input());
  const attempts=()=>q('SELECT * FROM ai_sales_staff_replies WHERE merchant_id=?',[f.merchantId]);
  const facts=()=>q('SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=?',[f.merchantId]);
  const messages=()=>q('SELECT * FROM messages WHERE conversationId=?',[conv]);
  const accepted=()=>({accepted:true,status:'sent',providerMessageId:`receipt-${f.merchantId}`});
  const account=(merchant=f.merchantId)=>q("INSERT INTO whatsapp_connection_requests (merchantId,countryCode,phoneNumber,fullNumber,status,instanceId,apiToken,apiUrl) VALUES (?,'966','500006611','966500006611','connected','710000001','fixture','https://api.green-api.com')",[merchant]);
  beforeEach(async()=>{f=await createDisposableMerchant('text-authority');requestId=randomUUID();instance=0;
    conv=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500006611')",[f.merchantId])).insertId);legacyId=Number((await account()).insertId);
    provider.mockReset().mockResolvedValue(accepted());
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([f.userId]);});afterAll(closeDb);
  async function group(){await q("UPDATE conversations SET customerPhone='group_120363123' WHERE id=?",[conv]);instance=Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary,api_url) VALUES (?,'720000001','fixture','active',1,'https://api.green-api.com')",[f.merchantId])).insertId);}
  async function afterReservation(action:()=>Promise<unknown>){const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let done=false;vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
    const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(!done){done=true;await action();}});return c;
  });}
  async function failSql(fragment:string){const pool=(await getPool())!,connect=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
    const c=await connect(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation(((sql:any,args:any)=>{if(String(sql).includes(fragment))throw Error('synthetic SQL failure');return execute(sql,args);}) as any);return c;
  });}
  it.each(['legacy','registered-group','legacy-group','group-jid'])('executes one %s transport across concurrency and a new pool',async kind=>{
    if(kind==='registered-group'||kind==='group-jid')await group();if(kind==='legacy-group')await q("UPDATE conversations SET customerPhone='group_120363123' WHERE id=?",[conv]);
    if(kind==='group-jid')await q("UPDATE conversations SET customerPhone='120363123@g.us' WHERE id=?",[conv]);
    await Promise.all(Array.from({length:8},send));await closeDb();expect(await send()).toEqual({success:true,status:'accepted',persisted:true});
    expect(provider).toHaveBeenCalledOnce();expect(await messages()).toHaveLength(1);const [r]=await attempts(),b=readStaffTextCompatibility(r);
    expect(b.version).toBe('staff-text-compatibility.v2');expect(b.ownershipVersion).toBeGreaterThan(0);expect(await facts()).toEqual([]);
    expect(provider.mock.calls[0][0]).toMatchObject({instanceId:instance?'720000001':'710000001',provider:'green_api'});expect(JSON.stringify(b)).not.toContain('fixture');
    expect((await q('SELECT COUNT(*) AS n FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]))[0].n).toBe(instance?1:0);
  });
  it('stores ownership before transport while concurrent callers stay pending',async()=>{
    let release!:()=>void,start!:()=>void;const begun=new Promise<void>(r=>start=r),held=new Promise<void>(r=>release=r);
    provider.mockImplementation(async()=>{expect((await attempts())[0].status).toBe('reserved');expect((await q('SELECT human_takeover FROM conversations WHERE id=?',[conv]))[0].human_takeover).toBe(1);start();await held;return accepted();});
    const first=send();await begun;try{expect(await send()).toMatchObject({success:false,status:'pending'});}finally{release();}expect(await first).toMatchObject({success:true});expect(provider).toHaveBeenCalledOnce();
  });
  it.each(['throws','rejected','unknown','no-receipt','bad-receipt','invalid-success','bad-status'])('never repeats %s after reconnect or registration',async kind=>{
    if(kind==='throws')provider.mockRejectedValue(Error('unknown'));else provider.mockResolvedValue({...accepted(),status:kind==='bad-status'?'failed':'sent',accepted:kind==='invalid-success'?'true':kind!=='rejected',outcome:kind==='unknown'?'unknown':undefined,providerMessageId:kind==='no-receipt'?undefined:kind==='bad-receipt'?'<script>':'receipt'});
    expect(await send()).toMatchObject({success:false,status:'pending'});await closeDb();await group();expect(await send()).toMatchObject({success:false,status:'pending'});
    expect(provider).toHaveBeenCalledOnce();expect(await facts()).toEqual([]);expect(await messages()).toEqual([]);
  });
  it.each(['message','conversationId'])('rejects changed %s under the same UUID',async field=>{await send();await expect(trySendDashboardStaff(f.merchantId,f.userId,{...input(),[field]:field==='message'?'مختلف':conv+1})).rejects.toThrow();expect(provider).toHaveBeenCalledOnce();});
  it.each(['reserved','accepted'])('retains %s history after destination change and deletion',async status=>{if(status==='reserved')provider.mockRejectedValue(Error('unknown'));await send();
    await q("UPDATE conversations SET customerPhone='group_99999999' WHERE id=?",[conv]);await send();await q('DELETE FROM conversations WHERE id=?',[conv]);expect((await send()).success).toBe(status==='accepted');expect(provider).toHaveBeenCalledOnce();});
  it.each(['basis','status','phone','reply','result','authority'])('rejects corrupted %s without redispatch',async field=>{
    await send();const [r]=await attempts(),sql=field==='basis'?"basis_digest=REPEAT('b',64)":field==='status'?"status='reserved'":field==='phone'?"customer_phone='group_99999999'":field==='reply'?"reply_text='changed'":field==='result'?"basis=JSON_SET(basis,'$.result.persisted',false)":"basis=JSON_SET(basis,'$.authority.recordId',999)";
    await q('UPDATE ai_sales_staff_replies SET '+sql+' WHERE id=?',[r.id]);await expect(send()).rejects.toThrow();expect(provider).toHaveBeenCalledOnce();
  });
  it('rolls ownership and reservation back on basis failure',async()=>{await failSql('SET basis=');await expect(send()).rejects.toThrow();vi.restoreAllMocks();expect(await attempts()).toEqual([]);
    expect((await q('SELECT human_takeover,handoff_version FROM conversations WHERE id=?',[conv]))[0]).toMatchObject({human_takeover:0,handoff_version:0});expect(provider).not.toHaveBeenCalled();expect(await send()).toMatchObject({success:true});});
  it.each(['reservation','result'])('survives a lost %s commit acknowledgement',async phase=>{
    const inject=()=>afterReservation(async()=>{throw Error('lost commit acknowledgement');});if(phase==='reservation')await inject();else provider.mockImplementation(async()=>{await inject();return accepted();});
    await send().catch(()=>{});vi.restoreAllMocks();await closeDb();expect((await send()).success).toBe(phase==='result');expect(provider).toHaveBeenCalledTimes(phase==='result'?1:0);
  });
  it.each(['INSERT INTO messages',"SET status='accepted'"])('does not repeat after SQL failure at %s',async fragment=>{provider.mockImplementation(async()=>{await failSql(fragment);return accepted();});
    expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();expect(await send()).toMatchObject({status:'pending'});expect(provider).toHaveBeenCalledOnce();expect(await messages()).toEqual([]);});
  it('isolates another authorized employee and equal UUIDs across tenants',async()=>{const other=await createDisposableMerchant('authority-other');try{await send();
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[f.merchantId,other.userId]);await expect(trySendDashboardStaff(f.merchantId,other.userId,input())).rejects.toThrow();
    const c=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500006611')",[other.merchantId])).insertId);await account(other.merchantId);
    provider.mockResolvedValue({...accepted(),providerMessageId:'other-receipt'});expect(await trySendDashboardStaff(other.merchantId,other.userId,{...input(),conversationId:c})).toMatchObject({success:true});expect(provider).toHaveBeenCalledTimes(2);
  }finally{await cleanupDisposableMerchants([other.userId]);}});
  it.each(['revoked','suspended','disabled'])('denies %s authority even for saved success',async kind=>{await send();
    if(kind==='revoked')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[f.merchantId,f.userId]);
    if(kind==='suspended')await q("UPDATE merchants SET status='suspended' WHERE id=?",[f.merchantId]);if(kind==='disabled')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[f.userId]);
    await expect(send()).rejects.toThrow();expect(provider).toHaveBeenCalledOnce();});
  it.each(['legacy','registered'])('suppresses rotated %s credentials after reservation',async source=>{
    if(source==='registered')await group();await afterReservation(async()=>source==='legacy'?q("UPDATE whatsapp_connection_requests SET apiToken='rotated' WHERE id=?",[legacyId]):q("UPDATE whatsapp_instances SET token='rotated' WHERE id=?",[instance]));
    expect(await send()).toMatchObject({success:false});expect(provider).not.toHaveBeenCalled();vi.restoreAllMocks();expect(await send()).toMatchObject({success:false});
  });
  it.each(['phone','ownership','resume','expiry','actor','merchant','latest-legacy','register-account','legacy-id','legacy-url','legacy-rejected','legacy-delete'])('suppresses %s drift before dispatch',async kind=>{
    await afterReservation(async()=>{
      if(kind==='phone')await q("UPDATE conversations SET customerPhone='966500006699' WHERE id=?",[conv]);if(kind==='ownership')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[conv]);
      if(kind==='resume')await q('UPDATE conversations SET human_takeover=0 WHERE id=?',[conv]);if(kind==='expiry')await q("UPDATE conversations SET human_expires_at='2020-01-01' WHERE id=?",[conv]);
      if(kind==='actor')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[f.merchantId,f.userId]);if(kind==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[f.merchantId]);
      if(kind==='latest-legacy')await account();if(kind==='register-account')await group();if(kind==='legacy-id')await q("UPDATE whatsapp_connection_requests SET instanceId='710000009' WHERE id=?",[legacyId]);
      if(kind==='legacy-url')await q("UPDATE whatsapp_connection_requests SET apiUrl='https://api.greenapi.com' WHERE id=?",[legacyId]);if(kind==='legacy-rejected')await q("UPDATE whatsapp_connection_requests SET status='rejected' WHERE id=?",[legacyId]);if(kind==='legacy-delete')await q('DELETE FROM whatsapp_connection_requests WHERE id=?',[legacyId]);
    });expect(await send()).toMatchObject({success:false});expect(provider).not.toHaveBeenCalled();expect(await messages()).toEqual([]);
  });
  it.each(['inactive','unselected','provider','instance','url','deleted'])('never falls back when a registered account becomes %s',async kind=>{await group();await afterReservation(async()=>{
    if(kind==='deleted')await q('DELETE FROM whatsapp_instances WHERE id=?',[instance]);else await q('UPDATE whatsapp_instances SET '+({inactive:"status='inactive',is_primary=0",unselected:'is_primary=0',provider:"provider='meta_cloud'",instance:"instance_id='720000099'",url:"api_url='https://api.greenapi.com'"} as any)[kind]+' WHERE id=?',[instance]);
  });expect(await send()).toMatchObject({success:false});expect(provider).not.toHaveBeenCalled();});
  it.each(['http://api.green-api.com','https://127.0.0.1','https://api.green-api.com:444','https://api.green-api.com/extra','https://api.green-api.com?token=x'])('rejects API origin %s before ownership',async url=>{await q('UPDATE whatsapp_connection_requests SET apiUrl=? WHERE id=?',[url,legacyId]);await expect(send()).rejects.toThrow();expect(await attempts()).toEqual([]);expect(provider).not.toHaveBeenCalled();});
  it.each(['missing','pending','rejected','inactive-registered','meta-group','malformed-group','missing-registered-api'])('rejects %s configuration before transport',async kind=>{
    if(kind==='missing')await q('DELETE FROM whatsapp_connection_requests WHERE id=?',[legacyId]);if(kind==='pending'||kind==='rejected')await q('UPDATE whatsapp_connection_requests SET status=? WHERE id=?',[kind,legacyId]);
    if(kind==='missing-registered-api'){await group();await q('UPDATE whatsapp_instances SET api_url=NULL WHERE id=?',[instance]);}
    if(kind==='inactive-registered'){await group();await q("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",[instance]);}if(kind==='meta-group'){await group();await q("UPDATE whatsapp_instances SET provider='meta_cloud',phone_number_id='123' WHERE id=?",[instance]);}if(kind==='malformed-group')await q("UPDATE conversations SET customerPhone='group_123' WHERE id=?",[conv]);
    await expect(send()).rejects.toThrow();expect(provider).not.toHaveBeenCalled();expect(await attempts()).toEqual([]);
  });
  it.each(['changed','deleted'])('does not project accepted text onto a %s conversation',async kind=>{provider.mockImplementation(async()=>{await q(kind==='deleted'?'DELETE FROM conversations WHERE id=?':"UPDATE conversations SET customerPhone='966500009999' WHERE id=?",[conv]);return accepted();});
    expect(await send()).toEqual({success:true,status:'accepted',persisted:false});expect(await messages()).toEqual([]);expect(await send()).toMatchObject({success:true});expect(provider).toHaveBeenCalledOnce();});
  it('never upgrades or redispatches v1 pending and accepted history',async()=>{for(const result of [null,{success:true,status:'accepted',persisted:false}]){
    requestId=randomUUID();const row=await q("INSERT INTO ai_sales_staff_replies (merchant_id,actor_user_id,conversation_id,request_id,instance_id,ownership_version,customer_phone,reply_text,next_reconcile_at,status) VALUES (?,?,?,?,0,0,'966500006611',?,NULL,?)",[f.merchantId,f.userId,conv,requestId,input().message,result?'accepted':'reserved']);
    const b={version:'staff-text-compatibility.v1',sourceId:row.insertId,merchantId:f.merchantId,actorUserId:f.userId,conversationId:conv,requestId,ownershipVersion:0,customerKey:staffCompatibilityCustomer(f.merchantId,'966500006611'),replyDigest:hash(input().message),scope:'unmeasured_compatibility',result};
    await q('UPDATE ai_sales_staff_replies SET basis=?,basis_digest=? WHERE id=?',[JSON.stringify(b),hash(b),row.insertId]);expect((await send()).success).toBe(!!result);
  }expect(provider).not.toHaveBeenCalled();});
  it('does not create verified acceptance or scheduled recovery',async()=>{await send();const [r]=await attempts();await q("UPDATE ai_sales_staff_replies SET created_at='2020-01-01' WHERE id=?",[r.id]);expect(await runDashboardStaffRecoveryBatch()).toBe(0);await expect(reconcileDashboardStaff(f.merchantId,r.id)).rejects.toThrow();expect(await facts()).toEqual([]);expect(provider).toHaveBeenCalledOnce();});
  it('never looks up another merchant by the legacy provider instance ID',async()=>{const other=await createDisposableMerchant('foreign-instance');try{await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,'710000001','foreign-secret','active',1)",[other.merchantId]);
    expect(await send()).toMatchObject({success:true});expect(provider.mock.calls[0][0].token).toBe('fixture');expect((await q('SELECT COUNT(*) AS n FROM whatsapp_message_deliveries WHERE merchant_id=?',[other.merchantId]))[0].n).toBe(0);
  }finally{await cleanupDisposableMerchants([other.userId]);}});
  it('blocks removing a durable guard to retry a rejected request',async()=>{await group();provider.mockResolvedValue({accepted:false,status:'failed',outcome:'rejected',errorCode:'http_400'});await send();const [r]=await attempts();
    await sendMerchantWhatsApp({merchantId:f.merchantId,instanceRecordId:instance,idempotencyKey:staffCompatibilityKey(f.merchantId,r.id),kind:'text',to:r.customer_phone,text:r.reply_text,retryFailed:true});expect(provider).toHaveBeenCalledOnce();
    const request={merchantId:f.merchantId,instanceRecordId:instance,idempotencyKey:`invalid-compat:${randomUUID()}`,kind:'text' as const,to:r.customer_phone,text:r.reply_text};
    expect(await sendMerchantWhatsApp({...request,staffCompatibilityGuard:{id:r.id,basisDigest:r.basis_digest}})).toMatchObject({errorCode:'staff_compatibility_suppressed'});
    expect(await sendMerchantWhatsApp({...request,retryFailed:true})).toMatchObject({duplicate:true,errorCode:'staff_compatibility_suppressed'});expect(provider).toHaveBeenCalledOnce();
  });
  it.each(['text','phone','kind','guard','account','other-guard'])('rejects %s substitution at the channel guard',async kind=>{await group();await afterReservation(async()=>{throw Error('keep reservation');});await send().catch(()=>{});vi.restoreAllMocks();const [r]=await attempts();
    const request:any={merchantId:f.merchantId,instanceRecordId:instance,idempotencyKey:staffCompatibilityKey(f.merchantId,r.id),kind:'text',to:r.customer_phone,text:r.reply_text,staffCompatibilityGuard:{id:r.id,basisDigest:r.basis_digest}},config:any={provider:'green_api',instanceId:'720000001',token:'fixture',apiUrl:'https://api.green-api.com',phoneNumberId:null,providerAccountId:null};
    expect(await canDispatchStaffCompatibility(request,config)).toBe(true);if(kind==='text')request.text='changed';if(kind==='phone')request.to='966500009999';if(kind==='kind')request.kind='audio';if(kind==='guard')delete request.staffCompatibilityGuard;if(kind==='account')config.token='other';if(kind==='other-guard')request.staffReplyGuard={id:r.id,basisDigest:r.basis_digest};
    expect(await canDispatchStaffCompatibility(request,config)).toBe(false);expect(provider).not.toHaveBeenCalled();
  });
  it.each(['actor','token','ownership'])('suppresses %s drift after the channel loads credentials',async kind=>{
    await group();const lookup=db.getWhatsAppInstanceById;
    vi.spyOn(db,'getWhatsAppInstanceById').mockImplementation(async id=>{const loaded=await lookup(id);
      if(kind==='actor')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[f.merchantId,f.userId]);
      if(kind==='token')await q("UPDATE whatsapp_instances SET token='rotated' WHERE id=?",[instance]);
      if(kind==='ownership')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[conv]);return loaded;
    });
    expect(await send()).toMatchObject({success:false,status:'pending'});expect(provider).not.toHaveBeenCalled();
    expect((await q('SELECT status,error_code FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]))[0]).toMatchObject({status:'failed',error_code:'staff_compatibility_suppressed'});
  });
  it.each(['reserved','accepted'])('retention preserves unresolved evidence and redacts %s only when complete',async status=>{
    await group();if(status==='reserved')provider.mockImplementation(async()=>{await failSql("SET status='accepted'");return accepted();});await send();vi.restoreAllMocks();
    await q("UPDATE whatsapp_message_deliveries SET status_updated_at='2020-01-01' WHERE merchant_id=?",[f.merchantId]);await purgeCompletedInboundPayloads();
    const [d]=await q('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]);expect(d.request_json===null).toBe(status==='accepted');
    expect((await send()).success).toBe(true);expect(provider).toHaveBeenCalledOnce();
  });
  it.each(['../x','..\\x','%2fpath','token?x','token#x','token\n'])('rejects unsafe token %j before ownership or network',async token=>{
    await q('UPDATE whatsapp_connection_requests SET apiToken=? WHERE id=?',[token,legacyId]);await expect(send()).rejects.toThrow();expect(await attempts()).toEqual([]);expect(provider).not.toHaveBeenCalled();
  });
  it.each(['direction','messageType','sender_type','content','matching'])('validates an existing %s message before saving the compatibility result',async field=>{
    provider.mockImplementation(async()=>{const msg:any={direction:'outgoing',messageType:'text',sender_type:'merchant',content:input().message};
      if(field==='direction')msg.direction='incoming';if(field==='messageType')msg.messageType='image';if(field==='sender_type')msg.sender_type='assistant';if(field==='content')msg.content='different';
      await q('INSERT INTO messages (conversationId,direction,messageType,sender_type,content,externalId) VALUES (?,?,?,?,?,?)',[conv,msg.direction,msg.messageType,msg.sender_type,msg.content,accepted().providerMessageId]);return accepted();
    });expect((await send()).success).toBe(field==='matching');expect(await messages()).toHaveLength(1);expect((await send()).success).toBe(field==='matching');expect(provider).toHaveBeenCalledOnce();
  });
});
