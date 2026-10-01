import { beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({database:vi.fn()}));
vi.mock('./db/connection',()=>({getDb:mocks.database}));
import { campaignListInput } from '../shared/campaign-workspace';
import { readCampaignWorkspace,readCampaignStatistics,CampaignWorkspaceUnavailableError } from './campaign-workspace';
beforeEach(()=>{mocks.database.mockReset();mocks.database.mockResolvedValue(null);});
describe('campaign workspace boundary',()=>{
  it('normalizes defaults and literal search',()=>{expect(campaignListInput.parse({search:'  20%_عرض  '})).toEqual({search:'20%_عرض',status:'all',page:1});});
  it.each([{page:0},{page:1.5},{page:1_000_001},{search:'x'.repeat(201)},{status:'unknown'},{merchantId:7},{actorId:7},{pageSize:500}])('rejects invalid or forged selection %j',async selection=>{
    await expect(readCampaignWorkspace(1,1,selection)).rejects.toThrow();expect(mocks.database).not.toHaveBeenCalled();
  });
  it.each([0,-1,NaN,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])('rejects invalid account and merchant %s before storage',async id=>{
    await expect(readCampaignWorkspace(id,1,{})).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);
    await expect(readCampaignWorkspace(1,id,{})).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);
    await expect(readCampaignStatistics(id)).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);expect(mocks.database).not.toHaveBeenCalled();
  });
  it('does not report a storage outage as an empty tenant',async()=>{await expect(readCampaignWorkspace(1,1,{})).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);await expect(readCampaignStatistics(1)).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);});
  it('sanitizes database exceptions',async()=>{mocks.database.mockRejectedValue(Error('private SQL detail'));await expect(readCampaignStatistics(1)).rejects.toThrow('Campaign workspace is unavailable');await expect(readCampaignWorkspace(1,1,{})).rejects.toThrow('Campaign workspace is unavailable');});
});
