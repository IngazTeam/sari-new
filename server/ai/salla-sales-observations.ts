import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { decryptSecret } from '../security/secrets';
import { databaseTimeEpoch } from '../db/time';
import { mapSallaOrderStatusSlug } from '../integrations/salla-order-state';
import { sallaObservationsInput, sallaObservationsOutput, type SallaObservationsRequest } from '../../shared/salla-sales-observations';

export class SallaObservationAccessDenied extends Error {}
export class SallaObservationConflict extends Error {}
export async function assertSallaObservationSchema() {
  await assertRuntimeSchema('Salla sales observations', [{ table: 'salla_sales_observations',
    columns: ['merchant_id','store_id','order_id','observed_state','provider_status','receipt_id','event_key','first_observed_at'],
    uniqueIndexes: [{ name: 'salla_observation_scope_state', columns: ['merchant_id','store_id','order_id','observed_state'] },
      { name: 'salla_observation_receipt', columns: ['receipt_id'] }],
    checkConstraints: ['chk_salla_observation_ids','chk_salla_observation_source'],
  }]);
}

/** The receipt effect, observation and legacy order projection share one transaction.
 * Recheck authority AFTER HTTP, holding the connection and receipt locks until commit.
 * No customer matching, payment fact, conversion attribution or learning signal is inferred. */
export async function recordSallaObservation(c: Pick<PoolConnection, 'execute'>, input: SallaObservationsRequest & {
  connectionId: number; accessToken: string; receiptId: number; processingToken: string; eventKey: string; providerStatus: string;
}) {
  sallaObservationsInput.parse({ merchantId: input.merchantId, storeId: input.storeId, orderId: input.orderId });
  const state = mapSallaOrderStatusSlug(input.providerStatus);
  if (!state || !/^[a-z_]{1,40}$/.test(input.providerStatus) || !/^[a-f0-9]{64}$/.test(input.eventKey)) throw new SallaObservationConflict();
  const [connections] = await c.execute<any[]>(`SELECT id,salla_store_id,accessToken,syncStatus FROM salla_connections WHERE merchantId=? FOR UPDATE`, [input.merchantId]);
  const active = connections[0];
  if (connections.length !== 1 || active.id !== input.connectionId || active.salla_store_id !== input.storeId
    || active.syncStatus !== 'active' || !input.accessToken || decryptSecret(active.accessToken) !== input.accessToken) throw new SallaObservationConflict();
  const [receipts] = await c.execute<any[]>(`SELECT id FROM salla_webhook_receipts
    WHERE id=? AND merchant_id=? AND salla_store_id=? AND resource_id=? AND event_key=? AND event_type='order.updated'
      AND status='processing' AND processing_token=? AND effect_applied=0
      AND claimed_at > DATE_SUB(NOW(3), INTERVAL 10 MINUTE) FOR UPDATE`,
  [input.receiptId,input.merchantId,input.storeId,input.orderId,input.eventKey,input.processingToken]);
  if (receipts.length !== 1) throw new SallaObservationConflict();
  // Scope lock above serializes distinct receipts observing the same state.
  const [existing] = await c.execute<any[]>(`SELECT receipt_id,observed_state FROM salla_sales_observations
    WHERE merchant_id=? AND store_id=? AND order_id=? AND observed_state=? FOR UPDATE`, [input.merchantId,input.storeId,input.orderId,state]);
  if (!existing.length) await c.execute(`INSERT INTO salla_sales_observations
    (merchant_id,store_id,order_id,observed_state,provider_status,receipt_id,event_key,first_observed_at)
    VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`,
  [input.merchantId,input.storeId,input.orderId,state,input.providerStatus,input.receiptId,input.eventKey]);
}

/** First observation of each supported state, not a complete transition history or live status. */
export async function inspectSallaObservations(actorId: number, raw: SallaObservationsRequest) {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new SallaObservationAccessDenied();
  const input = sallaObservationsInput.parse(raw), pool = await getPool();
  if (!pool) throw new SallaObservationConflict();
  const c = await pool.getConnection(); let reusable = true;
  try {
    await c.beginTransaction();
    const [actors] = await c.execute<any[]>("SELECT role,account_status FROM users WHERE id=? FOR SHARE", [actorId]);
    if (actors[0]?.role !== 'admin' || actors[0]?.account_status !== 'active') throw new SallaObservationAccessDenied();
    await assertSallaObservationSchema();
    const [rows] = await c.execute<any[]>(`SELECT o.*,r.merchant_id AS source_merchant,r.salla_store_id AS source_store,
      r.resource_id AS source_order,r.event_key AS source_event,r.event_type,r.effect_applied
      FROM salla_sales_observations o LEFT JOIN salla_webhook_receipts r ON r.id=o.receipt_id
      WHERE o.merchant_id=? AND o.store_id=? AND o.order_id=? ORDER BY o.first_observed_at,o.id LIMIT 7 FOR SHARE`,
    [input.merchantId,input.storeId,input.orderId]);
    const observations = rows.map(row => {
      if (row.source_merchant !== input.merchantId || row.source_store !== input.storeId || row.source_order !== input.orderId
        || row.source_event !== row.event_key || row.event_type !== 'order.updated' || row.effect_applied !== 1
        || mapSallaOrderStatusSlug(row.provider_status) !== row.observed_state) throw new SallaObservationConflict();
      return { state: row.observed_state, providerStatus: row.provider_status, firstObservedAt: new Date(databaseTimeEpoch(row.first_observed_at)).toISOString() };
    });
    const result = sallaObservationsOutput.parse({ ...input, source: 'salla_authenticated_order_read', paymentEvidence: 'not_measured', observations });
    await c.rollback(); return result;
  } catch (error) {
    try { await c.rollback(); } catch { reusable = false; c.destroy(); }
    throw error;
  } finally { if (reusable) c.release(); }
}
