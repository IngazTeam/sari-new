import { randomUUID } from 'node:crypto';
import { getPool } from '../../db/connection';

export function assertDisposableDatabase(): void {
  const url = new URL(process.env.DATABASE_URL || '');
  if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !/^\/[a-z0-9_]*test[a-z0-9_]*$/i.test(url.pathname)) {
    throw new Error('These contracts require a local disposable test database');
  }
}

export async function createDisposableMerchant(label: string) {
  assertDisposableDatabase();
  const pool = await getPool();
  if (!pool) throw new Error('Test database unavailable');
  const nonce = `remediation-${label.slice(0, 14)}-${randomUUID()}`;
  const [user] = await pool.execute<any>(
    "INSERT INTO users (openId, name, email, loginMethod, role, account_status) VALUES (?, ?, ?, 'local', 'user', 'active')",
    [nonce, 'Test account', `${nonce}@example.test`],
  );
  const userId = Number(user.insertId);
  const [merchant] = await pool.execute<any>(
    "INSERT INTO merchants (userId, businessName, status) VALUES (?, ?, 'active')", [userId, nonce],
  );
  return { userId, merchantId: Number(merchant.insertId) };
}

export async function cleanupDisposableMerchants(userIds: number[]): Promise<void> {
  if (!userIds.length) return;
  assertDisposableDatabase();
  const pool = await getPool();
  if (!pool) throw new Error('Test database unavailable');
  const connection = await pool.getConnection();
  try {
    // Parallel private fixtures can collide through MySQL's cascade/SET NULL locks.
    // Retry the rolled-back cleanup transaction only; test operations are never retried here.
    for (let attempt = 0; ; attempt++) {
      try {
        await connection.beginTransaction();
        const placeholders = userIds.map(() => '?').join(',');
        // Delete the leaf first: MySQL can reject the cascade diamond from merchant
        // through instance/message SET NULL and delivery CASCADE in one parent delete.
        await connection.execute(`DELETE d FROM whatsapp_message_deliveries d
          JOIN merchants m ON m.id = d.merchant_id JOIN users u ON u.id = m.userId
          WHERE u.id IN (${placeholders}) AND u.openId LIKE 'remediation-%'`, userIds);
        await connection.execute(`DELETE FROM users WHERE id IN (${placeholders}) AND openId LIKE 'remediation-%'`, userIds);
        await connection.commit();
        break;
      } catch (error) {
        await connection.rollback();
        if ((error as { code?: string }).code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error;
      }
    }
  } finally { connection.release(); }
}

export async function createDisposableTrialSubscription(merchantId: number) {
  assertDisposableDatabase();
  const pool = (await getPool())!;
  const [sub] = await pool.execute<any>(`INSERT INTO merchant_subscriptions (merchant_id,status,billing_cycle,start_date,end_date,trial_ends_at)
    VALUES (?,'trial','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))`, [merchantId]);
  await pool.execute('UPDATE merchants SET current_subscription_id=? WHERE id=?', [sub.insertId,merchantId]);
  return Number(sub.insertId);
}
