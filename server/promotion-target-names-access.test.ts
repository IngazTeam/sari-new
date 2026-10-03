import {it,expect,beforeEach,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./promotion-target-names',()=>({readPromotionTargetNames:m.read}));
import {promotionsRouter} from './routers-promotions';
import {appRouter} from './routers';
import {PromotionWorkspaceError} from './promotion-workspace-store';
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'viewer'});});
for(const mounted of [false,true]){
 const caller=(user:any={id:7,role:'user'},selected='20')=>{const ctx={user,merchantId:999,merchantRole:'owner',req:{headers:{'x-merchant-id':selected}},res:{}} as any;return mounted?appRouter.createCaller(ctx).promotions:promotionsRouter.createCaller(ctx);};
 const key={id:30,revision:'a'.repeat(64)};
 it(`uses fresh selected tenant and read permission mounted=${mounted}`,async()=>{await caller().targetNames(key);expect(m.read).toHaveBeenCalledExactlyOnceWith(7,20,key);});
 it(`rejects forged identity, revisions and arbitrary target search mounted=${mounted}`,async()=>{await expect(caller(null).targetNames(key)).rejects.toMatchObject({code:'UNAUTHORIZED'});await expect(caller(undefined,'20x').targetNames(key)).rejects.toMatchObject({code:'BAD_REQUEST'});for(const value of [{...key,merchantId:99},{...key,selectedIds:[1]},{...key,id:0},{...key,revision:'invalid'}])await expect(caller().targetNames(value as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.read).not.toHaveBeenCalled();});
 it(`hides source errors and honors inner authorization mounted=${mounted}`,async()=>{m.read.mockRejectedValue(Error('PRIVATE SQL'));await expect(caller().targetNames(key)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'promotion_workspace:unavailable'});m.read.mockRejectedValue(new PromotionWorkspaceError('forbidden'));await expect(caller().targetNames(key)).rejects.toMatchObject({code:'FORBIDDEN'});});
}
