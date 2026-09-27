import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),upload:vi.fn()}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('../storage',()=>({storagePut:mocks.upload}));
import * as db from '../db';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {trySendDashboardVoice,reconcileDashboardVoice,runDashboardVoiceRecoveryBatch} from './staff-dashboard-voice';
import {readVoiceCompatibility,compatibilityVoiceKey,compatibilityVoiceCustomer,compatibilityAudioDigest} from './staff-voice-compatibility-contract';
import {canDispatchVoiceCompatibility} from './staff-voice-compatibility';
import {sendMerchantWhatsApp} from '../channels/whatsapp/service';
import {purgeCompletedInboundPayloads} from '../messaging/retention';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';

describe.skipIf(!process.env.DATABASE_URL)('voice compatibility account and authority',()=>{
  let f:Awaited<ReturnType<typeof createDisposableMerchant>>,conv:number,legacy:number,instance:number,requestId:string;
  const bytes=Buffer.from('OggSsynthetic-voice'),q=async(sql:string,args:any[]=[])=>((await (await getPool())!.execute<any>(sql,args))[0]);
  const input=()=>({conversationId:conv,requestId,audioBase64:bytes.toString('base64'),mimeType:'audio/ogg' as const,duration:3.125});
  const send=()=>trySendDashboardVoice(f.merchantId,f.userId,input()),accepted=()=>({accepted:true,status:'sent',providerMessageId:`voice-${f.merchantId}`});
  const attempts=()=>q('SELECT * FROM ai_sales_staff_voices WHERE merchant_id=?',[f.merchantId]),messages=()=>q('SELECT * FROM messages WHERE conversationId=?',[conv]);
  const facts=()=>q('SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=?',[f.merchantId]);
  const account=(merchant=f.merchantId)=>q("INSERT INTO whatsapp_connection_requests (merchantId,countryCode,phoneNumber,fullNumber,status,instanceId,apiToken,apiUrl) VALUES (?,'966','500006611','966500006611','connected','710000001','fixture','https://api.green-api.com')",[merchant]);
  beforeEach(async()=>{f=await createDisposableMerchant('compat-voice');requestId=randomUUID();instance=0;
    conv=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500006611')",[f.merchantId])).insertId);legacy=Number((await account()).insertId);
    mocks.send.mockReset().mockResolvedValue(accepted());mocks.upload.mockReset().mockImplementation(async(key:string)=>({key,url:`https://media.example.test/${key}`}));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([f.userId]);});afterAll(closeDb);
  async function group(){await q("UPDATE conversations SET customerPhone='group_120363123' WHERE id=?",[conv]);instance=Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary,api_url) VALUES (?,'720000001','fixture','active',1,'https://api.green-api.com')",[f.merchantId])).insertId);}
  async function onCommit(number:number,action:()=>Promise<unknown>){const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let count=0;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(++count===number)await action();});return c;});}
  async function failSql(fragment:string){const pool=(await getPool())!,connect=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
    const c=await connect(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation(((sql:any,args:any)=>{if(String(sql).includes(fragment))throw Error('synthetic SQL failure');return execute(sql,args);}) as any);return c;});}
  it.each(['legacy','registered-group','legacy-group','group-jid'])('uploads and sends %s once across concurrency and reconnection',async kind=>{
    if(kind==='registered-group'||kind==='group-jid')await group();if(kind==='legacy-group')await q("UPDATE conversations SET customerPhone='group_120363123' WHERE id=?",[conv]);if(kind==='group-jid')await q("UPDATE conversations SET customerPhone='120363123@g.us' WHERE id=?",[conv]);
    await Promise.all(Array.from({length:6},send));await closeDb();expect(await send()).toEqual({success:true,status:'accepted',persisted:true});
    expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();expect(await messages()).toHaveLength(1);expect(await facts()).toEqual([]);
    const [r]=await attempts(),record=readVoiceCompatibility(r);expect(record.intent.version).toBe('staff-voice-compatibility.v2');expect(r.ownership_version).toBeGreaterThan(0);
    expect(JSON.stringify(record.intent)).not.toContain('fixture');expect(JSON.stringify(record.intent)).not.toContain(input().audioBase64);
    expect(mocks.send.mock.calls[0][0]).toMatchObject({instanceId:instance?'720000001':'710000001',token:'fixture'});
    expect((await q('SELECT COUNT(*) AS n FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]))[0].n).toBe(instance?1:0);
  });
  it('reserves ownership before upload and freezes the exact object before WhatsApp',async()=>{
    mocks.upload.mockImplementation(async(key:string,content:Buffer,mime:string)=>{const [r]=await attempts();expect(readVoiceCompatibility(r).basis).toBeNull();expect(r.ownership_version).toBeGreaterThan(0);
      expect((await q('SELECT human_takeover FROM conversations WHERE id=?',[conv]))[0].human_takeover).toBe(1);expect(content).toEqual(bytes);expect(mime).toBe('audio/ogg');return {key,url:`https://media.example.test/${key}`};});
    mocks.send.mockImplementation(async(_config,request)=>{const [r]=await attempts();expect(readVoiceCompatibility(r).basis?.mediaUrlDigest).toBe(hash(request.mediaUrl));expect(request.fileName).toBe('voice-message.ogg');return accepted();});expect(await send()).toMatchObject({success:true});
  });
  it('a second caller cannot upload while the first upload is still pending',async()=>{let release!:()=>void,begin!:()=>void;const begun=new Promise<void>(r=>begin=r),hold=new Promise<void>(r=>release=r);
    mocks.upload.mockImplementation(async(key:string)=>{begin();await hold;return {key,url:`https://media.example.test/${key}`};});const first=send();await begun;
    try{expect(await send()).toMatchObject({success:false,status:'pending'});}finally{release();}expect(await first).toMatchObject({success:true});expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();
  });
  it.each(['actor','phone','ownership','token','expiry','resume','account'])('stops %s drift before upload',async kind=>{await onCommit(1,()=>drift(kind));expect(await send()).toMatchObject({success:false});expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();});
  async function drift(kind:string){
    if(kind==='actor')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[f.merchantId,f.userId]);
    if(kind==='phone')await q("UPDATE conversations SET customerPhone='966500009999' WHERE id=?",[conv]);if(kind==='ownership')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[conv]);
    if(kind==='token')await q("UPDATE whatsapp_connection_requests SET apiToken='rotated' WHERE id=?",[legacy]);if(kind==='expiry')await q("UPDATE conversations SET human_expires_at='2020-01-01' WHERE id=?",[conv]);
    if(kind==='resume')await q('UPDATE conversations SET human_takeover=0 WHERE id=?',[conv]);if(kind==='account')await account();if(kind==='registered')await group();
    if(kind==='suspended')await q("UPDATE merchants SET status='suspended' WHERE id=?",[f.merchantId]);if(kind==='deleted')await q('DELETE FROM conversations WHERE id=?',[conv]);
  }
  it.each(['actor','phone','ownership','token','expiry','resume','account','registered','suspended','deleted'])('stops %s drift during upload',async kind=>{
    mocks.upload.mockImplementation(async(key:string)=>{await drift(kind);return {key,url:`https://media.example.test/${key}`};});expect(await send()).toMatchObject({success:false});expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).not.toHaveBeenCalled();expect((await attempts())[0].basis).toBeNull();
  });
  it.each(['actor','phone','ownership','token'])('stops %s drift after the uploaded basis commits',async kind=>{await onCommit(3,()=>drift(kind));expect(await send()).toMatchObject({success:false});expect((await attempts())[0].basis).not.toBeNull();expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).not.toHaveBeenCalled();});
  it.each(['actor','token','ownership'])('checks %s again after channel credential lookup',async kind=>{await group();const lookup=db.getWhatsAppInstanceById;
    vi.spyOn(db,'getWhatsAppInstanceById').mockImplementation(async id=>{const loaded=await lookup(id);if(kind==='token')await q("UPDATE whatsapp_instances SET token='rotated' WHERE id=?",[instance]);else await drift(kind);return loaded;});
    expect(await send()).toMatchObject({success:false});expect(mocks.send).not.toHaveBeenCalled();expect((await q('SELECT error_code FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]))[0].error_code).toBe('staff_compat_voice_suppressed');
  });
  it.each(['token','inactive','unselected','provider','deleted'])('blocks registered %s change during upload without fallback',async kind=>{await group();mocks.upload.mockImplementation(async(key:string)=>{
    if(kind==='deleted')await q('DELETE FROM whatsapp_instances WHERE id=?',[instance]);else await q('UPDATE whatsapp_instances SET '+({token:"token='rotated'",inactive:"status='inactive',is_primary=0",unselected:'is_primary=0',provider:"provider='meta_cloud'"} as any)[kind]+' WHERE id=?',[instance]);return {key,url:`https://media.example.test/${key}`};});
    expect(await send()).toMatchObject({success:false});expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['throws','wrong-key','unsafe-url','userinfo','fragment'])('does not repeat an uncertain/invalid upload: %s',async kind=>{mocks.upload.mockImplementation(async(key:string)=>{if(kind==='throws')throw Error('unknown storage');return {key:kind==='wrong-key'?'other':key,url:kind==='unsafe-url'?'http://media.example.test/a':kind==='userinfo'?'https://user:pass@media.example.test/a':kind==='fragment'?'https://media.example.test/a#x':'https://media.example.test/a'};});
    expect(await send()).toMatchObject({success:false});await closeDb();expect(await send()).toMatchObject({success:false});expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['throws','unknown','rejected','missing-receipt','bad-receipt','bad-status','invalid-success','contradictory'])('does not resend %s provider result',async kind=>{
    if(kind==='throws')mocks.send.mockRejectedValue(Error('unknown transport'));else mocks.send.mockResolvedValue({...accepted(),accepted:kind==='invalid-success'?'true':kind!=='rejected',status:kind==='bad-status'?'failed':'sent',outcome:kind==='unknown'?'unknown':kind==='contradictory'?'rejected':undefined,providerMessageId:kind==='missing-receipt'?undefined:kind==='bad-receipt'?'<script>':'receipt'});
    expect(await send()).toMatchObject({success:false});await closeDb();await group();expect(await send()).toMatchObject({success:false});expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();expect(await messages()).toEqual([]);
  });
  it.each([1,2,3,4,5])('does not repeat an effect after losing commit acknowledgement %s',async n=>{await onCommit(n,async()=>{throw Error('lost commit');});await send().catch(()=>{});vi.restoreAllMocks();await closeDb();
    expect((await send()).success).toBe(n===5);expect(mocks.upload).toHaveBeenCalledTimes(n>=3?1:0);expect(mocks.send).toHaveBeenCalledTimes(n===5?1:0);
  });
  it('rolls back ownership when intent persistence fails',async()=>{await failSql('UPDATE ai_sales_staff_voices SET intent=');await expect(send()).rejects.toThrow();vi.restoreAllMocks();expect(await attempts()).toEqual([]);
    expect((await q('SELECT human_takeover,handoff_version FROM conversations WHERE id=?',[conv]))[0]).toMatchObject({human_takeover:0,handoff_version:0});expect(mocks.upload).not.toHaveBeenCalled();expect(await send()).toMatchObject({success:true});});
  it('keeps one upload and no send after basis persistence failure',async()=>{await failSql('UPDATE ai_sales_staff_voices SET media_url=');expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();expect(await send()).toMatchObject({success:false});expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).not.toHaveBeenCalled();});
  it.each(['INSERT INTO messages',"SET status='accepted'"])('rolls projection and result back together on %s failure',async fragment=>{mocks.send.mockImplementation(async()=>{await failSql(fragment);return accepted();});
    expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();expect(await messages()).toEqual([]);expect(await send()).toMatchObject({success:false});expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();});
  it.each(['changed','deleted'])('does not project accepted audio on a %s customer',async kind=>{mocks.send.mockImplementation(async()=>{await drift(kind==='changed'?'phone':'deleted');return accepted();});
    expect(await send()).toEqual({success:true,status:'accepted',persisted:false});expect(await send()).toMatchObject({success:true});expect(await messages()).toEqual([]);expect(mocks.send).toHaveBeenCalledOnce();});
  it.each(['intent','basis','url','phone','status','result'])('rejects corrupted %s without repeated effects',async kind=>{await send();
    const sql=({intent:"intent_digest=REPEAT('b',64)",basis:"basis_digest=REPEAT('b',64)",url:"media_url='https://media.example.test/other'",phone:"customer_phone='group_99999999'",status:"status='reserved'",result:"compatibility_result=JSON_SET(compatibility_result,'$.persisted',false)"} as any)[kind];await q('UPDATE ai_sales_staff_voices SET '+sql+' WHERE merchant_id=?',[f.merchantId]);
    await expect(send()).rejects.toThrow();expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();});
  it.each(['audio','duration','conversation'])('rejects changed %s with the same UUID',async kind=>{await send();await expect(trySendDashboardVoice(f.merchantId,f.userId,{...input(),...(kind==='audio'?{audioBase64:Buffer.from('OggSchanged').toString('base64')}:kind==='duration'?{duration:8}:{conversationId:conv+1})})).rejects.toThrow();expect(mocks.send).toHaveBeenCalledOnce();});
  it.each(['missing','rejected','inactive','meta-group','bad-group','unsafe-api','unsafe-token','missing-registered-api'])('rejects %s account before upload and ownership',async kind=>{
    if(kind==='missing')await q('DELETE FROM whatsapp_connection_requests WHERE id=?',[legacy]);if(kind==='rejected')await q("UPDATE whatsapp_connection_requests SET status='rejected' WHERE id=?",[legacy]);
    if(kind==='inactive'){await group();await q("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",[instance]);}if(kind==='meta-group'){await group();await q("UPDATE whatsapp_instances SET provider='meta_cloud' WHERE id=?",[instance]);}
    if(kind==='bad-group')await q("UPDATE conversations SET customerPhone='group_123' WHERE id=?",[conv]);if(kind==='unsafe-api')await q("UPDATE whatsapp_connection_requests SET apiUrl='https://127.0.0.1' WHERE id=?",[legacy]);if(kind==='unsafe-token')await q("UPDATE whatsapp_connection_requests SET apiToken='../x' WHERE id=?",[legacy]);if(kind==='missing-registered-api'){await group();await q('UPDATE whatsapp_instances SET api_url=NULL WHERE id=?',[instance]);}
    await expect(send()).rejects.toThrow();expect(await attempts()).toEqual([]);expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();});
  it('isolates a second authorized employee and tenant with the same request UUID',async()=>{const other=await createDisposableMerchant('voice-compat-other');try{await send();
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[f.merchantId,other.userId]);await expect(trySendDashboardVoice(f.merchantId,other.userId,input())).rejects.toThrow();
    const c=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500006611')",[other.merchantId])).insertId);await account(other.merchantId);mocks.send.mockResolvedValue({...accepted(),providerMessageId:'other-receipt'});
    expect(await trySendDashboardVoice(other.merchantId,other.userId,{...input(),conversationId:c})).toMatchObject({success:true});expect(mocks.upload).toHaveBeenCalledTimes(2);expect(mocks.upload.mock.calls[0][0]).not.toBe(mocks.upload.mock.calls[1][0]);
  }finally{await cleanupDisposableMerchants([other.userId]);}});
  it('never globally looks up a foreign account with the same provider instance ID',async()=>{const other=await createDisposableMerchant('foreign-voice');try{await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,'710000001','foreign-secret','active',1)",[other.merchantId]);
    expect(await send()).toMatchObject({success:true});expect(mocks.send.mock.calls[0][0].token).toBe('fixture');expect((await q('SELECT COUNT(*) AS n FROM whatsapp_message_deliveries WHERE merchant_id=?',[other.merchantId]))[0].n).toBe(0);
  }finally{await cleanupDisposableMerchants([other.userId]);}});
  it.each([null,{success:true,status:'accepted',persisted:false}])('reads historical v1 without uploading or resending: %j',async result=>{
    const intent={version:'staff-voice-compatibility.v1',merchant:f.merchantId,actor:f.userId,conversationId:conv,requestId,audioDigest:compatibilityAudioDigest(bytes),byteLength:bytes.length,mimeType:'audio/ogg',duration:input().duration,customerKey:compatibilityVoiceCustomer(f.merchantId,'966500006611'),scope:'unmeasured_compatibility'};
    await q('INSERT INTO ai_sales_staff_voices (merchant_id,actor_user_id,conversation_id,request_id,instance_id,ownership_version,customer_phone,compatibility,intent,intent_digest,compatibility_result,basis_digest,status,next_reconcile_at) VALUES (?,?,?,?,0,0,?,1,?,?,?,?,?,NULL)',[f.merchantId,f.userId,conv,requestId,'966500006611',JSON.stringify(intent),hash(intent),result?JSON.stringify(result):null,result?hash({intentDigest:hash(intent),result}):null,result?'accepted':'reserved']);
    expect((await send()).success).toBe(!!result);expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();});
  it.each(['reserved','accepted'])('retention preserves unresolved requests and redacts only completed %s',async status=>{await group();if(status==='reserved')mocks.send.mockImplementation(async()=>{await failSql("SET status='accepted'");return accepted();});await send();vi.restoreAllMocks();
    await q("UPDATE whatsapp_message_deliveries SET status_updated_at='2020-01-01' WHERE merchant_id=?",[f.merchantId]);await purgeCompletedInboundPayloads();expect((await q('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]))[0].request_json===null).toBe(status==='accepted');
    expect((await send()).success).toBe(status==='accepted');expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();});
  it('does not schedule recovery or create a measured sales acceptance',async()=>{await send();const [r]=await attempts();await q("UPDATE ai_sales_staff_voices SET created_at='2020-01-01' WHERE id=?",[r.id]);expect(await runDashboardVoiceRecoveryBatch()).toBe(0);await expect(reconcileDashboardVoice(f.merchantId,r.id)).rejects.toThrow();expect(await facts()).toEqual([]);expect(mocks.send).toHaveBeenCalledOnce();});
  it('blocks stripped guards on the original key and on a malformed-key retry',async()=>{await group();mocks.send.mockResolvedValue({accepted:false,status:'failed',outcome:'rejected',errorCode:'http_400'});await send();const [r]=await attempts(),b=readVoiceCompatibility(r).basis!;
    const req={merchantId:f.merchantId,instanceRecordId:instance,idempotencyKey:compatibilityVoiceKey(f.merchantId,r.id),kind:'audio' as const,to:r.customer_phone,mediaUrl:r.media_url,fileName:b.fileName};await sendMerchantWhatsApp({...req,retryFailed:true});expect(mocks.send).toHaveBeenCalledOnce();
    const malformed={...req,idempotencyKey:`invalid-voice-compat:${randomUUID()}`};expect(await sendMerchantWhatsApp({...malformed,staffCompatibilityVoiceGuard:{id:r.id,basisDigest:r.basis_digest}})).toMatchObject({errorCode:'staff_compat_voice_suppressed'});
    expect(await sendMerchantWhatsApp({...malformed,retryFailed:true})).toMatchObject({duplicate:true,errorCode:'staff_compat_voice_suppressed'});expect(mocks.send).toHaveBeenCalledOnce();});
  it.each(['url','name','phone','kind','text','guard','account','mixed'])('rejects %s substitution at the final guard',async kind=>{await group();await onCommit(3,async()=>{throw Error('leave frozen basis');});await send();vi.restoreAllMocks();const [r]=await attempts(),b=readVoiceCompatibility(r).basis!;
    const req:any={merchantId:f.merchantId,instanceRecordId:instance,idempotencyKey:compatibilityVoiceKey(f.merchantId,r.id),kind:'audio',to:r.customer_phone,mediaUrl:r.media_url,fileName:b.fileName,staffCompatibilityVoiceGuard:{id:r.id,basisDigest:r.basis_digest}};
    const config:any={provider:'green_api',instanceId:'720000001',token:'fixture',apiUrl:'https://api.green-api.com',phoneNumberId:null,providerAccountId:null};expect(await canDispatchVoiceCompatibility(req,config)).toBe(true);
    if(kind==='url')req.mediaUrl='https://media.example.test/other';if(kind==='name')req.fileName='other.ogg';if(kind==='phone')req.to='966500009999';if(kind==='kind')req.kind='document';if(kind==='text')req.text='injected';if(kind==='guard')delete req.staffCompatibilityVoiceGuard;if(kind==='account')config.token='rotated';if(kind==='mixed')req.staffCompatibilityGuard={id:r.id,basisDigest:r.basis_digest};
    expect(await canDispatchVoiceCompatibility(req,config)).toBe(false);expect(mocks.send).not.toHaveBeenCalled();});
  it.each(['direction','type','author','content','voice-url','media-url','matching'])('validates existing message %s before reporting persistence',async kind=>{
    mocks.send.mockImplementation(async(_config,req)=>{await q('INSERT INTO messages (conversationId,direction,messageType,sender_type,content,voiceUrl,mediaUrl,externalId) VALUES (?,?,?,?,?,?,?,?)',
      [conv,kind==='direction'?'incoming':'outgoing',kind==='type'?'image':'voice',kind==='author'?'assistant':'merchant',kind==='content'?'different':`[رسالة صوتية — ${Math.round(input().duration)} ثانية]`,
        kind==='voice-url'?'https://media.example.test/other':req.mediaUrl,kind==='media-url'?'https://media.example.test/other':req.mediaUrl,accepted().providerMessageId]);return accepted();});
    expect((await send()).success).toBe(kind==='matching');expect(await messages()).toHaveLength(1);expect((await send()).success).toBe(kind==='matching');expect(mocks.send).toHaveBeenCalledOnce();
  });
  it.each(['actor','suspended','disabled'])('denies saved success after %s authority is revoked',async kind=>{await send();if(kind==='disabled')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[f.userId]);else await drift(kind);await expect(send()).rejects.toThrow();expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();});
  it.each(['reserved','accepted'])('keeps %s history after conversation deletion without recreating effects',async status=>{if(status==='reserved')mocks.send.mockRejectedValue(Error('unknown'));await send();await q('DELETE FROM conversations WHERE id=?',[conv]);expect((await send()).success).toBe(status==='accepted');expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();});
});
