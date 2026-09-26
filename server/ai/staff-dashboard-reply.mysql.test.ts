import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),instance:vi.fn()}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('../db',async original=>({...await original<typeof import('../db')>(),getWhatsAppInstanceById:mocks.instance}));
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {trySendDashboardStaff,reconcileDashboardStaff,runDashboardStaffRecoveryBatch} from './staff-dashboard-reply';
import {readDashboardStaffBasis,readDashboardStaffAcceptance,staffDashboardKey} from './staff-dashboard-reply-contract';
import {sendMerchantWhatsApp} from '../channels/whatsapp/service';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';
import * as readiness from '../db/schema-readiness';
import {purgeCompletedInboundPayloads} from '../messaging/retention';

describe.skipIf(!process.env.DATABASE_URL)('authenticated dashboard staff reply lifecycle',()=>{
  let f:Awaited<ReturnType<typeof createDisposableMerchant>>,conv:number,instance:number,requestId:string;
  const q=async(sql:string,args:any[]=[])=>((await (await getPool())!.execute<any>(sql,args))[0]);
  const input=()=>({conversationId:conv,requestId,message:'العرض يشمل التدريب والمتابعة.'});
  const send=()=>trySendDashboardStaff(f.merchantId,f.userId,input());
  const attempts=()=>q('SELECT * FROM ai_sales_staff_replies WHERE merchant_id=?',[f.merchantId]);
  const facts=()=>q("SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=? AND source_kind='dashboard_text'",[f.merchantId]);
  const messages=()=>q("SELECT * FROM messages WHERE conversationId=? AND direction='outgoing'",[conv]);
  beforeEach(async()=>{
    f=await createDisposableMerchant('dashboard-staff');requestId=randomUUID();
    conv=Number((await q("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500003311','active')",[f.merchantId])).insertId);
    instance=Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)",[f.merchantId,`staff-${f.merchantId}`])).insertId);
    mocks.instance.mockReset().mockResolvedValue({id:instance,merchantId:f.merchantId,status:'active',provider:'green_api',instanceId:`staff-${f.merchantId}`,token:'fixture',apiUrl:'https://api.green-api.com'});
    mocks.send.mockReset().mockResolvedValue({accepted:true,outcome:'accepted',providerMessageId:`staff-receipt-${f.merchantId}`,status:'sent'});
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([f.userId]);});afterAll(closeDb);
  const failSql=async(fragment:string)=>{
    const pool=(await getPool())!,connect=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),execute=c.execute.bind(c);
      vi.spyOn(c,'execute').mockImplementation(((sql:string,args:any[])=>{if(sql.includes(fragment))throw Error('synthetic SQL failure');return execute(sql,args);}) as any);return c;});
  };
  it('freezes authenticated identity before sending and projects one verified acceptance',async()=>{
    mocks.send.mockImplementationOnce(async()=>{
      const b=readDashboardStaffBasis((await attempts())[0]);expect(b.actorUserId).toBe(f.userId);expect(b.authorBasis).toBe('authenticated_submitter');expect(await facts()).toEqual([]);
      return {accepted:true,providerMessageId:`staff-receipt-${f.merchantId}`,status:'sent'};
    });
    expect(await send()).toEqual({success:true,status:'accepted',persisted:true});const s=readDashboardStaffAcceptance((await facts())[0]);
    expect(s.basis.conversationId).toBe(conv);expect((await messages())[0]).toMatchObject({sender_type:'merchant',content:input().message});expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('serializes five callers and keeps the same acceptance after reconnect and repeated request',async()=>{
    await Promise.all(Array.from({length:5},send));const before=await facts();await closeDb();expect(await send()).toMatchObject({success:true});
    expect(await facts()).toEqual(before);expect(await messages()).toHaveLength(1);expect(mocks.send).toHaveBeenCalledOnce();
  });
  it.each(['message','conversationId'])('rejects reuse of the same request ID with changed %s',async field=>{
    await send();await expect(trySendDashboardStaff(f.merchantId,f.userId,{...input(),[field]:field==='message'?'نص آخر':conv+1})).rejects.toThrow();expect(mocks.send).toHaveBeenCalledOnce();
  });
  it.each(['viewer','inactive-member','suspended-merchant','inactive-user','foreign-actor','foreign-conversation'])('rejects persisted authority: %s',async kind=>{
    if(kind==='viewer'||kind==='inactive-member')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',?)",[f.merchantId,f.userId,kind==='viewer'?1:0]);
    if(kind==='suspended-merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[f.merchantId]);
    if(kind==='inactive-user')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[f.userId]);
    await expect(trySendDashboardStaff(f.merchantId,kind==='foreign-actor'?f.userId+100000:f.userId,{...input(),conversationId:kind==='foreign-conversation'?conv+100000:conv})).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();expect(await attempts()).toEqual([]);expect(await facts()).toEqual([]);
  });
  it.each(['owner','manager','sales_supervisor'])('accepts an active persisted %s membership',async role=>{
    await q('INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)',[f.merchantId,f.userId,role]);expect(await send()).toMatchObject({success:true});
  });
  it.each(['token','provider','customer','ownership','actor','inactive'])('suppresses a %s change after the reservation and before provider execution',async kind=>{
    const config=await mocks.instance();mocks.instance.mockImplementationOnce(async()=>{
      if(kind==='token')await q("UPDATE whatsapp_instances SET token='changed' WHERE id=?",[instance]);
      if(kind==='provider')return {...config,provider:'meta_cloud'};
      if(kind==='customer')await q("UPDATE conversations SET customerPhone='966500003399' WHERE id=?",[conv]);
      if(kind==='ownership')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[conv]);
      if(kind==='actor')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[f.merchantId,f.userId]);
      if(kind==='inactive')await q("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",[instance]);return config;
    });
    expect(await send()).toMatchObject({success:false,status:kind==='provider'?'pending':'suppressed'});expect(mocks.send).not.toHaveBeenCalled();expect(await facts()).toEqual([]);
  });
  it.each(['unknown','rejected','no-receipt','throws'])('never confirms or repeats %s transport',async kind=>{
    if(kind==='throws')mocks.send.mockRejectedValue(Error('network lost'));
    else mocks.send.mockResolvedValue(kind==='no-receipt'?{accepted:true,status:'sent'}:{accepted:false,outcome:kind,status:'failed',errorCode:kind==='unknown'?'provider_unreachable':'http_400'});
    expect(await send()).toMatchObject({success:false});await closeDb();expect(await send()).toMatchObject({success:false});
    expect(mocks.send).toHaveBeenCalledOnce();expect(await facts()).toEqual([]);expect(await messages()).toEqual([]);
  });
  it('does not dispatch a stored reservation after the reservation commit acknowledgement is lost',async()=>{
    const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let injected=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(!injected){injected=true;throw Error('lost commit');}});return c;});
    await expect(send()).rejects.toThrow('lost commit');vi.restoreAllMocks();expect(await attempts()).toHaveLength(1);
    expect(await send()).toMatchObject({status:'pending'});expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['INSERT INTO ai_sales_staff_acceptances','INSERT INTO messages'])('recovers %s failure without another send or backdated acceptance',async fragment=>{
    await failSql(fragment);expect(await send()).toMatchObject({success:false,status:'pending'});vi.restoreAllMocks();expect(await facts()).toEqual([]);
    const [r]=await attempts();await q("UPDATE ai_sales_staff_replies SET created_at='2020-01-01 00:00:00',next_reconcile_at=UTC_TIMESTAMP() WHERE id=?",[r.id]);
    expect(await runDashboardStaffRecoveryBatch()).toBeGreaterThan(0);const s=readDashboardStaffAcceptance((await facts())[0]);
    expect(Date.parse(s.acceptanceObservedAt)).toBeGreaterThan(Date.parse('2026-01-01'));expect(await messages()).toHaveLength(1);expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('preserves one acceptance after losing its commit acknowledgement',async()=>{
    mocks.send.mockImplementationOnce(async()=>{const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let lost=false;
      vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(!lost){lost=true;throw Error('lost acceptance ack');}});return c;});
      return {accepted:true,providerMessageId:`staff-receipt-${f.merchantId}`,status:'sent'};});
    await send();vi.restoreAllMocks();const before=await facts();expect(before).toHaveLength(1);await send();expect(await facts()).toEqual(before);expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('does not resend rejected staff requests through the transport retryFailed escape hatch',async()=>{
    mocks.send.mockResolvedValue({accepted:false,outcome:'rejected',status:'failed',errorCode:'http_400'});await send();const [r]=await attempts();
    await sendMerchantWhatsApp({merchantId:f.merchantId,instanceRecordId:instance,kind:'text',to:r.customer_phone,text:r.reply_text,
      idempotencyKey:staffDashboardKey(f.merchantId,r.id),staffReplyGuard:{id:r.id,basisDigest:r.basis_digest},retryFailed:true});expect(mocks.send).toHaveBeenCalledOnce();
  });
  it.each(['basis','actor','request','text','receipt','fact','removed-fact'])('refuses corrupted %s evidence without replacing acceptance',async kind=>{
    await send();const before=await facts(),[r]=await attempts();
    if(kind==='basis')await q("UPDATE ai_sales_staff_replies SET basis_digest=REPEAT('b',64) WHERE id=?",[r.id]);
    if(kind==='actor')await q('UPDATE ai_sales_staff_replies SET actor_user_id=actor_user_id+1 WHERE id=?',[r.id]);
    if(kind==='request')await q('UPDATE ai_sales_staff_replies SET request_id=? WHERE id=?',[randomUUID(),r.id]);
    if(kind==='text')await q("UPDATE ai_sales_staff_replies SET reply_text='forged' WHERE id=?",[r.id]);
    if(kind==='receipt')await q("UPDATE whatsapp_message_deliveries SET provider_message_id='changed-receipt' WHERE merchant_id=?",[f.merchantId]);
    if(kind==='fact')await q("UPDATE ai_sales_staff_acceptances SET acceptance_digest=REPEAT('b',64) WHERE merchant_id=?",[f.merchantId]);
    if(kind==='removed-fact')await q('DELETE FROM ai_sales_staff_acceptances WHERE merchant_id=?',[f.merchantId]);
    await expect(reconcileDashboardStaff(f.merchantId,r.id)).rejects.toThrow();if(!['fact','removed-fact'].includes(kind))expect(await facts()).toEqual(before);expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('keeps acceptance through credential rotation, delivery failure and source deletion',async()=>{
    await send();const before=await facts(),[r]=await attempts();await q("UPDATE whatsapp_instances SET token='rotated' WHERE id=?",[instance]);
    await q("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",[f.merchantId]);await send();expect(await facts()).toEqual(before);
    await q('DELETE FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]);await q('DELETE FROM conversations WHERE id=?',[conv]);
    expect(await send()).toMatchObject({success:true});expect(await facts()).toEqual(before);expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('records the original customer without projecting onto a changed conversation after transport',async()=>{
    mocks.send.mockImplementationOnce(async()=>{await q("UPDATE conversations SET customerPhone='966500003399' WHERE id=?",[conv]);return {accepted:true,status:'sent',providerMessageId:`staff-receipt-${f.merchantId}`};});
    expect(await send()).toEqual({success:true,status:'accepted',persisted:false});expect(await facts()).toHaveLength(1);expect(await messages()).toEqual([]);
  });
  it.each(['group','legacy'])('preserves the explicit unmeasured %s compatibility path',async kind=>{
    if(kind==='group')await q("UPDATE conversations SET customerPhone='group_120363123' WHERE id=?",[conv]);else await q('DELETE FROM whatsapp_instances WHERE id=?',[instance]);
    expect(await send()).toBeNull();expect(await attempts()).toEqual([]);expect(mocks.send).not.toHaveBeenCalled();
  });
  it('missing schema prevents ownership changes and provider calls',async()=>{
    vi.spyOn(readiness,'assertRuntimeSchema').mockRejectedValueOnce(Error('missing schema'));await expect(send()).rejects.toThrow('missing schema');
    expect((await q('SELECT human_takeover FROM conversations WHERE id=?',[conv]))[0].human_takeover).toBe(0);expect(mocks.send).not.toHaveBeenCalled();
  });
  it('an inactive or unselected registered account cannot fall back to legacy credentials',async()=>{
    await q("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",[instance]);await expect(send()).rejects.toThrow();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('another authorized employee cannot replay a colleague request or obtain its receipt',async()=>{
    const other=await createDisposableMerchant('other-staff');try{
      await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[f.merchantId,other.userId]);await send();
      await expect(trySendDashboardStaff(f.merchantId,other.userId,input())).rejects.toThrow();expect(mocks.send).toHaveBeenCalledOnce();
    }finally{await cleanupDisposableMerchants([other.userId]);}
  });
  it('basis storage failure rolls the reservation and ownership back together',async()=>{
    await failSql('SET basis=');await expect(send()).rejects.toThrow();vi.restoreAllMocks();expect(await attempts()).toEqual([]);
    expect((await q('SELECT human_takeover FROM conversations WHERE id=?',[conv]))[0].human_takeover).toBe(0);expect(mocks.send).not.toHaveBeenCalled();
  });
  it('retention preserves unreconciled payloads and accepted retries survive later payload redaction',async()=>{
    await failSql('INSERT INTO messages');await send();vi.restoreAllMocks();
    await q('UPDATE whatsapp_message_deliveries SET status_updated_at=TIMESTAMPADD(DAY,-31,UTC_TIMESTAMP()) WHERE merchant_id=?',[f.merchantId]);
    await purgeCompletedInboundPayloads();expect((await q('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]))[0].request_json).not.toBeNull();
    expect(await send()).toMatchObject({success:true});const before=await facts();await purgeCompletedInboundPayloads();
    expect((await q('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]))[0].request_json).toBeNull();
    expect(await send()).toMatchObject({success:true});expect(await facts()).toEqual(before);expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('bounds and claims recovery work without dispatching unattempted reservations',async()=>{
    await send();const [r]=await attempts(),b=readDashboardStaffBasis(r);
    for(let i=0;i<21;i++){
      const request=randomUUID(),[saved]=await (await getPool())!.execute<any>(`INSERT INTO ai_sales_staff_replies
        (merchant_id,actor_user_id,conversation_id,request_id,instance_id,ownership_version,customer_phone,reply_text,created_at,next_reconcile_at)
        VALUES (?,?,?,?,?,?,?,?,'2020-01-01',UTC_TIMESTAMP())`,[f.merchantId,f.userId,conv,request,instance,b.ownershipVersion,r.customer_phone,r.reply_text]);
      const basis={...b,sourceId:saved.insertId,requestId:request};await q('UPDATE ai_sales_staff_replies SET basis=?,basis_digest=? WHERE id=?',[JSON.stringify(basis),hash(basis),saved.insertId]);
    }
    mocks.send.mockClear();expect(await runDashboardStaffRecoveryBatch()).toBe(20);expect(await runDashboardStaffRecoveryBatch()).toBe(1);expect(await runDashboardStaffRecoveryBatch()).toBe(0);expect(mocks.send).not.toHaveBeenCalled();
  });
});
