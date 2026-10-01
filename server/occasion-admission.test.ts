import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ audience: vi.fn(), guard: vi.fn(), enqueue: vi.fn(), complete: vi.fn(), campaign: vi.fn(), execute: vi.fn(), due: vi.fn() }));
vi.mock('./db', () => ({ getPool: vi.fn().mockResolvedValue({ getConnection: vi.fn().mockResolvedValue({ execute: mocks.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }) }),
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
  mocks.execute.mockImplementation(async (sql: string) => sql.includes('FROM occasion_campaigns oc') ? [[{ id:9, merchantId:7, campaignId:77, occasionType:'national_day', year:2026, enabled:1, discountPercentage:23, status:'pending', merchantStatus:'active' }]] : [[{ id:77 }]]);
  mocks.campaign.mockResolvedValue({ id:77, merchantId:7, name:'Fixture', message:'Fixture', imageUrl:null, targetAudience:'{"purchaseCountMin":2}', scheduledAt:null, status:'draft' });
  mocks.audience.mockResolvedValue({ customers: [{ id:501, customerPhone:'966500000001' }], recipientCount:1 });
  mocks.guard.mockResolvedValue({ allowed:['966500000001'], blocked:[], warnings:[] });
});
describe('occasion admission retains audience and pending state', () => {
  it('uses the full canonical audience and definition rather than the general conversation list', async () => {
    const customers = Array.from({ length:600 }, (_,i) => ({ id:501+i, customerPhone:String(99900000000+i) }));
    mocks.audience.mockResolvedValue({ customers, recipientCount:600 }); mocks.guard.mockResolvedValue({ allowed:customers.map(row=>row.customerPhone), blocked:[], warnings:[] });
    await checkAndSendOccasionCampaigns(now); expect(mocks.audience).toHaveBeenCalledWith(7, '{"purchaseCountMin":2}', now);
    expect(mocks.enqueue.mock.calls[0][0].recipients).toHaveLength(600); expect(mocks.enqueue.mock.calls[0][0].expectedDefinition).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each(['quiet_hours','rate_limit'])('keeps the entire occasion pending on %s', async reason => {
    mocks.guard.mockResolvedValue({ allowed:['966500000001'], blocked:[{ phone:'966500000002',reason }], warnings:[] });
    await checkAndSendOccasionCampaigns(now); expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('completes only a non-transient empty eligible audience with its read definition', async () => {
    mocks.guard.mockResolvedValue({ allowed:[], blocked:[{phone:'966500000001',reason:'missing_consent'}], warnings:[] });
    await checkAndSendOccasionCampaigns(now); expect(mocks.complete).toHaveBeenCalledWith(77,7,expect.stringMatching(/^[a-f0-9]{64}$/)); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('cannot dispatch a campaign belonging to another tenant', async () => {
    mocks.campaign.mockResolvedValue({ merchantId:99,status:'draft' }); await checkAndSendOccasionCampaigns(now);
    expect(mocks.audience).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('does not complete or partially send an oversized audience', async () => {
    mocks.audience.mockResolvedValue({customers:[],recipientCount:2001}); await checkAndSendOccasionCampaigns(now);
    expect(mocks.guard).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('preserves pending state when audience storage fails', async () => {
    mocks.audience.mockRejectedValue(Error('Unavailable')); await checkAndSendOccasionCampaigns(now);
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
});
