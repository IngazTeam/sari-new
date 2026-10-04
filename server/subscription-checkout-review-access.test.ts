import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./subscriptions/checkout-review', async original => ({ ...await original<any>(), readCheckoutReview: m.read }));
import { appRouter } from './routers';
import { MerchantSettingsAuthorityError } from './accounts/merchant-settings-authority';
import { CheckoutReviewError } from './subscriptions/checkout-review';
const caller = (user: unknown = { id: 7, role: 'user' }) => appRouter.createCaller({ user, req: { headers: { 'x-merchant-id': '20' } }, res: {}, merchantId: 999 } as any);
const input = { planId: 2, billingCycle: 'yearly' as const };
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ merchantId: 20, role: 'owner' }); m.read.mockResolvedValue({ fixture: true }); });
it('reviews the authenticated actor and selected tenant rather than context overrides', async () => {
  await caller().merchantSubscription.reviewCheckout(input);
  expect(m.read).toHaveBeenCalledWith(7, 20, 2, 'yearly', undefined);
});
it.each([{ ...input, merchantId: 21 }, { ...input, amount: 0 }, { ...input, planId: 1.5 }, { ...input, billingCycle: 'weekly' }])('rejects forged input %j', async forged => {
  await expect(caller().merchantSubscription.reviewCheckout(forged as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(m.read).not.toHaveBeenCalled();
});
it('blocks anonymous and revoked membership', async () => {
  await expect(caller(null).merchantSubscription.reviewCheckout(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  m.access.mockResolvedValue(null);
  await expect(caller().merchantSubscription.reviewCheckout(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(m.read).not.toHaveBeenCalled();
});
it('redacts source errors, reports owner authority loss and stale review', async () => {
  m.read.mockRejectedValue(Error('PRIVATE_SQL'));
  await expect(caller().merchantSubscription.reviewCheckout(input)).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Checkout review unavailable' });
  m.read.mockRejectedValue(new MerchantSettingsAuthorityError('forbidden'));
  await expect(caller().merchantSubscription.reviewCheckout(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  m.read.mockRejectedValue(new CheckoutReviewError('stale'));
  await expect(caller().merchantSubscription.reviewCheckout(input)).rejects.toMatchObject({ code: 'CONFLICT' });
});
