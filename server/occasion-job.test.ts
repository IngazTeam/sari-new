import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({check:vi.fn(),schedule:vi.fn()}));
vi.mock('./automation/occasion-campaigns',()=>({checkAndSendOccasionCampaigns:mocks.check}));
vi.mock('node-cron',()=>({default:{schedule:mocks.schedule}}));
let job:typeof import('./jobs/occasion-campaigns');
const empty={checked:0,queued:0,completed:0,deferred:0,failed:0,limited:false};
beforeEach(async()=>{vi.resetModules();mocks.check.mockReset().mockResolvedValue(empty);mocks.schedule.mockReset().mockReturnValue({stop:vi.fn()});job=await import('./jobs/occasion-campaigns');vi.spyOn(console,'info').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>vi.restoreAllMocks());
describe('occasion job retry and outcome reporting',()=>{
  it('registers one recurring Riyadh-day schedule even if startup is called twice',()=>{job.startOccasionCampaignsJob();job.startOccasionCampaignsJob();expect(mocks.schedule).toHaveBeenCalledOnce();expect(mocks.schedule).toHaveBeenCalledWith('*/15 9-23 * * *',expect.any(Function),{timezone:'Asia/Riyadh'});});
  it('skips overlapping in-process ticks then allows the next tick',async()=>{
    let release!:(value:typeof empty)=>void;mocks.check.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const first=job.runOccasionCampaignsCron(new Date('2026-09-23T09:00:00Z'));
    expect(await job.runOccasionCampaignsCron()).toEqual({skipped:true});expect(mocks.check).toHaveBeenCalledOnce();
    release(empty);expect(await first).toEqual({skipped:false,...empty});expect(await job.runOccasionCampaignsCron()).toEqual({skipped:false,...empty});expect(mocks.check).toHaveBeenCalledTimes(2);
  });
  it('propagates storage failure and releases its in-process guard for retry',async()=>{
    mocks.check.mockRejectedValueOnce(Error('Storage unavailable'));await expect(job.runOccasionCampaignsCron()).rejects.toThrow('Storage unavailable');
    expect(await job.runOccasionCampaignsCron()).toEqual({skipped:false,...empty});expect(console.info).not.toHaveBeenCalled();
  });
  it('reports deferred and completed counts separately from queued deliveries',async()=>{
    const result={...empty,checked:4,queued:1,completed:1,deferred:2};mocks.check.mockResolvedValue(result);
    expect(await job.runOccasionCampaignsCron()).toEqual({skipped:false,...result});expect(console.info).toHaveBeenCalledWith('[Occasion Campaigns] Admission outcome',result);expect(console.warn).not.toHaveBeenCalled();
  });
  it.each([{failed:1},{limited:true}])('warns on incomplete processing %j instead of logging success',async patch=>{
    const result={...empty,checked:1,...patch};mocks.check.mockResolvedValue(result);await job.runOccasionCampaignsCron();
    expect(console.warn).toHaveBeenCalledWith('[Occasion Campaigns] Admission requires retry',result);expect(console.info).not.toHaveBeenCalled();
  });
  it('contains scheduled callback failures and does not print provider/database secrets',async()=>{
    mocks.check.mockRejectedValue(Error('private database secret'));job.startOccasionCampaignsJob();mocks.schedule.mock.calls[0][1]();
    await new Promise(resolve=>setImmediate(resolve));expect(console.error).toHaveBeenCalledWith('[Occasion Campaigns] Admission batch unavailable');expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private database secret');
  });
});
