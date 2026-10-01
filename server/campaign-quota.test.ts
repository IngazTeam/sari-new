import { beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({pool:vi.fn(),schema:vi.fn()}));
vi.mock('./db/connection',()=>({getPool:mocks.pool}));vi.mock('./db/schema-readiness',()=>({assertRuntimeSchema:mocks.schema}));
import { reserveCampaignQuota,releaseCampaignQuota,CampaignQuotaEvidenceError } from './campaign-quota';
const lease={id:1,campaign_id:2,merchant_id:3,processing_token:'fixture-token'};
beforeEach(()=>{mocks.pool.mockReset().mockResolvedValue(null);mocks.schema.mockReset();});
describe('campaign quota boundary',()=>{
  it.each([{id:0},{merchant_id:-1},{campaign_id:1.5},{id:Number.MAX_SAFE_INTEGER+1},{processing_token:''},{processing_token:'a'.repeat(65)}])('rejects invalid lease %j before database work',async patch=>{await expect(reserveCampaignQuota({...lease,...patch})).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);await expect(releaseCampaignQuota({...lease,...patch})).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);expect(mocks.pool).not.toHaveBeenCalled();});
  it('never treats a database outage as reservation or refund success',async()=>{await expect(reserveCampaignQuota(lease)).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);await expect(releaseCampaignQuota(lease)).rejects.toBeInstanceOf(CampaignQuotaEvidenceError);});
});
