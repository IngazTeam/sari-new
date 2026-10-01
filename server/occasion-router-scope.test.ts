import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access:vi.fn(), merchant:vi.fn(), campaign:vi.fn(), list:vi.fn(), stats:vi.fn(), toggle:vi.fn(), create:vi.fn() }));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:mocks.access}));
vi.mock('./db',async original=>({...await original<typeof import('./db')>(), getMerchantById:mocks.merchant,getOccasionCampaignById:mocks.campaign,getOccasionCampaignsByMerchantId:mocks.list,getOccasionCampaignsStats:mocks.stats,setPendingOccasionEnabled:mocks.toggle,createOccasionCampaign:mocks.create}));
import { occasionCampaignsRouter } from './routers-occasion-campaigns';
const caller=()=>occasionCampaignsRouter.createCaller({user:{id:21,role:'user'},req:{headers:{'x-merchant-id':'73'}}} as any);
beforeEach(()=>{for(const mock of Object.values(mocks))mock.mockReset();mocks.access.mockResolvedValue({merchantId:73,role:'owner',memberId:1});mocks.merchant.mockResolvedValue({id:73,status:'active'});mocks.campaign.mockResolvedValue({id:7,merchantId:73,status:'pending'});mocks.toggle.mockResolvedValue(true);mocks.list.mockResolvedValue([{id:7,merchantId:73}]);mocks.stats.mockResolvedValue({totalCampaigns:1,completedCampaigns:0,acceptedRecipients:0});});
describe('occasion router selection and write permission',()=>{
  it('reads only the selected and authorized tenant',async()=>{expect(await caller().list()).toEqual([{id:7,merchantId:73}]);expect(mocks.access).toHaveBeenCalledWith(21,73);expect(mocks.list).toHaveBeenCalledWith(73);await caller().getStats();expect(mocks.stats).toHaveBeenCalledWith(73);});
  it('writes with the verified tenant and reports a raced claim as conflict',async()=>{
    expect(await caller().toggle({campaignId:7,enabled:false})).toEqual({success:true});expect(mocks.toggle).toHaveBeenCalledWith(7,73,false);
    mocks.toggle.mockResolvedValue(false);await expect(caller().toggle({campaignId:7,enabled:false})).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('rejects a foreign occasion before writing',async()=>{mocks.campaign.mockResolvedValue({id:7,merchantId:99,status:'pending'});await expect(caller().toggle({campaignId:7,enabled:false})).rejects.toMatchObject({code:'FORBIDDEN'});expect(mocks.toggle).not.toHaveBeenCalled();});
  it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1])('rejects invalid identity %s',async campaignId=>{await expect(caller().toggle({campaignId,enabled:false})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(mocks.campaign).not.toHaveBeenCalled();});
  it('rejects forged scope and lifecycle fields',async()=>{for(const extra of [{merchantId:99},{status:'completed'}])await expect(caller().toggle({campaignId:7,enabled:false,...extra} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(mocks.toggle).not.toHaveBeenCalled();});
  it('rejects writes without the campaign-management permission',async()=>{mocks.access.mockResolvedValue({merchantId:73,role:'viewer',memberId:1});await expect(caller().toggle({campaignId:7,enabled:false})).rejects.toMatchObject({code:'FORBIDDEN'});await expect(caller().create({occasionType:'ramadan',year:2027})).rejects.toMatchObject({code:'FORBIDDEN'});expect(mocks.toggle).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();});
});
