import {afterAll,afterEach,beforeEach,describe,expect,it} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {getServicesByCategory} from './db';
import {servicesRouter} from './routers-services';
import {servicePackagesRouter} from './routers-service-packages';
describe.skipIf(!process.env.DATABASE_URL)('service relationships on disposable MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,categoryId:number,foreignCategoryId:number,ownService:number,foreignService:number;
  const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const context=()=>({user:{id:owner.userId,role:'user'},req:{headers:{'x-merchant-id':String(owner.merchantId)}},res:{}} as any);
  beforeEach(async()=>{
    owner=await createDisposableMerchant('service-access');other=await createDisposableMerchant('service-access-other');
    categoryId=Number((await q("INSERT INTO service_categories (merchant_id,name) VALUES (?,'Local category')",[owner.merchantId])).insertId);
    foreignCategoryId=Number((await q("INSERT INTO service_categories (merchant_id,name) VALUES (?,'Foreign category')",[other.merchantId])).insertId);
    ownService=Number((await q("INSERT INTO services (merchant_id,name,category_id,duration_minutes) VALUES (?,'Local service',?,60)",[owner.merchantId,categoryId])).insertId);
    foreignService=Number((await q("INSERT INTO services (merchant_id,name,category_id,duration_minutes) VALUES (?,'Foreign service',?,60)",[other.merchantId,categoryId])).insertId);
  });
  afterEach(async()=>{await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
  it('filters contradictory category links by tenant in the SQL read and router',async()=>{
    expect((await getServicesByCategory(categoryId,owner.merchantId)).map(row=>row.id)).toEqual([ownService]);
    expect((await servicesRouter.createCaller(context()).getByCategory({categoryId})).services.map(row=>row.id)).toEqual([ownService]);
    await expect(servicesRouter.createCaller(context()).getByCategory({categoryId:foreignCategoryId})).rejects.toMatchObject({code:'NOT_FOUND'});
  });
  it('rejects cross-tenant category assignments without creating a service',async()=>{
    await expect(servicesRouter.createCaller(context()).create({name:'Rejected fixture',priceType:'fixed',basePrice:100,durationMinutes:60,categoryId:foreignCategoryId})).rejects.toMatchObject({code:'NOT_FOUND'});
    expect(await q("SELECT id FROM services WHERE merchant_id=? AND name='Rejected fixture'",[owner.merchantId])).toHaveLength(0);
  });
  it('rejects cross-tenant service membership without creating a package',async()=>{
    await expect(servicePackagesRouter.createCaller(context()).create({name:'Rejected package',serviceIds:[ownService,foreignService],originalPrice:200,packagePrice:100})).rejects.toMatchObject({code:'NOT_FOUND'});
    expect(await q("SELECT id FROM service_packages WHERE merchant_id=? AND name='Rejected package'",[owner.merchantId])).toHaveLength(0);
  });
});
