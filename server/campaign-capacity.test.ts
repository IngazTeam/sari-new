import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({pool:vi.fn(),execute:vi.fn(),schema:vi.fn()}));
vi.mock('./db/connection',()=>({getPool:mocks.pool}));vi.mock('./db/schema-readiness',()=>({assertRuntimeSchema:mocks.schema}));
import { campaignCapacityFromRows, readCampaignCapacity, CampaignCapacityUnavailableError } from './campaign-capacity';
const row={subscriptionId:12,status:'active',planId:4,resolvedPlanId:4,used:7,held:4,messageLimit:100,periodStart:'2026-10-01 00:00:00'};
beforeEach(()=>{for(const mock of Object.values(mocks))mock.mockReset();mocks.pool.mockResolvedValue({execute:mocks.execute});mocks.execute.mockResolvedValue([[row]]);});
describe('canonical campaign availability evidence',()=>{
  it('subtracts consumed units and outstanding reply holds',()=>expect(campaignCapacityFromRows([row])).toEqual({subscriptionId:12,used:7,held:4,limit:100,unlimited:false,remaining:89,periodStart:'2026-10-01T00:00:00.000Z'}));
  it('preserves a trial without a plan and unlimited plan semantics',()=>{
    expect(campaignCapacityFromRows([{...row,status:'trial',planId:null,resolvedPlanId:null,messageLimit:null}])).toMatchObject({limit:-1,unlimited:true,remaining:2147483636});
    expect(campaignCapacityFromRows([{...row,messageLimit:-1}]).unlimited).toBe(true);
  });
  it('has zero availability after exhaustion without making the count negative',()=>expect(campaignCapacityFromRows([{...row,messageLimit:8}]).remaining).toBe(0));
  it.each([{used:-1},{held:-1},{held:NaN},{used:null},{used:''},{used:' '},{messageLimit:-2},{messageLimit:null},{planId:null},{resolvedPlanId:99},{subscriptionId:0},{periodStart:'broken'},{used:2147483647,held:1},{status:'cancelled'}])('fails closed on invalid source %j',patch=>expect(()=>campaignCapacityFromRows([{...row,...patch}])).toThrow(CampaignCapacityUnavailableError));
  it('rejects missing and ambiguous subscription sources',()=>{expect(()=>campaignCapacityFromRows([])).toThrow();expect(()=>campaignCapacityFromRows([row,row])).toThrow();});
  it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1])('rejects invalid merchant %s before reading',async merchantId=>{await expect(readCampaignCapacity(merchantId)).rejects.toBeInstanceOf(CampaignCapacityUnavailableError);expect(mocks.pool).not.toHaveBeenCalled();});
  it('passes only the verified tenant to one read-only aggregate',async()=>{expect(await readCampaignCapacity(73)).toMatchObject({remaining:89});expect(mocks.execute).toHaveBeenCalledOnce();expect(mocks.execute.mock.calls[0][1]).toEqual([73]);expect(mocks.execute.mock.calls[0][0]).not.toMatch(/UPDATE|INSERT|DELETE|FOR UPDATE/);});
  it.each(['schema','pool','query'])('sanitizes %s failures instead of allowing messages',async mode=>{
    if(mode==='schema')mocks.schema.mockRejectedValue(Error('private schema'));if(mode==='pool')mocks.pool.mockResolvedValue(null);if(mode==='query')mocks.execute.mockRejectedValue(Error('private sql'));
    await expect(readCampaignCapacity(73)).rejects.toThrow('Campaign message capacity is unavailable');
  });
});
