import { beforeEach, expect, it, vi } from 'vitest';
import { billingPriceMinor, billingCurrency, assertProrationCharge } from './subscriptions/billing-price';
const m = vi.hoisted(() => ({ merchant: vi.fn(), plan: vi.fn(), addon: vi.fn(), current: vi.fn(), prorate: vi.fn(), transaction: vi.fn(), charge: vi.fn(), complete: vi.fn() }));
vi.mock('./db', () => ({ getMerchantByUserId: m.merchant, getSubscriptionPlanById: m.plan, getSubscriptionAddonById: m.addon, getMerchantCurrentSubscription: m.current, createOrReusePaymentTransactionForCheckout: m.transaction }));
vi.mock('./_core/subscriptionManager', () => ({ calculateProration: m.prorate }));
vi.mock('./subscriptions/canonical-state', () => ({ completeImmediateCanonicalPlanChange: m.complete }));
vi.mock('./payment/subscription-tap-checkout', () => ({ createPlatformSubscriptionTapCharge: m.charge, SubscriptionTapCheckoutError: class extends Error {} }));
import { merchantSubscriptionRouter, merchantAddonsRouter } from './routers/subscriptions';
const context = { user: { id: 21, role: 'user', email: 'owner@example.test' } } as any;
const attempt = 'da2e3e62-03dc-4ebf-9db9-0c3cb5ead2d6';
beforeEach(() => {
  vi.resetAllMocks();
  m.merchant.mockResolvedValue({ id: 73 });
  m.plan.mockResolvedValue({ id: 2, isActive: 1, monthlyPrice: '99.90', yearlyPrice: '999.00', currency: 'SAR' });
  m.addon.mockResolvedValue({ id: 3, isActive: 1, monthlyPrice: '9.99', yearlyPrice: '99.00', currency: 'SAR' });
  m.current.mockResolvedValue({ id: 9, planId: 1 });
  m.prorate.mockResolvedValue({ chargeAmount: 50 });
  m.transaction.mockResolvedValue({ transaction: { id: 44, status: 'pending' } });
  m.charge.mockResolvedValue({ paymentUrl: 'https://checkout.tap.company/test', chargeId: 'chg_test' });
});
it.each(['9.99', '0.01', '1000000.00'])('keeps exact cents %s', v => expect(billingPriceMinor(v)).toBe(Math.round(Number(v) * 100)));
it.each([null, undefined, 10, '', '10xyz', '1e2', '1.001', '-1', '0', '1000000.01'])('rejects invalid billable price %s', v => expect(() => billingPriceMinor(v)).toThrow());
it('only admits explicit zero in credit calculation', () => expect(billingPriceMinor('0.00', true)).toBe(0));
it.each([NaN, Infinity, -1, .001, 1000000.01])('rejects invalid derived payable %s', v => expect(() => assertProrationCharge(v)).toThrow());
it('normalizes supported currencies and rejects missing or unsupported ones', () => {
  expect(billingCurrency(' sar ')).toBe('SAR'); expect(billingCurrency('usd')).toBe('USD');
  for (const v of [null, 1, '', 'EUR']) expect(() => billingCurrency(v)).toThrow();
});
it.each([NaN, Infinity, -1, .001])('never writes or activates an invalid upgrade charge %s', async value => {
  m.prorate.mockResolvedValue({ chargeAmount: value });
  await expect(merchantSubscriptionRouter.createCaller(context).upgradePlan({ newPlanId: 2, newBillingCycle: 'monthly', checkoutAttemptId: attempt })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(m.transaction).not.toHaveBeenCalled(); expect(m.complete).not.toHaveBeenCalled(); expect(m.charge).not.toHaveBeenCalled();
});
it('redacts a proration source failure before all payment effects', async () => {
  m.prorate.mockRejectedValue(Error('PRIVATE_SQL_PLAN'));
  await expect(merchantSubscriptionRouter.createCaller(context).upgradePlan({ newPlanId: 2, newBillingCycle: 'monthly', checkoutAttemptId: attempt })).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Could not calculate a valid plan change' });
  expect(m.transaction).not.toHaveBeenCalled();
});
it('permits verified zero without contacting the provider', async () => {
  m.prorate.mockResolvedValue({ chargeAmount: 0 });
  expect(await merchantSubscriptionRouter.createCaller(context).upgradePlan({ newPlanId: 2, newBillingCycle: 'monthly', checkoutAttemptId: attempt })).toEqual({ success: true, immediate: true });
  expect(m.complete).toHaveBeenCalledWith(44, 73); expect(m.charge).not.toHaveBeenCalled();
});
it.each(['99.90junk', '0.001', 'NaN', ''])('blocks invalid stored plan prices %s before creating a transaction', async price => {
  m.plan.mockResolvedValue({ isActive: 1, monthlyPrice: price, currency: 'SAR' });
  await expect(merchantSubscriptionRouter.createCaller(context).subscribe({ planId: 2, billingCycle: 'monthly', checkoutAttemptId: attempt })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(m.transaction).not.toHaveBeenCalled();
});
it('bills yearly selection and addon quantity using their exact recorded prices', async () => {
  await merchantSubscriptionRouter.createCaller(context).subscribe({ planId: 2, billingCycle: 'yearly', checkoutAttemptId: attempt });
  expect(m.transaction).toHaveBeenLastCalledWith(expect.objectContaining({ amount: '999.00', currency: 'SAR' }));
  await merchantAddonsRouter.createCaller(context).purchaseAddon({ addonId: 3, quantity: 3, billingCycle: 'monthly', checkoutAttemptId: attempt });
  expect(m.transaction).toHaveBeenLastCalledWith(expect.objectContaining({ amount: '29.97' }));
});
it('rejects malformed addon prices before writing', async () => {
  m.addon.mockResolvedValue({ isActive: 1, monthlyPrice: '9.99junk', currency: 'SAR' });
  await expect(merchantAddonsRouter.createCaller(context).purchaseAddon({ addonId: 3, quantity: 3, billingCycle: 'monthly', checkoutAttemptId: attempt })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(m.transaction).not.toHaveBeenCalled();
});
