import crypto from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  sendMerchantWhatsApp,
  WhatsAppDeliveryStateError,
} from '../channels/whatsapp/service';
import {
  hasActiveCampaignConsent,
  isQuietHours,
  normalizeCampaignPhone,
  withCampaignOptOutNotice,
} from './campaign-guard';

const MAX_ATTEMPTS = 8;
const STALE_LEASE_MINUTES = 5;
const PROVIDER_WINDOW_LIMIT = 10;
const PROVIDER_WINDOW_MICROSECONDS = 1_000_000;
const MAX_RECIPIENTS = 2_000;

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

const campaignAudienceSchema = z.object({
  lastActivityDays: z.number().int().min(1).max(3650).optional(),
  purchaseCountMin: z.number().int().min(0).max(1_000_000).optional(),
  purchaseCountMax: z.number().int().min(0).max(1_000_000).optional(),
}).strict().refine(
  value => value.purchaseCountMin === undefined
    || value.purchaseCountMax === undefined
    || value.purchaseCountMin <= value.purchaseCountMax,
  { message: 'Invalid purchase count range' },
);

type AudienceCustomer = {
  id?: number | null;
  customerPhone: string;
  lastActivityAt?: string | Date | null;
  purchaseCount: number;
};

type CampaignDeliveryRow = RowDataPacket & {
  id: number;
  campaign_id: number;
  merchant_id: number;
  customer_id: number | null;
  customer_phone: string;
  attempts: number;
  processing_token: string;
  quota_subscription_id: number | null;
  quota_reserved: number;
};

type CampaignContext = RowDataPacket & CampaignDeliveryRow & {
  campaignStatus: string;
  message: string;
  imageUrl: string | null;
  merchantStatus: string;
  timezone: string | null;
};

type CampaignState = RowDataPacket & {
  total: number | string;
  sent: number | string;
  active: number | string;
  suppressed: number | string;
  manualReview: number | string;
};

type DeliveryLedgerRow = RowDataPacket & {
  status: string;
  error_code: string | null;
};

type CampaignAcceptanceTimelineRow = RowDataPacket & {
  day: string;
  accepted: number | string;
};

type CampaignManualReviewSummaryRow = RowDataPacket & {
  campaignId: number;
  campaignName: string;
  needsReview: number | string;
};

export class CampaignDispatchConflictError extends Error {
  constructor() {
    super('Campaign is already claimed or cannot be sent from its current state');
    this.name = 'CampaignDispatchConflictError';
  }
}

export class CampaignTargetingError extends Error {
  constructor() {
    super('Campaign targeting definition is invalid');
    this.name = 'CampaignTargetingError';
  }
}

class RetriableCampaignDeliveryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RetriableCampaignDeliveryError';
  }
}

// Once the channel service has been invoked, a persistence failure must not
// convert the row back into an automatically retriable state. The stable
// channel idempotency key and stale-lease reconciliation decide the outcome.
class CampaignPostDispatchStateError extends Error {
  constructor() {
    super('campaign_post_dispatch_state_unknown');
    this.name = 'CampaignPostDispatchStateError';
  }
}

async function ensureCampaignOutboxSchema(): Promise<void> {
  await assertRuntimeSchema('campaign delivery outbox', [
    {
      table: 'campaign_delivery_outbox',
      columns: [
        'campaign_id', 'merchant_id', 'customer_phone', 'status', 'processing_token',
        'quota_subscription_id', 'quota_reserved', 'available_at', 'claimed_at',
      ],
    },
    { table: 'campaign_dispatch_rate_limits', columns: ['merchant_id', 'window_started_at', 'reserved_count'] },
    { table: 'whatsapp_message_deliveries', columns: ['idempotency_key', 'provider_message_id', 'status'] },
  ]);
}

function parseCampaignAudience(value: string | null | undefined): z.infer<typeof campaignAudienceSchema> {
  if (!value) return {};
  if (value.length > 1_000) throw new CampaignTargetingError();
  try {
    return campaignAudienceSchema.parse(JSON.parse(value));
  } catch {
    throw new CampaignTargetingError();
  }
}

export function isValidCampaignTargetAudience(value: string): boolean {
  try {
    parseCampaignAudience(value);
    return true;
  } catch {
    return false;
  }
}

export function filterCampaignAudience<T extends AudienceCustomer>(
  customers: T[],
  targetAudience: string | null | undefined,
): T[] {
  const filters = parseCampaignAudience(targetAudience);
  const cutoff = filters.lastActivityDays === undefined
    ? null
    : Date.now() - (filters.lastActivityDays * 24 * 60 * 60 * 1_000);
  return customers.filter(customer => {
    if (cutoff !== null) {
      const activity = customer.lastActivityAt ? new Date(customer.lastActivityAt).getTime() : Number.NaN;
      if (!Number.isFinite(activity) || activity < cutoff) return false;
    }
    if (filters.purchaseCountMin !== undefined && customer.purchaseCount < filters.purchaseCountMin) return false;
    if (filters.purchaseCountMax !== undefined && customer.purchaseCount > filters.purchaseCountMax) return false;
    return true;
  });
}

function normalizeRecipients(recipients: Array<{ customerId?: number | null; phone: string }>) {
  const normalized = new Map<string, number | null>();
  for (const recipient of recipients) {
    const phone = normalizeCampaignPhone(recipient.phone);
    if (!phone || normalized.has(phone)) continue;
    const customerId = Number(recipient.customerId);
    normalized.set(phone, Number.isSafeInteger(customerId) && customerId > 0 ? customerId : null);
  }
  if (normalized.size === 0 || normalized.size > MAX_RECIPIENTS) {
    throw new CampaignDispatchConflictError();
  }
  return Array.from(normalized, ([phone, customerId]) => ({ phone, customerId }));
}

export async function enqueueCampaignDeliveries(input: {
  campaignId: number;
  merchantId: number;
  recipients: Array<{ customerId?: number | null; phone: string }>;
}): Promise<{ queued: number }> {
  if (!Number.isSafeInteger(input.campaignId) || input.campaignId <= 0) throw new CampaignDispatchConflictError();
  if (!Number.isSafeInteger(input.merchantId) || input.merchantId <= 0) throw new CampaignDispatchConflictError();
  const recipients = normalizeRecipients(input.recipients);
  await ensureCampaignOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [campaignRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, status FROM campaigns
        WHERE id = ? AND merchantId = ? LIMIT 1 FOR UPDATE`,
      [input.campaignId, input.merchantId],
    );
    const campaign = campaignRows[0];
    if (!campaign || !['draft', 'scheduled'].includes(String(campaign.status))) {
      throw new CampaignDispatchConflictError();
    }
    for (const recipient of recipients) {
      await connection.execute(
        `INSERT INTO campaign_delivery_outbox
          (campaign_id, merchant_id, customer_id, customer_phone, status, attempts, available_at)
         VALUES (?, ?, ?, ?, 'pending', 0, NOW(3))`,
        [input.campaignId, input.merchantId, recipient.customerId, recipient.phone],
      );
    }
    const [claimed] = await connection.execute(
      `UPDATE campaigns
          SET status = 'sending', totalRecipients = ?, sentCount = 0, updatedAt = NOW()
        WHERE id = ? AND merchantId = ? AND status IN ('draft', 'scheduled')`,
      [recipients.length, input.campaignId, input.merchantId],
    );
    if (Number((claimed as { affectedRows?: number }).affectedRows || 0) !== 1) {
      throw new CampaignDispatchConflictError();
    }
    await connection.commit();
    return { queued: recipients.length };
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    connection.release();
  }
}

export async function completeCampaignWithoutRecipients(campaignId: number, merchantId: number): Promise<boolean> {
  await ensureCampaignOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [result] = await pool.execute(
    `UPDATE campaigns
        SET status = 'completed', totalRecipients = 0, sentCount = 0, updatedAt = NOW()
      WHERE id = ? AND merchantId = ? AND status IN ('draft', 'scheduled')`,
    [campaignId, merchantId],
  );
  return Number((result as { affectedRows?: number }).affectedRows || 0) === 1;
}

function deliveryIdempotencyKey(row: Pick<CampaignDeliveryRow, 'campaign_id' | 'id'>): string {
  return `campaign:${row.campaign_id}:${row.id}`;
}

async function readDeliveryLedger(row: CampaignDeliveryRow): Promise<DeliveryLedgerRow | undefined> {
  const pool = await getPool();
  if (!pool) throw new RetriableCampaignDeliveryError('database_unavailable');
  const [rows] = await pool.execute<DeliveryLedgerRow[]>(
    `SELECT status, error_code FROM whatsapp_message_deliveries
      WHERE merchant_id = ? AND idempotency_key = ? LIMIT 1`,
    [row.merchant_id, deliveryIdempotencyKey(row)],
  );
  return rows[0];
}

async function reconcileCampaignState(campaignId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const [rows] = await pool.execute<CampaignState[]>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'sent') AS sent,
            SUM(status IN ('pending','processing','failed')) AS active,
            SUM(status = 'suppressed') AS suppressed,
            SUM(status = 'manual_review') AS manualReview
       FROM campaign_delivery_outbox WHERE campaign_id = ?`,
    [campaignId],
  );
  const state = rows[0];
  const total = Number(state?.total || 0);
  if (total === 0) return;
  const sent = Number(state?.sent || 0);
  const active = Number(state?.active || 0);
  const manualReview = Number(state?.manualReview || 0);
  const status = active > 0 ? 'sending' : manualReview > 0 ? 'failed' : 'completed';
  await pool.execute(
    `UPDATE campaigns SET sentCount = ?, totalRecipients = ?, status = ?, updatedAt = NOW()
      WHERE id = ? AND status IN ('sending', 'failed')`,
    [sent, total, status, campaignId],
  );
}

async function reconcileActiveCampaigns(): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT o.campaign_id AS campaignId
       FROM campaign_delivery_outbox o
       INNER JOIN campaigns c ON c.id = o.campaign_id
      WHERE c.status IN ('sending','failed')
      ORDER BY o.campaign_id ASC LIMIT 100`,
  );
  for (const row of rows) await reconcileCampaignState(Number(row.campaignId));
}

async function writeTerminalState(
  row: CampaignDeliveryRow,
  status: 'sent' | 'suppressed' | 'manual_review',
  reason: string | null,
): Promise<boolean> {
  const pool = await getPool();
  if (!pool) return false;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [updated] = await connection.execute(
      `UPDATE campaign_delivery_outbox
          SET status = ?, processing_token = NULL, claimed_at = NULL,
              sent_at = IF(? = 'sent', NOW(3), sent_at), last_error = ?
        WHERE id = ? AND status = 'processing' AND processing_token = ?`,
      [status, status, reason, row.id, row.processing_token],
    );
    if (Number((updated as { affectedRows?: number }).affectedRows || 0) !== 1) {
      await connection.rollback();
      return false;
    }
    const logStatus = status === 'sent' ? 'success' : 'failed';
    await connection.execute(
      `INSERT INTO campaignLogs
        (campaignId, campaign_outbox_id, customerId, customerPhone, customerName, status, errorMessage, sentAt, createdAt)
       VALUES (?, ?, ?, ?, NULL, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE status = VALUES(status), errorMessage = VALUES(errorMessage), sentAt = VALUES(sentAt)`,
      [row.campaign_id, row.id, row.customer_id, row.customer_phone, logStatus, reason],
    );
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original */ }
    throw error;
  } finally {
    connection.release();
  }
  await reconcileCampaignState(row.campaign_id);
  return true;
}

async function releaseQuotaReservation(row: CampaignDeliveryRow): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT quota_subscription_id AS subscriptionId, quota_reserved AS reserved
         FROM campaign_delivery_outbox WHERE id = ? LIMIT 1 FOR UPDATE`,
      [row.id],
    );
    const reservation = rows[0];
    if (Number(reservation?.reserved || 0) === 1 && Number(reservation?.subscriptionId || 0) > 0) {
      await connection.execute(
        `UPDATE merchant_subscriptions SET messages_used = GREATEST(messages_used - 1, 0)
          WHERE id = ?`,
        [reservation.subscriptionId],
      );
      await connection.execute(
        `UPDATE campaign_delivery_outbox
            SET quota_reserved = 0, quota_subscription_id = NULL
          WHERE id = ? AND quota_reserved = 1`,
        [row.id],
      );
    }
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function reserveDispatchCapacity(
  row: CampaignDeliveryRow,
): Promise<{ accepted: true } | { accepted: false; reason: 'inactive_subscription' | 'message_limit' | 'provider_rate' }> {
  const pool = await getPool();
  if (!pool) throw new RetriableCampaignDeliveryError('database_unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [subscriptions] = await connection.execute<RowDataPacket[]>(
      `SELECT ms.id AS subscriptionId, ms.messages_used AS messagesUsed, sp.message_limit AS messageLimit
         FROM merchant_subscriptions ms
         INNER JOIN subscription_plans sp ON sp.id = ms.plan_id AND sp.is_active = 1
        WHERE ms.merchant_id = ?
          AND ms.status IN ('trial','active')
          AND ms.end_date >= NOW()
          AND (ms.status <> 'trial' OR ms.trial_ends_at IS NULL OR ms.trial_ends_at >= NOW())
        ORDER BY ms.created_at DESC LIMIT 1 FOR UPDATE`,
      [row.merchant_id],
    );
    const subscription = subscriptions[0];
    if (!subscription) {
      await connection.rollback();
      return { accepted: false, reason: 'inactive_subscription' };
    }
    const messageLimit = Number(subscription.messageLimit);
    const messagesUsed = Number(subscription.messagesUsed || 0);
    if (messageLimit !== -1 && messagesUsed >= messageLimit) {
      await connection.rollback();
      return { accepted: false, reason: 'message_limit' };
    }
    await connection.execute(
      `INSERT INTO campaign_dispatch_rate_limits (merchant_id, window_started_at, reserved_count)
       VALUES (?, NOW(3), 0)
       ON DUPLICATE KEY UPDATE merchant_id = VALUES(merchant_id)`,
      [row.merchant_id],
    );
    const [windows] = await connection.execute<RowDataPacket[]>(
      `SELECT reserved_count AS reservedCount,
              TIMESTAMPDIFF(MICROSECOND, window_started_at, NOW(3)) AS windowAge
         FROM campaign_dispatch_rate_limits WHERE merchant_id = ? FOR UPDATE`,
      [row.merchant_id],
    );
    const window = windows[0];
    const expired = Number(window?.windowAge || 0) >= PROVIDER_WINDOW_MICROSECONDS;
    if (!expired && Number(window?.reservedCount || 0) >= PROVIDER_WINDOW_LIMIT) {
      await connection.rollback();
      return { accepted: false, reason: 'provider_rate' };
    }
    await connection.execute(
      `UPDATE campaign_dispatch_rate_limits
          SET window_started_at = IF(? = 1, NOW(3), window_started_at),
              reserved_count = IF(? = 1, 1, reserved_count + 1)
        WHERE merchant_id = ?`,
      [expired ? 1 : 0, expired ? 1 : 0, row.merchant_id],
    );
    await connection.execute(
      `UPDATE merchant_subscriptions SET messages_used = messages_used + 1 WHERE id = ?`,
      [subscription.subscriptionId],
    );
    const [reserved] = await connection.execute(
      `UPDATE campaign_delivery_outbox
          SET quota_subscription_id = ?, quota_reserved = 1
        WHERE id = ? AND status = 'processing' AND processing_token = ? AND quota_reserved = 0`,
      [subscription.subscriptionId, row.id, row.processing_token],
    );
    if (Number((reserved as { affectedRows?: number }).affectedRows || 0) !== 1) {
      throw new Error('campaign_delivery_lease_lost');
    }
    await connection.commit();
    row.quota_subscription_id = Number(subscription.subscriptionId);
    row.quota_reserved = 1;
    return { accepted: true };
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function scheduleRetry(row: CampaignDeliveryRow, errorCode: string): Promise<void> {
  if (Number(row.attempts || 0) >= MAX_ATTEMPTS) {
    await writeTerminalState(row, 'manual_review', 'retry_exhausted');
    return;
  }
  const pool = await getPool();
  if (!pool) return;
  const delaySeconds = Math.min(3600, 15 * (2 ** Math.max(0, Number(row.attempts || 1) - 1)));
  await pool.execute(
    `UPDATE campaign_delivery_outbox
        SET status = 'failed', processing_token = NULL, claimed_at = NULL,
            available_at = DATE_ADD(NOW(3), INTERVAL ? SECOND), last_error = ?
      WHERE id = ? AND status = 'processing' AND processing_token = ?`,
    [delaySeconds, errorCode.slice(0, 100), row.id, row.processing_token],
  );
  await reconcileCampaignState(row.campaign_id);
}

async function deferWithoutAttempt(row: CampaignDeliveryRow, reason: string, seconds: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  await pool.execute(
    `UPDATE campaign_delivery_outbox
        SET status = 'pending', attempts = GREATEST(attempts - 1, 0),
            processing_token = NULL, claimed_at = NULL,
            available_at = DATE_ADD(NOW(3), INTERVAL ? SECOND), last_error = ?
      WHERE id = ? AND status = 'processing' AND processing_token = ?`,
    [Math.max(1, Math.min(seconds, 3600)), reason.slice(0, 100), row.id, row.processing_token],
  );
}

async function recoverStaleLeases(): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const [rows] = await pool.execute<CampaignDeliveryRow[]>(
    `SELECT id, campaign_id, merchant_id, customer_id, customer_phone, attempts,
            processing_token, quota_subscription_id, quota_reserved
       FROM campaign_delivery_outbox
      WHERE status = 'processing'
        AND claimed_at < DATE_SUB(NOW(3), INTERVAL ${STALE_LEASE_MINUTES} MINUTE)
      ORDER BY id ASC LIMIT 50`,
  );
  for (const row of rows) {
    const ledger = await readDeliveryLedger(row);
    if (ledger && ['sent', 'delivered', 'read'].includes(String(ledger.status))) {
      await writeTerminalState(row, 'sent', null);
      continue;
    }
    if (ledger?.status === 'queued' || ledger?.error_code === 'provider_unreachable') {
      await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome');
      continue;
    }
    await releaseQuotaReservation(row);
    await scheduleRetry(row, ledger ? 'recovered_provider_rejection' : 'recovered_before_dispatch');
  }
}

async function claimDeliveryRows(limit: number): Promise<CampaignDeliveryRow[]> {
  const pool = await getPool();
  if (!pool) return [];
  await recoverStaleLeases();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const safeLimit = Math.max(1, Math.min(limit, 25));
    const [rows] = await connection.execute<CampaignDeliveryRow[]>(
      `SELECT id, campaign_id, merchant_id, customer_id, customer_phone, attempts,
              processing_token, quota_subscription_id, quota_reserved
         FROM campaign_delivery_outbox
        WHERE status IN ('pending','failed') AND available_at <= NOW(3) AND attempts < ${MAX_ATTEMPTS}
        ORDER BY available_at ASC, id ASC LIMIT ? FOR UPDATE SKIP LOCKED`,
      [safeLimit],
    );
    const claimed: CampaignDeliveryRow[] = [];
    for (const row of rows) {
      const token = crypto.randomBytes(32).toString('hex');
      const [result] = await connection.execute(
        `UPDATE campaign_delivery_outbox
            SET status = 'processing', attempts = attempts + 1,
                processing_token = ?, claimed_at = NOW(3), last_error = NULL
          WHERE id = ? AND status IN ('pending','failed') AND available_at <= NOW(3)`,
        [token, row.id],
      );
      if (Number((result as { affectedRows?: number }).affectedRows || 0) === 1) {
        claimed.push({ ...row, attempts: Number(row.attempts || 0) + 1, processing_token: token });
      }
    }
    await connection.commit();
    return claimed;
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function loadCampaignContext(row: CampaignDeliveryRow): Promise<CampaignContext | undefined> {
  const pool = await getPool();
  if (!pool) throw new RetriableCampaignDeliveryError('database_unavailable');
  const [rows] = await pool.execute<CampaignContext[]>(
    `SELECT o.id, o.campaign_id, o.merchant_id, o.customer_id, o.customer_phone,
            o.attempts, o.processing_token, o.quota_subscription_id, o.quota_reserved,
            c.status AS campaignStatus, c.message, c.imageUrl,
            m.status AS merchantStatus, m.timezone
       FROM campaign_delivery_outbox o
       INNER JOIN campaigns c ON c.id = o.campaign_id AND c.merchantId = o.merchant_id
       INNER JOIN merchants m ON m.id = o.merchant_id
      WHERE o.id = ? AND o.status = 'processing' AND o.processing_token = ? LIMIT 1`,
    [row.id, row.processing_token],
  );
  return rows[0];
}

async function dispatchDelivery(row: CampaignDeliveryRow): Promise<void> {
  const context = await loadCampaignContext(row);
  if (!context) throw new RetriableCampaignDeliveryError('campaign_context_unavailable');
  if (context.campaignStatus !== 'sending' || context.merchantStatus !== 'active') {
    await writeTerminalState(row, 'suppressed', 'campaign_or_merchant_inactive');
    return;
  }
  if (!(await hasActiveCampaignConsent(context.merchant_id, context.customer_phone))) {
    await writeTerminalState(row, 'suppressed', 'consent_withdrawn_before_dispatch');
    return;
  }
  if (isQuietHours(22, 8, context.timezone || 'Asia/Riyadh')) {
    await deferWithoutAttempt(row, 'quiet_hours', 15 * 60);
    return;
  }

  const existing = await readDeliveryLedger(row);
  if (existing && ['sent', 'delivered', 'read'].includes(existing.status)) {
    await writeTerminalState(row, 'sent', null);
    return;
  }
  if (existing?.status === 'queued' || existing?.error_code === 'provider_unreachable') {
    await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome');
    return;
  }

  const capacity = await reserveDispatchCapacity(row);
  if (!capacity.accepted) {
    if (capacity.reason === 'provider_rate') {
      await deferWithoutAttempt(row, 'provider_rate_window', 1);
    } else {
      await writeTerminalState(row, 'suppressed', capacity.reason);
    }
    return;
  }

  let result: Awaited<ReturnType<typeof sendMerchantWhatsApp>>;
  try {
    result = await sendMerchantWhatsApp({
      merchantId: context.merchant_id,
      idempotencyKey: deliveryIdempotencyKey(row),
      to: context.customer_phone,
      kind: context.imageUrl ? 'image' : 'text',
      text: withCampaignOptOutNotice(context.message),
      mediaUrl: context.imageUrl || undefined,
      fileName: context.imageUrl ? 'campaign.jpg' : undefined,
      retryFailed: true,
    });
  } catch (error) {
    if (error instanceof WhatsAppDeliveryStateError) {
      try {
        await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome');
      } catch {
        throw new CampaignPostDispatchStateError();
      }
      return;
    }
    await releaseQuotaReservation(row);
    throw new RetriableCampaignDeliveryError('delivery_service_unavailable');
  }

  try {
    if (result.accepted) {
      await writeTerminalState(row, 'sent', null);
      return;
    }
    if (result.errorCode === 'provider_unreachable' || result.errorCode === 'delivery_in_progress') {
      await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome');
      return;
    }
    await releaseQuotaReservation(row);
    await scheduleRetry(row, result.errorCode || 'provider_rejected');
  } catch {
    // The provider call completed. Preserve the processing lease and quota so
    // stale reconciliation can inspect the durable channel ledger safely.
    throw new CampaignPostDispatchStateError();
  }
}

export async function getCampaignDeliveryProgress(campaignId: number, merchantId: number): Promise<{
  total: number;
  sent: number;
  awaiting: number;
  suppressed: number;
  needsReview: number;
}> {
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0 || !Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid campaign scope');
  }
  await ensureCampaignOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [rows] = await pool.execute<CampaignState[]>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'sent') AS sent,
            SUM(status IN ('pending','processing','failed')) AS active,
            SUM(status = 'suppressed') AS suppressed,
            SUM(status = 'manual_review') AS manualReview
       FROM campaign_delivery_outbox
      WHERE campaign_id = ? AND merchant_id = ?`,
    [campaignId, merchantId],
  );
  const row = rows[0];
  return {
    total: Number(row?.total || 0),
    sent: Number(row?.sent || 0),
    awaiting: Number(row?.active || 0),
    suppressed: Number(row?.suppressed || 0),
    needsReview: Number(row?.manualReview || 0),
  };
}

export async function acknowledgeCampaignManualReviews(
  campaignId: number,
  merchantId: number,
): Promise<{ acknowledged: number }> {
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0 || !Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid campaign scope');
  }
  await ensureCampaignOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  let acknowledged = 0;
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE campaignLogs l
        INNER JOIN campaign_delivery_outbox o ON o.id = l.campaign_outbox_id
          SET l.errorMessage = 'merchant_acknowledged'
        WHERE o.campaign_id = ? AND o.merchant_id = ? AND o.status = 'manual_review'`,
      [campaignId, merchantId],
    );
    const [result] = await connection.execute(
      `UPDATE campaign_delivery_outbox
          SET status = 'suppressed', last_error = 'merchant_acknowledged', updated_at = NOW(3)
        WHERE campaign_id = ? AND merchant_id = ? AND status = 'manual_review'`,
      [campaignId, merchantId],
    );
    acknowledged = Number((result as { affectedRows?: number }).affectedRows || 0);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original */ }
    throw error;
  } finally {
    connection.release();
  }
  await reconcileCampaignState(campaignId);
  return { acknowledged };
}

export async function getCampaignManualReviewSummary(merchantId: number): Promise<{
  campaignId: number;
  campaignName: string;
  needsReview: number;
} | null> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new Error('Invalid merchant scope');
  await ensureCampaignOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [rows] = await pool.execute<CampaignManualReviewSummaryRow[]>(
    `SELECT o.campaign_id AS campaignId, c.name AS campaignName, COUNT(*) AS needsReview
       FROM campaign_delivery_outbox o
       INNER JOIN campaigns c ON c.id = o.campaign_id AND c.merchantId = o.merchant_id
      WHERE o.merchant_id = ? AND o.status = 'manual_review'
      GROUP BY o.campaign_id, c.name
      ORDER BY MIN(o.created_at) ASC, o.campaign_id ASC
      LIMIT 1`,
    [merchantId],
  );
  const row = rows[0];
  return row ? {
    campaignId: Number(row.campaignId),
    campaignName: String(row.campaignName),
    needsReview: Math.max(0, Number(row.needsReview || 0)),
  } : null;
}

export async function getCampaignAcceptanceTimeline(
  merchantId: number,
  days: number,
): Promise<Array<{ date: string; acceptedByProvider: number }>> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0 || !Number.isSafeInteger(days) || days < 1 || days > 365) {
    throw new Error('Invalid campaign timeline scope');
  }
  await ensureCampaignOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');

  const today = new Date();
  const timeline = new Map<string, { acceptedByProvider: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    timeline.set(date.toISOString().slice(0, 10), { acceptedByProvider: 0 });
  }
  const startDay = timeline.keys().next().value as string;
  const startDate = `${startDay} 00:00:00`;
  const [rows] = await pool.execute<CampaignAcceptanceTimelineRow[]>(
    `SELECT DATE_FORMAT(l.sentAt, '%Y-%m-%d') AS day, COUNT(*) AS accepted
       FROM campaignLogs l
       INNER JOIN campaigns c ON c.id = l.campaignId
      WHERE c.merchantId = ? AND l.status = 'success' AND l.sentAt >= ?
      GROUP BY DATE_FORMAT(l.sentAt, '%Y-%m-%d')`,
    [merchantId, startDate],
  );
  for (const row of rows) {
    const bucket = timeline.get(String(row.day));
    if (bucket) bucket.acceptedByProvider = Math.max(0, Number(row.accepted || 0));
  }
  return Array.from(timeline, ([date, values]) => ({ date, ...values }));
}

export async function runCampaignDeliveryBatch(limit = 10): Promise<number> {
  if (workerRunning) return 0;
  workerRunning = true;
  try {
    await ensureCampaignOutboxSchema();
    const rows = await claimDeliveryRows(limit);
    for (const row of rows) {
      try {
        await dispatchDelivery(row);
      } catch (error) {
        if (error instanceof CampaignPostDispatchStateError) continue;
        const code = error instanceof RetriableCampaignDeliveryError ? error.code : 'campaign_delivery_failed';
        await scheduleRetry(row, code);
      }
    }
    await reconcileActiveCampaigns();
    return rows.length;
  } finally {
    workerRunning = false;
  }
}

export function startCampaignDeliveryWorker(intervalMs = 1_000): void {
  if (workerTimer) return;
  const tick = () => runCampaignDeliveryBatch().catch(() => {
    console.error('[Campaign Delivery] batch unavailable');
  });
  void tick();
  workerTimer = setInterval(tick, Math.max(intervalMs, 1_000));
  workerTimer.unref?.();
}
