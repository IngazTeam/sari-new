import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),review:vi.fn(),apply:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./occasion-actions',async original=>({...await original<typeof import('./occasion-actions')>(),reviewOccasionAction:m.review,applyOccasionAction:m.apply}));
import {occasionCampaignsRouter} from './routers-occasion-campaigns';
import {appRouter} from './routers';
import {OccasionActionError} from './occasion-actions';
const target={action:'toggle' as const,id:9,enabled:true},value={target,reviewRevision:'a'.repeat(64),acknowledged:true as const};
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'manager'});});
for(const mounted of [false,true]){
 const caller=(user:any={id:7,role:'user'},selected='20')=>{const ctx={user,merchantId:999,merchantRole:'owner',req:{headers:{'x-merchant-id':selected}},res:{}} as any;return mounted?appRouter.createCaller(ctx).occasionCampaigns:occasionCampaignsRouter.createCaller(ctx);};
 it(`uses fresh selected tenant for review/apply mounted=${mounted}`,async()=>{await caller().reviewAction(target);await caller().applyAction(value);expect(m.review).toHaveBeenCalledExactlyOnceWith(7,20,target);expect(m.apply).toHaveBeenCalledExactlyOnceWith(7,20,value);});
 it(`rejects anonymous, viewer, revoked and malformed selection mounted=${mounted}`,async()=>{await expect(caller(null).applyAction(value)).rejects.toMatchObject({code:'UNAUTHORIZED'});await expect(caller(undefined,'20x').reviewAction(target)).rejects.toMatchObject({code:'BAD_REQUEST'});m.access.mockResolvedValue({merchantId:20,role:'viewer'});await expect(caller().reviewAction(target)).rejects.toMatchObject({code:'FORBIDDEN'});await expect(caller().applyAction(value)).rejects.toMatchObject({code:'FORBIDDEN'});m.access.mockResolvedValue(null);await expect(caller().applyAction(value)).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.review).not.toHaveBeenCalled();expect(m.apply).not.toHaveBeenCalled();});
 it(`rejects scope/lifecycle/value injection mounted=${mounted}`,async()=>{for(const forged of [{...value,merchantId:999},{...value,target:{...target,status:'completed'}},{...value,acknowledged:false},{...value,target:{action:'create',occasionType:'new_year',year:2027,enabled:true}}])await expect(caller().applyAction(forged as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.apply).not.toHaveBeenCalled();});
 it(`maps stale and uncertain outcomes without leaking internal errors mounted=${mounted}`,async()=>{m.apply.mockRejectedValue(new OccasionActionError('stale'));await expect(caller().applyAction(value)).rejects.toMatchObject({code:'CONFLICT',message:'occasion_action:stale'});m.apply.mockRejectedValue(new OccasionActionError('unknown'));await expect(caller().applyAction(value)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'occasion_action:unknown'});m.review.mockRejectedValue(Error('PRIVATE SQL'));await expect(caller().reviewAction(target)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'occasion_action:unavailable'});});
}
