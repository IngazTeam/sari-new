import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readCheckoutAttempt } from './subscriptions/checkout-attempt';
describe.skipIf(!process.env.DATABASE_URL)('checkout attempt disposable MySQL lookup', () => {
  let a: Awaited<ReturnType<typeof createDisposableMerchant>>, b: typeof a, request: string, transactionId: number;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  beforeEach(async () => {
    a = await createDisposableMerchant('attempt492'); b = await createDisposableMerchant('attempt492-other'); request = randomUUID();
    transactionId = Number((await q("INSERT INTO payment_transactions(merchant_id,type,amount,currency,status,payment_method,checkout_attempt_id,metadata) VALUES (?,'subscription','99.90','SAR','pending','tap',?,?)", [a.merchantId, request, JSON.stringify({ planId: 2, billingCycle: 'yearly', secret: 'DO_NOT_RETURN' })])).insertId);
  });
  afterEach(async () => { await cleanupDisposableMerchants([a?.userId, b?.userId].filter(Boolean)); });
  afterAll(closeDb);
  it('returns minimal local state and exact amount without metadata', async () => {
    const value = await readCheckoutAttempt(a.userId, a.merchantId, request);
    expect(value).toMatchObject({ actorId: a.userId, merchantId: a.merchantId, checkoutAttemptId: request, transactionId, found: true, state: 'pending', amountMinor: 9990, currency: 'SAR', planId: 2, billingCycle: 'yearly', recordedCheckoutUrl: null });
    expect(JSON.stringify(value)).not.toContain('DO_NOT_RETURN');
  });
  it('does not enumerate another tenant request even with its valid UUID', async () => {
    expect(await readCheckoutAttempt(b.userId, b.merchantId, request)).toMatchObject({ found: false, state: 'not_found', transactionId: null });
    await expect(readCheckoutAttempt(b.userId, a.merchantId, request)).rejects.toThrow();
  });
  it('preserves completed, failed and refunded states without creating a new payment', async () => {
    for (const state of ['completed', 'failed', 'refunded']) {
      await q('UPDATE payment_transactions SET status=? WHERE id=?', [state, transactionId]);
      expect(await readCheckoutAttempt(a.userId, a.merchantId, request)).toMatchObject({ state, recordedCheckoutUrl: null });
    }
    expect((await q('SELECT COUNT(*) AS n FROM payment_transactions WHERE merchant_id=?', [a.merchantId]))[0].n).toBe(1);
  });
  it('only returns an unexpired matching stored provider checkout link', async () => {
    const chargeId = 'chg_' + randomUUID().replaceAll('-', ''), url = 'https://sandbox.payments.tap.company/session/fixture';
    const response = { id: chargeId, amount: 99.9, currency: 'SAR', status: 'INITIATED', live_mode: false, transaction: { url }, expires_at: new Date(Date.now() + 300000).toISOString() };
    await q('UPDATE payment_transactions SET tap_charge_id=?,tap_response=? WHERE id=?', [chargeId, JSON.stringify(response), transactionId]);
    expect((await readCheckoutAttempt(a.userId, a.merchantId, request)).recordedCheckoutUrl).toBe(url);
    response.expires_at = new Date(Date.now() - 1000).toISOString();
    await q('UPDATE payment_transactions SET tap_response=? WHERE id=?', [JSON.stringify(response), transactionId]);
    expect((await readCheckoutAttempt(a.userId, a.merchantId, request)).recordedCheckoutUrl).toBeNull();
  });
  it('denies read-only members and an explicitly revoked owner', async () => {
    await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [a.merchantId, b.userId]);
    await expect(readCheckoutAttempt(b.userId, a.merchantId, request)).rejects.toThrow();
    await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)", [a.merchantId, a.userId]);
    await expect(readCheckoutAttempt(a.userId, a.merchantId, request)).rejects.toThrow();
  });
});
