import {describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({transaction:vi.fn()}));vi.mock('./booking-capacity',()=>({withBookingCapacityTransaction:mocks.transaction}));
import {normalizeCatalogService,normalizeCatalogPackage,serviceCatalogCreateCategory,serviceCatalogUpdateService} from '../shared/service-catalog-write';
import {writeServiceCatalog,archiveServiceCatalog,serviceCatalogDefinitionKey} from './service-catalog-write';
const service={name:' Local service ',priceType:'fixed',basePrice:0,durationMinutes:60};
describe('service catalog field contracts',()=>{
  it('keeps free prices, zero advance days and defaults appointment behavior explicitly',()=>{
    expect(normalizeCatalogService({...service,advanceBookingDays:0})).toMatchObject({name:'Local service',basePrice:0,minPrice:null,maxPrice:null,requiresAppointment:true,advanceBookingDays:0,bufferTimeMinutes:0,staffIds:[]});
  });
  it.each([{name:' '},{name:'x'.repeat(256)},{durationMinutes:0},{durationMinutes:1440},{durationMinutes:1.5},{bufferTimeMinutes:-1},{basePrice:-1},{basePrice:1.5},{basePrice:2147483648},{basePrice:null},{maxBookingsPerDay:0},{advanceBookingDays:-1},{staffIds:[1,1]},{merchantId:2}])('rejects invalid service fields %j',patch=>{
    expect(()=>normalizeCatalogService({...service,...patch})).toThrow();
  });
  it('requires a complete ordered price range and clears unused price fields',()=>{
    for(const patch of [{priceType:'variable',minPrice:50},{priceType:'variable',minPrice:60,maxPrice:50}])expect(()=>normalizeCatalogService({...service,...patch})).toThrow();
    expect(normalizeCatalogService({...service,priceType:'variable',minPrice:0,maxPrice:0})).toMatchObject({basePrice:null,minPrice:0,maxPrice:0});
    expect(normalizeCatalogService({...service,priceType:'custom',minPrice:50,maxPrice:100})).toMatchObject({basePrice:null,minPrice:null,maxPrice:null});
  });
  it('keeps explicit clearing apart from omitted values in a partial edit',()=>{
    expect(serviceCatalogUpdateService.parse({serviceId:1,categoryId:null,description:null,maxBookingsPerDay:null,staffIds:[]})).toEqual({serviceId:1,categoryId:null,description:null,maxBookingsPerDay:null,staffIds:[]});
    expect(serviceCatalogUpdateService.parse({serviceId:1,name:'Renamed'})).toEqual({serviceId:1,name:'Renamed'});
  });
  it('calculates package discount from integer prices instead of a supplied claim',()=>{
    expect(normalizeCatalogPackage({name:'Package',serviceIds:[1],originalPrice:1000,packagePrice:750,discountPercentage:99}).discountPercentage).toBe(25);
    expect(normalizeCatalogPackage({name:'Free',serviceIds:[1],originalPrice:0,packagePrice:0}).discountPercentage).toBe(0);
  });
  it.each([{serviceIds:[]},{serviceIds:[1,1]},{originalPrice:0,packagePrice:1},{packagePrice:1.2},{packagePrice:-1},{originalPrice:2147483648}])('rejects invalid package fields %j',patch=>{
    expect(()=>normalizeCatalogPackage({name:'Package',serviceIds:[1],originalPrice:1000,packagePrice:900,...patch})).toThrow();
  });
  it.each(['red','url(javascript:alert(1))','#GGGGGG','#fff;display:none'])('rejects unsupported category color %s',color=>{
    expect(serviceCatalogCreateCategory.safeParse({name:'Category',color}).success).toBe(false);
  });
  it('binds reviewed definitions to the entity, tenant, record and preserved fields',()=>{
    const row={name:'Before',staffIds:'[]',basePrice:100};const key=serviceCatalogDefinitionKey('service',2,3,row);
    for(const changed of [serviceCatalogDefinitionKey('service',9,3,row),serviceCatalogDefinitionKey('service',2,4,row),serviceCatalogDefinitionKey('category',2,3,row),serviceCatalogDefinitionKey('service',2,3,{...row,basePrice:101})])expect(changed).not.toBe(key);
    expect(serviceCatalogDefinitionKey('service',2,3,{...row,createdAt:'irrelevant'})).toBe(key);
  });
  it('rejects scope, fields and malformed definitions before starting a transaction',async()=>{
    mocks.transaction.mockClear();
    await expect(writeServiceCatalog('service',0,service)).rejects.toThrow();await expect(writeServiceCatalog('service',2,{merchantId:9})).rejects.toThrow();await expect(writeServiceCatalog('service',2,{})).rejects.toThrow();await expect(archiveServiceCatalog('service',2,1,'bad')).rejects.toThrow();expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('does not expose storage details on a failed transaction',async()=>{
    mocks.transaction.mockRejectedValue(Error('PRIVATE SQL password'));await expect(writeServiceCatalog('service',2,service)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'Service catalog write unavailable'});
  });
});
