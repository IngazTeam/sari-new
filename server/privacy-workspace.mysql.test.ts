import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import bcrypt from 'bcryptjs';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {createSessionId,hashSessionId} from './_core/session-security';
import {readPrivacyWorkspace} from './accounts/privacy-workspace';
import {accountDataRouter} from './routers-account-data';
import {apiRateLimitBucketHash} from './api/distributed-rate-limit';
describe.skipIf(!process.env.DATABASE_URL)('Account privacy workspace on disposable MySQL',()=>{
 let a:Awaited<ReturnType<typeof createDisposableMerchant>>,b:typeof a,sessionId:string,caller:ReturnType<typeof accountDataRouter.createCaller>;
 const password='Disposable-only-519',q=async(sql:string,args:any[]=[]) =>(await (await getPool())!.execute<any>(sql,args))[0];
 beforeEach(async()=>{
  a=await createDisposableMerchant('privacy519');b=await createDisposableMerchant('privacy519-other');sessionId=createSessionId();
  await q('UPDATE users SET password=? WHERE id=?',[await bcrypt.hash(password,4),a.userId]);
  await q('INSERT INTO auth_sessions(user_id,token_id_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))',[a.userId,hashSessionId(sessionId)]);
  caller=accountDataRouter.createCaller({user:{id:a.userId,role:'user'},session:{sessionId},req:{headers:{'x-merchant-id':String(b.merchantId)}},res:{clearCookie:vi.fn()}} as any);
 });
 afterEach(async()=>{
  vi.restoreAllMocks();
  for(const x of [a,b])if(x){
   await q('DELETE FROM consent_receipts WHERE user_id=?',[x.userId]);await q('DELETE FROM data_subject_requests WHERE user_id=?',[x.userId]);
   for(const ns of ['privacy:password','privacy:write'])await q('DELETE FROM api_rate_limit_windows WHERE bucket_hash=?',[apiRateLimitBucketHash(ns,String(x.userId))]);
  }
  await cleanupDisposableMerchants([a?.userId,b?.userId].filter(Boolean));
 });afterAll(closeDb);
 it('scopes owned stores to the account regardless of selected tenant',async()=>{
  const second=Number((await q("INSERT INTO merchants(userId,businessName,status) VALUES (?,'Second owned store','active')",[a.userId])).insertId);
  const d=await caller.getState();expect(d.actorId).toBe(a.userId);expect(d.scope).toBe('account');expect(d.ownedStores.map(s=>s.id)).toEqual([a.merchantId,second]);expect(d.marketingConsent).toBe(false);expect(d.canVerifyPassword).toBe(true);
 });
 it.each(['revoked','expired','foreign','disabled'])('rejects %s session for reads and writes',async mode=>{
  if(mode==='revoked')await q('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?',[a.userId]);
  if(mode==='expired')await q('UPDATE auth_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE user_id=?',[a.userId]);
  if(mode==='foreign')await q('UPDATE auth_sessions SET user_id=? WHERE user_id=?',[b.userId,a.userId]);
  if(mode==='disabled')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[a.userId]);
  await expect(caller.getState()).rejects.toBeDefined();await expect(caller.setMarketingConsent({granted:true})).rejects.toBeDefined();await expect(caller.exportPersonalData({password})).rejects.toBeDefined();expect(await q('SELECT id FROM consent_receipts WHERE user_id=?',[a.userId])).toEqual([]);
 });
 it('stores and withdraws consent with an account-bound receipt',async()=>{
  expect(await caller.setMarketingConsent({granted:true})).toMatchObject({success:true,actorId:a.userId,granted:true});expect((await caller.getState()).marketingConsent).toBe(true);
  await caller.setMarketingConsent({granted:false});const d=await caller.getState();expect(d.marketingConsent).toBe(false);expect(d.requests[0]).toMatchObject({requestType:'withdraw_consent',status:'completed'});
  await q("UPDATE consent_receipts SET granted=1,withdrawn_at=UTC_TIMESTAMP() WHERE user_id=?",[a.userId]);expect((await caller.getState()).marketingConsent).toBe(false);
 });
 it('keeps an existing open request and explicitly reports that new details were not stored',async()=>{
  const first=await caller.submitRequest({requestType:'correction',details:'Correct name'}),second=await caller.submitRequest({requestType:'correction',details:'Different details'});
  expect(first.created).toBe(true);expect(second).toMatchObject({id:first.id,created:false,actorId:a.userId});
  const rows=await q('SELECT request_metadata FROM data_subject_requests WHERE user_id=?',[a.userId]);expect(rows).toHaveLength(1);expect(JSON.stringify(rows)).toContain('Correct name');expect(JSON.stringify(rows)).not.toContain('Different details');
 });
 it('bounds history to 20 latest own requests without leaking another account',async()=>{
  for(let i=0;i<22;i++)await q("INSERT INTO data_subject_requests(user_id,subject_reference_hash,request_type,status,requested_at,due_at,rejection_reason) VALUES (?,REPEAT('a',64),'access','rejected',UTC_TIMESTAMP(),UTC_TIMESTAMP(),?)",[a.userId,'Own '+i]);
  await q("INSERT INTO data_subject_requests(user_id,subject_reference_hash,request_type,status,requested_at,due_at,rejection_reason) VALUES (?,REPEAT('a',64),'access','rejected',UTC_TIMESTAMP(),UTC_TIMESTAMP(),'Other account private text')",[b.userId]);
  const d=await caller.getState();expect(d.requests).toHaveLength(20);expect(d.requests[0].rejectionReason).toBe('Own 21');expect(JSON.stringify(d)).not.toContain('Other account');
 });
 it('exports only own personal data, records generation and excludes credentials',async()=>{
  const d=await caller.exportPersonalData({password});expect(d.account.id).toBe(a.userId);expect(d.merchants.map(m=>m.id)).toEqual([a.merchantId]);expect(d.account).not.toHaveProperty('password');expect(JSON.stringify(d)).not.toContain(password);expect(d.requestId).toBeGreaterThan(0);expect((await caller.getState()).requests[0]).toMatchObject({id:d.requestId,requestType:'export',status:'completed'});
 });
 it('maps wrong passwords to a safe field error and rate-limits repeated attempts across actions',async()=>{
  for(let i=0;i<5;i++)await expect(caller.exportPersonalData({password:'Wrong-password'})).rejects.toMatchObject({code:'BAD_REQUEST',message:'privacy:password_invalid'});
  await expect(caller.requestDeletion({password,confirmation:'DELETE_MY_ACCOUNT'})).rejects.toMatchObject({code:'TOO_MANY_REQUESTS'});expect(await q('SELECT id FROM data_subject_requests WHERE user_id=?',[a.userId])).toEqual([]);
 });
 it('refuses a truncated export when owned stores exceed the direct-export limit',async()=>{
  for(let i=0;i<100;i++)await q("INSERT INTO merchants(userId,businessName,status) VALUES (?,'Extra disposable store','active')",[a.userId]);
  expect((await caller.getState()).hasMoreStores).toBe(true);await expect(caller.exportPersonalData({password})).rejects.toMatchObject({message:'privacy:export_too_large'});expect(await q('SELECT id FROM data_subject_requests WHERE user_id=?',[a.userId])).toEqual([]);
 });
 it('requires exact confirmation and rejects caller-supplied user IDs',async()=>{
  await expect(caller.requestDeletion({password,confirmation:'DELETE'} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
  await expect(caller.submitRequest({requestType:'access',details:'Own data',userId:b.userId} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
  expect((await q('SELECT account_status FROM users WHERE id=?',[a.userId]))[0].account_status).toBe('active');
 });
 it('shows shared ownership and blocks deletion before suspending the account',async()=>{
  await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[a.merchantId,b.userId]);expect((await caller.getState()).ownedStores[0].shared).toBe(true);
  await expect(caller.requestDeletion({password,confirmation:'DELETE_MY_ACCOUNT'})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect((await q('SELECT account_status FROM users WHERE id=?',[a.userId]))[0].account_status).toBe('active');
 });
 it('suspends only the disposable account and revokes sessions after accepted deletion',async()=>{
  const r=await caller.requestDeletion({password,confirmation:'DELETE_MY_ACCOUNT'});expect(r).toMatchObject({success:true,actorId:a.userId,request:{status:'pending'}});
  expect((await q('SELECT account_status,password FROM users WHERE id=?',[a.userId]))[0]).toMatchObject({account_status:'deletion_pending',password:null});
  expect((await q('SELECT status,autoReplyEnabled FROM merchants WHERE id=?',[a.merchantId]))[0]).toMatchObject({status:'suspended',autoReplyEnabled:0});
  await expect(readPrivacyWorkspace(a.userId,sessionId)).rejects.toThrow('ACCOUNT_UNAVAILABLE');expect((await q('SELECT account_status FROM users WHERE id=?',[b.userId]))[0].account_status).toBe('active');
 });
 it('rolls back request creation when an insert acknowledgement is invalid',async()=>{
  const pool=(await getPool())!,original=pool.getConnection.bind(pool);
  vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
   const tx=await original(),execute=tx.execute.bind(tx);
   vi.spyOn(tx,'execute').mockImplementation((async(sql:any,args:any)=>{const r=await execute(sql,args);return String(sql).includes('INSERT INTO data_subject_requests')?[{affectedRows:0,insertId:0},[]]:r;}) as any);return tx;
  });
  await expect(caller.submitRequest({requestType:'access',details:'Access my data'})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR'});
  expect(await q('SELECT id FROM data_subject_requests WHERE user_id=?',[a.userId])).toEqual([]);
 });
});
