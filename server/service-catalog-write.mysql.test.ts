import {afterAll,afterEach,beforeEach,describe,expect,it} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {createService,createServiceCategory,createServicePackage,getServiceById,getServicePackageById,getServiceCategoryById,updateService,updateServicePackage,updateServiceCategory,deleteService,deleteServiceCategory,deleteServicePackage} from './db';
import {serviceCatalogDefinitionKey} from './service-catalog-write';
import {servicesRouter} from './routers-services';
import {serviceCategoriesRouter} from './routers-service-categories';
import {servicePackagesRouter} from './routers-service-packages';
describe.skipIf(!process.env.DATABASE_URL)('atomic local service catalog writes',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner;
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const create=(patch:any={})=>createService({merchantId:owner.merchantId,name:'Service fixture',priceType:'variable',minPrice:50,maxPrice:100,durationMinutes:60,...patch});
 const context=()=>({user:{id:owner.userId,role:'user'},req:{headers:{'x-merchant-id':String(owner.merchantId)}},res:{}} as any);
 beforeEach(async()=>{owner=await createDisposableMerchant('service-writes');other=await createDisposableMerchant('service-writes-other');});
 afterEach(async()=>{await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
 it('preserves zero settings and clears optional relationships, text and price modes explicitly',async()=>{
   const categoryId=await createServiceCategory({merchantId:owner.merchantId,name:'Category'});const id=await create({categoryId,description:'Before',maxBookingsPerDay:3,advanceBookingDays:0});
   expect(await getServiceById(id)).toMatchObject({advanceBookingDays:0,requiresAppointment:1});
   await updateService(id,{categoryId:null,description:null,maxBookingsPerDay:null,priceType:'custom',staffIds:'[]'},owner.merchantId);
   expect(await getServiceById(id)).toMatchObject({categoryId:null,description:null,maxBookingsPerDay:null,basePrice:null,minPrice:null,maxPrice:null,staffIds:'[]'});
   await updateService(id,{priceType:'fixed',basePrice:0},owner.merchantId);expect(await getServiceById(id)).toMatchObject({basePrice:0,priceType:'fixed'});
 });
 it('does not inject create defaults into partial edits through the actual routers',async()=>{
   const categoryId=await createServiceCategory({merchantId:owner.merchantId,name:'Category',nameEn:'English',color:'#112233',displayOrder:4}),id=await create({categoryId,description:'Keep description',advanceBookingDays:0,bufferTimeMinutes:15,requiresAppointment:0});
   await servicesRouter.createCaller(context()).update({serviceId:id,name:'Renamed service'});
   expect(await getServiceById(id)).toMatchObject({name:'Renamed service',categoryId,description:'Keep description',advanceBookingDays:0,bufferTimeMinutes:15,requiresAppointment:0,minPrice:50,maxPrice:100});
   await serviceCategoriesRouter.createCaller(context()).update({categoryId,name:'Renamed category'});expect(await getServiceCategoryById(categoryId)).toMatchObject({nameEn:'English',color:'#112233',displayOrder:4});
   const packageId=await createServicePackage({merchantId:owner.merchantId,name:'Package',description:'Keep package description',serviceIds:JSON.stringify([id]),originalPrice:1000,packagePrice:900,isActive:0});
   await servicePackagesRouter.createCaller(context()).update({packageId,name:'Renamed package'});expect(await getServicePackageById(packageId)).toMatchObject({description:'Keep package description',isActive:0});
 });
 it('validates the merged price range while holding the lock under concurrent partial edits',async()=>{
   const id=await create();const results=await Promise.allSettled([updateService(id,{minPrice:90},owner.merchantId),updateService(id,{maxPrice:60},owner.merchantId)]);
   expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);const row=await getServiceById(id);expect(row.minPrice!).toBeLessThanOrEqual(row.maxPrice!);
 });
 it('rejects stale edits and archives without replacing the newer record',async()=>{
   const id=await create(),key=serviceCatalogDefinitionKey('service',owner.merchantId,id,await getServiceById(id));
   await updateService(id,{name:'New version'},owner.merchantId,key);await expect(updateService(id,{name:'Stale version'},owner.merchantId,key)).rejects.toMatchObject({code:'CONFLICT'});
   await expect(deleteService(id,owner.merchantId,key)).rejects.toMatchObject({code:'CONFLICT'});expect(await getServiceById(id)).toMatchObject({name:'New version',isActive:1});
 });
 it('rejects writes with another tenant even when a caller bypasses the router',async()=>{
   const id=await create();await expect(updateService(id,{name:'Foreign'},other.merchantId)).rejects.toMatchObject({code:'NOT_FOUND'});await expect(deleteService(id,other.merchantId)).rejects.toMatchObject({code:'NOT_FOUND'});expect((await getServiceById(id)).isActive).toBe(1);
 });
 it('rechecks reference ownership under the transaction and rolls back invalid creation',async()=>{
   const categoryId=await createServiceCategory({merchantId:other.merchantId,name:'Foreign'});await expect(create({categoryId})).rejects.toMatchObject({code:'NOT_FOUND'});
   expect(await q('SELECT id FROM services WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
 });
 it('recalculates package discounts after partial price updates and rejects invalid merged totals',async()=>{
   const serviceId=await create(),id=await createServicePackage({merchantId:owner.merchantId,name:'Package',serviceIds:JSON.stringify([serviceId]),originalPrice:1000,packagePrice:750,discountPercentage:99});
   expect((await getServicePackageById(id)).discountPercentage).toBe(25);await updateServicePackage(id,{packagePrice:500},owner.merchantId);expect((await getServicePackageById(id)).discountPercentage).toBe(50);
   await expect(updateServicePackage(id,{originalPrice:400},owner.merchantId)).rejects.toMatchObject({code:'BAD_REQUEST'});expect((await getServicePackageById(id)).originalPrice).toBe(1000);
 });
 it('checks category and package review versions and explicit text clearing',async()=>{
   const categoryId=await createServiceCategory({merchantId:owner.merchantId,name:'Category',nameEn:'English',description:'Before'}),category=await getServiceCategoryById(categoryId),key=serviceCatalogDefinitionKey('category',owner.merchantId,categoryId,category);
   await updateServiceCategory(categoryId,{nameEn:null,description:null},owner.merchantId,key);await expect(deleteServiceCategory(categoryId,owner.merchantId,key)).rejects.toMatchObject({code:'CONFLICT'});expect(await getServiceCategoryById(categoryId)).toMatchObject({nameEn:null,description:null,isActive:1});
   const id=await createServicePackage({merchantId:owner.merchantId,name:'Package',serviceIds:JSON.stringify([await create()]),originalPrice:0,packagePrice:0}),pkey=serviceCatalogDefinitionKey('package',owner.merchantId,id,await getServicePackageById(id));
   await updateServicePackage(id,{name:'Updated'},owner.merchantId,pkey);await expect(deleteServicePackage(id,owner.merchantId,pkey)).rejects.toMatchObject({code:'CONFLICT'});
 });
 it('allows explicit repair or soft deactivation of corrupt legacy data',async()=>{
   const id=await create();await q("UPDATE services SET staff_ids='invalid' WHERE id=?",[id]);await expect(updateService(id,{name:'Retain bad assignment'},owner.merchantId)).rejects.toMatchObject({code:'BAD_REQUEST'});
   await updateService(id,{staffIds:'[]'},owner.merchantId);expect((await getServiceById(id)).staffIds).toBe('[]');await q('UPDATE services SET min_price=-1 WHERE id=?',[id]);await deleteService(id,owner.merchantId);expect((await getServiceById(id)).isActive).toBe(0);
 });
});
