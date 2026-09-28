import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getPool } from './db/connection';
import { cancelCurrentSubscription, SubscriptionCancellationConflictError } from './subscriptions/cancel-subscription';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';

describe.skipIf(!process.env.DATABASE_URL)('subscription cancellation MySQL contracts', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  let subscriptionId: number, otherId: number;
  const addSubscription = async (merchantId: number) => {
    const pool = (await getPool())!;
    const [result] = await pool.execute<any>(`INSERT INTO merchant_subscriptions
      (merchant_id,status,billing_cycle,start_date,end_date) VALUES (?,'active','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))`, [merchantId]);
    await pool.execute("UPDATE merchants SET current_subscription_id=?, subscription_status='active', max_customers_allowed=100 WHERE id=?", [result.insertId, merchantId]);
    return Number(result.insertId);
  };
  const readState = async (merchantId: number, id: number) => {
    const [rows] = await (await getPool())!.execute<any[]>(`SELECT s.status, s.cancellation_reason AS reason, m.current_subscription_id AS currentId,
      m.subscription_status AS entitlement, m.max_customers_allowed AS customers FROM merchant_subscriptions s JOIN merchants m ON m.id=s.merchant_id
      WHERE m.id=? AND s.id=?`, [merchantId, id]);
    return rows[0];
  };
  beforeEach(async () => {
    owner = await createDisposableMerchant('sub-workspace'); other = await createDisposableMerchant('sub-other');
    subscriptionId = await addSubscription(owner.merchantId); otherId = await addSubscription(other.merchantId);
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean)); });
  afterAll(closeDb);
  it('cancels the reviewed subscription and entitlement together, preserving the other tenant', async () => {
    await cancelCurrentSubscription(owner.merchantId, subscriptionId, 'test only');
    expect(await readState(owner.merchantId, subscriptionId)).toMatchObject({ status: 'cancelled', reason: 'test only', currentId: null, entitlement: 'expired', customers: 0 });
    expect(await readState(other.merchantId, otherId)).toMatchObject({ status: 'active', currentId: otherId, entitlement: 'active', customers: 100 });
  });
  it('rejects an identifier belonging to a different tenant without changing either subscription', async () => {
    await expect(cancelCurrentSubscription(owner.merchantId, otherId)).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
    expect((await readState(owner.merchantId, subscriptionId)).status).toBe('active');
    expect((await readState(other.merchantId, otherId)).status).toBe('active');
  });
  it('does not cancel a new subscription activated after the confirmation was opened', async () => {
    const nextId = await addSubscription(owner.merchantId);
    await expect(cancelCurrentSubscription(owner.merchantId, subscriptionId)).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
    expect(await readState(owner.merchantId, nextId)).toMatchObject({ status: 'active', currentId: nextId, entitlement: 'active' });
  });
  it('rejects an expired subscription without changing stored history', async () => {
    await (await getPool())!.execute('UPDATE merchant_subscriptions SET end_date=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) WHERE id=?', [subscriptionId]);
    await expect(cancelCurrentSubscription(owner.merchantId, subscriptionId)).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
    expect((await readState(owner.merchantId, subscriptionId)).status).toBe('active');
  });
  it('serializes duplicate cancellation requests so only one succeeds', async () => {
    const results = await Promise.allSettled([cancelCurrentSubscription(owner.merchantId, subscriptionId), cancelCurrentSubscription(owner.merchantId, subscriptionId)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await readState(owner.merchantId, subscriptionId)).status).toBe('cancelled');
  });
  it('rolls back the subscription when updating its entitlement fails', async () => {
    const pool = (await getPool())!, connection = await pool.getConnection();
    const execute = connection.execute.bind(connection);
    vi.spyOn(connection, 'execute').mockImplementation(((sql: string, values: any[]) => sql.startsWith('UPDATE merchants') ? Promise.reject(new Error('test failure')) : execute(sql, values)) as any);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    await expect(cancelCurrentSubscription(owner.merchantId, subscriptionId)).rejects.toThrow('test failure');
    vi.restoreAllMocks();
    expect(await readState(owner.merchantId, subscriptionId)).toMatchObject({ status: 'active', currentId: subscriptionId, entitlement: 'active', customers: 100 });
  });
});
