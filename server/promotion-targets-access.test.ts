import {it,expect,beforeEach,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./promotion-targets',()=>({readPromotionTargets:m.read}));
import {promotionsRouter} from './routers-promotions';
import {appRouter} from './routers';
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'manager'});});
for(const mounted of [false,true]){
 const caller=(user:any={id:7,role:'user'},selected='20')=>{const ctx={user,merchantId:999,merchantRole:'owner',req:{headers:{'x-merchant-id':selected}},res:{}} as any;return mounted?appRouter.createCaller(ctx).promotions:promotionsRouter.createCaller(ctx);};
 it(`scopes choices to fresh selected tenant mounted=${mounted}`,async()=>{await caller().targetChoices({kind:'products'});expect(m.read).toHaveBeenCalledExactlyOnceWith(7,20,{kind:'products',query:'',page:1,selectedIds:[]});});
 it(`rejects unauthenticated, viewer and forged inputs mounted=${mounted}`,async()=>{await expect(caller(null).targetChoices({kind:'products'})).rejects.toMatchObject({code:'UNAUTHORIZED'});await expect(caller(undefined,'20x').targetChoices({kind:'products'})).rejects.toMatchObject({code:'BAD_REQUEST'});for(const value of [{kind:'products',merchantId:99},{kind:'all'},{kind:'products',selectedIds:[1,1]},{kind:'products',selectedIds:[-1]},{kind:'products',page:0}])await expect(caller().targetChoices(value as any)).rejects.toMatchObject({code:'BAD_REQUEST'});m.access.mockResolvedValue({merchantId:20,role:'viewer'});await expect(caller().targetChoices({kind:'products'})).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.read).not.toHaveBeenCalled();});
 it(`hides database details mounted=${mounted}`,async()=>{m.read.mockRejectedValue(Error('PRIVATE SQL'));await expect(caller().targetChoices({kind:'categories'})).rejects.toMatchObject({message:'promotion_write:unavailable'});});
}
