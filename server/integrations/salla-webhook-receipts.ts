import crypto from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import {
  getActiveSallaConnectionByStoreId,
  getPool,
  getSallaConnectionByMerchantId,
} from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  sendMerchantWhatsApp,
  WhatsAppDeliveryStateError,
} from '../channels/whatsapp/service';
import { SallaIntegration } from './salla';
import {
  decideSallaOrderTransition,
  mapSallaOrderStatusSlug,
  type LocalOrderStatus,
} from './salla-order-state';
import { hashSallaWebhook, type ParsedSallaWebhook, type SallaWebhookEventType } from '../webhooks/salla-security';

const MAX_ATTEMPTS = 8;
const STALE_LEASE_MINUTES = 10;

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

type ReceiptRow = RowDataPacket & {
  id: number;
  merchant_id: number;
  salla_store_id: string;
  event_key: string;
  event_type: SallaWebhookEventType;
  resource_id: string;
  attempt_count: number;
  effect_applied: number;
  notification_required: number;
  notification_status: LocalOrderStatus | null;
  processing_token: string;
};

type LocalOrderRow = RowDataPacket & {
  id: number;
  status: LocalOrderStatus;
  customerPhone: string;
  customerName: string;
  orderNumber: string | null;
  trackingNumber: string | null;
};

type SallaReceiptHealthRow = RowDataPacket & {
  recent_total: number | string | null;
  recent_completed: number | string | null;
  awaiting: number | string | null;
  manual_review: number | string | null;
  oldest_pending_seconds: number | string | null;
};

class ReceiptProcessingError extends Error {
  constructor(readonly code: string, readonly manualReview = false) {
    super(code);
    this.name = 'ReceiptProcessingError';
  }
}

async function ensureSallaReceiptSchema(): Promise<void> {
  await assertRuntimeSchema('Salla webhook ingress', [
    {
      table: 'salla_connections',
      columns: ['merchantId', 'salla_store_id', 'accessToken', 'syncStatus'],
      uniqueIndexes: [
        { name: 'salla_connections_merchantId_unique', columns: ['merchantId'] },
        { name: 'salla_connections_store_id_unique', columns: ['salla_store_id'] },
      ],
    },
    {
      table: 'salla_webhook_receipts',
      columns: [
        'merchant_id', 'salla_store_id', 'event_key', 'event_type', 'resource_id', 'status',
        'attempt_count', 'effect_applied', 'notification_required', 'notification_status',
        'processing_token', 'available_at', 'claimed_at', 'processed_at', 'last_error',
      ],
      uniqueIndexes: [{ name: 'salla_webhook_receipts_event_unique', columns: ['event_key'] }],
    },
  ]);
}

export async function enqueueSallaWebhookReceipt(input: {
  rawBody: Buffer;
  payload: ParsedSallaWebhook;
}): Promise<{ accepted: true; duplicate: boolean }> {
  await ensureSallaReceiptSchema();
  const connection = await getActiveSallaConnectionByStoreId(input.payload.storeId);
  if (!connection) throw new ReceiptProcessingError('store_identity_unmapped', true);
  const pool = await getPool();
  if (!pool) throw new ReceiptProcessingError('database_unavailable');
  const eventKey = hashSallaWebhook(input.rawBody);
  const [result] = await pool.execute(
    `INSERT INTO salla_webhook_receipts
       (merchant_id, salla_store_id, event_key, event_type, resource_id, status, attempt_count, available_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, NOW(3))
     ON DUPLICATE KEY UPDATE event_key = VALUES(event_key)`,
    [connection.merchantId, input.payload.storeId, eventKey, input.payload.event, input.payload.resourceId],
  );
  return { accepted: true, duplicate: Number((result as any).affectedRows || 0) === 0 };
}

export async function getSallaWebhookReceiptHealth(merchantId: number): Promise<{
  recentTotal: number;
  recentCompleted: number;
  awaiting: number;
  manualReview: number;
  oldestPendingSeconds: number | null;
}> {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error('Invalid merchant');
  await ensureSallaReceiptSchema();
  const pool = await getPool();
  if (!pool) throw new ReceiptProcessingError('database_unavailable');
  const [rows] = await pool.execute<SallaReceiptHealthRow[]>(
    `SELECT
       SUM(created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY)) AS recent_total,
       SUM(created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) AND status = 'completed') AS recent_completed,
       SUM(status IN ('pending', 'processing', 'failed')) AS awaiting,
       SUM(status = 'manual_review') AS manual_review,
       TIMESTAMPDIFF(SECOND,
         MIN(CASE WHEN status IN ('pending', 'processing', 'failed') THEN created_at END),
         NOW(3)) AS oldest_pending_seconds
     FROM salla_webhook_receipts
     WHERE merchant_id = ?`,
    [merchantId],
  );
  const health = rows[0];
  return {
    recentTotal: Number(health?.recent_total || 0),
    recentCompleted: Number(health?.recent_completed || 0),
    awaiting: Number(health?.awaiting || 0),
    manualReview: Number(health?.manual_review || 0),
    oldestPendingSeconds: health?.oldest_pending_seconds == null
      ? null
      : Math.max(0, Number(health.oldest_pending_seconds)),
  };
}

async function recoverStaleLeases(): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new ReceiptProcessingError('database_unavailable');
  await pool.execute(
    `UPDATE salla_webhook_receipts
        SET status = IF(attempt_count >= ?, 'manual_review', 'failed'),
            processing_token = NULL,
            available_at = NOW(3),
            last_error = IF(attempt_count >= ?, 'retry_exhausted', 'stale_lease')
      WHERE status = 'processing'
        AND claimed_at < DATE_SUB(NOW(3), INTERVAL ${STALE_LEASE_MINUTES} MINUTE)`,
    [MAX_ATTEMPTS, MAX_ATTEMPTS],
  );
}

async function claimReceipts(limit: number): Promise<ReceiptRow[]> {
  const pool = await getPool();
  if (!pool) throw new ReceiptProcessingError('database_unavailable');
  const connection = await pool.getConnection();
  const processingToken = crypto.randomUUID().replace(/-/g, '');
  let inTransaction = false;
  let connectionReusable = true;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const [candidates] = await connection.execute<RowDataPacket[]>(
      `SELECT id
         FROM salla_webhook_receipts
        WHERE status IN ('pending', 'failed')
          AND available_at <= NOW(3)
          AND attempt_count < ?
        ORDER BY id ASC
        LIMIT ? FOR UPDATE SKIP LOCKED`,
      [MAX_ATTEMPTS, Math.max(1, Math.min(limit, 50))],
    );
    const ids = candidates.map(row => Number(row.id)).filter(Number.isSafeInteger);
    if (ids.length === 0) {
      try {
        await connection.commit();
        inTransaction = false;
      } catch (error) {
        connectionReusable = false;
        throw error;
      }
      return [];
    }
    const placeholders = ids.map(() => '?').join(',');
    await connection.execute(
      `UPDATE salla_webhook_receipts
          SET status = 'processing', attempt_count = attempt_count + 1,
              processing_token = ?, claimed_at = NOW(3), last_error = NULL
        WHERE id IN (${placeholders})`,
      [processingToken, ...ids],
    );
    try {
      await connection.commit();
      inTransaction = false;
    } catch (error) {
      connectionReusable = false;
      throw error;
    }
  } catch (error) {
    if (inTransaction && connectionReusable) {
      try {
        await connection.rollback();
        inTransaction = false;
      } catch {
        connectionReusable = false;
      }
    }
    throw error;
  } finally {
    if (connectionReusable) connection.release();
    else connection.destroy();
  }

  const [rows] = await pool.execute<ReceiptRow[]>(
    `SELECT id, merchant_id, salla_store_id, event_key, event_type, resource_id, attempt_count,
            effect_applied, notification_required, notification_status, processing_token
       FROM salla_webhook_receipts
      WHERE processing_token = ? AND status = 'processing'
      ORDER BY id ASC`,
    [processingToken],
  );
  return rows;
}

async function markEffectApplied(
  row: ReceiptRow,
  notificationRequired = false,
  notificationStatus: LocalOrderStatus | null = null,
): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new ReceiptProcessingError('database_unavailable');
  const [result] = await pool.execute(
    `UPDATE salla_webhook_receipts
        SET effect_applied = 1, notification_required = ?, notification_status = ?
      WHERE id = ? AND status = 'processing' AND processing_token = ?`,
    [notificationRequired ? 1 : 0, notificationStatus, row.id, row.processing_token],
  );
  if (Number((result as any).affectedRows || 0) !== 1) throw new ReceiptProcessingError('lease_lost');
  row.effect_applied = 1;
  row.notification_required = notificationRequired ? 1 : 0;
  row.notification_status = notificationStatus;
}

async function deleteLocalProduct(row: ReceiptRow): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new ReceiptProcessingError('database_unavailable');
  await pool.execute(
    'DELETE FROM products WHERE merchantId = ? AND sallaProductId = ?',
    [row.merchant_id, row.resource_id],
  );
  await markEffectApplied(row);
}

async function applyOrderEffect(
  row: ReceiptRow,
  nextStatus: LocalOrderStatus,
  trackingNumber?: string,
): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new ReceiptProcessingError('database_unavailable');
  const connection = await pool.getConnection();
  let inTransaction = false;
  let connectionReusable = true;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const [orders] = await connection.execute<LocalOrderRow[]>(
      `SELECT id, status, customerPhone, customerName, orderNumber, trackingNumber
         FROM orders
        WHERE merchantId = ? AND sallaOrderId = ?
        LIMIT 1 FOR UPDATE`,
      [row.merchant_id, row.resource_id],
    );
    const order = orders[0];
    if (!order) {
      await connection.execute(
        `UPDATE salla_webhook_receipts
            SET effect_applied = 1, notification_required = 0, notification_status = NULL
          WHERE id = ? AND status = 'processing' AND processing_token = ?`,
        [row.id, row.processing_token],
      );
      try {
        await connection.commit();
        inTransaction = false;
      } catch (error) {
        connectionReusable = false;
        throw error;
      }
      row.effect_applied = 1;
      return;
    }

    const decision = decideSallaOrderTransition(order.status, nextStatus);
    const notify = decision === 'apply' && nextStatus !== 'pending';
    if (decision === 'apply') {
      await connection.execute(
        `UPDATE orders
            SET status = ?, trackingNumber = COALESCE(?, trackingNumber), updatedAt = NOW()
          WHERE id = ? AND merchantId = ?`,
        [nextStatus, trackingNumber || null, order.id, row.merchant_id],
      );
      await connection.execute(
        `INSERT INTO order_tracking_logs
           (orderId, oldStatus, newStatus, trackingNumber, notificationSent, createdAt)
         VALUES (?, ?, ?, ?, 0, NOW())`,
        [order.id, order.status, nextStatus, trackingNumber || null],
      );
    }
    const [receiptUpdate] = await connection.execute(
      `UPDATE salla_webhook_receipts
          SET effect_applied = 1, notification_required = ?, notification_status = ?
        WHERE id = ? AND status = 'processing' AND processing_token = ?`,
      [notify ? 1 : 0, notify ? nextStatus : null, row.id, row.processing_token],
    );
    if (Number((receiptUpdate as any).affectedRows || 0) !== 1) {
      throw new ReceiptProcessingError('lease_lost');
    }
    try {
      await connection.commit();
      inTransaction = false;
    } catch (error) {
      connectionReusable = false;
      throw error;
    }
    row.effect_applied = 1;
    row.notification_required = notify ? 1 : 0;
    row.notification_status = notify ? nextStatus : null;
  } catch (error) {
    if (inTransaction && connectionReusable) {
      try {
        await connection.rollback();
        inTransaction = false;
      } catch {
        connectionReusable = false;
      }
    }
    throw error;
  } finally {
    if (connectionReusable) connection.release();
    else connection.destroy();
  }
}

function buildOrderStatusMessage(order: LocalOrderRow, status: LocalOrderStatus): string {
  const label: Record<LocalOrderStatus, string> = {
    pending: 'قيد المراجعة',
    paid: 'تم تأكيد الدفع',
    processing: 'قيد التجهيز',
    shipped: 'تم الشحن',
    delivered: 'تم التوصيل',
    cancelled: 'تم الإلغاء',
  };
  return [
    `مرحباً ${String(order.customerName).trim().slice(0, 100)}،`,
    `تحديث طلبك ${String(order.orderNumber || `#${order.id}`).slice(0, 80)}: ${label[status]}.`,
    status === 'shipped' && order.trackingNumber
      ? `رقم التتبع: ${String(order.trackingNumber).slice(0, 100)}`
      : '',
  ].filter(Boolean).join('\n');
}

async function deliverOrderNotification(row: ReceiptRow): Promise<void> {
  const status = row.notification_status;
  if (!row.notification_required || !status) return;
  const pool = await getPool();
  if (!pool) throw new ReceiptProcessingError('database_unavailable');
  const [orders] = await pool.execute<LocalOrderRow[]>(
    `SELECT id, status, customerPhone, customerName, orderNumber, trackingNumber
       FROM orders
      WHERE merchantId = ? AND sallaOrderId = ? LIMIT 1`,
    [row.merchant_id, row.resource_id],
  );
  const order = orders[0];
  if (!order || order.status !== status) return; // A newer state superseded this alert.

  try {
    const result = await sendMerchantWhatsApp({
      merchantId: Number(row.merchant_id),
      idempotencyKey: `salla-order:${row.merchant_id}:${row.resource_id}:${status}`,
      to: order.customerPhone,
      kind: 'text',
      text: buildOrderStatusMessage(order, status),
      retryFailed: true,
    });
    if (result.accepted) return;
    if (result.errorCode === 'delivery_in_progress') {
      throw new ReceiptProcessingError('ambiguous_notification_delivery', true);
    }
    throw new ReceiptProcessingError(result.errorCode || 'notification_rejected');
  } catch (error) {
    if (error instanceof ReceiptProcessingError) throw error;
    if (error instanceof WhatsAppDeliveryStateError) {
      throw new ReceiptProcessingError('ambiguous_notification_delivery', true);
    }
    throw new ReceiptProcessingError('notification_service_unavailable');
  }
}

async function applyReceiptEffect(row: ReceiptRow): Promise<void> {
  const connection = await getSallaConnectionByMerchantId(Number(row.merchant_id));
  if (
    !connection
    || connection.syncStatus !== 'active'
    || connection.sallaStoreId !== row.salla_store_id
  ) {
    throw new ReceiptProcessingError('connection_inactive');
  }
  const salla = new SallaIntegration(Number(row.merchant_id), connection.accessToken);

  if (!row.effect_applied) {
    if (row.event_type === 'product.deleted') {
      await deleteLocalProduct(row);
    } else if (row.event_type === 'product.updated' || row.event_type === 'product.quantity.updated') {
      await salla.syncSingleProduct(row.resource_id);
      await markEffectApplied(row);
    } else if (row.event_type === 'order.updated') {
      const remote = await salla.getOrderStatus(row.resource_id);
      const mapped = mapSallaOrderStatusSlug(remote.status);
      if (!mapped) throw new ReceiptProcessingError('unsupported_order_status', true);
      await applyOrderEffect(row, mapped, remote.trackingNumber);
    } else {
      throw new ReceiptProcessingError('unsupported_event', true);
    }
  }
  await deliverOrderNotification(row);
}

async function completeReceipt(row: ReceiptRow): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new ReceiptProcessingError('database_unavailable');
  const [result] = await pool.execute(
    `UPDATE salla_webhook_receipts
        SET status = 'completed', processed_at = NOW(3), processing_token = NULL, last_error = NULL
      WHERE id = ? AND status = 'processing' AND processing_token = ? AND effect_applied = 1`,
    [row.id, row.processing_token],
  );
  if (Number((result as any).affectedRows || 0) !== 1) throw new ReceiptProcessingError('lease_lost');
}

async function scheduleReceiptFailure(row: ReceiptRow, error: unknown): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const known = error instanceof ReceiptProcessingError ? error : null;
  const exhausted = Number(row.attempt_count) >= MAX_ATTEMPTS;
  const manualReview = Boolean(known?.manualReview || exhausted);
  const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, Number(row.attempt_count) - 1)));
  const code = manualReview && exhausted ? 'retry_exhausted' : known?.code || 'processing_failed';
  await pool.execute(
    `UPDATE salla_webhook_receipts
        SET status = ?, available_at = DATE_ADD(NOW(3), INTERVAL ? SECOND),
            processing_token = NULL, last_error = ?
      WHERE id = ? AND status = 'processing' AND processing_token = ?`,
    [manualReview ? 'manual_review' : 'failed', delaySeconds, code.slice(0, 100), row.id, row.processing_token],
  );
}

export async function runSallaWebhookReceiptBatch(limit = 20): Promise<number> {
  if (workerRunning) return 0;
  workerRunning = true;
  try {
    await ensureSallaReceiptSchema();
    await recoverStaleLeases();
    const rows = await claimReceipts(limit);
    for (const row of rows) {
      try {
        await applyReceiptEffect(row);
        await completeReceipt(row);
      } catch (error) {
        await scheduleReceiptFailure(row, error);
      }
    }
    return rows.length;
  } finally {
    workerRunning = false;
  }
}

export function startSallaWebhookReceiptWorker(intervalMs = 30_000): void {
  if (workerTimer) return;
  const tick = () => runSallaWebhookReceiptBatch().catch(() => {
    console.error('[Salla Webhook] receipt worker unavailable');
  });
  void tick();
  workerTimer = setInterval(tick, Math.max(intervalMs, 10_000));
  workerTimer.unref?.();
}
