import { beforeEach, expect, it, vi, afterEach } from 'vitest';
const m = vi.hoisted(() => ({ subscription: vi.fn(), plan: vi.fn() }));
vi.mock('./db', () => ({ getMerchantSubscriptionById: m.subscription, getSubscriptionPlanById: m.plan }));
import { calculateProration } from './_core/subscriptionManager';
let current: any, old: any, next: any;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T00:00:00.000Z'));
  current = { id: 9, planId: 1, status: 'active', billingCycle: 'monthly', startDate: new Date('2026-10-01T00:00:00Z'), endDate: new Date('2026-10-31T00:00:00Z') };
  old = { id: 1, monthlyPrice: '100.00', yearlyPrice: '1000.00', currency: 'SAR' };
  next = { id: 2, monthlyPrice: '200.00', yearlyPrice: '2000.00', currency: 'SAR' };
  m.subscription.mockImplementation(async () => current);
  m.plan.mockImplementation(async id => id === 1 ? old : next);
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it('retains daily credit on valid same-currency active plans', async () => {
  expect(await calculateProration(9, 2, 'monthly')).toMatchObject({ daysUsed: 15, daysRemaining: 15, creditAmount: 50, chargeAmount: 150 });
});
it.each(['200junk', '', 'NaN', '-1.00', '1e2', '0.001'])('rejects malformed new prices %s', async price => {
  next.monthlyPrice = price;
  await expect(calculateProration(9, 2, 'monthly')).rejects.toThrow();
});
it.each(['x', '-1', '1e2'])('rejects malformed credit prices %s', async price => {
  old.monthlyPrice = price;
  await expect(calculateProration(9, 2, 'monthly')).rejects.toThrow();
});
it.each([
  { startDate: new Date('invalid') }, { endDate: new Date('invalid') },
  { startDate: new Date('2026-10-31T00:00:00Z') },
  { startDate: new Date('2026-10-17T00:00:00Z') },
  { endDate: new Date('2026-10-16T00:00:00Z') },
  { billingCycle: 'weekly' }, { status: 'cancelled' },
])('rejects an unbillable subscription %j', async value => {
  Object.assign(current, value);
  await expect(calculateProration(9, 2, 'monthly')).rejects.toThrow();
});
it('does not subtract another currency as credit', async () => {
  old.currency = 'USD';
  await expect(calculateProration(9, 2, 'monthly')).rejects.toThrow();
});
it('does not turn an unpaid trial into monetary credit', async () => {
  current.status = 'trial';
  expect(await calculateProration(9, 2, 'monthly')).toMatchObject({ creditAmount: 0, chargeAmount: 200 });
});
it('rounds credit to cents once and conserves the new plan price', async () => {
  old.monthlyPrice = '9.99'; next.monthlyPrice = '10.01';
  expect(await calculateProration(9, 2, 'monthly')).toMatchObject({ creditAmount: 5, chargeAmount: 5.01 });
});
it('keeps a genuine zero charge possible when verified arithmetic covers the new price', async () => {
  next.monthlyPrice = '20.00';
  expect(await calculateProration(9, 2, 'monthly')).toMatchObject({ creditAmount: 50, chargeAmount: 0 });
});
