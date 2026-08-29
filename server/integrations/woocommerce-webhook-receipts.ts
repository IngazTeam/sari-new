import crypto from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import {
  deleteWooCommerceOrderByWooId,
  deleteWooCommerceProductByWooId,
  getPool,
  getWooCommerceSettings,
  getWooCommerceWebhookRegistrations,
  upsertWooCommerceOrdersSnapshot,
  upsertWooCommerceProductsSnapshot,
} from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { normalizeWooCommerceOrder, normalizeWooCommerceProduct, wooSyncTimestamp } from './woocommerce-sync';
import { createWooCommerceClient, WooCommerceApiError } from '../woocommerce';
import type { WooCommerceWebhookIdentity, WooCommerceWebhookTopic } from '../webhooks/woocommerce-security';
import { withWooCommerceMerchantLock, WooCommerceMerchantLockError } from './woocommerce-lock';

const MAX_ATTEMPTS = 8;
const STALE_LEASE_MINUTES = 10;
let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

type ReceiptRow = RowDataPacket & {
  id: number;
  merchant_id: number;
  delivery_id: string;
  webhook_id: string;
  topic: WooCommerceWebhookTopic;
  resource_id: number;
  attempt_count: number;
  processing_token: string;
};

type HealthRow = RowDataPacket & {
  recent_total: number | string | null;
  recent_completed: number | string | null;
  awaiting: number | string | null;
  manual_review: number | string | null;
  oldest_pending_seconds: number | string | null;
};

class WooCommerceReceiptError extends Error {
  constructor(readonly code: string, readonly manualReview = false) {
    super(code);
    this.name = 'WooCommerceReceiptError';
  }
}

async function ensureWooCommerceWebhookSchema(): Promise<void> {
  await assertRuntimeSchema('WooCommerce webhook ingress', [
    {
      table: 'woocommerce_settings',
      columns: ['merchant_id', 'webhook_endpoint_id', 'webhook_signing_secret', 'connectionStatus'],
      uniqueIndexes: [{ name: 'woocommerce_settings_webhook_endpoint_unique', columns: ['webhook_endpoint_id'] }],
    },
    {
      table: 'woocommerce_webhook_registrations',
      columns: ['merchant_id', 'topic', 'webhook_id'],
      uniqueIndexes: [
        { name: 'woocommerce_webhook_registrations_topic_unique', columns: ['merchant_id', 'topic'] },
        { name: 'woocommerce_webhook_registrations_remote_unique', columns: ['merchant_id', 'webhook_id'] },
      ],
    },
    {
      table: 'woocommerce_webhook_receipts',
      columns: [
        'merchant_id', 'delivery_id', 'webhook_id', 'topic', 'resource_id', 'status',
        'attempt_count', 'processing_token', 'available_at', 'claimed_at', 'processed_at', 'last_error',
      ],
      uniqueIndexes: [{ name: 'woocommerce_webhook_receipts_delivery_unique', columns: ['merchant_id', 'delivery_id'] }],
    },
  ]);
}

export async function enqueueWooCommerceWebhookReceipt(input: {
  merchantId: number;
  identity: WooCommerceWebhookIdentity;
  resourceId: number;
}): Promise<{ accepted: true; duplicate: boolean }> {
  await ensureWooCommerceWebhookSchema();
  if (!Number.isSafeInteger(input.merchantId) || input.merchantId <= 0 || !Number.isSafeInteger(input.resourceId) || input.resourceId <= 0) {
    throw new WooCommerceReceiptError('invalid_identity', true);
  }
  const pool = await getPool();
  if (!pool) throw new WooCommerceReceiptError('database_unavailable');
  const [result] = await pool.execute(
    `INSERT INTO woocommerce_webhook_receipts
       (merchant_id, delivery_id, webhook_id, topic, resource_id, status, attempt_count, available_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, NOW(3))
     ON DUPLICATE KEY UPDATE delivery_id = VALUES(delivery_id)`,
    [input.merchantId, input.identity.deliveryId, input.identity.webhookId, input.identity.topic, input.resourceId],
  );
  return { accepted: true, duplicate: Number((result as any).affectedRows || 0) === 0 };
}

async function recoverStaleLeases(): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new WooCommerceReceiptError('database_unavailable');
  await pool.execute(
    `UPDATE woocommerce_webhook_receipts
        SET status = IF(attempt_count >= ?, 'manual_review', 'failed'),
            processing_token = NULL, available_at = NOW(3),
            last_error = IF(attempt_count >= ?, 'retry_exhausted', 'stale_lease')
      WHERE status = 'processing'
        AND claimed_at < DATE_SUB(NOW(3), INTERVAL ${STALE_LEASE_MINUTES} MINUTE)`,
    [MAX_ATTEMPTS, MAX_ATTEMPTS],
  );
}

async function claimReceipts(limit: number): Promise<ReceiptRow[]> {
  const pool = await getPool();
  if (!pool) throw new WooCommerceReceiptError('database_unavailable');
  const connection = await pool.getConnection();
  const processingToken = crypto.randomUUID().replace(/-/g, '');
  let inTransaction = false;
  let reusable = true;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const [candidates] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM woocommerce_webhook_receipts
        WHERE status IN ('pending', 'failed') AND available_at <= NOW(3) AND attempt_count < ?
        ORDER BY id ASC LIMIT ? FOR UPDATE SKIP LOCKED`,
      [MAX_ATTEMPTS, Math.max(1, Math.min(limit, 50))],
    );
    const ids = candidates.map(row => Number(row.id)).filter(Number.isSafeInteger);
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      await connection.execute(
        `UPDATE woocommerce_webhook_receipts
            SET status = 'processing', attempt_count = attempt_count + 1,
                processing_token = ?, claimed_at = NOW(3), last_error = NULL
          WHERE id IN (${placeholders})`,
        [processingToken, ...ids],
      );
    }
    await connection.commit();
    inTransaction = false;
    if (!ids.length) return [];
  } catch (error) {
    if (inTransaction && reusable) {
      try {
        await connection.rollback();
        inTransaction = false;
      } catch {
        reusable = false;
      }
    }
    throw error;
  } finally {
    if (reusable) connection.release();
    else connection.destroy();
  }
  const [rows] = await pool.execute<ReceiptRow[]>(
    `SELECT id, merchant_id, delivery_id, webhook_id, topic, resource_id, attempt_count, processing_token
       FROM woocommerce_webhook_receipts
      WHERE processing_token = ? AND status = 'processing' ORDER BY id ASC`,
    [processingToken],
  );
  return rows;
}

async function suppressReceipt(row: ReceiptRow, code: string): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new WooCommerceReceiptError('database_unavailable');
  const [result] = await pool.execute(
    `UPDATE woocommerce_webhook_receipts
        SET status = 'suppressed', processed_at = NOW(3), processing_token = NULL, last_error = ?
      WHERE id = ? AND status = 'processing' AND processing_token = ?`,
    [code.slice(0, 100), row.id, row.processing_token],
  );
  if (Number((result as any).affectedRows || 0) !== 1) throw new WooCommerceReceiptError('lease_lost');
}

async function processReceiptUnlocked(row: ReceiptRow): Promise<'completed' | 'suppressed'> {
  const merchantId = Number(row.merchant_id);
  const resourceId = Number(row.resource_id);
  const settings = await getWooCommerceSettings(merchantId);
  if (!settings || settings.isActive !== 1 || settings.connectionStatus !== 'connected' || !settings.webhookEndpointId) {
    await suppressReceipt(row, 'connection_inactive');
    return 'suppressed';
  }
  const registrations = await getWooCommerceWebhookRegistrations(merchantId);
  if (!registrations.some(item => item.topic === row.topic && item.webhookId === row.webhook_id)) {
    await suppressReceipt(row, 'registration_rotated');
    return 'suppressed';
  }
  const client = createWooCommerceClient(settings);
  const observedAt = wooSyncTimestamp();
  try {
    if (row.topic.startsWith('product.')) {
      const product = await client.getProduct(resourceId);
      await upsertWooCommerceProductsSnapshot(merchantId, [normalizeWooCommerceProduct(merchantId, product, observedAt)], false);
    } else {
      const order = await client.getOrder(resourceId);
      await upsertWooCommerceOrdersSnapshot(merchantId, [normalizeWooCommerceOrder(merchantId, order, observedAt)], false);
    }
  } catch (error) {
    if (!(error instanceof WooCommerceApiError) || error.code !== 'not_found') throw error;
    if (row.topic.startsWith('product.')) await deleteWooCommerceProductByWooId(merchantId, resourceId);
    else await deleteWooCommerceOrderByWooId(merchantId, resourceId);
  }
  return 'completed';
}

async function processReceipt(row: ReceiptRow): Promise<'completed' | 'suppressed'> {
  try {
    return await withWooCommerceMerchantLock(Number(row.merchant_id), () => processReceiptUnlocked(row));
  } catch (error) {
    if (error instanceof WooCommerceMerchantLockError) throw new WooCommerceReceiptError(error.code);
    throw error;
  }
}

async function completeReceipt(row: ReceiptRow): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new WooCommerceReceiptError('database_unavailable');
  const [result] = await pool.execute(
    `UPDATE woocommerce_webhook_receipts
        SET status = 'completed', processed_at = NOW(3), processing_token = NULL, last_error = NULL
      WHERE id = ? AND status = 'processing' AND processing_token = ?`,
    [row.id, row.processing_token],
  );
  if (Number((result as any).affectedRows || 0) !== 1) throw new WooCommerceReceiptError('lease_lost');
}

async function scheduleFailure(row: ReceiptRow, error: unknown): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const apiError = error instanceof WooCommerceApiError ? error : null;
  const known = error instanceof WooCommerceReceiptError ? error : null;
  const exhausted = Number(row.attempt_count) >= MAX_ATTEMPTS;
  const permanentProviderError = apiError && (
    apiError.code === 'credentials'
    || apiError.code === 'endpoint'
    || apiError.code === 'response'
    || (apiError.code === 'status' && [400, 401, 403].includes(apiError.statusCode || 0))
  );
  const manualReview = Boolean(known?.manualReview || permanentProviderError || exhausted);
  const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, Number(row.attempt_count) - 1)));
  const code = exhausted ? 'retry_exhausted' : known?.code || apiError?.code || 'processing_failed';
  await pool.execute(
    `UPDATE woocommerce_webhook_receipts
        SET status = ?, available_at = DATE_ADD(NOW(3), INTERVAL ? SECOND),
            processing_token = NULL, last_error = ?
      WHERE id = ? AND status = 'processing' AND processing_token = ?`,
    [manualReview ? 'manual_review' : 'failed', delaySeconds, code.slice(0, 100), row.id, row.processing_token],
  );
}

export async function runWooCommerceWebhookReceiptBatch(limit = 20): Promise<number> {
  if (workerRunning) return 0;
  workerRunning = true;
  try {
    await ensureWooCommerceWebhookSchema();
    await recoverStaleLeases();
    const rows = await claimReceipts(limit);
    for (const row of rows) {
      try {
        const outcome = await processReceipt(row);
        if (outcome === 'completed') await completeReceipt(row);
      } catch (error) {
        await scheduleFailure(row, error);
      }
    }
    return rows.length;
  } finally {
    workerRunning = false;
  }
}

export function startWooCommerceWebhookReceiptWorker(intervalMs = 30_000): void {
  if (workerTimer) return;
  const tick = () => runWooCommerceWebhookReceiptBatch().catch(() => {
    console.error('[WooCommerce Webhook] receipt worker unavailable');
  });
  void tick();
  workerTimer = setInterval(tick, Math.max(intervalMs, 10_000));
  workerTimer.unref?.();
}

export async function getWooCommerceWebhookHealth(merchantId: number): Promise<{
  recentTotal: number;
  recentCompleted: number;
  awaiting: number;
  manualReview: number;
  oldestPendingSeconds: number | null;
}> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new Error('Invalid merchant');
  await ensureWooCommerceWebhookSchema();
  const pool = await getPool();
  if (!pool) throw new WooCommerceReceiptError('database_unavailable');
  const [rows] = await pool.execute<HealthRow[]>(
    `SELECT
       SUM(created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY)) AS recent_total,
       SUM(created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) AND status = 'completed') AS recent_completed,
       SUM(status IN ('pending', 'processing', 'failed')) AS awaiting,
       SUM(status = 'manual_review') AS manual_review,
       TIMESTAMPDIFF(SECOND,
         MIN(CASE WHEN status IN ('pending', 'processing', 'failed') THEN created_at END), NOW(3)) AS oldest_pending_seconds
     FROM woocommerce_webhook_receipts WHERE merchant_id = ?`,
    [merchantId],
  );
  const health = rows[0];
  return {
    recentTotal: Number(health?.recent_total || 0),
    recentCompleted: Number(health?.recent_completed || 0),
    awaiting: Number(health?.awaiting || 0),
    manualReview: Number(health?.manual_review || 0),
    oldestPendingSeconds: health?.oldest_pending_seconds == null ? null : Math.max(0, Number(health.oldest_pending_seconds)),
  };
}
