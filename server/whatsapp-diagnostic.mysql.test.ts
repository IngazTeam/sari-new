import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const http=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('axios',()=>({default:http}));
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { runWhatsAppDiagnostic } from './whatsapp/diagnostic-tests';
import { whatsappDiagnosticRouter } from './routers-whatsapp-diagnostic';
import { apiRateLimitBucketHash } from './api/distributed-rate-limit';
import { encryptSecret } from './security/secrets';
import { readWhatsAppDiagnosticWorkspace } from './whatsapp/diagnostic-workspace';
describe.skipIf(!process.env.DATABASE_URL)('scoped WhatsApp diagnostics with disposable MySQL and mocked provider',()=>{
 let a:Awaited<ReturnType<typeof createDisposableMerchant>>,b:typeof a,instanceId:string;
 const token='local_test_credential_506';
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const input=()=>({instanceId,token});
 const text=()=>({...input(),phoneNumber:'99900000001',message:'Synthetic local-only test'});
 const caller=(actorId=a.userId,merchantId=a.merchantId)=>whatsappDiagnosticRouter.createCaller({user:{id:actorId,role:'user'},req:{headers:{'x-merchant-id':String(merchantId)}}} as any);
 beforeEach(async()=>{
  vi.resetAllMocks();a=await createDisposableMerchant('wa-test506');b=await createDisposableMerchant('wa-test506-other');instanceId='7506'+a.merchantId;
  await q("INSERT INTO whatsapp_instances (merchant_id,provider,instance_id,token,api_url,status,is_primary) VALUES (?,'green_api',?,?,'https://api.green-api.com','active',0)",[a.merchantId,instanceId,encryptSecret(token)]);
  http.get.mockImplementation(async(url:string)=>({status:200,data:url.includes('/getSettings/')?{wid:'99900000001@c.us',private:'PRIVATE'}:{stateInstance:'authorized',private:'PRIVATE'}}));http.post.mockResolvedValue({status:200,data:{idMessage:'local_receipt_506',private:'PRIVATE'}});
 });
 afterEach(async()=>{
  for(const merchant of [a,b].filter(Boolean))for(const namespace of ['whatsapp:diagnostic:send','whatsapp:diagnostic:connection'])await q('DELETE FROM api_rate_limit_windows WHERE bucket_hash=?',[apiRateLimitBucketHash(namespace,String(merchant.merchantId))]);
  await cleanupDisposableMerchants([a?.userId,b?.userId].filter(Boolean));
 });afterAll(closeDb);
 it('verifies the selected owner, decrypts saved credentials and returns a minimal provider projection',async()=>{
  const storedBefore=await q('SELECT token,status FROM whatsapp_instances WHERE instance_id=?',[instanceId]);
  expect(await caller().testConnection(input())).toEqual({success:true,status:'authorized',phoneNumber:'99900000001'});expect(await caller().sendTestMessage(text())).toEqual({accepted:true,idMessage:'local_receipt_506'});expect(http.get).toHaveBeenCalledTimes(2);expect(http.post).toHaveBeenCalledOnce();
  expect(await q('SELECT token,status FROM whatsapp_instances WHERE instance_id=?',[instanceId])).toEqual(storedBefore);
 });
 it('reads connection choices without returning tokens, private metadata or inventing live connectivity',async()=>{
  await q('UPDATE whatsapp_instances SET metadata=?,webhook_url=? WHERE instance_id=?',['PRIVATE_METADATA','https://example.test/PRIVATE_WEBHOOK',instanceId]);
  const result=await caller().diagnosticWorkspace({merchantId:a.merchantId});expect(result).toMatchObject({actorId:a.userId,merchantId:a.merchantId,truncated:false,connections:[{instanceId,status:'active',provider:'green_api'}]});expect(JSON.stringify(result)).not.toMatch(/PRIVATE|local_test_credential|token|webhook|connected/);expect(http.get).not.toHaveBeenCalled();
  await expect(caller().diagnosticWorkspace({merchantId:b.merchantId})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('returns an honestly empty owned store and rejects another owner at the source boundary',async()=>{
  expect((await readWhatsAppDiagnosticWorkspace(b.userId,b.merchantId)).connections).toEqual([]);await expect(readWhatsAppDiagnosticWorkspace(b.userId,a.merchantId)).rejects.toThrow('forbidden');
 });
 it('caps choices at 100 and explicitly marks the incomplete list',async()=>{
  for(let i=0;i<100;i++)await q("INSERT INTO whatsapp_instances(merchant_id,provider,instance_id,token,status,is_primary) VALUES (?,'green_api',?,?,'inactive',0)",[a.merchantId,instanceId+'900'+i,encryptSecret(token)]);
  const result=await readWhatsAppDiagnosticWorkspace(a.userId,a.merchantId);expect(result.connections).toHaveLength(100);expect(result.truncated).toBe(true);expect(result.connections[0].instanceId).toBe(instanceId);expect(http.get).not.toHaveBeenCalled();
 });
 it('blocks a foreign instance before even consuming a request',async()=>{
  await expect(caller(b.userId,b.merchantId).testConnection(input())).rejects.toMatchObject({code:'FORBIDDEN'});await expect(caller(b.userId,b.merchantId).sendTestMessage(text())).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(http.get).not.toHaveBeenCalled();expect(http.post).not.toHaveBeenCalled();expect(await q('SELECT request_count FROM api_rate_limit_windows WHERE bucket_hash=?',[apiRateLimitBucketHash('whatsapp:diagnostic:send',String(b.merchantId))])).toHaveLength(0);
 });
 it.each(['viewer','manager','sales_supervisor'])('denies %s membership despite valid credentials',async role=>{
  await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,1)',[a.merchantId,b.userId,role]);await expect(caller(b.userId).testConnection(input())).rejects.toMatchObject({code:'FORBIDDEN'});expect(http.get).not.toHaveBeenCalled();
 });
 it('supports an additional live owner but blocks them immediately after revocation',async()=>{
  await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',1)",[a.merchantId,b.userId]);expect(await caller(b.userId).sendTestMessage(text())).toMatchObject({accepted:true});
  await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[a.merchantId,b.userId]);await expect(caller(b.userId).sendTestMessage(text())).rejects.toMatchObject({code:'FORBIDDEN'});expect(http.post).toHaveBeenCalledOnce();
 });
 it.each(['owner','actor'])('denies a deactivated %s account',async who=>{
  await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',1)",[a.merchantId,b.userId]);await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[who==='owner'?a.userId:b.userId]);await expect(caller(b.userId).testConnection(input())).rejects.toMatchObject({code:'FORBIDDEN'});expect(http.get).not.toHaveBeenCalled();
 });
 it.each(['inactive','expired','pending'])('blocks sending from a stored %s instance',async status=>{await q('UPDATE whatsapp_instances SET status=? WHERE instance_id=?',[status,instanceId]);await expect(caller().sendTestMessage(text())).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(http.post).not.toHaveBeenCalled();});
 it('uses database expiry and prevents a stale credential from reaching the provider',async()=>{
  await q('UPDATE whatsapp_instances SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE instance_id=?',[instanceId]);await expect(caller().sendTestMessage(text())).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
  await expect(caller().testConnection({...input(),token:'different_token'})).rejects.toMatchObject({code:'FORBIDDEN'});expect(http.post).not.toHaveBeenCalled();expect(http.get).not.toHaveBeenCalled();
 });
 it('admits exactly ten text/image attempts across concurrent callers through one database bucket',async()=>{
  const results=await Promise.allSettled(Array.from({length:16},(_,i)=>i%2?caller().sendTestMessage(text()):caller().sendTestImage({...input(),phoneNumber:'99900000001',imageUrl:'https://cdn.example.com/fixture.png'})));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(10);expect(results.filter(r=>r.status==='rejected'&&r.reason?.code==='TOO_MANY_REQUESTS')).toHaveLength(6);expect(http.post).toHaveBeenCalledTimes(10);
  expect((await q('SELECT request_count FROM api_rate_limit_windows WHERE bucket_hash=?',[apiRateLimitBucketHash('whatsapp:diagnostic:send',String(a.merchantId))]))[0].request_count).toBe(10);
 });
 it('retains the request count after an ambiguous provider outcome and never retries internally',async()=>{
  http.post.mockRejectedValue(Error('PRIVATE remote transport failure'));await expect(caller().sendTestMessage(text())).rejects.toMatchObject({message:'whatsapp_test:unavailable'});expect(http.post).toHaveBeenCalledOnce();
  expect((await q('SELECT request_count FROM api_rate_limit_windows WHERE bucket_hash=?',[apiRateLimitBucketHash('whatsapp:diagnostic:send',String(a.merchantId))]))[0].request_count).toBe(1);
 });
 it('does not save an unbound connection during a successful health test',async()=>{
  const before=await q('SELECT COUNT(*) AS n FROM whatsapp_instances WHERE merchant_id=?',[a.merchantId]);expect(await runWhatsAppDiagnostic(a.userId,a.merchantId,'connection',{...input(),instanceId:'799950600000'})).toMatchObject({success:true});expect(await q('SELECT COUNT(*) AS n FROM whatsapp_instances WHERE merchant_id=?',[a.merchantId])).toEqual(before);
 });
});
