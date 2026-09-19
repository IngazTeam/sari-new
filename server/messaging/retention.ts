import { getPool } from '../db/connection';

/** Retain identity tombstones for deduplication, remove completed message bodies. */
export async function purgeCompletedInboundPayloads(limit = 500): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid retention batch');
  const pool = await getPool();
  if (!pool) throw new Error('Queue database unavailable');
  const [result] = await pool.execute<any>(
    `UPDATE whatsapp_inbound_jobs SET payload_json = JSON_OBJECT('redacted', true), reply_plan_json = NULL
     WHERE status IN ('completed','dismissed') AND updated_at < TIMESTAMPADD(DAY, -30, UTC_TIMESTAMP())
       AND JSON_EXTRACT(payload_json, '$.redacted') IS NULL ORDER BY id LIMIT ${limit}`,
  );
  const [deliveries] = await pool.execute<any>(
    `UPDATE whatsapp_message_deliveries SET request_json = NULL WHERE request_json IS NOT NULL
     AND status IN ('sent','delivered','read') AND status_updated_at < TIMESTAMPADD(DAY, -30, UTC_TIMESTAMP())
     ORDER BY id LIMIT ${limit}`,
  );
  return result.affectedRows + deliveries.affectedRows;
}
