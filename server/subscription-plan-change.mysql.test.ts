import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { completeImmediateCanonicalPlanChange, processCanonicalSubscriptionCharge } from './subscriptions/canonical-state';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
describe.skipIf(!process.env.DATABASE_URL)('plan change snapshot on disposable MySQL', () => {
  let a: Awaited<ReturnType<typeof createDisposableMerchant>>, planIds: number[], subscriptionId: number, paymentId: number, prefix: string, metadata: any;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  beforeEach(async () => {
    a = await createDisposableMerchant('planchange491'); prefix = 'planchange491-' + randomUUID(); planIds = [];
    for (let i = 0; i < 3; i++) {
      const r = await q("INSERT INTO subscription_plans(name,name_en,monthly_price,yearly_price,max_customers) VALUES (?, ?, 100,1000,100)", [prefix, 'Plan change fixture']);
      planIds.push(Number(r.insertId));
    }
    const result = await q("INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,billing_cycle,start_date,end_date) VALUES (?,?,'active','monthly',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 DAY))", [a.merchantId, planIds[0]]);
    subscriptionId = Number(result.insertId);
    await q("UPDATE merchants SET current_subscription_id=?,subscription_status='active',max_customers_allowed=100 WHERE id=?", [subscriptionId, a.merchantId]);
    const [row] = await q('SELECT start_date,end_date FROM merchant_subscriptions WHERE id=?', [subscriptionId]);
    metadata = { newPlanId: planIds[1], newBillingCycle: 'yearly', previousPlanId: planIds[0], previousBillingCycle: 'monthly', previousStatus: 'active', previousStartDate: row.start_date, previousEndDate: row.end_date };
    paymentId = Number((await q("INSERT INTO payment_transactions(merchant_id,subscription_id,type,amount,currency,status,payment_method,metadata) VALUES (?,?,'downgrade','0.00','SAR','pending','tap',?)", [a.merchantId, subscriptionId, JSON.stringify(metadata)])).insertId);
  });
  afterEach(async () => {
    await cleanupDisposableMerchants([a?.userId].filter(Boolean));
    for (const id of planIds || []) await q('DELETE FROM subscription_plans WHERE id=? AND name=?', [id, prefix]);
  });
  afterAll(closeDb);
  const state = () => q('SELECT plan_id,billing_cycle,status,start_date,end_date,conversations_used FROM merchant_subscriptions WHERE id=?', [subscriptionId]);
  const payment = async () => (await q('SELECT status FROM payment_transactions WHERE id=?', [paymentId]))[0].status;
  it('applies a matching snapshot and records the zero payment atomically', async () => {
    await completeImmediateCanonicalPlanChange(paymentId, a.merchantId);
    expect((await state())[0]).toMatchObject({ plan_id: planIds[1], billing_cycle: 'yearly', status: 'active' });
    expect(await payment()).toBe('completed');
  });
  it.each(['plan', 'cycle', 'end', 'start', 'status', 'missing-snapshot'])('rejects a changed %s without overwriting subscription or completing payment', async field => {
    if (field === 'plan') await q('UPDATE merchant_subscriptions SET plan_id=? WHERE id=?', [planIds[2], subscriptionId]);
    if (field === 'cycle') await q("UPDATE merchant_subscriptions SET billing_cycle='yearly' WHERE id=?", [subscriptionId]);
    if (field === 'end') await q('UPDATE merchant_subscriptions SET end_date=DATE_ADD(end_date,INTERVAL 1 DAY) WHERE id=?', [subscriptionId]);
    if (field === 'start') await q('UPDATE merchant_subscriptions SET start_date=DATE_ADD(start_date,INTERVAL 1 DAY) WHERE id=?', [subscriptionId]);
    if (field === 'status') await q("UPDATE merchant_subscriptions SET status='trial' WHERE id=?", [subscriptionId]);
    if (field === 'missing-snapshot') { delete metadata.previousPlanId; await q('UPDATE payment_transactions SET metadata=? WHERE id=?', [JSON.stringify(metadata), paymentId]); }
    const before = await state();
    await expect(completeImmediateCanonicalPlanChange(paymentId, a.merchantId)).rejects.toThrow();
    expect(await state()).toEqual(before); expect(await payment()).toBe('pending');
  });
  it('keeps normal usage counter changes compatible with the reviewed subscription', async () => {
    await q('UPDATE merchant_subscriptions SET conversations_used=7 WHERE id=?', [subscriptionId]);
    await completeImmediateCanonicalPlanChange(paymentId, a.merchantId);
    expect((await state())[0].conversations_used).toBe(7); expect(await payment()).toBe('completed');
  });
  it('rejects a second active subscription created while payment was pending', async () => {
    await q("INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,billing_cycle,start_date,end_date) VALUES (?,?,'active','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY))", [a.merchantId, planIds[2]]);
    const before = await state();
    await expect(completeImmediateCanonicalPlanChange(paymentId, a.merchantId)).rejects.toThrow('SUBSCRIPTION_PLAN_CHANGE_CONFLICT');
    expect(await state()).toEqual(before); expect(await payment()).toBe('pending');
  });
  it('rejects a late captured charge against a newer plan without marking it applied', async () => {
    const chargeId = 'chg_' + randomUUID().replaceAll('-', '');
    await q("UPDATE payment_transactions SET type='upgrade',amount='50.00',tap_charge_id=? WHERE id=?", [chargeId, paymentId]);
    await q('UPDATE merchant_subscriptions SET plan_id=? WHERE id=?', [planIds[2], subscriptionId]);
    const before = await state();
    await expect(processCanonicalSubscriptionCharge({ id: chargeId, status: 'CAPTURED', amount: 50, currency: 'SAR' })).rejects.toThrow();
    expect(await state()).toEqual(before); expect(await payment()).toBe('pending');
  });
  it('allows only one of two simultaneous changes that reviewed the same subscription', async () => {
    const second = Number((await q("INSERT INTO payment_transactions(merchant_id,subscription_id,type,amount,currency,status,payment_method,metadata) VALUES (?,?,'downgrade','0.00','SAR','pending','tap',?)", [a.merchantId, subscriptionId, JSON.stringify({ ...metadata, newPlanId: planIds[2] })])).insertId);
    const results = await Promise.allSettled([completeImmediateCanonicalPlanChange(paymentId, a.merchantId), completeImmediateCanonicalPlanChange(second, a.merchantId)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rows = await q('SELECT status FROM payment_transactions WHERE id IN (?,?)', [paymentId, second]);
    expect(rows.filter((r: any) => r.status === 'completed')).toHaveLength(1);
  });
});
