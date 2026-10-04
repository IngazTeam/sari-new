import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {readAcquisitionWorkspace} from './analytics/acquisition-workspace';
describe.skipIf(!process.env.DATABASE_URL)('acquisition profile evidence in disposable MySQL',()=>{
 let a:Awaited<ReturnType<typeof createDisposableMerchant>>,b:typeof a;
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const add=async(preferences:string|null,days=0,merchant=a.merchantId)=>q('INSERT INTO customer_profiles(merchant_id,customer_phone,display_name,preferences,created_at) VALUES (?,?,?, ?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY))',[merchant,randomUUID(),'PRIVATE_NAME',preferences,days]);
 beforeEach(async()=>{a=await createDisposableMerchant('acquisition503');b=await createDisposableMerchant('acq503-other');});
 afterEach(async()=>cleanupDisposableMerchants([a?.userId,b?.userId].filter(Boolean)));afterAll(closeDb);
 it('does not relabel missing, malformed, object or null tags as organic traffic',async()=>{
  for(const v of [null,'{bad','{}','[]','null','{"acquisitionSource":null}','{"acquisitionSource":{}}','{"acquisitionSource":1}','{"acquisitionSource":"   "}'])await add(v);
  await add('{"acquisitionSource":"direct"}');
  const r=await readAcquisitionWorkspace(a.userId,a.merchantId,{});
  expect(r).toMatchObject({totalProfiles:10,classifiedProfiles:1,unattributedProfiles:9});expect(r.sources).toEqual([{source:'unattributed',count:9,sharePermille:900},{source:'direct',count:1,sharePermille:100}]);
 });
 it('normalizes known tags, groups unknown values and never exposes raw customer text',async()=>{
  for(const value of ['INSTAGRAM',' instagram ','google','google_ads','referral','whatsapp','__proto__','constructor','PRIVATE_PHONE_SECRET'])await add(JSON.stringify({acquisitionSource:value,phone:'PRIVATE_PHONE'}));
  const r=await readAcquisitionWorkspace(a.userId,a.merchantId,{});expect(r).toMatchObject({totalProfiles:9,classifiedProfiles:6,otherProfiles:3,unattributedProfiles:0});expect(r.sources.find(v=>v.source==='instagram')?.count).toBe(2);expect(JSON.stringify(r)).not.toMatch(/PRIVATE|__proto__|constructor|preferences/);
 });
 it.each([['all',3],['30d',1],['90d',2]] as const)('bounds %s by profile creation and excludes future records',async(period,total)=>{
  for(const days of [0,45,100,-2])await add('{"acquisitionSource":"instagram"}',days);
  expect((await readAcquisitionWorkspace(a.userId,a.merchantId,{period})).totalProfiles).toBe(total);
 });
 it('counts only profiles of the selected tenant and preserves empty other tenants',async()=>{
  await add('{"acquisitionSource":"instagram"}');expect((await readAcquisitionWorkspace(b.userId,b.merchantId,{})).totalProfiles).toBe(0);
  await expect(readAcquisitionWorkspace(b.userId,a.merchantId,{})).rejects.toThrow('forbidden');
 });
 it.each(['viewer','manager','sales_supervisor','owner'])('allows live %s analytics membership without exposing other stores',async role=>{
  await add('{"acquisitionSource":"direct"}');await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,1)',[a.merchantId,b.userId,role]);expect((await readAcquisitionWorkspace(b.userId,a.merchantId,{})).totalProfiles).toBe(1);
  await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[a.merchantId,b.userId]);await expect(readAcquisitionWorkspace(b.userId,a.merchantId,{})).rejects.toThrow('forbidden');
 });
 it('does not allow a revoked owner to fall back to legacy ownership',async()=>{await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[a.merchantId,a.userId]);await expect(readAcquisitionWorkspace(a.userId,a.merchantId,{})).rejects.toThrow('forbidden');});
 it('blocks a deactivated account and never modifies the stored preferences',async()=>{
  const payload='{"acquisitionSource":"instagram","private":"KEEP"}';await add(payload);
  await readAcquisitionWorkspace(a.userId,a.merchantId,{});expect((await q('SELECT preferences FROM customer_profiles WHERE merchant_id=?',[a.merchantId]))[0].preferences).toBe(payload);
  await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[a.userId]);await expect(readAcquisitionWorkspace(a.userId,a.merchantId,{})).rejects.toThrow('forbidden');
 });
});
