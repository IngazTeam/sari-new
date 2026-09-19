import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertInboundSchema } from './inbound-jobs';

export async function inboundHealth() {
  await assertInboundSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Queue database unavailable');
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT status, COUNT(*) AS count, COALESCE(MAX(TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP())), 0) AS oldestSeconds
     FROM whatsapp_inbound_jobs WHERE status IN ('pending','running','review') GROUP BY status`,
  );
  return rows.map(row => ({ status: String(row.status), count: Number(row.count), oldestSeconds: Number(row.oldestSeconds) }));
}
export async function listInboundReviews(merchantId?: number) {
  const pool = await getPool();
  if (!pool) throw new Error('Queue database unavailable');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, merchant_id AS merchantId, instance_id AS instanceId, source, status, attempts,
     error_code AS errorCode, created_at AS createdAt, updated_at AS updatedAt,
     reply_plan_json IS NOT NULL AS hasReplyPlan FROM whatsapp_inbound_jobs WHERE status = 'review'
     ${merchantId ? 'AND merchant_id = ?' : ''} ORDER BY id LIMIT 100`, merchantId ? [merchantId] : [],
  );
  return rows as Array<RowDataPacket & { id: number; merchantId: number; instanceId: number; source: string;
    status: string; attempts: number; errorCode: string; createdAt: string; updatedAt: string; hasReplyPlan: number }>;
}

/** Resolution does not replay AI/tools or bypass an unknown provider receipt. */
export async function resolveInboundReview(input: {
  id: number; merchantId: number; actorId: number; outcome: 'completed' | 'dismissed'; note: string;
}) {
  if (!input.note.trim() || input.note.trim().length < 20 || input.note.length > 1000) throw new Error('A concrete resolution note is required');
  const pool = await getPool();
  if (!pool) throw new Error('Queue database unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Recheck account status and administrator role inside the write transaction.
    const [actors] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE id = ? AND role = 'admin' AND account_status = 'active' FOR UPDATE", [input.actorId],
    );
    if (actors.length !== 1) throw new Error('Queue administrator required');
    const [changed] = await connection.execute<any>(
      `UPDATE whatsapp_inbound_jobs SET status = ?, resolution_note = ?, resolved_by = ?
       WHERE id = ? AND merchant_id = ? AND status = 'review' AND lease_token IS NULL`,
      [input.outcome, input.note.trim(), input.actorId, input.id, input.merchantId],
    );
    if (changed.affectedRows !== 1) throw new Error('Review no longer available');
    await connection.commit();
    return { success: true };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
