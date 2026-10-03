import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./occasion-workspace-store',async original=>({...await original<typeof import('./occasion-workspace-store')>(),readOccasionWorkspace:m.read}));
import {occasionCampaignsRouter} from './routers-occasion-campaigns';
import {appRouter} from './routers';
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'manager'});});
for(const mounted of [false,true]){
 const caller=(user:any={id:7,role:'user'},selection='20')=>{const ctx={user,merchantId:999,merchantRole:'owner',req:{headers:{'x-merchant-id':selection}},res:{}} as any;return mounted?appRouter.createCaller(ctx).occasionCampaigns:occasionCampaignsRouter.createCaller(ctx);};
 it(`uses current selected membership for the complete source mounted=${mounted}`,async()=>{await caller().workspace({page:2});expect(m.read).toHaveBeenCalledExactlyOnceWith(7,20,{query:'',state:'all',year:null,page:2});expect(m.access).toHaveBeenCalledWith(7,20);});
 it(`rejects anonymous, forged and revoked requests mounted=${mounted}`,async()=>{await expect(caller(null).workspace({})).rejects.toMatchObject({code:'UNAUTHORIZED'});await expect(caller().workspace({merchantId:999} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});await expect(caller(undefined,'20x').workspace({})).rejects.toMatchObject({code:'BAD_REQUEST'});m.access.mockResolvedValue(null);await expect(caller().workspace({})).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.read).not.toHaveBeenCalled();});
 it(`hides raw source errors and allows analytics viewers mounted=${mounted}`,async()=>{m.access.mockResolvedValue({merchantId:20,role:'viewer'});await caller().workspace({});expect(m.read).toHaveBeenCalledOnce();m.read.mockRejectedValue(Error('PRIVATE SQL credentials'));await expect(caller().workspace({})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:expect.not.stringContaining('PRIVATE')});});
}
