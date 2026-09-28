import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';

export class SubscriptionCancellationConflictError extends Error {}

/** Serialize cancellation with plan activation; never cancel a newer subscription
 * than the one the merchant reviewed in the confirmation dialog. */
export async function cancelCurrentSubscription(merchantId: number, expectedId?: number, reason?: string) {
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [merchants] = await connection.execute<RowDataPacket[]>('SELECT id FROM merchants WHERE id = ? FOR UPDATE', [merchantId]);
    if (!merchants.length) throw new SubscriptionCancellationConflictError();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, end_date > UTC_TIMESTAMP() AND
        (status <> 'trial' OR trial_ends_at IS NULL OR trial_ends_at > UTC_TIMESTAMP()) AS eligible
       FROM merchant_subscriptions WHERE merchant_id = ? AND status IN ('active', 'trial')
       ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`, [merchantId],
    );
    const current = rows[0];
    if (!current?.eligible || (expectedId !== undefined && current.id !== expectedId)) {
      throw new SubscriptionCancellationConflictError();
    }
    await connection.execute(
      `UPDATE merchant_subscriptions SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP(), cancellation_reason = ?
       WHERE id = ? AND merchant_id = ?`, [reason ?? null, current.id, merchantId],
    );
    await connection.execute(
      `UPDATE merchants SET current_subscription_id = NULL, subscription_status = 'expired', max_customers_allowed = 0
       WHERE id = ? AND current_subscription_id = ?`, [merchantId, current.id],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
