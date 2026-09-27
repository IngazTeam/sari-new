import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),upload:vi.fn()}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('../storage',()=>({storagePut:mocks.upload}));
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {trySendDashboardStaff} from './staff-dashboard-reply';
import {trySendDashboardVoice} from './staff-dashboard-voice';
import {reconcileStaffCompatibility} from './staff-compatibility-settlement';
import {readStaffTextCompatibility} from './staff-dashboard-compatibility';
import {readVoiceCompatibility} from './staff-voice-compatibility-contract';
import {purgeCompletedInboundPayloads} from '../messaging/retention';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';

describe.each(['text','voice'] as const)('SQL-only %s compatibility settlement',kind=>{
  describe.skipIf(!process.env.DATABASE_URL)('with a disposable merchant',()=>{
    let f:Awaited<ReturnType<typeof createDisposableMerchant>>,conv:number,instance:number,requestId:string;
    const q=async(sql:string,args:any[]=[])=>((await (await getPool())!.execute<any>(sql,args))[0]);
    const table=kind==='text'?'ai_sales_staff_replies':'ai_sales_staff_voices',guard=kind==='text'?'staffCompatibilityGuard':'staffCompatibilityVoiceGuard';
    const send=()=>kind==='text'?trySendDashboardStaff(f.merchantId,f.userId,{conversationId:conv,requestId,message:'عرض تجريبي'})
      :trySendDashboardVoice(f.merchantId,f.userId,{conversationId:conv,requestId,audioBase64:Buffer.from('OggSsynthetic').toString('base64'),mimeType:'audio/ogg',duration:3});
    const rows=()=>q(`SELECT * FROM ${table} WHERE merchant_id=?`,[f.merchantId]),outbox=()=>q('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]);
    const messages=()=>q('SELECT * FROM messages WHERE conversationId=?',[conv]),facts=()=>q('SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=?',[f.merchantId]);
    const record=(r:any)=>kind==='text'?readStaffTextCompatibility(r):readVoiceCompatibility(r).basis!;
    beforeEach(async()=>{f=await createDisposableMerchant('compat-settlement');requestId=randomUUID();
      conv=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'group_120363123')",[f.merchantId])).insertId);
      instance=Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary,api_url) VALUES (?,'710000001','fixture','active',1,'https://api.green-api.com')",[f.merchantId])).insertId);
      mocks.send.mockReset().mockResolvedValue({accepted:true,status:'sent',providerMessageId:`receipt-${f.merchantId}`});mocks.upload.mockReset().mockImplementation(async(key:string)=>({key,url:`https://media.example.test/${key}`}));
    });
    afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([f.userId]);});afterAll(closeDb);
    async function failSql(fragment:string){const pool=(await getPool())!,connect=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),execute=c.execute.bind(c);
      vi.spyOn(c,'execute').mockImplementation(((sql:any,args:any)=>{if(String(sql).includes(fragment))throw Error('synthetic SQL failure');return execute(sql,args);}) as any);return c;});}
    async function unresolved(){mocks.send.mockImplementationOnce(async()=>{await failSql("SET status='accepted'");return {accepted:true,status:'sent',providerMessageId:`receipt-${f.merchantId}`};});
      expect(await send()).toMatchObject({success:false,status:'pending'});vi.restoreAllMocks();expect(await messages()).toEqual([]);expect((await outbox())[0].status).toBe('sent');return (await rows())[0];}
    function once(){expect(mocks.send).toHaveBeenCalledOnce();expect(mocks.upload).toHaveBeenCalledTimes(kind==='voice'?1:0);}
    it('settles initial success from the exact guarded outbox and keeps an immutable local proof',async()=>{expect(await send()).toEqual({success:true,status:'accepted',persisted:true});const r=(await rows())[0],b=record(r);
      expect(b.settlement).toMatchObject({kind,instanceRecordId:instance,outboxId:(await outbox())[0].id,scope:'compatibility_result_only'});expect(await facts()).toEqual([]);once();
    });
    it('recovers after reconnect and six simultaneous checks without any external effect',async()=>{await unresolved();await closeDb();const results=await Promise.all(Array.from({length:6},send));
      expect(results.every(r=>r.success&&r.persisted)).toBe(true);expect(await messages()).toHaveLength(1);const before=await rows();await send();expect(await rows()).toEqual(before);expect(await facts()).toEqual([]);once();});
    it.each(['INSERT INTO messages',"SET status='accepted'"])('retains evidence after %s failure and recovers atomically',async fragment=>{await unresolved();await failSql(fragment);expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();
      expect(await messages()).toEqual([]);expect((await rows())[0].status).toBe('reserved');expect(await send()).toMatchObject({success:true});expect(await messages()).toHaveLength(1);once();});
    it('survives a lost settlement commit acknowledgement',async()=>{await unresolved();const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let count=0;
      vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(++count===2)throw Error('lost settlement acknowledgement');});return c;});
      expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();expect(await send()).toMatchObject({success:true});expect(await messages()).toHaveLength(1);once();});
    it.each(['queued','failed','received'])('keeps %s with a receipt unresolved',async status=>{await unresolved();await q('UPDATE whatsapp_message_deliveries SET status=? WHERE merchant_id=?',[status,f.merchantId]);
      expect(await send()).toMatchObject({success:false,status:'pending'});expect(await messages()).toEqual([]);expect((await rows())[0].status).toBe('reserved');once();});
    it.each(['sent','delivered','read'])('recovers on a persisted %s outcome after an uncertain attempt',async status=>{mocks.send.mockResolvedValueOnce({accepted:false,status:'failed',outcome:'unknown',providerMessageId:'late-receipt'});
      expect(await send()).toMatchObject({success:false});await q('UPDATE whatsapp_message_deliveries SET status=?,error_code=NULL WHERE merchant_id=?',[status,f.merchantId]);expect(await send()).toMatchObject({success:true});once();});
    it.each(['missing','redacted','no-receipt','bad-receipt','error','wrong-key','provider','direction','request-to','request-content','guard','extra'])('refuses %s evidence without fabricating success',async field=>{await unresolved();
      if(field==='missing')await q('DELETE FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]);
      else if(field==='redacted')await q('UPDATE whatsapp_message_deliveries SET request_json=NULL WHERE merchant_id=?',[f.merchantId]);
      else if(field==='no-receipt'||field==='bad-receipt')await q('UPDATE whatsapp_message_deliveries SET provider_message_id=? WHERE merchant_id=?',[field==='no-receipt'?null:'<script>',f.merchantId]);
      else if(field==='error')await q("UPDATE whatsapp_message_deliveries SET error_code='provider_unreachable' WHERE merchant_id=?",[f.merchantId]);
      else if(field==='wrong-key')await q("UPDATE whatsapp_message_deliveries SET idempotency_key='other:compatibility:attempt' WHERE merchant_id=?",[f.merchantId]);
      else if(field==='provider')await q("UPDATE whatsapp_message_deliveries SET provider='meta_cloud' WHERE merchant_id=?",[f.merchantId]);
      else if(field==='direction')await q("UPDATE whatsapp_message_deliveries SET direction='incoming' WHERE merchant_id=?",[f.merchantId]);
      else {const d=(await outbox())[0],request=typeof d.request_json==='string'?JSON.parse(d.request_json):d.request_json;
        if(field==='request-to')request.to='group_999999999';if(field==='request-content')request[kind==='text'?'text':'mediaUrl']='other';if(field==='guard')request[guard].basisDigest=hash('other');if(field==='extra')request.salesReplyGuard={id:1};
        await q('UPDATE whatsapp_message_deliveries SET request_json=? WHERE id=?',[JSON.stringify(request),d.id]);}
      expect(await send()).toMatchObject({success:false,status:'pending'});expect(await messages()).toEqual([]);expect(await facts()).toEqual([]);once();});
    it.each(['token','inactive','ownership','expiry','resumed'])('can settle historical acceptance after %s changes without acquiring new send authority',async change=>{await unresolved();
      if(change==='token')await q("UPDATE whatsapp_instances SET token='rotated' WHERE id=?",[instance]);if(change==='inactive')await q("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",[instance]);
      if(change==='ownership')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[conv]);if(change==='expiry')await q("UPDATE conversations SET human_expires_at='2020-01-01' WHERE id=?",[conv]);if(change==='resumed')await q('UPDATE conversations SET human_takeover=0 WHERE id=?',[conv]);
      const before=await q('SELECT handoff_version,human_takeover,human_expires_at FROM conversations WHERE id=?',[conv]);expect(await send()).toMatchObject({success:true});expect(await q('SELECT handoff_version,human_takeover,human_expires_at FROM conversations WHERE id=?',[conv])).toEqual(before);once();});
    it.each(['actor','suspended','disabled'])('requires current %s authority even for SQL-only settlement',async change=>{const row=await unresolved();
      if(change==='actor')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[f.merchantId,f.userId]);if(change==='suspended')await q("UPDATE merchants SET status='suspended' WHERE id=?",[f.merchantId]);if(change==='disabled')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[f.userId]);
      await expect(reconcileStaffCompatibility(kind,f.merchantId,f.userId,row.id)).rejects.toThrow();expect((await rows())[0].status).toBe('reserved');once();});
    it.each(['changed','deleted'])('retains successful acceptance without projecting onto a %s conversation',async change=>{await unresolved();await q(change==='deleted'?'DELETE FROM conversations WHERE id=?':"UPDATE conversations SET customerPhone='group_999999999' WHERE id=?",[conv]);
      expect(await send()).toEqual({success:true,status:'accepted',persisted:false});expect(await messages()).toEqual([]);expect(await send()).toMatchObject({success:true,persisted:false});once();});
    it('does not overwrite a conflicting existing message and can recover after the conflict is removed',async()=>{await unresolved();const [d]=await outbox();await q("INSERT INTO messages (conversationId,direction,messageType,content,externalId,sender_type) VALUES (?,'outgoing','text','unrelated',?,'assistant')",[conv,d.provider_message_id]);
      expect(await send()).toMatchObject({success:false});expect((await messages())[0].content).toBe('unrelated');await q('DELETE FROM messages WHERE conversationId=?',[conv]);expect(await send()).toMatchObject({success:true});expect(await messages()).toHaveLength(1);once();});
    it('retains unresolved request proof, then permits redaction and survives source deletion',async()=>{await unresolved();await q("UPDATE whatsapp_message_deliveries SET status_updated_at='2020-01-01' WHERE merchant_id=?",[f.merchantId]);await purgeCompletedInboundPayloads();expect((await outbox())[0].request_json).not.toBeNull();
      expect(await send()).toMatchObject({success:true});const before=await rows();await purgeCompletedInboundPayloads();expect((await outbox())[0].request_json).toBeNull();await q('DELETE FROM conversations WHERE id=?',[conv]);await q('DELETE FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId]);
      expect(await send()).toMatchObject({success:true});expect(await rows()).toEqual(before);expect(await messages()).toEqual([]);once();});
    it.each(['basisDigest','requestDigest','instanceRecordId','kind','scope','extra'])('rejects rehashed %s settlement corruption',async field=>{await send();const [r]=await rows(),b=record(r);
      b.settlement[field]=field==='instanceRecordId'?instance+1:field==='kind'?(kind==='text'?'voice':'text'):field==='basisDigest'||field==='requestDigest'?hash('other'):'other';await q(`UPDATE ${table} SET basis=?,basis_digest=? WHERE id=?`,[JSON.stringify(b),hash(b),r.id]);await expect(send()).rejects.toThrow();once();});
    it('isolates another authorized employee and a second merchant',async()=>{const row=await unresolved(),other=await createDisposableMerchant('settle-other');try{
      await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[f.merchantId,other.userId]);await expect(reconcileStaffCompatibility(kind,f.merchantId,other.userId,row.id)).rejects.toThrow();await expect(reconcileStaffCompatibility(kind,other.merchantId,other.userId,row.id)).rejects.toThrow();
      expect((await rows())[0].status).toBe('reserved');expect(await send()).toMatchObject({success:true});once();
    }finally{await cleanupDisposableMerchants([other.userId]);}});
    it('never dispatches a reservation that failed before transport',async()=>{await failSql(kind==='text'?'SELECT customerPhone FROM conversations':'SET media_url=');await send().catch(()=>{});vi.restoreAllMocks();
      const [r]=await rows();expect(r.status).toBe('reserved');expect(await reconcileStaffCompatibility(kind,f.merchantId,f.userId,r.id)).toMatchObject({success:false});expect(await send()).toMatchObject({success:false});expect(mocks.send).not.toHaveBeenCalled();});
  });
});
