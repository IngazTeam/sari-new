import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ authority: vi.fn(), execute: vi.fn() }));
vi.mock('./accounts/merchant-settings-authority', async original => ({ ...await original<any>(), withMerchantOwnerSettings: m.authority }));
import { projectCheckoutAttempt, readCheckoutAttempt } from './subscriptions/checkout-attempt';
import { checkoutAttemptSchema } from '../shared/subscription-checkout-attempt';
const attempt = 'da2e3e62-03dc-4ebf-9db9-0c3cb5ead2d6', checkedAt = '2026-10-04T00:00:00.000Z';
const saved = () => ({ id: 'chg_fixture', status: 'INITIATED', amount: 99.9, currency: 'SAR', live_mode: false, transaction: { url: 'https://sandbox.payments.tap.company/session/fixture' }, expires_at: '2026-10-04T00:30:00.000Z' });
const row = () => ({ id: 5, type: 'subscription', amount: '99.90', currency: 'SAR', status: 'pending', metadata: JSON.stringify({ planId: 2, billingCycle: 'yearly', customerPhone: 'PRIVATE_PHONE', token: 'PRIVATE_TOKEN' }), tap_charge_id: 'chg_fixture', tap_response: JSON.stringify(saved()) });
const project = (value?: Record<string, any>) => projectCheckoutAttempt(7, 20, attempt, checkedAt, value);
beforeEach(() => { vi.clearAllMocks(); m.authority.mockImplementation(async (_a, _m, _w, fn) => fn({ execute: m.execute }, { canManage: true })); });
it('keeps a missing request distinct from a recorded zero amount', () => {
  expect(project()).toMatchObject({ found: false, state: 'not_found', transactionId: null, amountMinor: null });
  expect(project({ ...row(), type: 'downgrade', amount: '0.00', status: 'completed', metadata: JSON.stringify({ newPlanId: 2, newBillingCycle: 'monthly' }) })).toMatchObject({ found: true, state: 'completed', amountMinor: 0, planId: 2, billingCycle: 'monthly', recordedCheckoutUrl: null });
});
it('projects only public fields and a verified unexpired stored checkout URL', () => {
  const r = project(row()); expect(r).toMatchObject({ amountMinor: 9990, currency: 'SAR', state: 'pending', planId: 2, billingCycle: 'yearly', recordedCheckoutUrl: saved().transaction.url, linkExpiresAt: saved().expires_at });
  expect(JSON.stringify(r)).not.toMatch(/PRIVATE_|tap_charge_id|tap_response|metadata|live_mode/);
});
it.each(['completed', 'failed', 'refunded', 'requires_review', 'other'])('does not expose a checkout URL for %s', status => {
  expect(project({ ...row(), status })).toMatchObject({ state: status === 'other' ? 'unknown' : status, recordedCheckoutUrl: null, linkExpiresAt: null });
});
it.each(['amount', 'currency', 'id', 'captured', 'mode', 'expired', 'missing-expiry', 'bad-expiry', 'url', 'port', 'credentials', 'json'])('does not reopen invalid stored checkout evidence: %s', reason => {
  const charge: any = saved();
  if (reason === 'amount') charge.amount = 1;
  if (reason === 'currency') charge.currency = 'USD';
  if (reason === 'id') charge.id = 'chg_other';
  if (reason === 'captured') charge.status = 'CAPTURED';
  if (reason === 'mode') charge.live_mode = 'false';
  if (reason === 'expired') charge.expires_at = checkedAt;
  if (reason === 'missing-expiry') charge.expires_at = null;
  if (reason === 'bad-expiry') charge.expires_at = '2026-02-30';
  if (reason === 'url') charge.transaction.url = 'https://tap.company.evil.test/a';
  if (reason === 'port') charge.transaction.url = 'https://tap.company:444/a';
  if (reason === 'credentials') charge.transaction.url = 'https://user:pass@tap.company/a';
  expect(project({ ...row(), tap_response: reason === 'json' ? '{invalid' : JSON.stringify(charge) }).recordedCheckoutUrl).toBeNull();
});
it.each([{ amount: '-1' }, { amount: '1e2' }, { amount: '1000000.01' }, { currency: 'EUR' }])('keeps invalid amounts unknown %j', change => expect(project({ ...row(), ...change }).amountMinor).toBeNull());
it('does not infer plan selection from malformed metadata or an addon request', () => {
  for (const value of [{ ...row(), metadata: '{bad' }, { ...row(), metadata: JSON.stringify({ planId: '2', billingCycle: 'weekly' }) }, { ...row(), type: 'addon' }])
    expect(project(value)).toMatchObject({ planId: null, billingCycle: null, recordedCheckoutUrl: null });
});
it('rejects contradictory contract data', () => {
  expect(checkoutAttemptSchema.safeParse({ ...project(), amountMinor: 0 }).success).toBe(false);
  expect(checkoutAttemptSchema.safeParse({ ...project(row()), state: 'completed' }).success).toBe(false);
  expect(checkoutAttemptSchema.safeParse({ ...project(row()), state: 'requires_review' }).success).toBe(false);
});
it('uses actor authority and exact tenant+UUID query without mutations', async () => {
  m.execute.mockResolvedValueOnce([[{ checked_at: checkedAt }]]).mockResolvedValueOnce([[row()]]);
  expect(await readCheckoutAttempt(7, 20, attempt.toUpperCase())).toMatchObject({ checkoutAttemptId: attempt, transactionId: 5 });
  expect(m.authority).toHaveBeenCalledWith(7, 20, false, expect.any(Function));
  expect(m.execute).toHaveBeenLastCalledWith(expect.stringContaining('WHERE merchant_id=? AND checkout_attempt_id=?'), [20, attempt]);
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it('rejects a viewer before reading payment data', async () => {
  m.authority.mockImplementation(async (_a, _m, _w, fn) => fn({ execute: m.execute }, { canManage: false }));
  await expect(readCheckoutAttempt(7, 20, attempt)).rejects.toThrow(); expect(m.execute).not.toHaveBeenCalled();
});
it.each([{}, [row(), row()]])('never reports missing when the storage envelope is invalid %j', result => {
  m.execute.mockResolvedValueOnce([[{ checked_at: checkedAt }]]).mockResolvedValueOnce([result]);
  return expect(readCheckoutAttempt(7, 20, attempt)).rejects.toThrow();
});
it('rejects malformed UUID and clock before reading transaction data', async () => {
  await expect(readCheckoutAttempt(7, 20, 'bad')).rejects.toThrow(); expect(m.authority).not.toHaveBeenCalled();
  m.execute.mockResolvedValueOnce([[{ checked_at: 'invalid' }]]);
  await expect(readCheckoutAttempt(7, 20, attempt)).rejects.toThrow(); expect(m.execute).toHaveBeenCalledTimes(1);
});
