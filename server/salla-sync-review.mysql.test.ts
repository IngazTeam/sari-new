import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const http=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('axios',()=>({default:{create:()=>http}}));
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {encryptSecret} from './security/secrets';
import {SallaIntegration} from './integrations/salla';
import {sallaSyncReview} from './integrations/salla-sync-review';
import {readSallaWorkspace} from './integrations/salla-workspace';
import type {SallaCatalogGuard} from './integrations/salla-catalog';

describe.skipIf(!process.env.DATABASE_URL)('Salla sync initiating actor and review throughout actual MySQL writes',()=>{
 let own:Awaited<ReturnType<typeof createDisposableMerchant>>,member:typeof own,revision:string;
 const token='synthetic-sync-token-300',q=async(sql:string,args:any[]=[]) => (await(await getPool())!.execute<any>(sql,args))[0];
 const product=(id='123')=>({id,name:'Synthetic',price:{amount:1,currency:'SAR'},quantity:5,unlimited_quantity:false,status:'sale',is_available:true,type:'product',options:[],skus:[]});
 const page=(items=[product()])=>({data:{status:200,success:true,data:items,pagination:{currentPage:1,totalPages:1}}});
 const one=()=>({data:{status:200,success:true,data:product()}});
 const guarded=(guard:SallaCatalogGuard=sallaSyncReview(member.userId,own.merchantId,revision))=>{const s=new SallaIntegration(own.merchantId,token,guard);vi.spyOn(s as any,'sleep').mockResolvedValue(undefined);return s;};
 const revoke=()=>q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[own.merchantId,member.userId]);
 const products=()=>q('SELECT * FROM products WHERE merchantId=? ORDER BY id',[own.merchantId]);
 const logs=()=>q('SELECT * FROM sync_logs WHERE merchantId=? ORDER BY id DESC',[own.merchantId]);
 beforeEach(async()=>{
  vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-phase300-field-encryption-key');own=await createDisposableMerchant('sync-reviewed');member=await createDisposableMerchant('sync-actor');
  await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[own.merchantId,member.userId]);
  await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[own.merchantId,String(own.merchantId),encryptSecret(token)]);
  revision=(await readSallaWorkspace(own.userId,own.merchantId)).revision;http.get.mockReset().mockResolvedValue(page());http.post.mockReset();
 });
 afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([own.userId,member.userId]);vi.unstubAllEnvs();});afterAll(closeDb);
 it.each(['full','stock'] as const)('allows reviewed %s sync for a current manager and never sends provider mutations',async mode=>{
  if(mode==='stock'){http.get.mockResolvedValue(one());await new SallaIntegration(own.merchantId,token).syncSingleProduct('123');}
  const s=guarded();expect(await(mode==='full'?s.fullSync():s.syncStock())).toMatchObject({success:true});expect((await products()).length).toBe(1);expect((await logs())[0].status).toBe('success');expect((await readSallaWorkspace(own.userId,own.merchantId)).lastSyncAt).not.toBeNull();expect(http.post).not.toHaveBeenCalled();
 });
 it.each(['stale','foreign','revoked','owner-revoked','paused'] as const)('rejects %s review before HTTP and before starting a log',async mode=>{
  let actor=member.userId,version=revision;
  if(mode==='stale')await q("UPDATE salla_connections SET storeUrl='https://changed.example.test' WHERE merchantId=?",[own.merchantId]);
  if(mode==='foreign')version=(await readSallaWorkspace(member.userId,member.merchantId)).revision;
  if(mode==='revoked')await revoke();
  if(mode==='owner-revoked'){actor=own.userId;await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[own.merchantId,own.userId]);}
  if(mode==='paused')await q("UPDATE salla_connections SET syncStatus='paused' WHERE merchantId=?",[own.merchantId]);
  await expect(guarded(sallaSyncReview(actor,own.merchantId,version)).fullSync()).rejects.toBeTruthy();expect(http.get).not.toHaveBeenCalled();expect(await logs()).toHaveLength(0);
 });
 it.each(['full','stock'] as const)('rechecks membership after the %s network response before changing a product',async mode=>{
  if(mode==='stock'){http.get.mockResolvedValue(one());await new SallaIntegration(own.merchantId,token).syncSingleProduct('123');}
  const before=await products();http.get.mockImplementationOnce(async()=>{await revoke();return mode==='full'?page():one();});
  await expect(mode==='full'?guarded().fullSync():guarded().syncStock()).rejects.toThrow('Salla catalog synchronization unavailable');expect(await products()).toEqual(before);expect((await logs())[0]).toMatchObject({status:'failed',itemsSynced:0});expect((await readSallaWorkspace(own.userId,own.merchantId)).lastSyncAt).toBeNull();
 });
 it.each(['actor','owner','merchant','token','store','disconnect'] as const)('rejects %s changes during HTTP without saving a late product',async mode=>{
  http.get.mockImplementationOnce(async()=>{
   if(mode==='actor'||mode==='owner')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[mode==='actor'?member.userId:own.userId]);
   if(mode==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[own.merchantId]);
   if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE merchantId=?',[encryptSecret('rotated-token'),own.merchantId]);
   if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE merchantId=?',[String(own.merchantId)+'1',own.merchantId]);
   if(mode==='disconnect')await q('DELETE FROM salla_connections WHERE merchantId=?',[own.merchantId]);
   return page();
  });await expect(guarded().fullSync()).rejects.toThrow();expect(await products()).toHaveLength(0);expect((await logs())[0].status).toBe('failed');expect(JSON.stringify(await logs())).not.toContain(token);
 });
 it('keeps already committed products but stops the next write after revocation',async()=>{
  const check=sallaSyncReview(member.userId,own.merchantId,revision);let writes=0;
  const guard:SallaCatalogGuard=async tx=>{if(tx&&++writes===2)await revoke();await check(tx);};http.get.mockResolvedValue(page([product(),product('456')]));
  await expect(guarded(guard).fullSync()).rejects.toThrow();expect(await products()).toHaveLength(1);expect((await logs())[0]).toMatchObject({status:'failed',itemsSynced:1});expect((await readSallaWorkspace(own.userId,own.merchantId)).lastSyncAt).toBeNull();
 });
 it.each(['full','stock'] as const)('rechecks authority before marking an empty %s result complete',async mode=>{
  const check=sallaSyncReview(member.userId,own.merchantId,revision),guard:SallaCatalogGuard=async tx=>{if(tx)await revoke();await check(tx);};http.get.mockResolvedValue(page([]));const s=guarded(guard);
  await expect(mode==='full'?s.fullSync():s.syncStock()).rejects.toThrow();expect((await logs())[0].status).toBe('failed');expect((await readSallaWorkspace(own.userId,own.merchantId)).lastSyncAt).toBeNull();
 });
 it('takes current permission after waiting for the merchant lock',async()=>{
  const lock=await(await getPool())!.getConnection();let pending:Promise<any>|undefined;
  try{await lock.beginTransaction();await lock.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[own.merchantId]);pending=guarded().fullSync().then(value=>({value}),error=>({error}));await lock.execute('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[own.merchantId,member.userId]);await lock.commit();expect((await pending).error).toMatchObject({reason:'forbidden'});expect(http.get).not.toHaveBeenCalled();}finally{await lock.rollback();lock.release();await pending;}
 });
 it('lets existing system work retain its own connection authority without inheriting a revoked human',async()=>{await revoke();http.get.mockResolvedValue(one());expect(await new SallaIntegration(own.merchantId,token).syncSingleProduct('123')).toEqual({success:true});expect(await products()).toHaveLength(1);});
});
