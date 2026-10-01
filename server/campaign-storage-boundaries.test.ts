import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./db/connection', async original => ({
  ...(await original<typeof import('./db/connection')>()),
  getDb: vi.fn().mockResolvedValue(null), getPool: vi.fn().mockResolvedValue(null),
}));
import * as db from './db';
import { deleteTenantCampaign } from './campaign-delete';
afterEach(()=>vi.restoreAllMocks());
describe('campaign persistence outages are never success or empty results',()=>{
  it.each([
    ['createCampaign', [{merchantId:1,name:'Fixture',message:'Fixture'}]],
    ['getCampaignById',[1]], ['getCampaignsByMerchantId',[1]], ['getAllCampaigns',[]],
    ['getAllCampaignsWithMerchants',[]], ['updateCampaign',[1,{name:'Fixture'}]],
    ['deleteCampaign',[1,1]], ['deleteCampaignLogsByCampaignId',[1]],
    ['createCampaignLog',[{campaignId:1,customerPhone:'99900000001'}]],
    ['getCampaignLogById',[1]], ['getCampaignLogsByCampaignId',[1]],
    ['getCampaignLogsWithStats',[1]], ['updateCampaignLog',[1,{status:'success'}]],
    ['createOccasionCampaign',[{merchantId:1,occasionType:'national_day',year:2026,discountPercentage:23}]],
    ['getOccasionCampaignById',[1]],['getOccasionCampaignsByMerchantId',[1]],['getOccasionCampaignByTypeAndYear',[1,'national_day',2026]],
    ['updateOccasionCampaign',[1,{enabled:0}]],['setPendingOccasionEnabled',[1,1,false]],['markOccasionCampaignSent',[1,0]],
    ['getEnabledOccasionCampaigns',[]],['getDispatchableOccasionCampaigns',['national_day',2026]],['getOccasionCampaignsStats',[1]],
  ])('rejects %s when storage is unavailable',async(name,args)=>{
    await expect((db as any)[name as string](...(args as any[]))).rejects.toThrow('Database not available');
  });
  it.each([0,-1,1.2,Number.MAX_SAFE_INTEGER+1,NaN,Infinity])('rejects invalid delete scope %s before acquiring a connection',async id=>{
    await expect(deleteTenantCampaign(id,1)).rejects.toThrow('Invalid campaign deletion scope');
    await expect(deleteTenantCampaign(1,id)).rejects.toThrow('Invalid campaign deletion scope');
  });
});
