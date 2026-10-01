import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool } from './db/connection';

/** Serialize deletion with the dispatcher's campaign claim and keep logs atomic. */
export async function deleteTenantCampaign(id: number, merchantId: number): Promise<boolean> {
  if (![id, merchantId].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('Invalid campaign deletion scope');
  }
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [campaigns] = await connection.execute<RowDataPacket[]>(
      'SELECT status FROM campaigns WHERE id=? AND merchantId=? LIMIT 1 FOR UPDATE',
      [id, merchantId],
    );
    if (!campaigns[0] || !['draft', 'scheduled', 'completed', 'failed'].includes(campaigns[0].status)) {
      await connection.rollback();
      return false;
    }
    // Protect unresolved dispatches even if a legacy writer changed the parent status.
    // Lock all children so corrupt cross-tenant rows also prevent deletion.
    const [deliveries] = await connection.execute<RowDataPacket[]>(
      'SELECT merchant_id, status, quota_reserved FROM campaign_delivery_outbox WHERE campaign_id=? FOR UPDATE',
      [id],
    );
    if (deliveries.some(row => row.merchant_id !== merchantId || Number(row.quota_reserved) !== 0
      || !['sent', 'failed', 'suppressed'].includes(row.status))) {
      await connection.rollback();
      return false;
    }
    await connection.execute('DELETE FROM campaignLogs WHERE campaignId=?', [id]);
    const [removed] = await connection.execute<ResultSetHeader>(
      'DELETE FROM campaigns WHERE id=? AND merchantId=?', [id, merchantId],
    );
    if (removed.affectedRows !== 1) throw new Error('Campaign changed during deletion');
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
