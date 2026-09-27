import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),upload:vi.fn()}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('../storage',()=>({storagePut:mocks.upload}));
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {trySendDashboardStaff} from './staff-dashboard-reply';
import {trySendDashboardVoice} from './staff-dashboard-voice';
import {checkStaffAttempt} from './staff-attempt-review';
import {checkTeamStaffAttempt,listTeamStaffAttempts,listStaffTeamReviews} from './staff-team-review';

describe.each(['text','voice'] as const)('%s administrative review',kind=>{
 describe.each(['registered','group','legacy'] as const)('%s transport',channel=>{
  describe.skipIf(!process.env.DATABASE_URL)('isolated MySQL',()=>{
   let f:Awaited<ReturnType<typeof createDisposableMerchant>>,author:typeof f,conv:number,source:number,sendRequest:string,reviewRequest:string;
   const q=async(sql:string,args:any[]=[])=>((await (await getPool())!.execute<any>(sql,args))[0]);
   const table=kind==='text'?'ai_sales_staff_replies':'ai_sales_staff_voices';
   const row=async()=>(await q(`SELECT * FROM ${table} WHERE id=? AND merchant_id=?`,[source,f.merchantId]))[0];
   const audits=()=>q('SELECT * FROM ai_sales_staff_reviews WHERE merchant_id=?',[f.merchantId]);
   const messages=()=>q('SELECT * FROM messages WHERE conversationId=?',[conv]);
   const input=()=>({kind,sourceId:source,conversationId:conv,authorUserId:author.userId,requestId:reviewRequest,reason:'departed_employee' as const});
   const review=()=>checkTeamStaffAttempt(f.merchantId,f.userId,input());
   const send=()=>kind==='text'?trySendDashboardStaff(f.merchantId,author.userId,{conversationId:conv,requestId:sendRequest,message:'private synthetic reply'})
    :trySendDashboardVoice(f.merchantId,author.userId,{conversationId:conv,requestId:sendRequest,audioBase64:Buffer.from('OggSsynthetic').toString('base64'),mimeType:'audio/ogg',duration:3});
   async function failSql(fragment:string){const pool=(await getPool())!,connect=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),execute=c.execute.bind(c);
    vi.spyOn(c,'execute').mockImplementation(((sql:any,args:any)=>{if(String(sql).includes(fragment))throw Error('synthetic save failure');return execute(sql,args);}) as any);return c;});}
   beforeEach(async()=>{
    f=await createDisposableMerchant('team-review');author=await createDisposableMerchant('team-author');sendRequest=randomUUID();reviewRequest=randomUUID();
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'sales_supervisor',1)",[f.merchantId,author.userId]);
    conv=Number((await q('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)',[f.merchantId,channel==='group'?'group_120363123':'966500006611'])).insertId);
    if(channel==='legacy')await q("INSERT INTO whatsapp_connection_requests (merchantId,countryCode,phoneNumber,fullNumber,status,instanceId,apiToken,apiUrl) VALUES (?,'966','500006611','966500006611','connected','710000001','fixture','https://api.green-api.com')",[f.merchantId]);
    else await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary,api_url) VALUES (?,'710000001','fixture','active',1,'https://api.green-api.com')",[f.merchantId]);
    mocks.send.mockReset().mockImplementation(async()=>{await failSql("SET status='accepted'");return {accepted:true,status:'sent',providerMessageId:`receipt-${f.merchantId}`};});
    mocks.upload.mockReset().mockImplementation(async(key:string)=>({key,url:`https://media.example.test/${key}`}));
    expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();source=(await q(`SELECT id FROM ${table} WHERE merchant_id=?`,[f.merchantId]))[0].id;
   });
   afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([f.userId,author.userId]);});afterAll(closeDb);
   function once(){expect(mocks.send).toHaveBeenCalledOnce();expect(mocks.upload).toHaveBeenCalledTimes(kind==='voice'?1:0);}
   it.each(['inactive','deleted-membership','disabled-account'])('reviews a %s author without impersonation',async state=>{
    if(state==='inactive')await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[f.merchantId,author.userId]);
    if(state==='deleted-membership')await q('DELETE FROM merchant_members WHERE merchant_id=? AND user_id=?',[f.merchantId,author.userId]);
    if(state==='disabled-account')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[author.userId]);
    await expect(checkStaffAttempt(f.merchantId,author.userId,{kind,conversationId:conv,sourceId:source})).rejects.toThrow();
    const ownership=await q('SELECT handoff_version,human_takeover,human_expires_at FROM conversations WHERE id=?',[conv]);
    expect((await review()).result).toEqual({success:true,status:'accepted',persisted:true});expect((await row()).actor_user_id).toBe(author.userId);expect(await messages()).toHaveLength(1);
    expect(await q('SELECT handoff_version,human_takeover,human_expires_at FROM conversations WHERE id=?',[conv])).toEqual(ownership);
    const history=await listStaffTeamReviews(f.merchantId,f.userId,{kind});expect(history.items[0]).toMatchObject({authorUserId:author.userId,reviewerUserId:f.userId,reason:'departed_employee'});
    expect(JSON.stringify(history)).not.toMatch(/private|media\.|receipt|Digest|requestId|token/);once();
   });
   it.each(['viewer','sales_supervisor','inactive','suspended','disabled'])('denies %s reviewer under current SQL authority',async state=>{
    if(state==='suspended')await q("UPDATE merchants SET status='suspended' WHERE id=?",[f.merchantId]);
    else if(state==='disabled')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[f.userId]);
    else await q('INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,?)',[f.merchantId,f.userId,state==='inactive'?'owner':state,state==='inactive'?0:1]);
    await expect(review()).rejects.toThrow();await expect(listTeamStaffAttempts(f.merchantId,f.userId,{kind})).rejects.toThrow();await expect(listStaffTeamReviews(f.merchantId,f.userId,{kind})).rejects.toThrow();
    expect(await audits()).toEqual([]);expect(await messages()).toEqual([]);once();
   });
   it('authorizes a manager and keeps the ordinary self-review boundary',async()=>{
    await q("UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?",[f.merchantId,author.userId]);
    await expect(checkStaffAttempt(f.merchantId,f.userId,{kind,conversationId:conv,sourceId:source})).rejects.toThrow();
    expect((await checkTeamStaffAttempt(f.merchantId,author.userId,input())).result.success).toBe(true);expect((await audits())[0].reviewer_user_id).toBe(author.userId);once();
   });
   it('deduplicates six concurrent checks and survives a new connection',async()=>{
    const results=await Promise.all(Array.from({length:6},review));expect(new Set(results.map(r=>r.reviewId)).size).toBe(1);expect(results.every(r=>r.result.success)).toBe(true);
    await closeDb();expect(await review()).toEqual(results[0]);expect(await audits()).toHaveLength(1);expect(await messages()).toHaveLength(1);once();
   });
   it('rolls message, acceptance and result back if the audit cannot be saved',async()=>{
    const before=await row();await failSql('INSERT INTO ai_sales_staff_reviews');await expect(review()).rejects.toThrow();vi.restoreAllMocks();
    expect(await row()).toEqual(before);expect(await messages()).toEqual([]);expect(await audits()).toEqual([]);
    expect((await review()).result.success).toBe(true);once();
   });
   it('survives a lost audit commit acknowledgement without a second audit',async()=>{
    const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let done=false;vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);
     vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(!done){done=true;throw Error('lost acknowledgement');}});return c;});
    await expect(review()).rejects.toThrow();vi.restoreAllMocks();expect((await review()).result.success).toBe(true);expect(await audits()).toHaveLength(1);expect(await messages()).toHaveLength(1);once();
   });
   it.each(['authorUserId','conversationId','reason'])('refuses reuse of a request with changed %s',async field=>{
    await review();await expect(checkTeamStaffAttempt(f.merchantId,f.userId,{...input(),[field]:field==='reason'?'incident_review':999999} as any)).rejects.toThrow();expect(await audits()).toHaveLength(1);once();
   });
   it('does not infer acceptance from a missing or contradictory transport',async()=>{
    if(channel==='legacy'){const r=await row(),b=typeof r.basis==='string'?JSON.parse(r.basis):r.basis;delete b.legacyDelivery;
     const {policyArtifactDigest}=await import('./learning-policy-evaluation-bundle');await q(`UPDATE ${table} SET basis=?,basis_digest=? WHERE id=?`,[JSON.stringify(b),policyArtifactDigest(b),source]);}
    else await q("UPDATE whatsapp_message_deliveries SET status='failed',error_code='synthetic_unknown' WHERE merchant_id=?",[f.merchantId]);
    expect((await review()).result.success).toBe(false);expect(await messages()).toEqual([]);expect(await audits()).toHaveLength(1);once();
   });
   it.each(['digest','json-string'])('records an unavailable review without projecting corrupt %s evidence',async corruption=>{
    await q(`UPDATE ${table} SET ${corruption==='digest'?"basis_digest=REPEAT('a',64)":"basis=JSON_QUOTE('invalid snapshot')"} WHERE id=?`,[source]);const before=await row();
    expect((await review()).result).toEqual({success:false,status:'unavailable',persisted:false});expect(await row()).toEqual(before);expect(await messages()).toEqual([]);expect(await audits()).toHaveLength(1);once();
   });
   it('isolates tenants and rejects mismatched author or conversation before auditing',async()=>{
    await expect(checkTeamStaffAttempt(author.merchantId,author.userId,input())).rejects.toThrow();
    for(const patch of [{authorUserId:f.userId},{conversationId:conv+100000}])await expect(checkTeamStaffAttempt(f.merchantId,f.userId,{...input(),...patch})).rejects.toThrow();
    expect((await listTeamStaffAttempts(author.merchantId,author.userId,{kind})).items).toEqual([]);expect(await audits()).toEqual([]);once();
   });
   it('retains auditable acceptance after the conversation and attempt are deleted',async()=>{
    await q('DELETE FROM conversations WHERE id=?',[conv]);const result=await review();expect(result.result).toMatchObject({success:true,persisted:false});
    await q(`DELETE FROM ${table} WHERE id=?`,[source]);expect(await review()).toEqual(result);expect((await listStaffTeamReviews(f.merchantId,f.userId,{kind})).items).toHaveLength(1);once();
   });
   it('refuses corrupted audit snapshots rather than replaying or displaying them',async()=>{
    await review();await q("UPDATE ai_sales_staff_reviews SET snapshot_digest=REPEAT('a',64) WHERE merchant_id=?",[f.merchantId]);await expect(review()).rejects.toThrow();
    await expect(listStaffTeamReviews(f.merchantId,f.userId,{kind})).rejects.toThrow();expect(await audits()).toHaveLength(1);once();
   });
   if(channel==='registered'&&kind==='text'){
    it('paginates and filters attempts and audits independently without leaking reply content',async()=>{
     mocks.send.mockReset();for(let n=0;n<22;n++){sendRequest=randomUUID();mocks.send.mockResolvedValue({accepted:true,status:'sent',providerMessageId:`page-${f.merchantId}-${n}`});await send();}
     const first=await listTeamStaffAttempts(f.merchantId,f.userId,{kind});expect(first.items).toHaveLength(20);expect(first.nextCursor).toBe(first.items.at(-1)!.attempt.id);
     expect((await listTeamStaffAttempts(f.merchantId,f.userId,{kind,beforeId:first.nextCursor!})).items).toHaveLength(3);
     expect((await listTeamStaffAttempts(f.merchantId,f.userId,{kind,authorUserId:f.userId})).items).toEqual([]);
     expect((await listTeamStaffAttempts(f.merchantId,f.userId,{kind,conversationId:conv+100000})).items).toEqual([]);
     expect(JSON.stringify(first)).not.toMatch(/private|media\.|receipt|Digest|requestId|token/);
     for(let n=0;n<23;n++){reviewRequest=randomUUID();await review();}
     const history=await listStaffTeamReviews(f.merchantId,f.userId,{kind,conversationId:conv,authorUserId:author.userId});expect(history.items).toHaveLength(20);
     expect((await listStaffTeamReviews(f.merchantId,f.userId,{kind,beforeId:history.nextCursor!})).items).toHaveLength(3);
     expect((await listStaffTeamReviews(f.merchantId,f.userId,{kind,authorUserId:f.userId})).items).toEqual([]);
    });
    it('holds administrative authority until the audit transaction commits',async()=>{
     await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[f.merchantId,f.userId]);
     let started!:()=>void,release!:()=>void,revoked=false;const begun=new Promise<void>(r=>started=r),held=new Promise<void>(r=>release=r);
     const pool=(await getPool())!,connect=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),execute=c.execute.bind(c);
      vi.spyOn(c,'execute').mockImplementation((async(sql:any,args:any)=>{if(String(sql).includes('INSERT INTO ai_sales_staff_reviews')){started();await held;}return execute(sql,args);}) as any);return c;});
     const checking=review();await begun;const revoking=q("UPDATE merchant_members SET role='viewer' WHERE merchant_id=? AND user_id=?",[f.merchantId,f.userId]).then(()=>{revoked=true;});
     try{await new Promise(r=>setTimeout(r,30));expect(revoked).toBe(false);}finally{release();}
     expect((await checking).result.success).toBe(true);await revoking;vi.restoreAllMocks();reviewRequest=randomUUID();await expect(review()).rejects.toThrow();expect(await audits()).toHaveLength(1);once();
    });
   }
  });
 });
});
