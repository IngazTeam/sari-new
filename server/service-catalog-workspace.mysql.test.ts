import {afterAll,afterEach,beforeEach,describe,expect,it} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {readCatalogWorkspace,readCatalogRecord,readCatalogChoices} from './service-catalog-workspace';
import {createService,createServiceCategory,createServicePackage,updateService,updateServiceCategory,updateServicePackage} from './db';
import {servicesRouter} from './routers-services';

describe.skipIf(!process.env.DATABASE_URL)('tenant catalog workspace on MySQL',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner;
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const service=(patch:any={})=>createService({merchantId:owner.merchantId,name:'Service fixture',priceType:'fixed',basePrice:0,durationMinutes:60,...patch});
 const scope=()=>[owner.userId,owner.merchantId] as const;
 beforeEach(async()=>{owner=await createDisposableMerchant('catalog-source');other=await createDisposableMerchant('catalog-source-other');});
 afterEach(async()=>{await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
 it('returns all statuses and complete counts with stable, disjoint pages',async()=>{
  const ids:number[]=[];for(let n=0;n<30;n++)ids.push(await service({name:`Service ${n}`,isActive:n<3?0:1}));
  await q('UPDATE services SET is_active=2 WHERE id=?',[ids[29]]);await service({merchantId:other.merchantId,name:'Private foreign name'});
  const first=await readCatalogWorkspace(...scope(),{entity:'service'}),second=await readCatalogWorkspace(...scope(),{entity:'service',page:2});
  expect(first.summary).toEqual({total:30,active:26,inactive:3,unknown:1});expect(first.pagination).toEqual({page:1,pageSize:24,total:30,pages:2});
  expect([...first.rows,...second.rows].map(row=>row.id)).toEqual(ids.slice().reverse());expect(first.rows[0].fields.isActive).toBeNull();expect(first.rows[0].issues).toContain('isActive');expect(JSON.stringify(first)).not.toContain('Private foreign');
  expect((await readCatalogWorkspace(...scope(),{entity:'service',status:'inactive'})).rows).toHaveLength(3);
  expect((await readCatalogWorkspace(...scope(),{entity:'service',status:'unknown'})).rows).toHaveLength(1);
  expect((await readCatalogWorkspace(...scope(),{entity:'service',page:3})).rows).toEqual([]);
 });
 it('treats search symbols literally and distinguishes an empty match from a full catalog',async()=>{
  const id=await service({name:'50%_offer'});await service({name:'Unrelated'});
  const found=await readCatalogWorkspace(...scope(),{entity:'service',search:'%_'});expect(found.rows.map(row=>row.id)).toEqual([id]);expect(found.summary.total).toBe(2);
  const none=await readCatalogWorkspace(...scope(),{entity:'service',search:"' OR 1=1 --"});expect(none.pagination.total).toBe(0);expect(none.summary.total).toBe(2);
 });
 it('keeps legacy malformed references visible and counts unavailable links without revealing foreign names',async()=>{
  const categoryId=await createServiceCategory({merchantId:other.merchantId,name:'Secret category'}),id=await service();
  await q("UPDATE services SET category_id=?,staff_ids='broken' WHERE id=?",[categoryId,id]);
  const data=await readCatalogRecord(...scope(),{entity:'service',id});expect(data.record).toMatchObject({fields:{staffIds:null},unavailableReferences:1});expect(data.record.issues).toContain('staffIds');expect(JSON.stringify(data)).not.toContain('Secret category');
  await expect(readCatalogRecord(other.userId,other.merchantId,{entity:'service',id})).rejects.toThrow('Catalog record not found');
 });
 it('returns write-compatible version evidence for all entity types, including inactive records',async()=>{
  const categoryId=await createServiceCategory({merchantId:owner.merchantId,name:'Category'}),id=await service({categoryId}),packageId=await createServicePackage({merchantId:owner.merchantId,name:'Package',serviceIds:JSON.stringify([id]),originalPrice:0,packagePrice:0});
  for(const [entity,recordId,update] of [['package',packageId,updateServicePackage],['service',id,updateService],['category',categoryId,updateServiceCategory]] as const){
   const record=(await readCatalogRecord(...scope(),{entity,id:recordId})).record;expect(record.issues).toEqual([]);expect(record.unavailableReferences).toBe(0);
   await update(recordId,{isActive:0},owner.merchantId,record.definition);
   expect((await readCatalogRecord(...scope(),{entity,id:recordId})).record.fields.isActive).toBe(false);
   await expect(update(recordId,{name:'Stale'},owner.merchantId,record.definition)).rejects.toMatchObject({code:'CONFLICT'});
  }
 });
 it('marks archived package services and incorrect stored discounts explicitly',async()=>{
  const id=await service(),packageId=await createServicePackage({merchantId:owner.merchantId,name:'Package',serviceIds:JSON.stringify([id]),originalPrice:1000,packagePrice:750});
  await updateService(id,{isActive:0},owner.merchantId);await q('UPDATE service_packages SET discount_percentage=99 WHERE id=?',[packageId]);
  const data=await readCatalogWorkspace(...scope(),{entity:'package'});expect(data.rows[0]).toMatchObject({unavailableReferences:1,issues:['discountPercentage'],fields:{discountPercentage:99}});
  await q("UPDATE service_packages SET service_ids='{}' WHERE id=?",[packageId]);expect((await readCatalogRecord(...scope(),{entity:'package',id:packageId})).record).toMatchObject({fields:{serviceIds:null},issues:['serviceIds']});
 });
 it.each(['category','staff','service'] as const)('paginates only active owned %s choices without private fields',async kind=>{
  const table=kind==='category'?'service_categories':kind==='staff'?'staff_members':'services';
  for(let n=0;n<26;n++)await q(`INSERT INTO ${table} (merchant_id,name${kind==='service'?',duration_minutes':''}) VALUES (?,?${kind==='service'?',60':''})`,[owner.merchantId,`Choice ${n}`]);
  await q(`INSERT INTO ${table} (merchant_id,name,is_active${kind==='service'?',duration_minutes':''}) VALUES (?,'Inactive',0${kind==='service'?',60':''}),(?,'Foreign',1${kind==='service'?',60':''})`,[owner.merchantId,other.merchantId]);
  const first=await readCatalogChoices(...scope(),{kind}),second=await readCatalogChoices(...scope(),{kind,page:2});expect(first.pagination.total).toBe(26);expect(first.rows).toHaveLength(24);expect(second.rows).toHaveLength(2);expect(new Set([...first.rows,...second.rows].map(row=>row.id)).size).toBe(26);expect(Object.keys(first.rows[0]).sort()).toEqual(['id','name']);
  expect((await readCatalogChoices(...scope(),{kind,search:'Choice 25'})).rows).toHaveLength(1);
 });
 it('uses actual membership and selected tenant on all new router reads',async()=>{
  await service();const caller=servicesRouter.createCaller({user:{id:owner.userId,role:'user'},merchantId:other.merchantId,req:{headers:{'x-merchant-id':String(owner.merchantId)}},res:{}} as any);
  expect(await caller.catalogWorkspace({entity:'service'})).toMatchObject({actorId:owner.userId,merchantId:owner.merchantId,canManage:true,summary:{total:1}});
  const forged=servicesRouter.createCaller({user:{id:other.userId,role:'user'},req:{headers:{'x-merchant-id':String(owner.merchantId)}},res:{}} as any);await expect(forged.catalogWorkspace({entity:'service'})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
});
