import {afterAll,afterEach,beforeEach,describe,expect,it} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {getServicesByCategory,getBookingsByService,getServiceRatingStats} from './db';
import {servicesRouter} from './routers-services';
import {servicePackagesRouter} from './routers-service-packages';
import {serviceCategoriesRouter} from './routers-service-categories';
describe.skipIf(!process.env.DATABASE_URL)('service relationships on disposable MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,categoryId:number,foreignCategoryId:number,ownService:number,foreignService:number;
  const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const context=()=>({user:{id:owner.userId,role:'user'},req:{headers:{'x-merchant-id':String(owner.merchantId)}},res:{}} as any);
  const booking=async(merchantId=owner.merchantId,serviceId=ownService,date='2026-10-01')=>Number((await q("INSERT INTO bookings (merchant_id,service_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,final_price) VALUES (?,?,'sample-only',?,'10:00','11:00',60,1000,1000)",[merchantId,serviceId,date])).insertId);
  const rating=async(bookingId:number,value:number,merchantId=owner.merchantId,isPublic=1)=>q("INSERT INTO booking_reviews (merchant_id,service_id,booking_id,customer_phone,overall_rating,is_public) VALUES (?,?,?,'sample-only',?,?)",[merchantId,ownService,bookingId,value,isPublic]);
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
  it('returns the created category, service and package identifiers from real driver results',async()=>{
    const {categoryId:id}=await serviceCategoriesRouter.createCaller(context()).create({name:'Created category'});
    expect(Number.isSafeInteger(id)&&id>0).toBe(true);expect(await q('SELECT id FROM service_categories WHERE id=? AND merchant_id=?',[id,owner.merchantId])).toHaveLength(1);
    const {serviceId}=await servicesRouter.createCaller(context()).create({name:'Created service',categoryId:id,priceType:'fixed',basePrice:1000,durationMinutes:60});
    expect(Number.isSafeInteger(serviceId)&&serviceId>0).toBe(true);expect(await q('SELECT id FROM services WHERE id=? AND merchant_id=?',[serviceId,owner.merchantId])).toHaveLength(1);
    const {packageId}=await servicePackagesRouter.createCaller(context()).create({name:'Created package',serviceIds:[serviceId],originalPrice:1000,packagePrice:900});
    expect(Number.isSafeInteger(packageId)&&packageId>0).toBe(true);expect(await q('SELECT id FROM service_packages WHERE id=? AND merchant_id=?',[packageId,owner.merchantId])).toHaveLength(1);
  });
  it('limits recent bookings in SQL with deterministic ties and excludes another tenant',async()=>{
    const ids:number[]=[];for(let i=0;i<13;i++)ids.push(await booking());await booking(other.merchantId,ownService,'2026-12-31');
    expect((await getBookingsByService(ownService,owner.merchantId,{limit:10})).map(row=>row.id)).toEqual(ids.slice(3).reverse());
    const details=await servicesRouter.createCaller(context()).getById({serviceId:ownService});expect(details.recentBookings.map(row=>row.id)).toEqual(ids.slice(3).reverse());expect(details.bookingStats.total).toBe(13);
    expect(await getBookingsByService(ownService,owner.merchantId,{status:'completed'})).toEqual([]);
    expect(await getBookingsByService(ownService,owner.merchantId,{startDate:'2026-10-02'})).toEqual([]);
    expect(await getBookingsByService(ownService,owner.merchantId,{endDate:'2026-09-30'})).toEqual([]);
    expect(await getBookingsByService(ownService,owner.merchantId)).toHaveLength(13);
  });
  it('aggregates only public valid ratings with a consistent booking and tenant',async()=>{
    const first=await booking(),second=await booking(),foreign=await booking(other.merchantId),different=await booking(owner.merchantId,foreignService);
    await rating(first,5);await rating(second,3);await rating(first,9);await rating(foreign,1);await rating(different,1);await rating(first,1,other.merchantId);await rating(first,1,owner.merchantId,0);
    const stats=await getServiceRatingStats(ownService,owner.merchantId);
    expect(stats).toEqual({totalReviews:2,averageRating:4,excludedReviews:3,ratingDistribution:{1:0,2:0,3:1,4:0,5:1}});
    expect((await servicesRouter.createCaller(context()).getById({serviceId:ownService})).ratingStats).toEqual(stats);
  });
  it('represents an actual empty rating set without NaN',async()=>{
    expect(await getServiceRatingStats(ownService,owner.merchantId)).toEqual({totalReviews:0,averageRating:0,excludedReviews:0,ratingDistribution:{1:0,2:0,3:0,4:0,5:0}});
  });
  it.each([0,-1,1.5,NaN,Infinity,101])('rejects invalid recent-booking limit %s',async limit=>{
    await expect(getBookingsByService(ownService,owner.merchantId,{limit})).rejects.toThrow('Invalid service booking scope');
  });
});
