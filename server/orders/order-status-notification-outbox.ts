import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  sendMerchantWhatsApp,
  WhatsAppDeliveryStateError,
} from '../channels/whatsapp/service';

const MAX_ATTEMPTS = 8;
const STALE_LEASE_MINUTES = 10;

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

type OutboxRow = RowDataPacket & {
  id: number;
  merchant_id: number;
  event_key: string;
  customer_phone: string;
  message: string;
  attempts: number;
};

class RetriableOrderNotificationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RetriableOrderNotificationError';
  }
}

class OrderNotificationPostDispatchStateError extends Error {
  constructor() {
    super('Order notification provider outcome requires durable reconciliation');
    this.name = 'OrderNotificationPostDispatchStateError';
  }
}

async function ensureOutboxSchema(): Promise<void> {
  await assertRuntimeSchema('Order status notification outbox', [
    {
      table: 'order_notifications',
      columns: ['event_key', 'delivery_status', 'attempts', 'available_at', 'claimed_at'],
    },
    { table: 'whatsapp_message_deliveries', columns: ['idempotency_key', 'status', 'error_code'] },
  ]);
}

function deliveryIdempotencyKey(row: Pick<OutboxRow, 'merchant_id' | 'event_key'>): string {
  return `order-status:${row.merchant_id}:${row.event_key}`;
}

async function writeTerminalState(
  row: Pick<OutboxRow, 'id'>,
  status: 'sent' | 'manual_review' | 'suppressed',
  error: string | null,
): Promise<boolean> {
  const pool = await getPool();
  if (!pool) return false;
  const [result] = await pool.execute(
    `UPDATE order_notifications
        SET delivery_status = ?, sent = IF(? = 'sent', 1, sent),
            sent_at = IF(? = 'sent', NOW(3), sent_at), error = ?
      WHERE id = ? AND delivery_status = 'processing'`,
    [status, status, status, error, row.id],
  );
  return Number((result as { affectedRows?: number }).affectedRows || 0) === 1;
}

async function recoverStaleLeases(): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const [rows] = await pool.execute<OutboxRow[]>(
    `SELECT id, merchant_id, event_key, customer_phone, message, attempts
       FROM order_notifications
      WHERE delivery_status = 'processing' AND event_key IS NOT NULL
        AND claimed_at < DATE_SUB(NOW(3), INTERVAL ${STALE_LEASE_MINUTES} MINUTE)
      ORDER BY id ASC LIMIT 25`,
  );

  for (const row of rows) {
    const [deliveryRows] = await pool.execute<RowDataPacket[]>(
      `SELECT status, error_code FROM whatsapp_message_deliveries
        WHERE merchant_id = ? AND idempotency_key = ? LIMIT 1`,
      [row.merchant_id, deliveryIdempotencyKey(row)],
    );
    const deliveryStatus = String(deliveryRows[0]?.status || '');
    const errorCode = String(deliveryRows[0]?.error_code || '');
    if (['sent', 'delivered', 'read'].includes(deliveryStatus)) {
      await writeTerminalState(row, 'sent', null);
    } else if (deliveryStatus === 'queued' || errorCode === 'provider_unreachable') {
      await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome');
    } else {
      await pool.execute(
        `UPDATE order_notifications
            SET delivery_status = 'failed', available_at = NOW(3), error = 'recovered_safe_retry'
          WHERE id = ? AND delivery_status = 'processing'`,
        [row.id],
      );
    }
  }

  await pool.execute(
    `UPDATE order_notifications
        SET delivery_status = 'manual_review', error = 'retry_exhausted'
      WHERE delivery_status = 'failed' AND event_key IS NOT NULL AND attempts >= ${MAX_ATTEMPTS}`,
  );
}

async function claimRows(limit: number): Promise<OutboxRow[]> {
  const pool = await getPool();
  if (!pool) return [];
  await recoverStaleLeases();
  const safeLimit = Math.max(1, Math.min(limit, 25));
  const [candidates] = await pool.execute<OutboxRow[]>(
    `SELECT id, merchant_id, event_key, customer_phone, message, attempts
       FROM order_notifications
      WHERE event_key IS NOT NULL AND delivery_status IN ('pending','failed')
        AND available_at <= NOW(3) AND attempts < ${MAX_ATTEMPTS}
      ORDER BY available_at ASC, id ASC LIMIT ${safeLimit}`,
  );
  const claimed: OutboxRow[] = [];
  for (const candidate of candidates) {
    const [result] = await pool.execute(
      `UPDATE order_notifications
          SET delivery_status = 'processing', attempts = attempts + 1,
              claimed_at = NOW(3), error = NULL
        WHERE id = ? AND delivery_status IN ('pending','failed') AND available_at <= NOW(3)`,
      [candidate.id],
    );
    if (Number((result as { affectedRows?: number }).affectedRows || 0) !== 1) continue;
    const [rows] = await pool.execute<OutboxRow[]>(
      `SELECT id, merchant_id, event_key, customer_phone, message, attempts
         FROM order_notifications WHERE id = ? AND delivery_status = 'processing' LIMIT 1`,
      [candidate.id],
    );
    if (rows[0]) claimed.push(rows[0]);
  }
  return claimed;
}

async function dispatchRow(row: OutboxRow): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new RetriableOrderNotificationError('database_unavailable');
  const [merchantRows] = await pool.execute<RowDataPacket[]>(
    `SELECT m.status
       FROM order_notifications n
       INNER JOIN merchants m ON m.id = n.merchant_id
      WHERE n.id = ? AND n.merchant_id = ? AND n.delivery_status = 'processing' LIMIT 1`,
    [row.id, row.merchant_id],
  );
  if (!merchantRows[0]) throw new RetriableOrderNotificationError('notification_context_unavailable');
  if (merchantRows[0].status !== 'active') {
    if (!(await writeTerminalState(row, 'suppressed', 'merchant_inactive'))) {
      throw new RetriableOrderNotificationError('terminal_state_unavailable');
    }
    return;
  }

  try {
    const result = await sendMerchantWhatsApp({
      merchantId: Number(row.merchant_id),
      idempotencyKey: deliveryIdempotencyKey(row),
      to: row.customer_phone,
      kind: 'text',
      text: row.message,
      retryFailed: true,
    });
    if (result.accepted) {
      if (!(await writeTerminalState(row, 'sent', null))) throw new OrderNotificationPostDispatchStateError();
      return;
    }
    if (result.errorCode === 'delivery_in_progress' || result.errorCode === 'provider_unreachable') {
      if (!(await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome'))) {
        throw new OrderNotificationPostDispatchStateError();
      }
      return;
    }
    throw new RetriableOrderNotificationError(result.errorCode || 'provider_rejected');
  } catch (error) {
    if (error instanceof OrderNotificationPostDispatchStateError) throw error;
    if (error instanceof RetriableOrderNotificationError) throw error;
    if (error instanceof WhatsAppDeliveryStateError) {
      if (!(await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome'))) {
        throw new OrderNotificationPostDispatchStateError();
      }
      return;
    }
    throw new RetriableOrderNotificationError('delivery_service_unavailable');
  }
}

async function scheduleRetry(row: OutboxRow, error: unknown): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const attempts = Math.max(1, Number(row.attempts || 1));
  const exhausted = attempts >= MAX_ATTEMPTS;
  const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, attempts - 1)));
  const code = error instanceof RetriableOrderNotificationError ? error.code : 'delivery_failed';
  await pool.execute(
    `UPDATE order_notifications
        SET delivery_status = ?, available_at = DATE_ADD(NOW(3), INTERVAL ? SECOND), error = ?
      WHERE id = ? AND delivery_status = 'processing'`,
    [exhausted ? 'manual_review' : 'failed', delaySeconds, exhausted ? 'retry_exhausted' : code.slice(0, 100), row.id],
  );
}

export async function runOrderStatusNotificationBatch(limit = 10): Promise<number> {
  if (workerRunning) return 0;
  workerRunning = true;
  try {
    await ensureOutboxSchema();
    const rows = await claimRows(limit);
    for (const row of rows) {
      try {
        await dispatchRow(row);
      } catch (error) {
        if (error instanceof OrderNotificationPostDispatchStateError) continue;
        await scheduleRetry(row, error);
      }
    }
    return rows.length;
  } finally {
    workerRunning = false;
  }
}

export function startOrderStatusNotificationWorker(intervalMs = 30_000): void {
  if (workerTimer) return;
  const tick = () => runOrderStatusNotificationBatch().catch(() => {
    console.error('[Order Status Notification] batch unavailable');
  });
  void tick();
  workerTimer = setInterval(tick, Math.max(intervalMs, 10_000));
  workerTimer.unref?.();
}
