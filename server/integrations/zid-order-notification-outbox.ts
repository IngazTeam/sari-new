import crypto from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  sendMerchantWhatsApp,
  WhatsAppDeliveryStateError,
} from '../channels/whatsapp/service';
import { normalizeZidOrderExternalId, normalizeZidPhone } from './zid-commerce-normalization';
import { parseZidSettings } from './zid-settings';

const MAX_ATTEMPTS = 8;
const STALE_LEASE_MINUTES = 10;

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

type NotificationRow = RowDataPacket & {
  id: number;
  merchant_id: number;
  zid_order_id: string;
  event_key: string;
  attempts: number;
};

type NotificationContext = RowDataPacket & {
  merchantStatus: string;
  merchantPhone: string | null;
  orderNumber: string | null;
  totalAmount: string | number | null;
  currency: string | null;
  integrationActive: number | null;
  integrationSettings: string | null;
};

type NotificationHealthRow = RowDataPacket & {
  total: number | string | null;
  delivered: number | string | null;
  awaiting: number | string | null;
  suppressed: number | string | null;
  needsReview: number | string | null;
};

class RetriableNotificationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RetriableNotificationError';
  }
}

async function ensureOutboxSchema(): Promise<void> {
  await assertRuntimeSchema('Zid order notification outbox', [
    {
      table: 'zid_order_notification_outbox',
      columns: ['merchant_id', 'zid_order_id', 'event_key', 'status', 'attempts', 'available_at', 'claimed_at'],
    },
    { table: 'whatsapp_message_deliveries', columns: ['idempotency_key', 'status'] },
  ]);
}

export function createZidOrderNotificationEventKey(merchantId: number, externalOrderId: unknown): string {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error('Invalid merchant');
  const orderId = normalizeZidOrderExternalId(externalOrderId);
  return crypto
    .createHash('sha256')
    .update(`zid-order-created:v1\0${merchantId}\0${orderId}`, 'utf8')
    .digest('hex');
}

function deliveryIdempotencyKey(merchantId: number, eventKey: string): string {
  return `zid-order:${merchantId}:${eventKey}`;
}

export async function enqueueZidOrderCreatedNotification(input: {
  merchantId: number;
  externalOrderId: unknown;
}): Promise<string> {
  await ensureOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const orderId = normalizeZidOrderExternalId(input.externalOrderId);
  const eventKey = createZidOrderNotificationEventKey(input.merchantId, orderId);
  await pool.execute(
    `INSERT INTO zid_order_notification_outbox
       (merchant_id, zid_order_id, event_key, status, attempts, available_at)
     VALUES (?, ?, ?, 'pending', 0, NOW(3))
     ON DUPLICATE KEY UPDATE event_key = VALUES(event_key)`,
    [input.merchantId, orderId, eventKey],
  );
  return eventKey;
}

export async function getZidOrderNotificationHealth(merchantId: number): Promise<{
  total: number;
  delivered: number;
  awaiting: number;
  suppressed: number;
  needsReview: number;
}> {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error('Invalid merchant');
  await ensureOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [rows] = await pool.execute<NotificationHealthRow[]>(
    `SELECT
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS total,
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) AND status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) AND status IN ('pending', 'processing', 'failed') THEN 1 ELSE 0 END) AS awaiting,
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) AND status = 'suppressed' THEN 1 ELSE 0 END) AS suppressed,
       SUM(CASE WHEN status = 'manual_review' THEN 1 ELSE 0 END) AS needsReview
     FROM zid_order_notification_outbox
     WHERE merchant_id = ? AND (created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) OR status = 'manual_review')`,
    [merchantId],
  );
  const health = rows[0];
  return {
    total: Number(health?.total || 0),
    delivered: Number(health?.delivered || 0),
    awaiting: Number(health?.awaiting || 0),
    suppressed: Number(health?.suppressed || 0),
    needsReview: Number(health?.needsReview || 0),
  };
}

export async function acknowledgeZidOrderNotificationIncidents(
  merchantId: number,
): Promise<{ acknowledged: number }> {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error('Invalid merchant');
  await ensureOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [result] = await pool.execute(
    `UPDATE zid_order_notification_outbox
        SET status = 'suppressed', last_error = 'merchant_acknowledged', updated_at = NOW(3)
      WHERE merchant_id = ? AND status = 'manual_review'`,
    [merchantId],
  );
  return { acknowledged: Number((result as any)?.affectedRows || 0) };
}

async function setTerminalStatus(
  id: number,
  status: 'delivered' | 'suppressed' | 'manual_review',
  reason: string | null,
): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  await pool.execute(
    `UPDATE zid_order_notification_outbox
        SET status = ?, last_error = ?, delivered_at = IF(? = 'delivered', NOW(3), delivered_at)
      WHERE id = ? AND status = 'processing'`,
    [status, reason, status, id],
  );
}

async function recoverStaleLeases(): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const [rows] = await pool.execute<NotificationRow[]>(
    `SELECT id, merchant_id, zid_order_id, event_key, attempts
       FROM zid_order_notification_outbox
      WHERE status = 'processing'
        AND claimed_at < DATE_SUB(NOW(3), INTERVAL ${STALE_LEASE_MINUTES} MINUTE)
      ORDER BY id ASC LIMIT 25`,
  );
  for (const row of rows) {
    const idempotencyKey = deliveryIdempotencyKey(Number(row.merchant_id), String(row.event_key));
    const [deliveryRows] = await pool.execute<RowDataPacket[]>(
      `SELECT status FROM whatsapp_message_deliveries
        WHERE merchant_id = ? AND idempotency_key = ? LIMIT 1`,
      [row.merchant_id, idempotencyKey],
    );
    const deliveryStatus = deliveryRows[0]?.status;
    if (['sent', 'delivered', 'read'].includes(String(deliveryStatus))) {
      await pool.execute(
        `UPDATE zid_order_notification_outbox
            SET status = 'delivered', delivered_at = NOW(3), last_error = NULL
          WHERE id = ? AND status = 'processing'`,
        [row.id],
      );
    } else if (deliveryStatus === 'queued') {
      await pool.execute(
        `UPDATE zid_order_notification_outbox
            SET status = 'manual_review', last_error = 'ambiguous_provider_outcome'
          WHERE id = ? AND status = 'processing'`,
        [row.id],
      );
    } else {
      await pool.execute(
        `UPDATE zid_order_notification_outbox
            SET status = 'failed', available_at = NOW(3), last_error = 'recovered_safe_retry'
          WHERE id = ? AND status = 'processing'`,
        [row.id],
      );
    }
  }
  await pool.execute(
    `UPDATE zid_order_notification_outbox
        SET status = 'manual_review', last_error = 'retry_exhausted'
      WHERE status = 'failed' AND attempts >= ${MAX_ATTEMPTS}`,
  );
}

async function claimOutboxRows(limit: number): Promise<NotificationRow[]> {
  const pool = await getPool();
  if (!pool) return [];
  await recoverStaleLeases();
  const safeLimit = Math.max(1, Math.min(limit, 25));
  const [candidates] = await pool.execute<NotificationRow[]>(
    `SELECT id, merchant_id, zid_order_id, event_key, attempts
       FROM zid_order_notification_outbox
      WHERE status IN ('pending', 'failed') AND available_at <= NOW(3) AND attempts < ${MAX_ATTEMPTS}
      ORDER BY available_at ASC, id ASC LIMIT ${safeLimit}`,
  );
  const claimed: NotificationRow[] = [];
  for (const candidate of candidates) {
    const [result] = await pool.execute(
      `UPDATE zid_order_notification_outbox
          SET status = 'processing', attempts = attempts + 1, claimed_at = NOW(3), last_error = NULL
        WHERE id = ? AND status IN ('pending', 'failed') AND available_at <= NOW(3)`,
      [candidate.id],
    );
    if (Number((result as any)?.affectedRows || 0) !== 1) continue;
    const [rows] = await pool.execute<NotificationRow[]>(
      `SELECT id, merchant_id, zid_order_id, event_key, attempts
         FROM zid_order_notification_outbox WHERE id = ? LIMIT 1`,
      [candidate.id],
    );
    if (rows[0]) claimed.push(rows[0]);
  }
  return claimed;
}

function safeOrderNumber(value: unknown): string {
  const normalized = String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 80);
  return normalized || 'غير متاح';
}

function buildMerchantOrderMessage(context: NotificationContext): string {
  const amount = Number(context.totalAmount);
  const formattedAmount = Number.isFinite(amount) && amount >= 0
    ? amount.toFixed(2)
    : 'غير متاح';
  const currency = /^[A-Z]{3}$/.test(String(context.currency || ''))
    ? String(context.currency)
    : 'SAR';
  return [
    'طلب جديد من زد 🛒',
    `رقم الطلب: ${safeOrderNumber(context.orderNumber)}`,
    `الإجمالي: ${formattedAmount} ${currency}`,
    'راجع لوحة ساري للاطلاع على التفاصيل.',
  ].join('\n');
}

async function dispatchOutboxRow(row: NotificationRow): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new RetriableNotificationError('database_unavailable');
  const [rows] = await pool.execute<NotificationContext[]>(
    `SELECT m.status AS merchantStatus, m.phone AS merchantPhone,
            zo.zid_order_number AS orderNumber, zo.total_amount AS totalAmount, zo.currency,
            pi.is_active AS integrationActive, pi.settings AS integrationSettings
       FROM zid_order_notification_outbox outbox
       INNER JOIN merchants m ON m.id = outbox.merchant_id
       LEFT JOIN zid_orders zo
         ON zo.merchant_id = outbox.merchant_id AND zo.zid_order_id = outbox.zid_order_id
       LEFT JOIN platform_integrations pi
         ON pi.merchant_id = outbox.merchant_id AND pi.platform_type = 'zid'
      WHERE outbox.id = ? AND outbox.status = 'processing' LIMIT 1`,
    [row.id],
  );
  const context = rows[0];
  if (!context) throw new RetriableNotificationError('notification_context_unavailable');
  const settings = parseZidSettings(context.integrationSettings);
  if (
    context.merchantStatus !== 'active'
    || context.integrationActive !== 1
    || !settings.valid
    || !settings.autoSync
    || !settings.syncOrders
    || !settings.notifyMerchantOrders
  ) {
    await setTerminalStatus(row.id, 'suppressed', 'merchant_opt_out_or_inactive');
    return;
  }
  if (context.totalAmount === null) throw new RetriableNotificationError('order_unavailable');
  const recipient = normalizeZidPhone(context.merchantPhone);
  if (!recipient) throw new RetriableNotificationError('merchant_phone_unavailable');

  try {
    const result = await sendMerchantWhatsApp({
      merchantId: Number(row.merchant_id),
      idempotencyKey: deliveryIdempotencyKey(Number(row.merchant_id), String(row.event_key)),
      to: recipient,
      kind: 'text',
      text: buildMerchantOrderMessage(context),
      retryFailed: true,
    });
    if (result.accepted) {
      await setTerminalStatus(row.id, 'delivered', null);
      return;
    }
    if (result.errorCode === 'delivery_in_progress' || result.errorCode === 'provider_unreachable') {
      await setTerminalStatus(row.id, 'manual_review', 'ambiguous_provider_outcome');
      return;
    }
    throw new RetriableNotificationError(result.errorCode || 'provider_rejected');
  } catch (error) {
    if (error instanceof RetriableNotificationError) throw error;
    if (error instanceof WhatsAppDeliveryStateError) {
      await setTerminalStatus(row.id, 'manual_review', 'ambiguous_provider_outcome');
      return;
    }
    throw new RetriableNotificationError('delivery_service_unavailable');
  }
}

async function scheduleRetry(row: NotificationRow, error: unknown): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const attempts = Math.max(1, Number(row.attempts || 1));
  const exhausted = attempts >= MAX_ATTEMPTS;
  const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, attempts - 1)));
  const errorCode = error instanceof RetriableNotificationError ? error.code : 'delivery_failed';
  await pool.execute(
    `UPDATE zid_order_notification_outbox
        SET status = ?, available_at = DATE_ADD(NOW(3), INTERVAL ? SECOND), last_error = ?
      WHERE id = ? AND status = 'processing'`,
    [exhausted ? 'manual_review' : 'failed', delaySeconds, exhausted ? 'retry_exhausted' : errorCode.slice(0, 100), row.id],
  );
}

export async function runZidOrderNotificationBatch(limit = 10): Promise<number> {
  if (workerRunning) return 0;
  workerRunning = true;
  try {
    await ensureOutboxSchema();
    const rows = await claimOutboxRows(limit);
    for (const row of rows) {
      try {
        await dispatchOutboxRow(row);
      } catch (error) {
        await scheduleRetry(row, error);
      }
    }
    return rows.length;
  } finally {
    workerRunning = false;
  }
}

export function startZidOrderNotificationWorker(intervalMs = 30_000): void {
  if (workerTimer) return;
  const tick = () => runZidOrderNotificationBatch().catch(() => {
    console.error('[Zid Order Notification] batch unavailable');
  });
  void tick();
  workerTimer = setInterval(tick, Math.max(intervalMs, 10_000));
  workerTimer.unref?.();
}
