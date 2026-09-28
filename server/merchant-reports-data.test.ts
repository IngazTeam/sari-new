import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
const mocks=vi.hoisted(()=>({access:vi.fn(),merchant:vi.fn(),db:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:mocks.access}));
vi.mock('./db',()=>({getMerchantById:mocks.merchant,getDb:mocks.db}));
import { reportsRouter } from './routers-reports';
const caller=()=>reportsRouter.createCaller({user:{id:7,role:'user'},req:{headers:{'x-merchant-id':'20'}},res:{},merchantId:999} as any);
let results:any[], predicates:any[];
beforeEach(()=>{
  vi.clearAllMocks();results=[];predicates=[];
  mocks.access.mockResolvedValue({merchantId:20,role:'owner',memberId:3});mocks.merchant.mockResolvedValue({id:20,status:'active'});
  mocks.db.mockResolvedValue({select:()=>{const value=results.shift();const chain:any={from:()=>chain,innerJoin:()=>chain,where:(c:any)=>{predicates.push(new MySqlDialect().sqlToQuery(c));return chain;},orderBy:()=>chain,limit:()=>chain,then:(resolve:any)=>Promise.resolve(value).then(resolve)};return chain;}});
});
describe('report truth and tenant boundaries',()=>{
  it('filters every sales aggregate and product snapshot by selected tenant and currency',async()=>{
    results=[[{totalOrders:2,totalRevenue:250,averageOrderValue:125}],[{totalRevenue:100}],[{totalConversations:4}],[{items:'[{"name":"Coffee","quantity":2,"price":125}]'},{items:'invalid'}]];
    const data=await caller().getSalesReport({period:'week',currency:'USD'});
    expect(mocks.merchant).toHaveBeenCalledWith(20);expect(data).toMatchObject({totalRevenue:250,growth:150,growthAvailable:true,currency:'USD',conversionRate:50,topProducts:[{name:'Coffee',quantity:2,revenue:250}]});
    for(const p of predicates){expect(p.params).toContain(20);if(p.sql.includes('`orders`'))expect(p.params).toContain('USD');}
    expect(predicates.filter(p=>p.sql.includes('`orders`'))).toHaveLength(3);
  });
  it('does not present missing baseline as measured zero growth',async()=>{
    results=[[{totalOrders:0,totalRevenue:0,averageOrderValue:0}],[{totalRevenue:0}],[{totalConversations:0}],[]];
    expect(await caller().getSalesReport({period:'month'})).toMatchObject({currency:'SAR',growthAvailable:false});
  });
  it('marks unimplemented quality metrics as unavailable',async()=>{
    results=[[{totalConversations:4}],[{totalMessages:10,aiResponses:3}],[{withPurchase:1}]];
    expect(await caller().getConversationsReport({period:'month'})).toMatchObject({conversionRate:25,responseTimeAvailable:false,satisfactionAvailable:false,topicsAvailable:false});
  });
  it('surfaces unavailable storage rather than reporting empty successful analytics',async()=>{
    mocks.db.mockResolvedValue(null);
    for(const method of ['getSalesReport','getCustomersReport','getConversationsReport'] as const)await expect(caller()[method]({period:'month'})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR'});
  });
});
