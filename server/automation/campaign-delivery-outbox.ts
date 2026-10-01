import { campaignDeliveryEvidence } from '../campaign-delivery-evidence';
import crypto from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { campaignRecipientLimit } from '../../shared/campaign-audience';
export { CampaignTargetingError, filterCampaignAudience, isValidCampaignTargetAudience } from '../../shared/campaign-audience';
import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { campaignDefinitionKey, type CampaignDefinition } from '../campaign-definition';
import { assertCampaignContent } from '../campaign-content';
import { reserveCampaignQuota as reserveDispatchCapacity, releaseCampaignQuota as releaseQuotaReservation, CampaignQuotaEvidenceError } from '../campaign-quota';
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
const MAX_RECIPIENTS = campaignRecipientLimit;

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

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
  provider_message_id: string | null;
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

export class CampaignReviewScopeError extends Error {
  constructor() { super('Campaign review scope not found'); this.name = 'CampaignReviewScopeError'; }
}

type LockedCampaign = RowDataPacket & { id: number; merchantId: number; status: string };

// Call only after locking the parent. Lock current recipient rows before counting:
// a consistent-read aggregate taken before that lock can overwrite newer totals.
async function reconcileLockedCampaignState(connection: PoolConnection, campaign: LockedCampaign): Promise<void> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, merchant_id, status FROM campaign_delivery_outbox
      WHERE campaign_id = ? ORDER BY id FOR UPDATE`, [campaign.id],
  );
  if (rows.some(row => Number(row.merchant_id) !== Number(campaign.merchantId))) {
    throw new Error('Campaign recipient ownership is inconsistent');
  }
  if (!rows.length || !['sending', 'failed'].includes(campaign.status)) return;
  const sent = rows.filter(row => row.status === 'sent').length;
  const active = rows.some(row => ['pending', 'processing', 'failed'].includes(row.status));
  const status = active ? 'sending' : rows.some(row => row.status === 'manual_review') ? 'failed' : 'completed';
  await connection.execute(
    `UPDATE campaigns SET sentCount = ?, totalRecipients = ?, status = ?, updatedAt = NOW()
      WHERE id = ? AND merchantId = ? AND status IN ('sending', 'failed')`,
    [sent, rows.length, status, campaign.id, campaign.merchantId],
  );
  await connection.execute(
    `UPDATE occasion_campaigns SET recipientCount = ?, status = ?,
      sentAt = IF(? = 'sending', NULL, COALESCE(sentAt, NOW())), updatedAt = NOW()
      WHERE campaign_id = ? AND merchantId = ? AND status IN ('pending','sending','failed')`,
    [sent, status, status, campaign.id, campaign.merchantId],
  );
}

export class CampaignDispatchConflictError extends Error {
  constructor() {
    super('Campaign is already claimed or cannot be sent from its current state');
    this.name = 'CampaignDispatchConflictError';
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
        'quota_subscription_id', 'quota_reserved', 'quota_period_start', 'available_at', 'claimed_at',
      ],
    },
    { table: 'campaign_dispatch_rate_limits', columns: ['merchant_id', 'window_started_at', 'reserved_count'] },
    { table: 'whatsapp_message_deliveries', columns: ['idempotency_key', 'provider_message_id', 'status'] },
    { table: 'occasion_campaigns', columns: ['campaign_id', 'merchantId', 'enabled', 'status', 'recipientCount', 'sentAt'] },
  ]);
}

async function occasionAllowsAdmission(connection: PoolConnection, campaignId: number, merchantId: number): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT merchantId, enabled, status FROM occasion_campaigns WHERE campaign_id = ? FOR UPDATE', [campaignId],
  );
  // This shares the campaign -> occasion lock order with state reconciliation.
  return rows.length === 0 || (rows.length === 1 && Number(rows[0].merchantId) === merchantId
    && Number(rows[0].enabled) === 1 && rows[0].status === 'pending');
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
  expectedDefinition: string;
  recipients: Array<{ customerId?: number | null; phone: string }>;
}): Promise<{ queued: number }> {
  if (!Number.isSafeInteger(input.campaignId) || input.campaignId <= 0) throw new CampaignDispatchConflictError();
  if (!Number.isSafeInteger(input.merchantId) || input.merchantId <= 0) throw new CampaignDispatchConflictError();
  if (!/^[a-f0-9]{64}$/.test(input.expectedDefinition)) throw new CampaignDispatchConflictError();
  const recipients = normalizeRecipients(input.recipients);
  await ensureCampaignOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [campaignRows] = await connection.execute<(RowDataPacket & CampaignDefinition)[]>(
      `SELECT id, name, message, imageUrl, targetAudience, scheduledAt, status FROM campaigns
        WHERE id = ? AND merchantId = ? LIMIT 1 FOR UPDATE`,
      [input.campaignId, input.merchantId],
    );
    const campaign = campaignRows[0];
    if (!campaign || !['draft', 'scheduled'].includes(String(campaign.status))
      || campaignDefinitionKey(campaign) !== input.expectedDefinition) {
      throw new CampaignDispatchConflictError();
    }
    assertCampaignContent(campaign.message, campaign.imageUrl);
    if (!await occasionAllowsAdmission(connection, input.campaignId, input.merchantId)) throw new CampaignDispatchConflictError();
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
    await connection.execute(
      `UPDATE occasion_campaigns
          SET status = 'sending', updatedAt = NOW()
        WHERE campaign_id = ? AND merchantId = ? AND status = 'pending'`,
      [input.campaignId, input.merchantId],
    );
    await connection.commit();
    return { queued: recipients.length };
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    connection.release();
  }
}

export async function completeCampaignWithoutRecipients(campaignId: number, merchantId: number, expectedDefinition: string): Promise<boolean> {
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0 || !Number.isSafeInteger(merchantId) || merchantId <= 0
    || !/^[a-f0-9]{64}$/.test(expectedDefinition)) throw new CampaignDispatchConflictError();
  await ensureCampaignOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [campaignRows] = await connection.execute<(RowDataPacket & CampaignDefinition)[]>(
      `SELECT id, name, message, imageUrl, targetAudience, scheduledAt, status FROM campaigns
        WHERE id = ? AND merchantId = ? LIMIT 1 FOR UPDATE`, [campaignId, merchantId],
    );
    const campaign = campaignRows[0];
    if (!campaign || !['draft', 'scheduled'].includes(campaign.status) || campaignDefinitionKey(campaign) !== expectedDefinition
      || !await occasionAllowsAdmission(connection, campaignId, merchantId)) {
      await connection.rollback();
      return false;
    }
    const [result] = await connection.execute(
      `UPDATE campaigns
          SET status = 'completed', totalRecipients = 0, sentCount = 0, updatedAt = NOW()
        WHERE id = ? AND merchantId = ? AND status IN ('draft', 'scheduled')`,
      [campaignId, merchantId],
    );
    const completed = Number((result as { affectedRows?: number }).affectedRows || 0) === 1;
    if (completed) {
      await connection.execute(
        `UPDATE occasion_campaigns
            SET status = 'completed', recipientCount = 0, sentAt = NOW(), updatedAt = NOW()
          WHERE campaign_id = ? AND merchantId = ? AND status = 'pending'`,
        [campaignId, merchantId],
      );
    }
    await connection.commit();
    return completed;
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original */ }
    throw error;
  } finally {
    connection.release();
  }
}

function deliveryIdempotencyKey(row: Pick<CampaignDeliveryRow, 'campaign_id' | 'id'>): string {
  return `campaign:${row.campaign_id}:${row.id}`;
}

async function readDeliveryLedger(row: CampaignDeliveryRow): Promise<DeliveryLedgerRow | undefined> {
  const pool = await getPool();
  if (!pool) throw new RetriableCampaignDeliveryError('database_unavailable');
  const [rows] = await pool.execute<DeliveryLedgerRow[]>(
    `SELECT status, error_code, provider_message_id FROM whatsapp_message_deliveries
      WHERE merchant_id = ? AND idempotency_key = ? LIMIT 1`,
    [row.merchant_id, deliveryIdempotencyKey(row)],
  );
  return rows[0];
}

async function reconcileCampaignState(campaignId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [campaigns] = await connection.execute<LockedCampaign[]>(
      'SELECT id, merchantId, status FROM campaigns WHERE id = ? FOR UPDATE', [campaignId],
    );
    if (!campaigns[0]) {
      await connection.rollback();
      return;
    }
    await reconcileLockedCampaignState(connection, campaigns[0]);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function reconcileActiveCampaigns(): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT o.campaign_id AS campaignId
       FROM campaign_delivery_outbox o
       INNER JOIN campaigns c ON c.id = o.campaign_id AND c.merchantId = o.merchant_id
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
    // Recovery may have observed queued just before a fenced provider call finished.
    // The update above waits for that lease lock; reread its committed receipt now.
    if (status === 'manual_review') {
      const [receipts] = await connection.execute<DeliveryLedgerRow[]>(
        `SELECT status, error_code, provider_message_id FROM whatsapp_message_deliveries
          WHERE merchant_id = ? AND idempotency_key = ? FOR SHARE`,
        [row.merchant_id, deliveryIdempotencyKey(row)],
      );
      if (campaignDeliveryEvidence(receipts[0]) === 'accepted') {
        status = 'sent'; reason = null;
        await connection.execute(`UPDATE campaign_delivery_outbox SET status='sent',sent_at=NOW(3),last_error=NULL
          WHERE id=? AND merchant_id=?`, [row.id, row.merchant_id]);
      }
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
    if (campaignDeliveryEvidence(ledger) === 'accepted') {
      await writeTerminalState(row, 'sent', null);
      continue;
    }
    if (campaignDeliveryEvidence(ledger) === 'unknown') {
      await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome');
      continue;
    }
    if (!ledger && Number(row.quota_reserved) === 1) {
      // A charged lease without a receipt may have paused immediately before transport.
      // Recovery cannot prove that an old execution will never enter provider I/O.
      await writeTerminalState(row, 'manual_review', 'quota_without_delivery_receipt');
      continue;
    }
    try { await releaseQuotaReservation(row); } catch (error) {
      if (!(error instanceof CampaignQuotaEvidenceError)) throw error;
      await writeTerminalState(row, 'manual_review', 'quota_evidence_unavailable');
      continue;
    }
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
  const existing = await readDeliveryLedger(row);
  if (campaignDeliveryEvidence(existing) === 'accepted') {
    await writeTerminalState(row, 'sent', null);
    return;
  }
  if (campaignDeliveryEvidence(existing) === 'unknown') {
    await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome');
    return;
  }


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
      campaignGuard: {campaignId:row.campaign_id,deliveryId:row.id,token:row.processing_token},
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
    const evidence = campaignDeliveryEvidence({status:result.status,provider_message_id:result.providerMessageId,error_code:result.errorCode});
    if (evidence === 'accepted') {
      await writeTerminalState(row, 'sent', null);
      return;
    }
    if (evidence !== 'rejected') {
      await writeTerminalState(row, 'manual_review', 'ambiguous_provider_outcome');
      return;
    }
    await releaseQuotaReservation(row);
    if (result.errorCode === 'campaign_authority_suppressed') {
      await writeTerminalState(row, 'suppressed', 'campaign_authority_suppressed');
      return;
    }
    if (result.duplicate) {
      await writeTerminalState(row, 'manual_review', 'campaign_retry_authority_unavailable');
      return;
    }
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
    const [campaigns] = await connection.execute<LockedCampaign[]>(
      'SELECT id, merchantId, status FROM campaigns WHERE id = ? AND merchantId = ? FOR UPDATE',
      [campaignId, merchantId],
    );
    if (!campaigns[0]) throw new CampaignReviewScopeError();
    // Same parent -> recipient -> log order as state reconciliation. In-flight
    // terminal writes finish before the current manual-review set is selected.
    await connection.execute<RowDataPacket[]>(
      `SELECT id FROM campaign_delivery_outbox
        WHERE campaign_id = ? AND merchant_id = ? ORDER BY id FOR UPDATE`, [campaignId, merchantId],
    );
    await connection.execute(
      `UPDATE campaignLogs l
        INNER JOIN campaign_delivery_outbox o ON o.id = l.campaign_outbox_id
          AND l.campaignId = o.campaign_id AND BINARY l.customerPhone = BINARY o.customer_phone
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
    await reconcileLockedCampaignState(connection, campaigns[0]);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original */ }
    throw error;
  } finally {
    connection.release();
  }
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
        if (error instanceof CampaignQuotaEvidenceError) {
          await writeTerminalState(row, 'manual_review', 'quota_evidence_unavailable');
          continue;
        }
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
