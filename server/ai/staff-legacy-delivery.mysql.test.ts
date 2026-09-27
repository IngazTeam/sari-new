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
import {listStaffAttempts,checkStaffAttempt} from './staff-attempt-review';
import {readStaffTextCompatibility} from './staff-dashboard-compatibility';
import {readVoiceCompatibility} from './staff-voice-compatibility-contract';
import {inspectStaffCompatibilityDispatch} from './staff-compatibility-authority';
import {sendVoiceCompatibility} from './staff-voice-compatibility';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';

describe.each(['text','voice'] as const)('durable legacy %s transport',kind=>{
  describe.skipIf(!process.env.DATABASE_URL)('isolated MySQL',()=>{
    let f:Awaited<ReturnType<typeof createDisposableMerchant>>,conv:number,connection:number,requestId:string;
    const q=async(sql:string,args:any[]=[])=>((await (await getPool())!.execute<any>(sql,args))[0]);
    const table=kind==='text'?'ai_sales_staff_replies':'ai_sales_staff_voices';
    const send=()=>kind==='text'?trySendDashboardStaff(f.merchantId,f.userId,{conversationId:conv,requestId,message:'عرض تجريبي'})
      :trySendDashboardVoice(f.merchantId,f.userId,{conversationId:conv,requestId,audioBase64:Buffer.from('OggSsynthetic').toString('base64'),mimeType:'audio/ogg',duration:3});
    const rows=()=>q(`SELECT * FROM ${table} WHERE merchant_id=?`,[f.merchantId]);
    const messages=()=>q('SELECT * FROM messages WHERE conversationId=?',[conv]);
    const record=(r:any)=>kind==='text'?readStaffTextCompatibility(r):readVoiceCompatibility(r).basis!;
    const accepted=()=>({accepted:true,status:'sent',providerMessageId:`receipt-${f.merchantId}`});
    const check=async()=>checkStaffAttempt(f.merchantId,f.userId,{kind,conversationId:conv,sourceId:(await rows())[0].id});
    beforeEach(async()=>{f=await createDisposableMerchant('legacy-delivery');requestId=randomUUID();
      conv=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500006611')",[f.merchantId])).insertId);
      connection=Number((await q("INSERT INTO whatsapp_connection_requests (merchantId,countryCode,phoneNumber,fullNumber,status,instanceId,apiToken,apiUrl) VALUES (?,'966','500006611','966500006611','connected','710000001','fixture','https://api.green-api.com')",[f.merchantId])).insertId);
      mocks.send.mockReset().mockResolvedValue(accepted());mocks.upload.mockReset().mockImplementation(async(key:string)=>({key,url:`https://media.example.test/${key}`}));
    });
    afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([f.userId]);});afterAll(closeDb);
    async function failSql(fragment:string){const pool=(await getPool())!,connect=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),execute=c.execute.bind(c);
      vi.spyOn(c,'execute').mockImplementation(((sql:any,args:any)=>{if(String(sql).includes(fragment))throw Error('synthetic SQL failure');return execute(sql,args);}) as any);return c;});}
    async function unresolved(){mocks.send.mockImplementationOnce(async()=>{await failSql("SET status='accepted'");return accepted();});
      expect(await send()).toMatchObject({success:false,status:'pending'});vi.restoreAllMocks();expect(await messages()).toEqual([]);
      const row=(await rows())[0];expect(record(row)).toHaveProperty('legacyDelivery');return row;}
    function once(){expect(mocks.send).toHaveBeenCalledOnce();expect(mocks.upload).toHaveBeenCalledTimes(kind==='voice'?1:0);}
    it('commits exact evidence without fabricating a registered account or measured sales acceptance',async()=>{
      expect(await send()).toEqual({success:true,status:'accepted',persisted:true});const b=record((await rows())[0]);
      expect(b).toHaveProperty('legacyDelivery.connectionId',connection);expect(b).not.toHaveProperty('settlement');
      expect(JSON.stringify(b)).not.toContain('fixture');expect(await q('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=?',[f.merchantId])).toEqual([]);
      expect(await q('SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=?',[f.merchantId])).toEqual([]);once();
    });
    it('recovers after reconnect through six simultaneous history checks without original content',async()=>{
      await unresolved();await closeDb();expect((await Promise.all(Array.from({length:6},check))).every(r=>r.success&&r.persisted)).toBe(true);
      expect(await messages()).toHaveLength(1);const before=await rows();expect(await send()).toMatchObject({success:true});expect(await rows()).toEqual(before);once();
    });
    it.each(['INSERT INTO messages',"SET status='accepted'"])('survives repeated %s projection failure',async fragment=>{
      await unresolved();await failSql(fragment);await expect(check()).rejects.toThrow();vi.restoreAllMocks();expect(await messages()).toEqual([]);
      expect((await rows())[0].status).toBe('reserved');expect(await check()).toMatchObject({success:true});expect(await messages()).toHaveLength(1);once();
    });
    it.each(['evidence','settlement'])('recovers a lost %s commit acknowledgement',async phase=>{
      mocks.send.mockImplementationOnce(async()=>{const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let commits=0;
        vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);
          vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(++commits===(phase==='evidence'?1:2))throw Error('lost acknowledgement');});return c;});return accepted();});
      expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();expect(record((await rows())[0])).toHaveProperty('legacyDelivery');
      expect(await check()).toMatchObject({success:true});expect(await messages()).toHaveLength(1);once();
    });
    it('never resends if the evidence transaction itself rolls back',async()=>{
      mocks.send.mockImplementationOnce(async()=>{await failSql('SET basis=');return accepted();});expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();
      expect(record((await rows())[0])).not.toHaveProperty('legacyDelivery');await closeDb();expect(await check()).toMatchObject({success:false});expect(await send()).toMatchObject({success:false});once();
    });
    it.each(['rejected','unknown','error'])('does not preserve a contradictory %s acknowledgement',async contradiction=>{
      mocks.send.mockResolvedValue({...accepted(),...(contradiction==='error'?{errorCode:'timeout'}:{outcome:contradiction})});
      expect(await send()).toMatchObject({success:false});expect(record((await rows())[0])).not.toHaveProperty('legacyDelivery');
      expect(await check()).toMatchObject({success:false});expect(await messages()).toEqual([]);once();
    });
    it('never grants dispatch authority again after storing a pending receipt',async()=>{
      const r=await unresolved();if(kind==='text')await expect(inspectStaffCompatibilityDispatch(f.merchantId,r.id,r.basis_digest)).rejects.toThrow();
      else expect(await sendVoiceCompatibility(f.merchantId,r.id,r.intent_digest,Buffer.from('OggSsynthetic'))).toMatchObject({success:false});
      expect(await check()).toMatchObject({success:true});once();
    });
    it('refuses to attach a receipt if the original request changes while the provider is running',async()=>{
      mocks.send.mockImplementationOnce(async()=>{const r=(await rows())[0],b:any=record(r);
        if(kind==='text'){b.replyDigest=hash('changed');await q(`UPDATE ${table} SET reply_text='changed',basis=?,basis_digest=? WHERE id=?`,[JSON.stringify(b),hash(b),r.id]);}
        else {const url='https://media.example.test/changed.ogg';b.mediaUrlDigest=hash(url);await q(`UPDATE ${table} SET media_url=?,basis=?,basis_digest=? WHERE id=?`,[url,JSON.stringify(b),hash(b),r.id]);}
        return accepted();});
      expect(await send()).toMatchObject({success:false});expect(record((await rows())[0])).not.toHaveProperty('legacyDelivery');expect(await check()).toMatchObject({success:false});once();
    });
    it.each(['token','deleted-account','ownership','expiry','resumed'])('settles saved acceptance after %s changes without renewing send authority',async change=>{
      await unresolved();if(change==='token')await q("UPDATE whatsapp_connection_requests SET apiToken='rotated' WHERE id=?",[connection]);
      if(change==='deleted-account')await q('DELETE FROM whatsapp_connection_requests WHERE id=?',[connection]);
      if(change==='ownership')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[conv]);
      if(change==='expiry')await q("UPDATE conversations SET human_expires_at='2020-01-01' WHERE id=?",[conv]);
      if(change==='resumed')await q('UPDATE conversations SET human_takeover=0 WHERE id=?',[conv]);
      const before=await q('SELECT handoff_version,human_takeover,human_expires_at FROM conversations WHERE id=?',[conv]);
      expect(await check()).toMatchObject({success:true});expect(await q('SELECT handoff_version,human_takeover,human_expires_at FROM conversations WHERE id=?',[conv])).toEqual(before);once();
    });
    it('retains transport evidence when reply authority is revoked during provider execution',async()=>{
      mocks.send.mockImplementationOnce(async()=>{await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[f.merchantId,f.userId]);return accepted();});
      expect(await send()).toMatchObject({success:false});expect(record((await rows())[0])).toHaveProperty('legacyDelivery');expect(await messages()).toEqual([]);await expect(check()).rejects.toThrow();
      await q("UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?",[f.merchantId,f.userId]);expect(await check()).toMatchObject({success:true});once();
    });
    it.each(['changed','deleted'])('records acceptance without projecting to a %s conversation',async change=>{
      const row=await unresolved();await q(change==='deleted'?'DELETE FROM conversations WHERE id=?':"UPDATE conversations SET customerPhone='966500009999' WHERE id=?",[conv]);
      expect(await reconcileStaffCompatibility(kind,f.merchantId,f.userId,row.id)).toEqual({success:true,status:'accepted',persisted:false});expect(await messages()).toEqual([]);once();
    });
    it('does not overwrite a conflicting receipt projection',async()=>{
      await unresolved();await q("INSERT INTO messages (conversationId,direction,messageType,content,externalId,sender_type) VALUES (?,'outgoing','text','unrelated',?,'assistant')",[conv,accepted().providerMessageId]);
      await expect(check()).rejects.toThrow();expect((await messages())[0].content).toBe('unrelated');await q('DELETE FROM messages WHERE conversationId=?',[conv]);expect(await check()).toMatchObject({success:true});once();
    });
    it.each(['kind','merchantId','sourceId','connectionId','accountDigest','basisDigest','requestDigest','scope','extra','providerMessageId'])('rejects rehashed %s corruption',async field=>{
      const r=await unresolved(),b:any=record(r);b.legacyDelivery[field]=field.endsWith('Id')&&field!=='providerMessageId'?999999:field.endsWith('Digest')?hash('other'):'<invalid>';
      await q(`UPDATE ${table} SET basis=?,basis_digest=? WHERE id=?`,[JSON.stringify(b),hash(b),r.id]);await expect(check()).rejects.toThrow();
      expect((await listStaffAttempts(f.merchantId,f.userId,{conversationId:conv,kind})).items[0].state).toBe('unavailable');expect(await messages()).toEqual([]);once();
    });
    it('rejects another authorized employee and tenant',async()=>{
      const r=await unresolved(),other=await createDisposableMerchant('legacy-other');try{
        await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[f.merchantId,other.userId]);
        await expect(reconcileStaffCompatibility(kind,f.merchantId,other.userId,r.id)).rejects.toThrow();await expect(reconcileStaffCompatibility(kind,other.merchantId,other.userId,r.id)).rejects.toThrow();
        expect(await check()).toMatchObject({success:true});once();
      }finally{await cleanupDisposableMerchants([other.userId]);}
    });
    it('does not recreate a deleted projection once the saved result has completed',async()=>{
      await send();const before=await rows();await q('DELETE FROM messages WHERE conversationId=?',[conv]);expect(await check()).toMatchObject({success:true,persisted:true});
      expect(await rows()).toEqual(before);expect(await messages()).toEqual([]);once();
    });
  });
});
