import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),db:Object.fromEntries(['createService','updateService','deleteService','getServiceById','getServicesByMerchant','getServicesByCategory','getBookingStats','getBookingsByService','getServiceRatingStats','createServiceCategory','updateServiceCategory','deleteServiceCategory','getServiceCategoryById','getServiceCategoriesByMerchant','createServicePackage','updateServicePackage','deleteServicePackage','getServicePackageById','getServicePackagesByMerchant','getStaffMemberById'].map(key=>[key,vi.fn()]))}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./db',async original=>({...await original<typeof import('./db')>(),...m.db}));
import {appRouter} from './routers';
import {servicesRouter} from './routers-services';
import {serviceCategoriesRouter} from './routers-service-categories';
import {servicePackagesRouter} from './routers-service-packages';
const service={name:'Local service',priceType:'fixed' as const,basePrice:1000,durationMinutes:60,categoryId:7,staffIds:[6]};
const category={name:'Local category'};
const pack={name:'Local package',serviceIds:[11],originalPrice:1000,packagePrice:900};
const writes=[['services','create',service,'createService'],['services','update',{serviceId:11,...service},'updateService'],['services','delete',{serviceId:11},'deleteService'],['serviceCategories','create',category,'createServiceCategory'],['serviceCategories','update',{categoryId:7,...category},'updateServiceCategory'],['serviceCategories','delete',{categoryId:7},'deleteServiceCategory'],['servicePackages','create',pack,'createServicePackage'],['servicePackages','update',{packageId:8,...pack},'updateServicePackage'],['servicePackages','delete',{packageId:8},'deleteServicePackage']] as const;
beforeEach(()=>{
  vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'owner'});
  for(const [name,id] of [['getServiceById',11],['getServiceCategoryById',7],['getServicePackageById',8],['getStaffMemberById',6]] as const)m.db[name].mockResolvedValue({id,merchantId:20,isActive:1});
  for(const name of ['getServicesByMerchant','getServiceCategoriesByMerchant','getServicePackagesByMerchant','getServicesByCategory','getBookingsByService'])m.db[name].mockResolvedValue([]);
  for(const name of ['createService','createServiceCategory','createServicePackage'])m.db[name].mockResolvedValue(51);
});
for(const surface of ['mounted','module'])describe('service catalog '+surface,()=>{
  const caller=(user:any={id:7,role:'user'},headers:any={'x-merchant-id':'20'})=>{
    const ctx={user,merchantId:999,merchantRole:'owner',req:{headers},res:{}} as any;
    return surface==='mounted'?appRouter.createCaller(ctx):{services:servicesRouter.createCaller(ctx),serviceCategories:serviceCategoriesRouter.createCaller(ctx),servicePackages:servicePackagesRouter.createCaller(ctx)};
  };
  it.each(writes)('denies viewer write %s.%s',async(group,action,input,write)=>{
    m.access.mockResolvedValue({merchantId:20,role:'viewer'});await expect((caller() as any)[group][action](input)).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.db[write]).not.toHaveBeenCalled();
  });
  it.each(writes)('denies unauthenticated write %s.%s',async(group,action,input,write)=>{
    await expect((caller(null) as any)[group][action](input)).rejects.toMatchObject({code:'UNAUTHORIZED'});expect(m.db[write]).not.toHaveBeenCalled();
  });
  it.each(['owner','manager','sales_supervisor'])('uses resolved %s authority for all catalog writes',async role=>{
    m.access.mockResolvedValue({merchantId:20,role});for(const [group,action,input,write] of writes){await (caller() as any)[group][action](input);expect(m.db[write]).toHaveBeenCalledOnce();}
    expect(m.db.createService.mock.calls[0][0].merchantId).toBe(20);expect(m.db.createServiceCategory.mock.calls[0][0].merchantId).toBe(20);expect(m.db.createServicePackage.mock.calls[0][0].merchantId).toBe(20);expect(m.access).toHaveBeenCalledWith(7,20);
  });
  it.each(writes)('rejects forged identity at %s.%s',async(group,action,input,write)=>{
    await expect((caller() as any)[group][action]({...input,merchantId:999})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.db[write]).not.toHaveBeenCalled();
  });
  it.each(['services','serviceCategories','servicePackages'])('permits only selected-tenant member reads in %s',async group=>{
    m.access.mockResolvedValue({merchantId:20,role:'viewer'});await (caller() as any)[group].list();
    expect(m.db[{services:'getServicesByMerchant',serviceCategories:'getServiceCategoriesByMerchant',servicePackages:'getServicePackagesByMerchant'}[group]!]).toHaveBeenCalledWith(20);
    m.access.mockResolvedValue(null);await expect((caller() as any)[group].list()).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('scopes related details reads and applies a real ten-booking limit',async()=>{
    await caller().services.getById({serviceId:11});
    expect(m.db.getBookingsByService).toHaveBeenCalledExactlyOnceWith(11,20,{limit:10});
    expect(m.db.getServiceRatingStats).toHaveBeenCalledExactlyOnceWith(11,20);
    expect(m.db.getBookingStats).toHaveBeenCalledExactlyOnceWith(20,{serviceId:11});
  });
  it.each([0,-1,1.5,2147483648,NaN])('rejects invalid record identifier %s',async serviceId=>{
    await expect(caller().services.getById({serviceId})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.db.getServiceById).not.toHaveBeenCalled();
  });
  it.each(['missing','foreign','inactive'])('rejects %s service relationships before writes',async state=>{
    for(const read of ['getServiceCategoryById','getStaffMemberById','getServiceById']){
      m.db[read].mockResolvedValue(state==='missing'?undefined:{id:1,merchantId:state==='foreign'?99:20,isActive:state==='inactive'?0:1});
      const run=read==='getServiceById'?()=>caller().servicePackages.create(pack):()=>caller().services.create(service);
      await expect(run() as any).rejects.toMatchObject({code:'NOT_FOUND'});m.db[read].mockResolvedValue({id:1,merchantId:20,isActive:1});
    }
    expect(m.db.createService).not.toHaveBeenCalled();expect(m.db.createServicePackage).not.toHaveBeenCalled();
  });
  it('rejects another store category before reading services, and scopes accepted reads in storage and output',async()=>{
    m.db.getServiceCategoryById.mockResolvedValue({merchantId:99,isActive:1});await expect(caller().services.getByCategory({categoryId:7})).rejects.toMatchObject({code:'NOT_FOUND'});expect(m.db.getServicesByCategory).not.toHaveBeenCalled();
    m.db.getServiceCategoryById.mockResolvedValue({merchantId:20,isActive:1});m.db.getServicesByCategory.mockResolvedValue([{id:11,merchantId:20},{id:12,merchantId:99}]);
    expect(await caller().services.getByCategory({categoryId:7})).toEqual({services:[{id:11,merchantId:20}]});expect(m.db.getServicesByCategory).toHaveBeenCalledWith(7,20);
  });
  it.each([['services','getServiceById',{serviceId:11}],['serviceCategories','getServiceCategoryById',{categoryId:7}],['servicePackages','getServicePackageById',{packageId:8}]] as const)('rejects another store target in %s before update or delete',async(group,read,input)=>{
    m.db[read].mockResolvedValue({merchantId:99});for(const action of ['update','delete'])await expect((caller() as any)[group][action]({...input,...action==='update'?{name:'Changed'}:{}})).rejects.toMatchObject({code:'NOT_FOUND'});
    for(const name of ['updateService','deleteService','updateServiceCategory','deleteServiceCategory','updateServicePackage','deleteServicePackage'])expect(m.db[name]).not.toHaveBeenCalled();
  });
  it.each([[11,11],Array.from({length:201},(_,i)=>i+1),[-1],[1.5]])('rejects duplicate, unbounded or invalid selected references',async serviceIds=>{
    await expect(caller().servicePackages.create({...pack,serviceIds})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.db.createServicePackage).not.toHaveBeenCalled();
  });
  it('fails closed on membership lookup failure and malformed merchant selection',async()=>{
    m.access.mockRejectedValue(Error('private lookup'));await expect(caller().services.list()).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR'});
    await expect(caller(undefined,{'x-merchant-id':'20x'}).services.list()).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.db.getServicesByMerchant).not.toHaveBeenCalled();
  });
});
