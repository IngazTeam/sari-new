import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ merchant: vi.fn(), campaign: vi.fn(), audience: vi.fn(), guard: vi.fn(), enqueue: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: vi.fn().mockResolvedValue({ merchantId: 73, role: 'owner', memberId: 1 }) }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(), getMerchantById: mocks.merchant, getCampaignById: mocks.campaign, getPrimaryWhatsAppInstance: vi.fn().mockResolvedValue({ status: 'active' }), getActiveSubscriptionByMerchantId: vi.fn().mockResolvedValue({ id: 1 }) }));
vi.mock('./campaign-audience', async original => ({ ...await original<typeof import('./campaign-audience')>(), readCampaignAudience: mocks.audience }));
vi.mock('./automation/campaign-guard', async original => ({ ...await original<typeof import('./automation/campaign-guard')>(), filterCampaignRecipients: mocks.guard }));
vi.mock('./automation/campaign-delivery-outbox', async original => ({ ...await original<typeof import('./automation/campaign-delivery-outbox')>(), enqueueCampaignDeliveries: mocks.enqueue }));
import { campaignsRouter } from './routers-campaigns';
const caller = () => campaignsRouter.createCaller({ user: { id: 21, role: 'user' } } as any);
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.merchant.mockResolvedValue({ id: 73, status: 'active' });
  mocks.campaign.mockResolvedValue({ id: 7, merchantId: 73, status: 'draft', targetAudience: '{"purchaseCountMin":2}' });
  mocks.audience.mockResolvedValue({ count: 3, recipientCount: 2, customers: [{ id: 501, customerPhone: '966500000001' }, { id: 502, customerPhone: '966500000002' }] });
  mocks.guard.mockResolvedValue({ allowed: ['966500000002'], blocked: [{ phone: '966500000001', reason: 'missing_consent' }], warnings: [] });
});
describe('manual campaigns and preview use the verified audience', () => {
  it.each([{ lastActivityDays: 0 }, { purchaseCountMin: 5, purchaseCountMax: 2 }, { merchantId: 99 }, { purchaseCountMax: 1.5 }])('rejects invalid preview %j before reading', async filters => {
    await expect(caller().filterCustomers(filters as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(mocks.audience).not.toHaveBeenCalled();
  });
  it('returns the full preview aggregate for the verified tenant', async () => {
    expect(await caller().filterCustomers({ purchaseCountMin: 2 })).toMatchObject({ count: 3, recipientCount: 2 }); expect(mocks.audience).toHaveBeenCalledWith(73, '{"purchaseCountMin":2}');
  });
  it('uses the same audience and only enqueues consent-eligible identities', async () => {
    expect(await caller().send({ id: 7 })).toMatchObject({ totalRecipients: 1, blockedRecipients: 1 });
    expect(mocks.audience).toHaveBeenCalledWith(73, '{"purchaseCountMin":2}'); expect(mocks.enqueue).toHaveBeenCalledWith({ campaignId: 7, merchantId: 73, recipients: [{ customerId: 502, phone: '966500000002' }] });
  });
  it('rejects an oversized audience without quietly sending its first portion', async () => {
    mocks.audience.mockResolvedValue({ customers: [{ id: 501, customerPhone: '966500000001' }], recipientCount: 2001 });
    await expect(caller().send({ id: 7 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(mocks.guard).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('does not turn failed audience storage into an empty preview or a send', async () => {
    mocks.audience.mockRejectedValue(Error('Unavailable audience storage')); await expect(caller().filterCustomers({})).rejects.toThrow('Unavailable audience storage');
    await expect(caller().send({ id: 7 })).rejects.toThrow('Unavailable audience storage'); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
