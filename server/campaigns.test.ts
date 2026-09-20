import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), merchant: vi.fn(), campaigns: vi.fn(), create: vi.fn(), allCampaigns: vi.fn(), allMerchants: vi.fn(), plans: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./db', async original => ({
  ...(await original<typeof import('./db')>()),
  getMerchantById: mocks.merchant,
  getMerchantByUserId: mocks.merchant,
  getCampaignsByMerchantId: mocks.campaigns,
  createCampaign: mocks.create,
  getAllCampaignsWithMerchants: mocks.allCampaigns,
  getAllMerchants: mocks.allMerchants,
  getAllPlans: mocks.plans,
}));
import { appRouter } from './routers';
const caller = (role = 'user') => appRouter.createCaller({ user: { id: 7, role }, req: { headers: { 'x-merchant-id': '20' } }, res: {} } as any);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: 'owner', memberId: 1 });
  mocks.merchant.mockResolvedValue({ id: 20, status: 'active' });
  mocks.campaigns.mockResolvedValue([{ id: 4, merchantId: 20 }]);
  mocks.create.mockImplementation(async data => ({ id: 4, ...data }));
  mocks.allCampaigns.mockResolvedValue([{ id: 4, merchantId: 20 }]);
  mocks.allMerchants.mockResolvedValue([{ id: 20 }]);
  mocks.plans.mockResolvedValue([{ id: 2, name: 'fixture' }]);
});
describe('mounted campaign, merchant and plan contracts', () => {
  it('returns only campaigns of the verified selected merchant', async () => {
    expect(await caller().campaigns.list()).toEqual([{ id: 4, merchantId: 20 }]);
    expect(mocks.access).toHaveBeenCalledWith(7, 20);
    expect(mocks.campaigns).toHaveBeenCalledWith(20);
  });
  it('creates a draft with server-owned tenant and lifecycle fields', async () => {
    const input = { name: 'Test campaign', message: 'Test message' };
    expect(await caller().campaigns.create(input)).toMatchObject({ id: 4, merchantId: 20, status: 'draft', ...input });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 20, sentCount: 0, totalRecipients: 0 }));
  });
  it('rejects empty campaign names before any database write', async () => {
    await expect(caller().campaigns.create({ name: '', message: 'fixture' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('allows the platform admin to list all campaigns', async () => {
    expect(await caller('admin').campaigns.listAll()).toEqual([{ id: 4, merchantId: 20 }]);
    expect(mocks.allCampaigns).toHaveBeenCalledTimes(1);
  });
  it('rejects non-admin global campaign reads before querying', async () => {
    await expect(caller().campaigns.listAll()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.allCampaigns).not.toHaveBeenCalled();
  });
  it('returns the current merchant through the mounted adapter', async () => {
    expect(await caller().merchants.getCurrent()).toMatchObject({ id: 20 });
    expect(mocks.merchant).toHaveBeenCalledWith(7);
  });
  it('allows the platform admin to list merchants', async () => {
    expect(await caller('admin').merchants.list()).toEqual([{ id: 20 }]);
    expect(mocks.allMerchants).toHaveBeenCalledTimes(1);
  });
  it('rejects non-admin global merchant reads before querying', async () => {
    await expect(caller().merchants.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.allMerchants).not.toHaveBeenCalled();
  });
  it('serves public plans without requiring a merchant identity', async () => {
    const publicCaller = appRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as any);
    expect(await publicCaller.plans.list()).toEqual([{ id: 2, name: 'fixture' }]);
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it('propagates database failures instead of treating them as a passed smoke test', async () => {
    mocks.campaigns.mockRejectedValue(new Error('fixture database unavailable'));
    await expect(caller().campaigns.list()).rejects.toThrow('fixture database unavailable');
  });
});
