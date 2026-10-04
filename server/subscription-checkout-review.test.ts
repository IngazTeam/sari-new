import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ authority: vi.fn(), execute: vi.fn() }));
vi.mock('./accounts/merchant-settings-authority', async original => ({ ...await original<any>(), withMerchantOwnerSettings: m.authority }));
import { readCheckoutReview } from './subscriptions/checkout-review';
let plan: any, current: any[], old: any, now: string;
beforeEach(() => {
  vi.clearAllMocks(); now = '2026-10-16 00:00:00.000'; current = [];
  plan = { id: 2, name: 'نمو', name_en: 'Growth', monthly_price: '100.00', yearly_price: '1000.00', currency: 'SAR', is_active: 1, updated_at: '2026-10-01' };
  old = { id: 1, monthly_price: '60.00', yearly_price: '600.00', currency: 'SAR', updated_at: '2026-10-01' };
  m.authority.mockImplementation(async (_a, _m, _w, fn) => fn({ execute: m.execute }, { canManage: true }));
  m.execute.mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT UTC_')) return [[{ checked_at: now }]];
    if (sql.includes('FROM merchant_subscriptions')) return [current];
    if (sql.includes('AND is_active=1')) return [plan ? [plan] : []];
    if (sql.includes('FROM subscription_plans')) return [[old]];
    throw Error('Unexpected SQL');
  });
});
const active = () => { current = [{ id: 9, plan_id: 1, status: 'active', billing_cycle: 'monthly', start_date: '2026-10-01 00:00:00', end_date: '2026-10-31 00:00:00', trial_ends_at: null, updated_at: '2026-10-01' }]; };
it('returns exact yearly total and a five-minute owner-bound review without writes', async () => {
  const r = await readCheckoutReview(7, 20, 2, 'yearly');
  expect(r).toMatchObject({ actorId: 7, merchantId: 20, mode: 'subscribe', priceMinor: 100000, chargeMinor: 100000, currency: 'SAR', expiresAt: '2026-10-16T00:05:00.000Z' });
  expect(m.authority).toHaveBeenCalledWith(7, 20, false, expect.any(Function));
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  await expect(readCheckoutReview(7, 20, 2, 'yearly', r)).resolves.toEqual(r);
});
it('reviews monetary credit from an active same-currency subscription', async () => {
  active(); expect(await readCheckoutReview(7, 20, 2, 'monthly')).toMatchObject({ mode: 'upgrade', subscriptionId: 9, creditMinor: 3000, chargeMinor: 7000, daysRemaining: 15 });
});
it.each(['trial', 'expired'])('never assigns paid credit to %s', async status => {
  active(); if (status === 'trial') current[0].status = 'trial'; else current[0].end_date = '2026-10-15 00:00:00';
  const r = await readCheckoutReview(7, 20, 2, 'monthly');
  expect(r.creditMinor).toBe(0); expect(r.mode).toBe(status === 'trial' ? 'upgrade' : 'subscribe');
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it.each(['actor', 'merchant', 'price', 'features', 'cycle', 'tamper', 'currency', 'subscription', 'expired', 'future'])('rejects stale or forged %s review', async reason => {
  active(); const r = await readCheckoutReview(7, 20, 2, 'monthly');
  if (reason === 'price') plan.monthly_price = '101.00';
  if (reason === 'features') plan.features = '["Changed"]';
  if (reason === 'currency') old.currency = 'USD';
  if (reason === 'subscription') current[0].id = 10;
  if (reason === 'expired') now = '2026-10-16 00:05:00.000';
  if (reason === 'future') now = '2026-10-15 23:59:59.000';
  if (reason === 'tamper') r.token = '0'.repeat(64);
  await expect(readCheckoutReview(reason === 'actor' ? 8 : 7, reason === 'merchant' ? 21 : 20, 2, reason === 'cycle' ? 'yearly' : 'monthly', r)).rejects.toThrow();
});
it('rejects duplicate current subscriptions, unknown prices, absent plans and unchanged selection', async () => {
  active(); current.push({ ...current[0], id: 10 }); await expect(readCheckoutReview(7, 20, 2, 'monthly')).rejects.toThrow();
  active(); current[0].plan_id = 2; await expect(readCheckoutReview(7, 20, 2, 'monthly')).rejects.toMatchObject({ reason: 'unchanged' });
  current = []; plan.monthly_price = 'NaN'; await expect(readCheckoutReview(7, 20, 2, 'monthly')).rejects.toThrow();
  plan = null; await expect(readCheckoutReview(7, 20, 2, 'monthly')).rejects.toThrow();
});
it('rejects read-only members before reading pricing', async () => {
  m.authority.mockImplementation(async (_a, _m, _w, fn) => fn({ execute: m.execute }, { canManage: false }));
  await expect(readCheckoutReview(7, 20, 2, 'monthly')).rejects.toMatchObject({ reason: 'forbidden' });
  expect(m.execute).not.toHaveBeenCalled();
});
it('fails closed on unavailable query envelopes and invalid database clocks', async () => {
  m.execute.mockResolvedValueOnce([{}]); await expect(readCheckoutReview(7, 20, 2, 'monthly')).rejects.toThrow();
  now = 'invalid'; await expect(readCheckoutReview(7, 20, 2, 'monthly')).rejects.toThrow();
});
