import {randomUUID,createHash} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),instance:vi.fn(),upload:vi.fn()}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('../storage',()=>({storagePut:mocks.upload}));
vi.mock('../db',async original=>({...await original<typeof import('../db')>(),getWhatsAppInstanceById:mocks.instance}));
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {trySendDashboardVoice,reconcileDashboardVoice,runDashboardVoiceRecoveryBatch} from './staff-dashboard-voice';
import {readStaffVoiceIntent,readStaffVoiceBasis,readStaffVoiceAcceptance,staffVoiceKey} from './staff-dashboard-voice-contract';
import {sendMerchantWhatsApp} from '../channels/whatsapp/service';
import {purgeCompletedInboundPayloads} from '../messaging/retention';
import * as readiness from '../db/schema-readiness';
describe.skipIf(!process.env.DATABASE_URL)('dashboard voice durable lifecycle',()=>{
  let f:Awaited<ReturnType<typeof createDisposableMerchant>>,conv:number,instance:number,requestId:string;
  const bytes=Buffer.from('OggSsynthetic-voice'),audioBase64=bytes.toString('base64');
  const q=async(sql:string,args:any[]=[])=>((await (await getPool())!.execute<any>(sql,args))[0]);
  const input=()=>({conversationId:conv,requestId,audioBase64,mimeType:'audio/ogg' as const,duration:3.125});
  const send=()=>trySendDashboardVoice(f.merchantId,f.userId,input());
  const attempts=()=>q('SELECT * FROM ai_sales_staff_voices WHERE merchant_id=?',[f.merchantId]);
  const facts=()=>q("SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=? AND source_kind='dashboard_voice'",[f.merchantId]);
  const messages=()=>q('SELECT * FROM messages WHERE conversationId=?',[conv]);
  beforeEach(async()=>{
    f=await createDisposableMerchant('dashboard-voice');requestId=randomUUID();
    conv=Number((await q("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500003311','active')",[f.merchantId])).insertId);
    instance=Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)",[f.merchantId,`voice-${f.merchantId}`])).insertId);
    mocks.instance.mockReset().mockResolvedValue({id:instance,merchantId:f.merchantId,status:'active',provider:'green_api',instanceId:`voice-${f.merchantId}`,token:'fixture',apiUrl:'https://api.green-api.com'});
    mocks.send.mockReset().mockResolvedValue({accepted:true,outcome:'accepted',providerMessageId:`voice-receipt-${f.merchantId}`,status:'sent'});
    mocks.upload.mockReset().mockImplementation(async(key:string)=>({key,url:`https://media.example.com/${key}`}));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([f.userId]);});afterAll(closeDb);
  const failSql=async(fragment:string)=>{const pool=(await getPool())!,connect=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),execute=c.execute.bind(c);
      vi.spyOn(c,'execute').mockImplementation(((sql:string,args:any[])=>{if(sql.includes(fragment))throw Error('synthetic SQL failure');return execute(sql,args);}) as any);return c;});};
  it('reserves content and authenticated identity before upload, then freezes the object before transport',async()=>{
    mocks.upload.mockImplementationOnce(async(key:string,content:Buffer,mime:string)=>{
      const r=(await attempts())[0],i=readStaffVoiceIntent(r);expect(i.audioDigest).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(i.authorBasis).toBe('authenticated_submitter');expect(i.compositionBasis).toBe('unmeasured');expect(i.durationBasis).toBe('client_reported');expect(r.basis).toBeNull();
      expect(content).toEqual(bytes);expect(mime).toBe('audio/ogg');expect(mocks.send).not.toHaveBeenCalled();return {key,url:`https://media.example.com/${key}`};
    });
    mocks.send.mockImplementationOnce(async()=>{expect(readStaffVoiceBasis((await attempts())[0]).fileName).toBe('voice-message.ogg');expect(await facts()).toEqual([]);return {accepted:true,providerMessageId:'receipt',status:'sent'};});
    expect(await send()).toEqual({success:true,status:'accepted',persisted:true});const s=readStaffVoiceAcceptance((await facts())[0]);
    expect(JSON.stringify(s)).not.toContain('https://');expect(JSON.stringify(s)).not.toContain(audioBase64);expect((await messages())[0]).toMatchObject({messageType:'voice',sender_type:'merchant'});
  });
  it('serializes five callers, reconnects and repeated submits into one upload and send',async()=>{
    await Promise.all(Array.from({length:5},send));const before=await facts();await closeDb();expect(await send()).toMatchObject({success:true});
    expect(await facts()).toEqual(before);expect(await messages()).toHaveLength(1);expect(mocks.send).toHaveBeenCalledOnce();expect(mocks.upload).toHaveBeenCalledOnce();
  });
  it.each([{audioBase64:Buffer.from('OggSdifferent').toString('base64')},{mimeType:'audio/webm'},{duration:4},{conversationId:999999}])('rejects changed recording context %j',async patch=>{
    await send();await expect(trySendDashboardVoice(f.merchantId,f.userId,{...input(),...patch} as any)).rejects.toThrow();expect(mocks.send).toHaveBeenCalledOnce();expect(mocks.upload).toHaveBeenCalledOnce();
  });
  it.each(['viewer','inactive-member','inactive-user','suspended','foreign-actor','foreign-conversation'])('rejects persisted authority %s before upload',async kind=>{
    if(kind==='viewer'||kind==='inactive-member')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',?)",[f.merchantId,f.userId,kind==='viewer'?1:0]);
    if(kind==='inactive-user')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[f.userId]);
    if(kind==='suspended')await q("UPDATE merchants SET status='suspended' WHERE id=?",[f.merchantId]);
    await expect(trySendDashboardVoice(f.merchantId,kind==='foreign-actor'?f.userId+10000:f.userId,{...input(),conversationId:kind==='foreign-conversation'?conv+10000:conv})).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();expect(await attempts()).toEqual([]);
  });
  it.each(['token','provider','customer','ownership','actor','inactive'])('stops a %s change during upload before WhatsApp',async kind=>{
    mocks.upload.mockImplementationOnce(async(key:string)=>{
      if(kind==='token')await q("UPDATE whatsapp_instances SET token='rotated' WHERE id=?",[instance]);
      if(kind==='provider')await q("UPDATE whatsapp_instances SET provider='meta_cloud' WHERE id=?",[instance]);
      if(kind==='customer')await q("UPDATE conversations SET customerPhone='966500009999' WHERE id=?",[conv]);
      if(kind==='ownership')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[conv]);
      if(kind==='actor')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[f.userId]);
      if(kind==='inactive')await q("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",[instance]);
      return {key,url:`https://media.example.com/${key}`};
    });expect(await send()).toMatchObject({success:false});expect(mocks.send).not.toHaveBeenCalled();expect(await facts()).toEqual([]);
  });
  it.each(['throws','wrong-key','unsafe-url'])('never repeats an uncertain or invalid upload: %s',async kind=>{
    mocks.upload.mockImplementationOnce(async(key:string)=>{if(kind==='throws')throw Error('private upload error');return {key:kind==='wrong-key'?'wrong':key,url:kind==='unsafe-url'?'http://unsafe.test/file':'https://media.example.com/a'};});
    expect(await send()).toMatchObject({success:false,status:'pending'});expect(await send()).toMatchObject({success:false});expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['unknown','rejected','missing-receipt','throws'])('does not resend %s transport',async kind=>{
    mocks.send.mockImplementationOnce(async()=>{if(kind==='throws')throw Error('private');return kind==='missing-receipt'?{accepted:true,status:'sent'}:{accepted:false,status:'failed',outcome:kind==='unknown'?'unknown':'rejected'};});
    expect(await send()).toMatchObject({success:false});expect(await send()).toMatchObject({success:false});expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();expect(await facts()).toEqual([]);
  });
  it.each([1,2])('never uploads or sends again after losing reservation/basis commit %s',async number=>{
    const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let count=0;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(++count===number)throw Error('lost commit');});return c;});
    await send().catch(()=>{});vi.restoreAllMocks();expect(await send()).toMatchObject({success:false});expect(mocks.upload).toHaveBeenCalledTimes(number===1?0:1);expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['INSERT INTO ai_sales_staff_acceptances','INSERT INTO messages'])('recovers %s without repeating upload or transport',async fragment=>{
    await failSql(fragment);expect(await send()).toMatchObject({success:false});expect(await facts()).toEqual([]);vi.restoreAllMocks();
    expect(await send()).toMatchObject({success:true});expect(await messages()).toHaveLength(1);expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('keeps one acceptance after loss of acceptance commit acknowledgement',async()=>{
    mocks.send.mockImplementationOnce(async()=>{const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let lost=false;
      vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(!lost){lost=true;throw Error('lost acceptance');}});return c;});return {accepted:true,providerMessageId:'receipt',status:'sent'};});
    expect(await send()).toMatchObject({success:false});const before=await facts();vi.restoreAllMocks();expect(await send()).toMatchObject({success:true});expect(await facts()).toEqual(before);expect(mocks.send).toHaveBeenCalledOnce();
  });
  it.each(['intent','basis','url','receipt','request','removed-fact'])('rejects corrupted %s evidence without replacing it',async field=>{
    await send();const r=(await attempts())[0];
    if(field==='intent')await q("UPDATE ai_sales_staff_voices SET intent=JSON_SET(intent,'$.actorUserId',999) WHERE id=?",[r.id]);
    if(field==='basis')await q("UPDATE ai_sales_staff_voices SET basis=JSON_SET(basis,'$.fileName','changed.mp3') WHERE id=?",[r.id]);
    if(field==='url')await q("UPDATE ai_sales_staff_voices SET media_url='https://media.example.com/other' WHERE id=?",[r.id]);
    if(field==='receipt')await q("UPDATE whatsapp_message_deliveries SET provider_message_id='other' WHERE merchant_id=?",[f.merchantId]);
    if(field==='request')await q("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.kind','text') WHERE merchant_id=?",[f.merchantId]);
    if(field==='removed-fact')await q('DELETE FROM ai_sales_staff_acceptances WHERE merchant_id=?',[f.merchantId]);
    await expect(reconcileDashboardVoice(f.merchantId,r.id)).rejects.toThrow();expect(mocks.send).toHaveBeenCalledOnce();expect(mocks.upload).toHaveBeenCalledOnce();
  });
  it('retains unresolved payloads, then supports redaction and source deletion without recreating messages',async()=>{
    await failSql('INSERT INTO messages');await send();vi.restoreAllMocks();
    await q('UPDATE whatsapp_message_deliveries SET status_updated_at=TIMESTAMPADD(DAY,-40,UTC_TIMESTAMP()) WHERE merchant_id=?',[f.merchantId]);
    await purgeCompletedInboundPayloads();expect((await q('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]))[0].request_json).not.toBeNull();
    await send();const before=await facts();await purgeCompletedInboundPayloads();expect((await q('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]))[0].request_json).toBeNull();
    await q('DELETE FROM conversations WHERE id=?',[conv]);await q('DELETE FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]);expect(await send()).toMatchObject({success:true});expect(await facts()).toEqual(before);
  });
  it('never projects onto a different customer after provider acceptance',async()=>{
    mocks.send.mockImplementationOnce(async()=>{await q("UPDATE conversations SET customerPhone='966500009999' WHERE id=?",[conv]);return {accepted:true,providerMessageId:'receipt',status:'sent'};});
    expect(await send()).toEqual({success:true,status:'accepted',persisted:false});expect(await facts()).toHaveLength(1);expect(await messages()).toEqual([]);
  });
  it('an inactive registered account cannot fall back to the compatibility sender',async()=>{
    await q("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",[instance]);const legacy=vi.fn();await expect(trySendDashboardVoice(f.merchantId,f.userId,input(),legacy)).rejects.toThrow();expect(legacy).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(['group','legacy'])('retains unmeasured %s transport with once-only request handling',async kind=>{
    if(kind==='group')await q("UPDATE conversations SET customerPhone='group_123456789012' WHERE id=?",[conv]);else await q('DELETE FROM whatsapp_instances WHERE id=?',[instance]);
    const legacy=vi.fn().mockResolvedValue({success:true,persisted:true});const run=()=>trySendDashboardVoice(f.merchantId,f.userId,input(),legacy);
    await Promise.all(Array.from({length:5},run));expect(await run()).toEqual({success:true,status:'accepted',persisted:true});expect(legacy).toHaveBeenCalledOnce();expect(await facts()).toEqual([]);expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('never repeats unknown compatibility transport even after registration changes',async()=>{
    await q('DELETE FROM whatsapp_instances WHERE id=?',[instance]);const legacy=vi.fn().mockRejectedValue(Error('unknown'));
    expect(await trySendDashboardVoice(f.merchantId,f.userId,input(),legacy)).toMatchObject({success:false});
    await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,'new','fixture','active',1)",[f.merchantId]);
    expect(await trySendDashboardVoice(f.merchantId,f.userId,input(),legacy)).toMatchObject({success:false});expect(legacy).toHaveBeenCalledOnce();expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('recovers a lost compatibility result commit and rejects result corruption',async()=>{
    await q("UPDATE conversations SET customerPhone='group_123456789012' WHERE id=?",[conv]);
    const legacy=vi.fn().mockImplementation(async()=>{const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let lost=false;
      vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(!lost){lost=true;throw Error('lost compatibility commit');}});return c;});return {success:true,persisted:false};});
    expect(await trySendDashboardVoice(f.merchantId,f.userId,input(),legacy)).toMatchObject({success:false});vi.restoreAllMocks();
    expect(await trySendDashboardVoice(f.merchantId,f.userId,input(),legacy)).toEqual({success:true,status:'accepted',persisted:false});expect(legacy).toHaveBeenCalledOnce();
    await q("UPDATE ai_sales_staff_voices SET compatibility_result=JSON_SET(compatibility_result,'$.persisted',true) WHERE merchant_id=?",[f.merchantId]);
    await expect(trySendDashboardVoice(f.merchantId,f.userId,input(),legacy)).rejects.toThrow();expect(await facts()).toEqual([]);
  });
  it('blocks retryFailed and missing guards from replaying the audio outbox',async()=>{
    mocks.send.mockResolvedValueOnce({accepted:false,status:'failed',outcome:'rejected'});await send();const r=(await attempts())[0],b=readStaffVoiceBasis(r);
    await sendMerchantWhatsApp({merchantId:f.merchantId,instanceRecordId:instance,idempotencyKey:staffVoiceKey(f.merchantId,r.id),kind:'audio',to:r.customer_phone,mediaUrl:r.media_url,fileName:b.fileName,retryFailed:true});expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('retains a rejected voice guard even when a retry removes it from a malformed-key request',async()=>{
    await send();const r=(await attempts())[0],b=readStaffVoiceBasis(r);
    const request={merchantId:f.merchantId,instanceRecordId:instance,idempotencyKey:`invalid-voice:${randomUUID()}`,kind:'audio' as const,to:r.customer_phone,mediaUrl:r.media_url,fileName:b.fileName};
    expect(await sendMerchantWhatsApp({...request,staffVoiceGuard:{id:r.id,basisDigest:r.basis_digest}})).toMatchObject({accepted:false,errorCode:'staff_voice_suppressed'});
    expect(await sendMerchantWhatsApp({...request,retryFailed:true})).toMatchObject({accepted:false,duplicate:true,errorCode:'staff_voice_suppressed'});
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('rejects schema absence and invalid bytes before storage or WhatsApp',async()=>{
    await expect(trySendDashboardVoice(f.merchantId,f.userId,{...input(),audioBase64:Buffer.from('<script>').toString('base64')})).rejects.toThrow();
    vi.spyOn(readiness,'assertRuntimeSchema').mockRejectedValue(Error('schema missing'));await expect(send()).rejects.toThrow();expect(mocks.send).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rolls ownership back when intent persistence fails before upload',async()=>{
    const before=await q('SELECT human_takeover,handoff_version FROM conversations WHERE id=?',[conv]);
    await failSql('UPDATE ai_sales_staff_voices SET intent=');await expect(send()).rejects.toThrow();vi.restoreAllMocks();
    expect(await attempts()).toEqual([]);expect(await q('SELECT human_takeover,handoff_version FROM conversations WHERE id=?',[conv])).toEqual(before);expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('does not upload twice or send if basis persistence fails',async()=>{
    await failSql('UPDATE ai_sales_staff_voices SET media_url=');expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();expect(await send()).toMatchObject({success:false});
    expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('a different authorized employee cannot replay the recording',async()=>{
    const other=await createDisposableMerchant('voice-other');
    try{await send();await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[f.merchantId,other.userId]);
      await expect(trySendDashboardVoice(f.merchantId,other.userId,input())).rejects.toThrow();expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();
    }finally{await q('DELETE FROM merchant_members WHERE merchant_id=? AND user_id=?',[f.merchantId,other.userId]);await cleanupDisposableMerchants([other.userId]);}
  });
  it('claims bounded recovery without repeating unknown uploads',async()=>{
    mocks.upload.mockRejectedValue(Error('unknown'));for(let n=0;n<21;n++){requestId=randomUUID();await send();}
    await q('UPDATE ai_sales_staff_voices SET created_at=TIMESTAMPADD(MINUTE,-10,UTC_TIMESTAMP()),next_reconcile_at=UTC_TIMESTAMP() WHERE merchant_id=?',[f.merchantId]);
    expect(await runDashboardVoiceRecoveryBatch()).toBe(20);expect(await runDashboardVoiceRecoveryBatch()).toBe(1);expect(await runDashboardVoiceRecoveryBatch()).toBe(0);expect(mocks.upload).toHaveBeenCalledTimes(21);expect(mocks.send).not.toHaveBeenCalled();
  });
});
