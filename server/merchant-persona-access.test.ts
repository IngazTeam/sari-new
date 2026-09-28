import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),merchant:vi.fn(),db:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:mocks.access}));
vi.mock('./db',()=>({getMerchantById:mocks.merchant,getDb:mocks.db}));
import { virtualAgentsRouter } from './routers-virtual-agents';
const caller=()=>virtualAgentsRouter.createCaller({user:{id:7,role:'user'},req:{headers:{'x-merchant-id':'20'}},res:{},merchantId:999} as any);
let writes:any, current:any[], conditions:any[], transaction:any;
beforeEach(()=>{
  vi.clearAllMocks();current=[{id:1,sortOrder:0},{id:2,sortOrder:1}];conditions=[];
  mocks.access.mockResolvedValue({merchantId:20,role:'owner',memberId:3});mocks.merchant.mockResolvedValue({id:20,status:'active'});
  writes=vi.fn(()=>({set:()=>({where:async()=>{}})}));
  const result={select:()=>({from:()=>({where:(condition:any)=>{conditions.push(condition);const p:any=Promise.resolve(current);p.orderBy=async()=>current;return p;}})}),update:writes,insert:vi.fn(()=>({values:async()=>[{insertId:3}]}))};
  transaction=vi.fn(async fn=>fn(result));mocks.db.mockResolvedValue({...result,transaction});
});
describe('persona mutations obey selected tenant and permissions',()=>{
  it('reads the selected tenant rather than accepting merchantId from the caller context',async()=>{await caller().list();expect(mocks.access).toHaveBeenCalledWith(7,20);expect(mocks.merchant).toHaveBeenCalledWith(20);});
  it.each(['viewer','sales_agent','sales_supervisor'])('blocks %s before database access',async role=>{
    mocks.access.mockResolvedValue({merchantId:20,role,memberId:3});
    await expect(caller().reorder({orderedIds:[2,1]})).rejects.toMatchObject({code:'FORBIDDEN'});expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each([[1,1],[1],[1,99],[]])('rejects duplicate, missing or foreign persona ids: %s',async(...ids)=>{
    await expect(caller().reorder({orderedIds:ids as number[]})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(writes).not.toHaveBeenCalled();
  });
  it('persists a full reorder in one transaction',async()=>{await caller().reorder({orderedIds:[2,1]});expect(transaction).toHaveBeenCalledOnce();expect(writes).toHaveBeenCalledTimes(2);});
  it('rejects a full team before clearing its existing default',async()=>{
    current=Array.from({length:10},(_,i)=>({id:i+1,sortOrder:i}));
    await expect(caller().create({name:'سارة',role:'استقبال',personalityPrompt:'تعليمات',isDefault:true})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(writes).not.toHaveBeenCalled();
  });
  it('rejects whitespace-only identity even when the UI is bypassed',async()=>{
    await expect(caller().create({name:'  ',role:'مبيعات',personalityPrompt:'تعليمات'})).rejects.toMatchObject({code:'BAD_REQUEST'});
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('rejects an incomplete or equal schedule before changing defaults',async()=>{
    for(const schedule of [{shiftStart:'22:00'},{shiftStart:'09:00',shiftEnd:'09:00'}])await expect(caller().create({name:'سارة',role:'مبيعات',personalityPrompt:'تعليمات',isDefault:true,...schedule})).rejects.toMatchObject({code:'BAD_REQUEST'});
    expect(writes).not.toHaveBeenCalled();
  });
});
