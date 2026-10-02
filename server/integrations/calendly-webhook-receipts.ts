import {prepareCalendlyNotification} from './calendly-notification';
import {parseCalendlyCanonicalPair} from './calendly-canonical';
import {calendlyStamp} from './calendly-workspace';
import {assertCalendlyWorkerConnection,assertCalendlyReceiptLease,CalendlyWorkerAuthorityError} from './calendly-worker-authority';
import {calendlyOperationTransaction} from './calendly-operation';
import {withCalendlyProviderCheckpoint} from './calendly-provider-checkpoint';
import crypto from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getIntegrationByType, getPool } from '../db';
import type { PlatformIntegration } from '../../drizzle/schema';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { sendMerchantWhatsApp, WhatsAppDeliveryStateError } from '../channels/whatsapp/service';
import {
  CalendlyApiError,
  getCalendlyInvitee,
  getCalendlyScheduledEvent,
  type CalendlyInvitee,
  type CalendlyScheduledEvent,
} from './calendly-api';
import {
  calendlyEventKey,
  type CalendlyWebhookEventType,
  type ParsedCalendlyWebhook,
} from '../webhooks/calendly-security';

const MAX_ATTEMPTS = 8;
const STALE_LEASE_MINUTES = 10;
let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

type ReceiptRow = RowDataPacket & {
  id: number;
  merchant_id: number;
  integration_id: number;
  event_key: string;
  event_type: CalendlyWebhookEventType;
  event_uri: string;
  invitee_uri: string;
  signature_timestamp: number;
  attempt_count: number;
  effect_applied: number;
  notification_required: number;
  processing_token: string;
};

type AppointmentRow = RowDataPacket & {
  id: number;
  customer_name: string;
  customer_phone: string | null;
  event_name: string;
  start_at: Date | string;
  status: 'active' | 'cancelled';
};

type HealthRow = RowDataPacket & {
  recent_total: number | string | null;
  recent_completed: number | string | null;
  awaiting: number | string | null;
  manual_review: number | string | null;
  oldest_pending_seconds: number | string | null;
};

class CalendlyReceiptError extends Error {
  constructor(readonly code: string, readonly manualReview = false) {
    super(code);
    this.name = 'CalendlyReceiptError';
  }
}

async function ensureCalendlySchema(): Promise<void> {
  await assertRuntimeSchema('Calendly webhook ingress', [
    {
      table: 'platform_integrations',
      columns: ['webhook_endpoint_id', 'webhook_signing_secret', 'webhook_subscription_uri'],
      uniqueIndexes: [{ name: 'platform_integrations_webhook_endpoint_unique', columns: ['webhook_endpoint_id'] }],
    },
    {
      table: 'calendly_appointments',
      columns: ['merchant_id', 'integration_id', 'event_uri', 'invitee_uri', 'provider_updated_at', 'status'],
      uniqueIndexes: [{ name: 'calendly_appointments_invitee_unique', columns: ['merchant_id', 'invitee_uri'] }],
    },
    {
      table: 'calendly_webhook_receipts',
      columns: [
        'merchant_id', 'integration_id', 'event_key', 'event_type', 'event_uri', 'invitee_uri',
        'signature_timestamp', 'status', 'attempt_count', 'effect_applied', 'notification_required',
        'processing_token', 'available_at', 'claimed_at', 'processed_at', 'last_error',
      ],
      uniqueIndexes: [{ name: 'calendly_webhook_receipts_event_unique', columns: ['merchant_id', 'event_key'] }],
    },
  ]);
}

function mysqlTimestamp(value: string | number | Date, errorCode: string): string {
  const date = new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time) || time < Date.UTC(2000, 0, 1) || time > Date.UTC(2100, 0, 1)) {
    throw new CalendlyReceiptError(errorCode, true);
  }
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function cleanText(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, max) || fallback;
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s().-]/g, '');
  const normalized = compact.startsWith('+') ? compact : `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function locationText(event: CalendlyScheduledEvent): string | null {
  const value = event.location?.location;
  return typeof value === 'string' ? cleanText(value, 500) || null : null;
}

function parseSettings(value: string | null): { syncToWhatsApp: boolean } {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return { syncToWhatsApp: parsed?.syncToWhatsApp === true };
  } catch {
    return { syncToWhatsApp: false };
  }
}

function assertCanonicalResources(row: ReceiptRow, event: CalendlyScheduledEvent, invitee: CalendlyInvitee): void {
  if (event.uri !== row.event_uri || invitee.uri !== row.invitee_uri) {
    throw new CalendlyReceiptError('provider_identity_mismatch', true);
  }
  if (!invitee.uri.startsWith(`${event.uri}/invitees/`)) {
    throw new CalendlyReceiptError('provider_parent_mismatch', true);
  }
}

async function fetchCanonicalResources(row: ReceiptRow, accessToken: string): Promise<{
  event: CalendlyScheduledEvent;
  invitee: CalendlyInvitee;
}> {
  const [event, invitee] = await Promise.all([
    getCalendlyScheduledEvent(accessToken, row.event_uri),
    getCalendlyInvitee(accessToken, row.invitee_uri),
  ]);
  assertCanonicalResources(row, event, invitee);
  return { event, invitee };
}

export async function applyCanonicalAppointment(
  row: ReceiptRow,
  integration: PlatformIntegration,
  event: CalendlyScheduledEvent,
  invitee: CalendlyInvitee,
): Promise<void> {
  if(row.merchant_id!==integration.merchantId||row.integration_id!==integration.id)throw new CalendlyReceiptError('connection_inactive',true);
  const pool = await getPool();
  if (!pool) throw new CalendlyReceiptError('database_unavailable');
  try{parseCalendlyCanonicalPair(event,invitee,integration.storeUrl??'');assertCanonicalResources(row,event,invitee);}catch{throw new CalendlyReceiptError('invalid_canonical_appointment',true);}
  const startAt = mysqlTimestamp(event.start_time, 'invalid_event_start');
  const endAt = mysqlTimestamp(event.end_time, 'invalid_event_end');
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw new CalendlyReceiptError('invalid_event_range', true);
  }
  const providerUpdatedAt = mysqlTimestamp(
    Math.max(Date.parse(invitee.updated_at!),Date.parse(event.updated_at!)),
    'invalid_provider_timestamp',
  );
  const status = invitee.status === 'canceled' || event.status === 'canceled'
    ? 'cancelled'
    : 'active';
  const phone = normalizePhone(invitee.text_reminder_number);
  let notify = row.event_type === 'invitee.created'
    && status === 'active'
    && parseSettings(integration.settings).syncToWhatsApp
    && Boolean(phone);
  const connection = await pool.getConnection();
  let inTransaction = false;
  let committing = false;
  let reusable = true;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const current=await assertCalendlyWorkerConnection(connection,integration);await assertCalendlyReceiptLease(connection,row);
    const [previous]=await connection.execute<RowDataPacket[]>('SELECT provider_updated_at FROM calendly_appointments WHERE merchant_id=? AND invitee_uri=? FOR UPDATE',[row.merchant_id,row.invitee_uri]);
    const previousTime=previous[0]?.provider_updated_at;
    notify=notify&&current.syncToWhatsApp&&(!previousTime||Date.parse(calendlyStamp(previousTime)??'')<=Date.parse(calendlyStamp(providerUpdatedAt)??''));
    await connection.execute(
      `INSERT INTO calendly_appointments
         (merchant_id, integration_id, event_uri, invitee_uri, event_name,
          customer_name, customer_email, customer_phone, start_at, end_at,
          status, location, provider_updated_at, cancelled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         integration_id = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(integration_id), integration_id),
         event_uri = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(event_uri), event_uri),
         event_name = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(event_name), event_name),
         customer_name = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(customer_name), customer_name),
         customer_email = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(customer_email), customer_email),
         customer_phone = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(customer_phone), customer_phone),
         start_at = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(start_at), start_at),
         end_at = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(end_at), end_at),
         status = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(status), status),
         location = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(location), location),
         cancelled_at = IF(VALUES(provider_updated_at) >= provider_updated_at, VALUES(cancelled_at), cancelled_at),
         provider_updated_at = GREATEST(provider_updated_at, VALUES(provider_updated_at))`,
      [
        row.merchant_id,
        integration.id,
        event.uri,
        invitee.uri,
        cleanText(event.name, 255, 'Calendly'),
        cleanText(invitee.name, 255, 'Calendly invitee'),
        normalizeEmail(invitee.email),
        phone,
        startAt,
        endAt,
        status,
        locationText(event),
        providerUpdatedAt,
        status === 'cancelled' && ((invitee.cancellation as any)?.created_at||invitee.cancellation?.canceled_at)
          ? mysqlTimestamp((invitee.cancellation as any)?.created_at||invitee.cancellation!.canceled_at!, 'invalid_cancellation_time') : null,
      ],
    );
    const [receiptUpdate] = await connection.execute(
      `UPDATE calendly_webhook_receipts
          SET effect_applied = 1, notification_required = ?
        WHERE id = ? AND status = 'processing' AND processing_token = ?`,
      [notify ? 1 : 0, row.id, row.processing_token],
    );
    if (Number((receiptUpdate as any).affectedRows || 0) !== 1) throw new CalendlyReceiptError('lease_lost');
    committing = true;
    await connection.commit();
    inTransaction = false;
    row.effect_applied = 1;
    row.notification_required = notify ? 1 : 0;
  } catch (error) {
    if(committing)reusable=false;
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
}

export async function deliverCalendlyNotification(row: ReceiptRow): Promise<void> {
 if(!row.notification_required)return;
 try{
  const input=await prepareCalendlyNotification(row.merchant_id,row.id,row.processing_token);if(!input)return;
  const result=await sendMerchantWhatsApp(input);
  if(!result.accepted||!result.providerMessageId)throw new CalendlyReceiptError('notification_outcome_unconfirmed',true);
 }catch(error){if(error instanceof CalendlyReceiptError)throw error;if(error instanceof WhatsAppDeliveryStateError)throw new CalendlyReceiptError('ambiguous_notification_delivery',true);throw new CalendlyReceiptError('notification_authority_unavailable',true);}
}

export async function enqueueCalendlyWebhookReceipt(input: {
  merchantId: number;
  integrationId: number;
  expectedEndpointId:string;
  expectedSigningSecret:string;
  signatureTimestamp: number;
  payload: ParsedCalendlyWebhook;
}): Promise<{ accepted: true; duplicate: boolean }> {
  await ensureCalendlySchema();
  const pool = await getPool();
  if (!pool) throw new CalendlyReceiptError('database_unavailable');
  const eventKey = calendlyEventKey(input.payload);
  return calendlyOperationTransaction(async tx=>{
  await assertCalendlyWorkerConnection(tx,{id:input.integrationId,merchantId:input.merchantId,webhookEndpointId:input.expectedEndpointId,webhookSigningSecret:input.expectedSigningSecret});
  const [existing]=await tx.execute<RowDataPacket[]>('SELECT id FROM calendly_webhook_receipts WHERE merchant_id=? AND event_key=? FOR UPDATE',[input.merchantId,eventKey]);
  if(existing.length)return {accepted:true as const,duplicate:true};
  const [result] = await tx.execute(
    `INSERT INTO calendly_webhook_receipts
       (merchant_id, integration_id, event_key, event_type, event_uri, invitee_uri,
        signature_timestamp, status, attempt_count, available_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, NOW(3))`,
    [
      input.merchantId,
      input.integrationId,
      eventKey,
      input.payload.event,
      input.payload.eventUri,
      input.payload.inviteeUri,
      input.signatureTimestamp,
    ],
  );
  if(Number((result as any).affectedRows)!==1)throw new CalendlyReceiptError('receipt_save_unavailable');
  return { accepted: true as const, duplicate:false };
  });
}

async function recoverStaleLeases(): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new CalendlyReceiptError('database_unavailable');
  await pool.execute(
    `UPDATE calendly_webhook_receipts
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
  if (!pool) throw new CalendlyReceiptError('database_unavailable');
  const connection = await pool.getConnection();
  const processingToken = crypto.randomUUID().replace(/-/g, '');
  let inTransaction = false;
  let reusable = true;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const [candidates] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM calendly_webhook_receipts
        WHERE status IN ('pending', 'failed') AND available_at <= NOW(3) AND attempt_count < ?
        ORDER BY id ASC LIMIT ? FOR UPDATE SKIP LOCKED`,
      [MAX_ATTEMPTS, Math.max(1, Math.min(limit, 50))],
    );
    const ids = candidates.map(row => Number(row.id)).filter(Number.isSafeInteger);
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      await connection.execute(
        `UPDATE calendly_webhook_receipts
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
    `SELECT id, merchant_id, integration_id, event_key, event_type, event_uri, invitee_uri,
            signature_timestamp, attempt_count, effect_applied, notification_required, processing_token
       FROM calendly_webhook_receipts
      WHERE processing_token = ? AND status = 'processing' ORDER BY id ASC`,
    [processingToken],
  );
  return rows;
}

export async function processCalendlyReceipt(row: ReceiptRow): Promise<void> {
  const integration = await getIntegrationByType(Number(row.merchant_id), 'calendly');
  if (!integration || integration.id !== Number(row.integration_id) || !integration.isActive || !integration.accessToken) {
    throw new CalendlyReceiptError('connection_inactive', true);
  }
  const check=()=>calendlyOperationTransaction(async tx=>{await assertCalendlyWorkerConnection(tx,integration);await assertCalendlyReceiptLease(tx,row);});
  await withCalendlyProviderCheckpoint(check,async()=>{
    await check();
    if (!row.effect_applied) {
      const canonical = await fetchCanonicalResources(row, integration.accessToken!);
      const memberships=(canonical.event as any).event_memberships;
      if(!Array.isArray(memberships)||!memberships.some(member=>member?.user===integration.storeUrl)||(canonical.invitee as any).event!==canonical.event.uri)throw new CalendlyReceiptError('provider_account_mismatch',true);
      await applyCanonicalAppointment(row, integration, canonical.event, canonical.invitee);
    }
    await check();await deliverCalendlyNotification(row);
  });
}

async function completeReceipt(row: ReceiptRow): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new CalendlyReceiptError('database_unavailable');
  const [result] = await pool.execute(
    `UPDATE calendly_webhook_receipts
        SET status = 'completed', processed_at = NOW(3), processing_token = NULL, last_error = NULL
      WHERE id = ? AND status = 'processing' AND processing_token = ? AND effect_applied = 1`,
    [row.id, row.processing_token],
  );
  if (Number((result as any).affectedRows || 0) !== 1) throw new CalendlyReceiptError('lease_lost');
}

async function scheduleFailure(row: ReceiptRow, error: unknown): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const apiError = error instanceof CalendlyApiError ? error : null;
  const known = error instanceof CalendlyReceiptError ? error : error instanceof CalendlyWorkerAuthorityError ? new CalendlyReceiptError('connection_changed',true) : null;
  const exhausted = Number(row.attempt_count) >= MAX_ATTEMPTS;
  const permanentProviderError = apiError && [400, 401, 403, 404].includes(apiError.status);
  const manualReview = Boolean(known?.manualReview || permanentProviderError || exhausted);
  const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, Number(row.attempt_count) - 1)));
  const code = exhausted ? 'retry_exhausted' : known?.code || apiError?.code || 'processing_failed';
  await pool.execute(
    `UPDATE calendly_webhook_receipts
        SET status = ?, available_at = DATE_ADD(NOW(3), INTERVAL ? SECOND),
            processing_token = NULL, last_error = ?
      WHERE id = ? AND status = 'processing' AND processing_token = ?`,
    [manualReview ? 'manual_review' : 'failed', delaySeconds, code.slice(0, 100), row.id, row.processing_token],
  );
}

export async function runCalendlyWebhookReceiptBatch(limit = 20): Promise<number> {
  if (workerRunning) return 0;
  workerRunning = true;
  try {
    await ensureCalendlySchema();
    await recoverStaleLeases();
    const rows = await claimReceipts(limit);
    for (const row of rows) {
      try {
        await processCalendlyReceipt(row);
        await completeReceipt(row);
      } catch (error) {
        await scheduleFailure(row, error);
      }
    }
    return rows.length;
  } finally {
    workerRunning = false;
  }
}

export function startCalendlyWebhookReceiptWorker(intervalMs = 30_000): void {
  if (workerTimer) return;
  const tick = () => runCalendlyWebhookReceiptBatch().catch(() => {
    console.error('[Calendly Webhook] receipt worker unavailable');
  });
  void tick();
  workerTimer = setInterval(tick, Math.max(intervalMs, 10_000));
  workerTimer.unref?.();
}

export async function getCalendlyWebhookHealth(merchantId: number): Promise<{
  recentTotal: number;
  recentCompleted: number;
  awaiting: number;
  manualReview: number;
  oldestPendingSeconds: number | null;
}> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new Error('Invalid merchant');
  await ensureCalendlySchema();
  const pool = await getPool();
  if (!pool) throw new CalendlyReceiptError('database_unavailable');
  const [rows] = await pool.execute<HealthRow[]>(
    `SELECT
       SUM(created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY)) AS recent_total,
       SUM(created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) AND status = 'completed') AS recent_completed,
       SUM(status IN ('pending', 'processing', 'failed')) AS awaiting,
       SUM(status = 'manual_review') AS manual_review,
       TIMESTAMPDIFF(SECOND,
         MIN(CASE WHEN status IN ('pending', 'processing', 'failed') THEN created_at END), NOW(3)) AS oldest_pending_seconds
     FROM calendly_webhook_receipts WHERE merchant_id = ?`,
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

/** Retired compatibility entry: callers must use reviewed, bounded, atomic synchronization. */
export async function syncCalendlyAppointments(_integration:PlatformIntegration):Promise<never>{throw new CalendlyReceiptError('reviewed_operation_required',true);}

export async function getCalendlyAppointmentStats(merchantId: number): Promise<{
  total: number;
  upcoming: number;
  remindersSent: number;
}> {
  await ensureCalendlySchema();
  const pool = await getPool();
  if (!pool) throw new CalendlyReceiptError('database_unavailable');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'active' AND start_at >= NOW(3)) AS upcoming,
            SUM(notification_sent_at IS NOT NULL) AS reminders_sent
       FROM calendly_appointments WHERE merchant_id = ?`,
    [merchantId],
  );
  return {
    total: Number(rows[0]?.total || 0),
    upcoming: Number(rows[0]?.upcoming || 0),
    remindersSent: Number(rows[0]?.reminders_sent || 0),
  };
}
