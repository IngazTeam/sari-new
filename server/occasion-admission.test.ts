// Atomic-envelope/admission tests isolate the separately tested persistent authority gate.
vi.mock('./occasion-worker-authority',()=>({lockOccasionWorkerAuthority:vi.fn().mockResolvedValue({}),bindOccasionPreparedEnvelope:vi.fn(),ensureOccasionAuthorizationSchema:vi.fn(),OccasionAuthorizationDenied:class extends Error{}}));
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ audience: vi.fn(), guard: vi.fn(), enqueue: vi.fn(), complete: vi.fn(), campaign: vi.fn(), execute: vi.fn(), due: vi.fn() }));
vi.mock('./db', () => ({ getPool: vi.fn().mockResolvedValue({ getConnection: vi.fn().mockResolvedValue({ execute: mocks.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),destroy:vi.fn() }) }),
  getMerchantById: vi.fn().mockResolvedValue({ id: 7, status: 'active' }), getCampaignById: mocks.campaign, getDispatchableOccasionCampaigns: mocks.due,
  getPrimaryWhatsAppInstance: vi.fn().mockResolvedValue({ status:'active' }), getActiveSubscriptionByMerchantId: vi.fn().mockResolvedValue({ id:1 }),
}));
vi.mock('./db/schema-readiness', () => ({ assertRuntimeSchema: vi.fn() }));
vi.mock('./campaign-audience', async original => ({ ...await original<typeof import('./campaign-audience')>(), readCampaignAudience: mocks.audience }));
vi.mock('./automation/campaign-guard', async original => ({ ...await original<typeof import('./automation/campaign-guard')>(), filterCampaignRecipients: mocks.guard }));
vi.mock('./automation/campaign-delivery-outbox', async original => ({ ...await original<typeof import('./automation/campaign-delivery-outbox')>(), enqueueCampaignDeliveries: mocks.enqueue, completeCampaignWithoutRecipients: mocks.complete }));
import { checkAndSendOccasionCampaigns } from './automation/occasion-campaigns';
const now = new Date('2026-09-23T09:00:00Z');
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.due.mockResolvedValue([{ id: 9, merchantId: 7 }]);
  mocks.execute.mockImplementation(async(sql:string)=>{
    if(sql.includes('FROM merchants'))return [[{id:7,status:'active',businessName:'Fixture shop'}]];
    if(sql.includes('SELECT campaign_id FROM occasion_campaigns'))return [[{campaign_id:77}]];
    if(sql.includes('FROM occasion_campaigns'))return [[{id:9,merchantId:7,campaignId:77,occasionType:'national_day',year:2026,enabled:1,discountPercentage:23,status:'pending',discountCode:'CODE',messageTemplate:null,recipientCount:0,sentAt:null}]];
    if(sql.includes('FROM campaigns'))return [[{id:77,merchantId:7,status:'draft',message:'Fixture',imageUrl:null,targetAudience:'{}'}]];
    if(sql.includes('FROM discount_codes'))return [[{type:'percentage',value:23,minOrderAmount:0,maxUses:2000,usedCount:0,isActive:1,expiresAt:'2026-09-23 20:59:59',customer_phone:null}]];
    if(sql.includes('FROM campaign_delivery_outbox'))return [[]];
    throw Error('Unexpected SQL');
  });
  mocks.campaign.mockResolvedValue({ id:77, merchantId:7, name:'Fixture', message:'Fixture', imageUrl:null, targetAudience:'{}', scheduledAt:null, status:'draft' });
  mocks.audience.mockResolvedValue({ customers: [{ id:501, customerPhone:'966500000001' }], recipientCount:1 });
  mocks.guard.mockResolvedValue({ allowed:['966500000001'], blocked:[], warnings:[] });
  mocks.complete.mockResolvedValue(true);
});
describe('occasion admission retains audience and pending state', () => {
  it('uses the full canonical audience and definition rather than the general conversation list', async () => {
    const customers = Array.from({ length:600 }, (_,i) => ({ id:501+i, customerPhone:String(99900000000+i) }));
    mocks.audience.mockResolvedValue({ customers, recipientCount:600 }); mocks.guard.mockResolvedValue({ allowed:customers.map(row=>row.customerPhone), blocked:[], warnings:[] });
    expect(await checkAndSendOccasionCampaigns(now)).toEqual({ checked:1,queued:1,completed:0,deferred:0,failed:0,limited:false }); expect(mocks.audience).toHaveBeenCalledWith(7, '{}', now);
    expect(mocks.enqueue.mock.calls[0][0].recipients).toHaveLength(600); expect(mocks.enqueue.mock.calls[0][0].expectedDefinition).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each(['quiet_hours','rate_limit'])('keeps the entire occasion pending on %s', async reason => {
    mocks.guard.mockResolvedValue({ allowed:['966500000001'], blocked:[{ phone:'966500000002',reason }], warnings:[] });
    expect(await checkAndSendOccasionCampaigns(now)).toMatchObject({checked:1,queued:0,completed:0,deferred:1,failed:0}); expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('completes only a non-transient empty eligible audience with its read definition', async () => {
    mocks.guard.mockResolvedValue({ allowed:[], blocked:[{phone:'966500000001',reason:'missing_consent'}], warnings:[] });
    expect(await checkAndSendOccasionCampaigns(now)).toMatchObject({completed:1,queued:0,deferred:0,failed:0}); expect(mocks.complete).toHaveBeenCalledWith(77,7,expect.stringMatching(/^[a-f0-9]{64}$/)); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('cannot dispatch a campaign belonging to another tenant', async () => {
    mocks.campaign.mockResolvedValue({ merchantId:99,status:'draft' }); expect(await checkAndSendOccasionCampaigns(now)).toMatchObject({deferred:1,failed:0,queued:0});
    expect(mocks.audience).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('does not complete or partially send an oversized audience', async () => {
    mocks.audience.mockResolvedValue({customers:[],recipientCount:2001}); expect(await checkAndSendOccasionCampaigns(now)).toMatchObject({failed:1,queued:0});
    expect(mocks.guard).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('preserves pending state when audience storage fails', async () => {
    mocks.audience.mockRejectedValue(Error('Unavailable')); expect(await checkAndSendOccasionCampaigns(now)).toMatchObject({failed:1,queued:0});
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('retries a deferred occasion on the next check of the same day', async () => {
    mocks.guard.mockResolvedValueOnce({allowed:[],blocked:[{phone:'966500000001',reason:'quiet_hours'}],warnings:[]});
    expect(await checkAndSendOccasionCampaigns(now)).toMatchObject({deferred:1,queued:0});
    expect(await checkAndSendOccasionCampaigns(new Date('2026-09-23T09:15:00Z'))).toMatchObject({deferred:0,queued:1}); expect(mocks.enqueue).toHaveBeenCalledOnce();
  });
  it('does not admit a campaign after its occasion day', async () => {
    expect(await checkAndSendOccasionCampaigns(new Date('2026-09-24T09:00:00Z'))).toEqual({checked:0,queued:0,completed:0,deferred:0,failed:0,limited:false}); expect(mocks.due).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('reports a raced empty completion as deferred, never completed', async () => {
    mocks.guard.mockResolvedValue({allowed:[],blocked:[],warnings:[]}); mocks.complete.mockResolvedValue(false);
    expect(await checkAndSendOccasionCampaigns(now)).toMatchObject({completed:0,deferred:1,queued:0});
  });
  it('reports hitting the bounded batch size without claiming full coverage', async () => {
    mocks.due.mockImplementation(async(_type,_year,_size,afterId)=>Array.from({length:100},(_,i)=>({id:afterId+i+1,merchantId:7})));
    mocks.campaign.mockResolvedValue(undefined);
    const result=await checkAndSendOccasionCampaigns(now);expect(result).toEqual({checked:10000,queued:0,completed:0,deferred:10000,failed:0,limited:true});expect(mocks.due).toHaveBeenCalledTimes(100);
  });
});
