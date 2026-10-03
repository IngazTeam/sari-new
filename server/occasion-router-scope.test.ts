import {readFileSync} from 'node:fs';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),review:vi.fn(),apply:vi.fn(),db:vi.fn(),pool:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./db',async original=>({...await original<typeof import('./db')>(),getDb:m.db,getPool:m.pool}));
vi.mock('./occasion-workspace-store',async original=>({...await original<typeof import('./occasion-workspace-store')>(),readOccasionWorkspace:m.read}));
vi.mock('./occasion-actions',async original=>({...await original<typeof import('./occasion-actions')>(),reviewOccasionAction:m.review,applyOccasionAction:m.apply}));
import {occasionCampaignsRouter} from './routers-occasion-campaigns';
import {appRouter} from './routers';
const inputs={list:undefined,getStats:undefined,getUpcoming:undefined,toggle:{campaignId:9,enabled:true},create:{occasionType:'national_day',year:2027}};
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:73,role:'owner',memberId:1});});
for(const mounted of [false,true]){
 const caller=(user:any={id:21,role:'user'},selected='73')=>{const ctx={user,merchantId:999,merchantRole:'owner',req:{headers:{'x-merchant-id':selected}},res:{}} as any;return mounted?appRouter.createCaller(ctx).occasionCampaigns:occasionCampaignsRouter.createCaller(ctx);};
 describe(`legacy occasion clients mounted=${mounted}`,()=>{
  it('requires reloading every old endpoint without a data read, write or reviewed action',async()=>{
   for(const [key,value] of Object.entries(inputs))await expect((caller() as any)[key](value)).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:'occasion_action:reload_reviewed_workspace'});
   expect(m.access).toHaveBeenCalledWith(21,73);for(const fn of [m.read,m.review,m.apply,m.db,m.pool])expect(fn).not.toHaveBeenCalled();
  });
  it('denies anonymous, foreign/revoked selection and unprivileged writes',async()=>{
   for(const [key,value] of Object.entries(inputs))await expect((caller(null) as any)[key](value)).rejects.toMatchObject({code:'UNAUTHORIZED'});
   m.access.mockResolvedValue({merchantId:73,role:'viewer'});
   for(const key of ['create','toggle'])await expect((caller() as any)[key](inputs[key as keyof typeof inputs])).rejects.toMatchObject({code:'FORBIDDEN'});
   m.access.mockResolvedValue(null);await expect(caller().getUpcoming()).rejects.toMatchObject({code:'FORBIDDEN'});
   for(const fn of [m.read,m.review,m.apply,m.db,m.pool])expect(fn).not.toHaveBeenCalled();
  });
  it('rejects forged fields and malformed identities',async()=>{
   for(const campaignId of [0,-1,1.5,2147483648])await expect(caller().toggle({campaignId,enabled:false})).rejects.toMatchObject({code:'BAD_REQUEST'});
   for(const extra of [{merchantId:999},{status:'completed'}])await expect(caller().toggle({campaignId:9,enabled:true,...extra} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
   await expect(caller().create({...inputs.create,enabled:true} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
   await expect(caller(undefined,'73x').list()).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.apply).not.toHaveBeenCalled();
  });
 });
}
it('removes unused unreviewed writers and misleading acceptance aggregation from production storage',()=>{
 const db=readFileSync('server/db.ts','utf8'),router=readFileSync('server/routers-occasion-campaigns.ts','utf8');
 for(const fn of ['createOccasionCampaign','updateOccasionCampaign','setPendingOccasionEnabled','markOccasionCampaignSent','getEnabledOccasionCampaigns','getOccasionCampaignsStats'])expect(db).not.toContain(`export async function ${fn}(`);
 expect(router).not.toContain("from './db'");
 expect(readFileSync('client/src/components/merchant/OccasionWorkspace.tsx','utf8')).not.toMatch(/occasionCampaigns\.(create|toggle|list|getStats|getUpcoming)\./);
});
