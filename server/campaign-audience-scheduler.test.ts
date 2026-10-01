import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: vi.fn(), audience: vi.fn(), guard: vi.fn(), enqueue: vi.fn(), complete: vi.fn(), due: vi.fn() }));
vi.mock('./db', () => ({ getDb: mocks.db, getActiveSubscriptionByMerchantId: vi.fn().mockResolvedValue({ id: 1 }), getPrimaryWhatsAppInstance: vi.fn().mockResolvedValue({ status: 'active' }) }));
vi.mock('./campaign-audience', async original => ({ ...await original<typeof import('./campaign-audience')>(), readCampaignAudience: mocks.audience }));
vi.mock('./automation/campaign-guard', async original => ({ ...await original<typeof import('./automation/campaign-guard')>(), filterCampaignRecipients: mocks.guard }));
vi.mock('./automation/campaign-delivery-outbox', async original => ({ ...await original<typeof import('./automation/campaign-delivery-outbox')>(), enqueueCampaignDeliveries: mocks.enqueue, completeCampaignWithoutRecipients: mocks.complete }));
import { checkScheduledCampaigns } from './jobs/scheduled-campaigns';
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  const chain = { select: () => chain, from: () => chain, where: () => chain, orderBy: () => chain, limit: mocks.due };
  mocks.db.mockResolvedValue(chain); mocks.due.mockResolvedValue([{ id: 7, merchantId: 73, status:'scheduled', name:'Fixture', message:'Fixture', imageUrl:null, scheduledAt:'2026-10-01 09:00:00', targetAudience: '{"purchaseCountMin":2}' }]);
  mocks.audience.mockResolvedValue({ count: 600, recipientCount: 1, customers: [{ id: 501, customerPhone: '966500000001' }] });
  mocks.guard.mockResolvedValue({ allowed: ['966500000001'], blocked: [], warnings: [] });
});
describe('scheduled audience boundaries', () => {
  it('uses the same complete snapshot as preview and manual send', async () => {
    expect(await checkScheduledCampaigns()).toEqual({ checked: 1, queued: 1, deferred: 0, failed: 0 }); expect(mocks.audience).toHaveBeenCalledWith(73, '{"purchaseCountMin":2}');
    expect(mocks.enqueue).toHaveBeenCalledWith({ campaignId: 7, merchantId: 73, expectedDefinition: expect.stringMatching(/^[a-f0-9]{64}$/), recipients: [{ customerId: 501, phone: '966500000001' }] });
  });
  it('fails rather than completing or partially sending an oversized campaign', async () => {
    mocks.audience.mockResolvedValue({ customers: [], recipientCount: 2001 }); expect(await checkScheduledCampaigns()).toEqual({ checked: 1, queued: 0, deferred: 0, failed: 1 });
    expect(mocks.guard).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('does not complete a campaign when the audience read fails', async () => {
    mocks.audience.mockRejectedValue(Error('Unavailable')); expect(await checkScheduledCampaigns()).toMatchObject({ queued: 0, failed: 1 }); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('surfaces a database outage rather than reporting a successful empty batch', async () => { mocks.db.mockResolvedValue(null); await expect(checkScheduledCampaigns()).rejects.toThrow('Database not available'); });
  it.each(['quiet_hours','rate_limit'])('defers the entire campaign on %s without completing or truncating it', async reason => {
    mocks.guard.mockResolvedValue({ allowed: ['966500000001'], blocked: [{ phone: '966500000002', reason }], warnings: [] });
    expect(await checkScheduledCampaigns()).toEqual({ checked: 1, queued: 0, deferred: 1, failed: 0 });
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
});
