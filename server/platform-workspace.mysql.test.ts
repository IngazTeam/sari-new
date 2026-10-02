import {afterAll,afterEach,beforeEach,describe,it,expect} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {readPlatformWorkspace} from './integrations/platform-workspace';
import {checkExistingIntegrations,validateNewPlatformConnection} from './integrations/platform-checker';
import {integrationsRouter} from './routers-integrations';
describe.skipIf(!process.env.DATABASE_URL)('platform inventory MySQL contracts',()=>{
 let own:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof own;
 const q=async(text:string,params:unknown[]=[]) => (await (await getPool())!.execute<any>(text,params))[0];
 beforeEach(async()=>{own=await createDisposableMerchant('platform-space');other=await createDisposableMerchant('platform-other');});
 afterEach(async()=>cleanupDisposableMerchants([own.userId,other.userId]));afterAll(closeDb);
 const read=()=>readPlatformWorkspace(own.userId,own.merchantId);
 it('reads five complete empty states with no foreign connection leakage',async()=>{
  await q("INSERT INTO salla_connections (merchantId,storeUrl,accessToken,syncStatus) VALUES (?,'https://private.example.test','SECRET','active')",[other.merchantId]);
  const result=await read();expect(result).toMatchObject({occupied:0,conflict:false,stats:{products:0,customers:0}});expect(result.platforms).toHaveLength(5);expect(JSON.stringify(result)).not.toMatch(/private|SECRET/);
 });
 it.each(['active','syncing','paused','error'])('retains a %s stored Salla link for admission',async state=>{
  await q('INSERT INTO salla_connections (merchantId,storeUrl,accessToken,syncStatus) VALUES (?,?,?,?)',[own.merchantId,'https://store.example.test/?token=secret','PRIVATE',state]);
  expect((await read()).platforms[0]).toMatchObject({occupiesSlot:true,state:state==='active'?'configured':state,storeUrl:'https://store.example.test/'});
  await expect(validateNewPlatformConnection(own.merchantId,'زد')).rejects.toThrow('سلة');expect(JSON.stringify(await read())).not.toMatch(/secret|PRIVATE/);
 });
 it('keeps the canonical inactive Zid record authoritative over an active legacy record',async()=>{
  await q("INSERT INTO zid_settings (merchant_id,is_active,store_url) VALUES (?,1,'https://legacy.example.test')",[own.merchantId]);
  expect((await read()).platforms[1]).toMatchObject({legacy:true,state:'configured'});
  await q("INSERT INTO platform_integrations (merchant_id,platform_type,is_active,store_url) VALUES (?,'zid',0,'https://canonical.example.test')",[own.merchantId]);
  expect((await read()).platforms[1]).toMatchObject({legacy:false,state:'disabled',occupiesSlot:false});expect(await checkExistingIntegrations(own.merchantId)).toEqual([]);
 });
 it('reports Byaan pending verification, Woo errors and Shopify without hiding conflicts',async()=>{
  await q("INSERT INTO byaan_connections (merchant_id,tenant_domain,is_active,sync_status) VALUES (?,?,0,'pending_verification')",[own.merchantId,`academy-${own.merchantId}.example.test`]);
  await q("INSERT INTO woocommerce_settings (merchant_id,store_url,consumer_key,consumer_secret,is_active,connectionStatus) VALUES (?,'https://woo.example.test','SECRET','PRIVATE',1,'error')",[own.merchantId]);
  await q("INSERT INTO platform_integrations (merchant_id,platform_type,is_active) VALUES (?,'shopify',1)",[own.merchantId]);
  const result=await read();expect(result).toMatchObject({occupied:3,conflict:true});expect(result.platforms[2].state).toBe('error');expect(result.platforms[4].state).toBe('pending_verification');expect(await checkExistingIntegrations(own.merchantId)).toHaveLength(3);
 });
 it('counts more than 500 customer profiles and excludes another tenant',async()=>{
  const values=Array.from({length:503},(_,i)=>[own.merchantId,'profile-'+i]);
  await q('INSERT INTO customer_profiles (merchant_id,customer_phone) VALUES '+values.map(()=>'(?,?)').join(','),values.flat());
  await q("INSERT INTO customer_profiles (merchant_id,customer_phone) VALUES (?,'foreign-profile')",[other.merchantId]);
  expect((await read()).stats).toMatchObject({customers:503,audience:'customers'});
 });
 it('uses active trainees for Byaan rather than customer profiles',async()=>{
  await q("UPDATE merchants SET integration_source='byaan' WHERE id=?",[own.merchantId]);
  const values=Array.from({length:502},(_,i)=>[own.merchantId,'trainee-'+i,'Trainee','active']);
  await q('INSERT INTO byaan_trainees (merchant_id,external_id,name,status) VALUES '+values.map(()=>'(?,?,?,?)').join(','),values.flat());
  await q("INSERT INTO byaan_trainees (merchant_id,external_id,name,status) VALUES (?,'inactive','Inactive','archived')",[own.merchantId]);
  expect((await read()).stats).toMatchObject({customers:502,audience:'trainees'});
 });
 it('honors selected membership and revocation for every read surface',async()=>{
  await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[own.merchantId,other.userId]);
  const caller=integrationsRouter.createCaller({user:{id:other.userId,role:'user'},req:{headers:{'x-merchant-id':String(own.merchantId)}},res:{}} as any);
  expect(await caller.workspace()).toMatchObject({actorId:other.userId,merchantId:own.merchantId});
  expect(await caller.getCurrentPlatform()).toBeNull();expect(await caller.getAllConnectedPlatforms()).toEqual([]);expect(await caller.getByaanStatus()).toMatchObject({merchantId:own.merchantId});
  await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[own.merchantId,other.userId]);
  await expect(caller.workspace()).rejects.toMatchObject({code:'FORBIDDEN'});await expect(caller.getByaanStatus()).rejects.toMatchObject({code:'FORBIDDEN'});
 });
});
