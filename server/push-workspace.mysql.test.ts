import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createECDH,randomBytes,randomUUID} from 'node:crypto';
import webpush from 'web-push';
const m=vi.hoisted(()=>({dispatch:vi.fn()}));
vi.mock('./_core/push-transport',async importOriginal=>({...await importOriginal<any>(),dispatchPushRequest:m.dispatch}));
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {createSessionId,hashSessionId} from './_core/session-security';
import {readPushWorkspace,subscribePushDevice,unsubscribePushDevice,testPushDevice,pushDeviceHash,type PushScope} from './push-workspace';
import {getActivePushSubscriptions} from './db_push';
import {apiRateLimitBucketHash} from './api/distributed-rate-limit';
import {pushRouter} from './routers-push';
describe.skipIf(!process.env.DATABASE_URL)('Session bound browser devices and one-attempt tests on MySQL',()=>{
 let a:Awaited<ReturnType<typeof createDisposableMerchant>>,b:typeof a,s:PushScope,other:PushScope,input:any;
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const hash=()=>pushDeviceHash(input.endpoint);
 const test=()=>({deviceHash:hash(),requestId:randomUUID(),reviewed:true as const,language:'en' as const});
 beforeEach(async()=>{
  a=await createDisposableMerchant('push518');b=await createDisposableMerchant('push518-other');
  s={actorId:a.userId,merchantId:a.merchantId,sessionId:createSessionId()};other={actorId:b.userId,merchantId:b.merchantId,sessionId:createSessionId()};
  for(const x of [s,other])await q('INSERT INTO auth_sessions(user_id,token_id_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))',[x.actorId,hashSessionId(x.sessionId)]);
  const keys=webpush.generateVAPIDKeys();vi.stubEnv('VAPID_PUBLIC_KEY',keys.publicKey);vi.stubEnv('VAPID_PRIVATE_KEY',keys.privateKey);
  input={endpoint:'https://fcm.googleapis.com/push/'+randomUUID(),p256dh:createECDH('prime256v1').generateKeys().toString('base64url'),auth:randomBytes(16).toString('base64url'),reviewed:true};
  m.dispatch.mockReset().mockResolvedValue({state:'accepted',httpStatus:201,referenceHash:'a'.repeat(64)});
 });
 afterEach(async()=>{
  for(const x of [a,b])if(x)await q('DELETE FROM api_rate_limit_windows WHERE bucket_hash=?',[apiRateLimitBucketHash('push:device-test',String(x.merchantId))]);
  vi.restoreAllMocks();await cleanupDisposableMerchants([a?.userId,b?.userId].filter(Boolean));vi.unstubAllEnvs();
 });afterAll(closeDb);
 it('confirms the browser registration only for the current actor, tenant and session',async()=>{
  expect(await readPushWorkspace(s,hash())).toMatchObject({deviceEnabled:false});
  await subscribePushDevice(s,input);expect(await readPushWorkspace(s,hash())).toMatchObject({deviceEnabled:true,actorId:a.userId,merchantId:a.merchantId});
  expect(await readPushWorkspace(other,hash())).toMatchObject({deviceEnabled:false});expect(await getActivePushSubscriptions(a.merchantId)).toHaveLength(1);
 });
 it('does not send legacy unbound subscriptions',async()=>{
  await q('INSERT INTO push_subscriptions(merchant_id,endpoint,p256dh,auth) VALUES (?,?,?,?)',[a.merchantId,input.endpoint,input.p256dh,input.auth]);
  expect(await getActivePushSubscriptions(a.merchantId)).toEqual([]);await subscribePushDevice(s,input);
  expect(await getActivePushSubscriptions(a.merchantId)).toHaveLength(1);expect((await q('SELECT is_active FROM push_subscriptions WHERE merchant_id=? AND endpoint_hash IS NULL',[a.merchantId]))[0].is_active).toBe(0);
 });
 it('rebinds a reviewed browser to one tenant only and a former tenant cannot disable it',async()=>{
  await subscribePushDevice(s,input);await subscribePushDevice(other,input);
  await unsubscribePushDevice(s,{deviceHash:hash(),reviewed:true});expect(await getActivePushSubscriptions(a.merchantId)).toHaveLength(0);expect(await getActivePushSubscriptions(b.merchantId)).toHaveLength(1);
  expect(await readPushWorkspace(other,hash())).toMatchObject({deviceEnabled:true});
 });
 it.each(['revoked','expired','owner','merchant','membership'])('removes %s authority from actual send candidates',async reason=>{
  await subscribePushDevice(s,input);
  if(reason==='revoked')await q('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?',[a.userId]);
  if(reason==='expired')await q('UPDATE auth_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE user_id=?',[a.userId]);
  if(reason==='owner')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[a.userId]);
  if(reason==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[a.merchantId]);
  if(reason==='membership')await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[a.merchantId,a.userId]);
  expect(await getActivePushSubscriptions(a.merchantId)).toEqual([]);await expect(testPushDevice(s,test())).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.dispatch).not.toHaveBeenCalled();
 });
 it.each(['viewer','sales_supervisor'])('prevents %s registering a notification recipient',async role=>{
  await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,1)',[a.merchantId,b.userId,role]);
  await expect(subscribePushDevice({...other,merchantId:a.merchantId},input)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('rejects cross-tenant reads without leaking records',async()=>{
  await expect(readPushWorkspace({...s,merchantId:b.merchantId},null)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('tests only the selected device and replays its outcome without sending again',async()=>{
  await subscribePushDevice(s,input);await subscribePushDevice(s,{...input,endpoint:input.endpoint+'2'});const request=test();
  expect(await testPushDevice(s,request)).toMatchObject({state:'accepted'});expect(await testPushDevice(s,request)).toMatchObject({state:'accepted'});expect(m.dispatch).toHaveBeenCalledOnce();
  const view=await readPushWorkspace(s,hash());expect(view.counts).toMatchObject({total:1,accepted:1});expect(JSON.stringify(view)).not.toContain(input.endpoint);
 });
 it('commits its no-repeat marker before any external request',async()=>{
  await subscribePushDevice(s,input);const request=test();
  m.dispatch.mockImplementation(async()=>{const rows=await q('SELECT status FROM push_notification_logs WHERE request_id=?',[request.requestId]);expect(rows[0].status).toBe('started');return {state:'accepted'};});
  await testPushDevice(s,request);expect(m.dispatch).toHaveBeenCalledOnce();
 });
 it.each(['unknown','rejected'])('persists %s outcome and never retries a repeated request',async status=>{
  await subscribePushDevice(s,input);const request=test();m.dispatch.mockResolvedValue({state:status});
  expect(await testPushDevice(s,request)).toMatchObject({state:status});await testPushDevice(s,request);expect(m.dispatch).toHaveBeenCalledOnce();
 });
 it('stores provider exceptions as uncertainty without secret text',async()=>{
  await subscribePushDevice(s,input);m.dispatch.mockRejectedValue(Error('private endpoint token'));const request=test();
  expect(await testPushDevice(s,request)).toMatchObject({state:'unknown'});await testPushDevice(s,request);expect(m.dispatch).toHaveBeenCalledOnce();
  expect(JSON.stringify(await q('SELECT error FROM push_notification_logs WHERE merchant_id=?',[a.merchantId]))).not.toContain('private');
 });
 it('does not repurpose a request ID for a different device or account',async()=>{
  await subscribePushDevice(s,input);const request=test();await testPushDevice(s,request);
  await expect(testPushDevice(s,{...request,language:'ar'})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
  await expect(testPushDevice(other,request)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(m.dispatch).toHaveBeenCalledOnce();
 });
 it('rejects invalid public keys and arbitrary endpoints before storing',async()=>{
  for(const change of [{endpoint:'http://127.0.0.1/'},{p256dh:'A'.repeat(87)},{auth:'a'.repeat(22)}])
    await expect(subscribePushDevice(s,{...input,...change})).rejects.toBeDefined();
  expect(await q('SELECT id FROM push_subscriptions WHERE merchant_id=?',[a.merchantId])).toEqual([]);
 });
 it('applies shared test quota across distinct request IDs',async()=>{
  await subscribePushDevice(s,input);for(let i=0;i<5;i++)await testPushDevice(s,test());
  await expect(testPushDevice(s,test())).rejects.toMatchObject({code:'TOO_MANY_REQUESTS'});expect(m.dispatch).toHaveBeenCalledTimes(5);
 });
 it('scopes and bounds history without exposing stored raw provider errors',async()=>{
  for(let i=0;i<25;i++)await q("INSERT INTO push_notification_logs(merchant_id,title,body,status,error) VALUES (?,'Test',?,'sent','private-token')",[a.merchantId,'x'.repeat(1100)]);
  await q("INSERT INTO push_notification_logs(merchant_id,title,body,status) VALUES (?,'Other','Secret','accepted')",[b.merchantId]);
  const view=await readPushWorkspace(s,null);expect(view.counts).toEqual({total:25,accepted:0,rejected:0,unconfirmed:25});expect(view.logs).toHaveLength(20);expect(view.logs[0].body).toHaveLength(1000);expect(JSON.stringify(view)).not.toMatch(/private-token|Secret/);
 });
 it('uses the explicitly selected tenant through the real router',async()=>{
  const second=Number((await q("INSERT INTO merchants(userId,businessName,status) VALUES (?,'Second disposable store','active')",[a.userId])).insertId);
  const caller=pushRouter.createCaller({user:{id:a.userId,role:'user'},session:{sessionId:s.sessionId},req:{headers:{'x-merchant-id':String(second)}}} as any);
  await caller.subscribe(input);expect(await caller.workspace({deviceHash:hash()})).toMatchObject({merchantId:second,deviceEnabled:true});expect(await getActivePushSubscriptions(a.merchantId)).toEqual([]);
 });
 it('refuses old unreviewed test callers before sending to any device',async()=>{
  const caller=pushRouter.createCaller({user:{id:a.userId,role:'user'},session:{sessionId:s.sessionId},req:{headers:{'x-merchant-id':String(a.merchantId)}}} as any);
  await expect(caller.sendTest()).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(m.dispatch).not.toHaveBeenCalled();
 });
 it('retains the committed marker when receipt persistence fails after sending',async()=>{
  await subscribePushDevice(s,input);const request=test(),pool=(await getPool())!,original=pool.getConnection.bind(pool);
  vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
    const tx=await original(),execute=tx.execute.bind(tx);
    vi.spyOn(tx,'execute').mockImplementation(((sql:any,args:any)=>String(sql).startsWith('UPDATE push_notification_logs SET status=')?Promise.resolve([{affectedRows:0},[]]):execute(sql,args)) as any);
    return tx;
  });
  await expect(testPushDevice(s,request)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
  expect((await q('SELECT status FROM push_notification_logs WHERE request_id=?',[request.requestId]))[0].status).toBe('started');
  expect(await testPushDevice(s,request)).toMatchObject({state:'unknown'});expect(m.dispatch).toHaveBeenCalledOnce();
 });
});
