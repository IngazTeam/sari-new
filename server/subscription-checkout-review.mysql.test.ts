import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readCheckoutReview } from './subscriptions/checkout-review';
describe.skipIf(!process.env.DATABASE_URL)('checkout review disposable MySQL source', () => {
  let a: Awaited<ReturnType<typeof createDisposableMerchant>>, b: typeof a, plans: number[], name: string;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  beforeEach(async () => {
    a = await createDisposableMerchant('checkout489'); b = await createDisposableMerchant('checkout489-other');
    name = 'checkout489-' + randomUUID(); plans = [];
    for (const price of ['60.00', '100.00']) {
      const r = await q(`INSERT INTO subscription_plans (name,name_en,monthly_price,yearly_price,currency,is_active,max_customers,max_whatsapp_numbers) VALUES (?,? ,?,'1000.00','SAR',1,100,1)`, [name, 'Checkout fixture', price]);
      plans.push(Number(r.insertId));
    }
  });
  afterEach(async () => {
    await cleanupDisposableMerchants([a?.userId, b?.userId].filter(Boolean));
    for (const id of plans || []) await q('DELETE FROM subscription_plans WHERE id=? AND name=?', [id, name]);
  });
  afterAll(closeDb);
  const sub = async (status = 'active', expired = false) => {
    const r = await q(`INSERT INTO merchant_subscriptions (merchant_id,plan_id,status,billing_cycle,start_date,end_date)
      VALUES (?, ?, ?, 'monthly', DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 DAY), ${expired ? 'DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)' : 'DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 DAY)'})`, [a.merchantId, plans[0], status]);
    return Number(r.insertId);
  };
  it('reviews and revalidates exact prices, then rejects changed catalog and actor', async () => {
    const r = await readCheckoutReview(a.userId, a.merchantId, plans[1], 'yearly');
    expect(r.chargeMinor).toBe(100000);
    await expect(readCheckoutReview(a.userId, a.merchantId, plans[1], 'yearly', r)).resolves.toEqual(r);
    await expect(readCheckoutReview(b.userId, a.merchantId, plans[1], 'yearly', r)).rejects.toThrow();
    await q('UPDATE subscription_plans SET yearly_price=1001 WHERE id=?', [plans[1]]);
    await expect(readCheckoutReview(a.userId, a.merchantId, plans[1], 'yearly', r)).rejects.toMatchObject({ reason: 'stale' });
  });
  it('calculates upgrade credit but rejects a second current subscription', async () => {
    const id = await sub(); const r = await readCheckoutReview(a.userId, a.merchantId, plans[1], 'monthly');
    expect(r).toMatchObject({ mode: 'upgrade', subscriptionId: id, currency: 'SAR' });
    expect(r.creditMinor).toBeGreaterThan(0); expect(r.chargeMinor + r.creditMinor).toBe(10000);
    await sub(); await expect(readCheckoutReview(a.userId, a.merchantId, plans[1], 'monthly')).rejects.toMatchObject({ reason: 'invalid' });
  });
  it('reads an expired row without changing subscription or merchant state', async () => {
    const id = await sub('active', true);
    const before = await q('SELECT current_subscription_id,subscription_status FROM merchants WHERE id=?', [a.merchantId]);
    expect(await readCheckoutReview(a.userId, a.merchantId, plans[1], 'monthly')).toMatchObject({ mode: 'subscribe', creditMinor: 0 });
    expect((await q('SELECT status FROM merchant_subscriptions WHERE id=?', [id]))[0].status).toBe('active');
    expect(await q('SELECT current_subscription_id,subscription_status FROM merchants WHERE id=?', [a.merchantId])).toEqual(before);
  });
  it('denies a viewer, revoked owner and inactive actor', async () => {
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [a.merchantId, b.userId]);
    await expect(readCheckoutReview(b.userId, a.merchantId, plans[1], 'monthly')).rejects.toThrow();
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)", [a.merchantId, a.userId]);
    await expect(readCheckoutReview(a.userId, a.merchantId, plans[1], 'monthly')).rejects.toThrow();
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [b.userId]);
    await expect(readCheckoutReview(b.userId, b.merchantId, plans[1], 'monthly')).rejects.toThrow();
  });
});

