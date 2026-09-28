/**
 * Durable follow-ups: customer-requested times or centrally interpreted sales recommendations.
 * Recommendations require independently recorded marketing consent and current sealed dialogue.
 * Source checks, ownership, quiet hours and weekly limits run again at transport admission.
 */

import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { AUTOMATIC_FOLLOWUP_SOURCE, AUTOMATIC_FOLLOWUP_TYPE, readAutomaticFollowup, resolveAutomaticFollowup, hasAutomaticFollowupProof } from './automatic-followup-context';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { hasActiveCampaignConsent, withCampaignOptOutNotice } from '../automation/campaign-guard';
import { CONTEXTUAL_FOLLOWUP_SOURCE, readContextualFollowup, resolveContextualFollowup, hasContextualFollowupProof } from './contextual-followup';
import { assertCheckoutIdentity } from './checkout-agreements';
import { getFollowupPolicy } from './followup-policy';
import { isFollowupTimeAllowed, nextFollowupSendTime } from '../../shared/followup-policy';
import { followupPhoneForms } from './followup-send-guard';
import type { CheckoutIdentity } from './checkout-agreements';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type FollowUpType = 'hesitating' | 'abandoned_cart' | 'price_no_reply' | 'ghost' | 'post_interest' | 'action_selector'
  | 'contextual_sales'
  | 'customer_requested'
  | 'recovery_price' | 'recovery_trust' | 'recovery_competitor' | 'recovery_delivery' | 'recovery_payment' | 'recovery_general';

export interface FollowUpRecord {
  id?: number;
  merchantId: number;
  customerPhone: string;
  conversationId: number;
  followUpType: FollowUpType;
  scheduledAt: Date;
  sentAt: Date | null;
  cancelled: boolean;
  messageTemplate: string;
  customerName?: string;
  source?: string;
}

// ═══════════════════════════════════════════════════════════════
// Follow-up Templates (Gulf Arabic, natural tone)
// ═══════════════════════════════════════════════════════════════

const FOLLOW_UP_TEMPLATES = { customer_requested: ['مرحباً {name}، أتابع معك في الموعد الذي طلبته. هل يناسبك إكمال حديثنا السابق؟'] };

// DB Table Auto-Create
// ═══════════════════════════════════════════════════════════════

async function ensureTable(): Promise<void> {
  await assertRuntimeSchema('proactive follow-ups', [
    { table: 'sales_followups', columns: ['processing_token', 'anchor_message_id', 'claimed_at', 'schedule_timezone'] },
    { table: 'sales_followup_policies', columns: ['revision', 'enabled', 'time_zone', 'weekly_limit'] },
    { table: 'sales_followup_dispatches', columns: ['customer_phone', 'admitted_at', 'state'] },
    { table: 'conversations', columns: ['deal_stage', 'loss_reason', 'stalled_since', 'payment_link_sent_at'] },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

async function followUpContext(executor: Pick<Pool, 'execute'>, merchantId: number, conversationId: number, phone: string) {
  const [rows] = await executor.execute<RowDataPacket[]>(`SELECT c.deal_stage,
    (c.human_takeover = 1 AND (c.human_expires_at IS NULL OR c.human_expires_at > UTC_TIMESTAMP())) AS human_owned,
    COALESCE((SELECT MAX(m.id) FROM messages m WHERE m.conversationId = c.id AND m.direction = 'incoming'), 0) AS incoming_id,
    (SELECT m.createdAt FROM messages m WHERE m.conversationId = c.id AND m.direction = 'incoming' ORDER BY m.id DESC LIMIT 1) AS source_created_at
    FROM conversations c WHERE c.id = ? AND c.merchantId = ? AND c.customerPhone = ?`,
  [conversationId, merchantId, phone]);
  return rows[0];
}

function suppressReason(context: RowDataPacket | undefined): string | undefined {
  if (!context || !context.incoming_id) return 'context_unavailable';
  if (context.human_owned) return 'human_takeover';
  if (['paid', 'purchased'].includes(context.deal_stage)) return 'purchase_completed';
  if (context.deal_stage === 'lost') return 'customer_declined';
}

/**
 * Schedule a follow-up message for a customer (DB-persisted).
 * 
 * Safety checks:
 * - Only 1 active follow-up per customer per conversation
 * - Max 3 per week per customer
 */
export async function scheduleFollowUp(params: {
  merchantId: number;
  customerPhone: string;
  conversationId: number;
  followUpType: FollowUpType;
  customerName?: string;
  customDelayMs?: number;
  customMessage?: string;
  source?: string;
  requestedSourceMessageId?: number;
  automaticSourceMessageId?: number;
}): Promise<boolean> {
  const { merchantId, customerPhone, conversationId, customerName } = params;
  const followUpType = params.followUpType === 'customer_requested' ? 'customer_requested' : AUTOMATIC_FOLLOWUP_TYPE;
  let connection: Awaited<ReturnType<Pool['getConnection']>> | undefined;
  try {
    await ensureTable();
    const pool = await getPool();
    if (!pool) return false;
    // Interest or a past purchase is not permission for unsolicited sales follow-ups.
    if (followUpType !== 'customer_requested' && !await hasActiveCampaignConsent(merchantId, customerPhone)) return false;
    connection = await pool.getConnection();
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
    // Serialize the short scheduling transaction across this merchant, including different conversations.
    await connection.execute('SELECT id FROM merchants WHERE id = ? FOR UPDATE', [merchantId]);
    const { policy } = await getFollowupPolicy(merchantId, connection);
    if (!policy.enabled) return false;
    const phoneForms = followupPhoneForms(customerPhone);
    if (!phoneForms.length) return false;
    const context = await followUpContext(connection, merchantId, conversationId, customerPhone);
    if (suppressReason(context)) return false;
    let automatic = null;
    if (followUpType !== 'customer_requested') {
      const identity = { merchantId, conversationId, customerPhone, incomingMessageId: params.automaticSourceMessageId! };
      await assertCheckoutIdentity(connection, identity);
      if (identity.incomingMessageId !== Number(context!.incoming_id)) return false;
      const stored = await readAutomaticFollowup(connection, identity);
      automatic = resolveAutomaticFollowup(stored?.analysis, new Date(context!.source_created_at));
      if (!automatic || automatic.due.getTime() <= Date.now()) return false;
      const [previous] = await connection.execute<RowDataPacket[]>('SELECT id FROM sales_followups WHERE merchant_id=? AND conversation_id=? AND anchor_message_id=? AND follow_up_type=? LIMIT 1',
        [merchantId, conversationId, identity.incomingMessageId, AUTOMATIC_FOLLOWUP_TYPE]);
      if (previous.length) return false; // Cancellation/delivery never grants another send for the same turn.
      // Recheck consent after acquiring the transaction lock; model interpretation never grants it.
      if (!await hasActiveCampaignConsent(merchantId, customerPhone)) return false;
    }
    let requested = null;
    if (followUpType === 'customer_requested') {
      const identity = { merchantId, conversationId, customerPhone, incomingMessageId: params.requestedSourceMessageId! };
      await assertCheckoutIdentity(connection, identity);
      const analysis = await readContextualFollowup(connection, identity);
      requested = resolveContextualFollowup(analysis, new Date(context!.source_created_at), policy);
    }
    if (followUpType === 'customer_requested' && (requested?.kind !== 'requested' || params.requestedSourceMessageId !== Number(context!.incoming_id))) return false;
    if (requested?.kind === 'requested') {
      const [existing] = await connection.execute<RowDataPacket[]>(`SELECT id FROM sales_followups WHERE merchant_id=? AND conversation_id=?
        AND anchor_message_id=? AND follow_up_type='customer_requested' AND cancelled_at IS NULL`, [merchantId, conversationId, context!.incoming_id]);
      if (existing.length) { await connection.commit(); return true; }
      await connection.execute(`UPDATE sales_followups SET cancelled_at=UTC_TIMESTAMP(), cancel_reason='customer_rescheduled'
        WHERE merchant_id=? AND conversation_id=? AND customer_phone=? AND sent_at IS NULL AND cancelled_at IS NULL`, [merchantId, conversationId, customerPhone]);
    }

    // Safety: Check weekly limit (max 3 per customer per week)
    const [weekRows] = await connection.execute(
      `SELECT COUNT(*) as cnt FROM sales_followups 
       WHERE merchant_id = ? AND customer_phone IN (${phoneForms.map(() => '?').join(',')})
       AND cancelled_at IS NULL
       AND (sent_at IS NULL OR sent_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY))`,
      [merchantId, ...phoneForms]
    );
    if ((weekRows as any[])[0]?.cnt >= policy.weeklyLimit) {
      console.log(`[FollowUp] Weekly limit reached for ***${customerPhone.slice(-4)} — skipping`);
      return false;
    }

    // Safety: Only 1 active per conversation
    const [existRows] = await connection.execute(
      `SELECT id FROM sales_followups 
       WHERE merchant_id = ? AND customer_phone = ? AND conversation_id = ?
       AND sent_at IS NULL AND cancelled_at IS NULL
       LIMIT 1`,
      [merchantId, customerPhone, conversationId]
    );
    if ((existRows as any[]).length > 0) {
      console.log(`[FollowUp] Already scheduled for ***${customerPhone.slice(-4)} in conv ${conversationId}`);
      return false;
    }

    // Pick template
    const templates = FOLLOW_UP_TEMPLATES.customer_requested;
    const template = templates[Math.floor(Math.random() * templates.length)];
    const name = customerName || 'عميلنا';
    const messageText = automatic?.text || withCampaignOptOutNotice(template.replace(/{name}/g, name));

    // Calculate scheduled time
    if (messageText.length > 4096) return false;
    const scheduledAt = requested?.kind === 'requested' ? requested.at : automatic && nextFollowupSendTime(policy, automatic.due);
    if (!scheduledAt) return false;
    if (automatic && scheduledAt.getTime() > automatic.due.getTime() + 86_400_000) return false;
    const schedulingSource = followUpType === 'customer_requested' ? CONTEXTUAL_FOLLOWUP_SOURCE : AUTOMATIC_FOLLOWUP_SOURCE;

    await connection.execute(
      `INSERT INTO sales_followups 
       (merchant_id, conversation_id, customer_phone, follow_up_type, scheduled_at, message_text, customer_name, source, anchor_message_id, schedule_timezone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [merchantId, conversationId, customerPhone, followUpType, scheduledAt, messageText, name, schedulingSource, context!.incoming_id, policy.timeZone]
    );
    await connection.commit();

    console.log(`[FollowUp] Scheduled ${followUpType} for ***${customerPhone.slice(-4)} at ${scheduledAt.toISOString()} (source: ${schedulingSource})`);
    return true;
  } catch (err: any) {
    console.warn(`[FollowUp] Schedule failed: ${err.message}`);
    return false;
  } finally {
    if (connection) { await connection.rollback(); connection.release(); }
  }
}

export function scheduleAutomaticFollowup(input: CheckoutIdentity & { customerName?: string }) {
  return scheduleFollowUp({ ...input, followUpType: AUTOMATIC_FOLLOWUP_TYPE, automaticSourceMessageId: input.incomingMessageId });
}

/**
 * Cancel any pending follow-ups for a customer (call when they reply).
 */
export async function cancelFollowUps(merchantId: number, customerPhone: string): Promise<number> {
  try {
    await ensureTable();
    const pool = await getPool();
    if (!pool) return 0;
    const phoneForms = followupPhoneForms(customerPhone);
    if (!phoneForms.length) return 0;

    const [result] = await pool.execute(
      `UPDATE sales_followups 
       SET cancelled_at = NOW(), cancel_reason = 'customer_replied'
       WHERE merchant_id = ? AND customer_phone IN (${phoneForms.map(() => '?').join(',')})
       AND sent_at IS NULL AND cancelled_at IS NULL`,
      [merchantId, ...phoneForms]
    );

    const cancelled = (result as any).affectedRows || 0;
    if (cancelled > 0) {
      console.log(`[FollowUp] Cancelled ${cancelled} follow-up(s) for ***${customerPhone.slice(-4)} (customer replied)`);
    }
    return cancelled;
  } catch (err: any) {
    console.warn(`[FollowUp] Cancel failed: ${err.message}`);
    return 0;
  }
}

/**
 * Process and send due follow-ups.
 * Called by cron every 5 minutes.
 */
export async function runFollowUps(): Promise<{ sent: number; cancelled: number; errors: number }> {
  let sent = 0;
  let cancelled = 0;
  let errors = 0;

  try {
    await ensureTable();
    const pool = await getPool();
    if (!pool) return { sent, cancelled, errors };

    // Reclaim only expired claims. Transport deduplication uses the same follow-up ID on replay.
    await pool.execute(`UPDATE sales_followups SET processing_token = NULL, claimed_at = NULL
      WHERE sent_at IS NULL AND cancelled_at IS NULL AND processing_token IS NOT NULL
      AND (claimed_at IS NULL OR claimed_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE))`);
    await pool.execute(`UPDATE sales_followups SET cancelled_at = NOW(), cancel_reason = 'expired'
      WHERE sent_at IS NULL AND cancelled_at IS NULL AND scheduled_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`);
    // Find due follow-ups — CLAIM-LOCK: atomic UPDATE to prevent double-send
    // when multiple cron intervals overlap (cronJobs 15min + followup-reminders 5min)
    const claimToken = `claim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await pool.execute(
      `UPDATE sales_followups SET processing_token = ?, claimed_at = UTC_TIMESTAMP(3)
       WHERE sent_at IS NULL AND cancelled_at IS NULL AND processing_token IS NULL
       AND scheduled_at <= NOW()
       LIMIT 20`,
      [claimToken]
    );

    const [rows] = await pool.execute(
      `SELECT f.id, f.merchant_id, f.conversation_id, f.customer_phone, 
              f.follow_up_type, f.message_text, f.customer_name, f.anchor_message_id, f.source, f.scheduled_at, f.schedule_timezone
       FROM sales_followups f
       WHERE f.processing_token = ?`,
      [claimToken]
    );

    const followUps = rows as any[];
    if (followUps.length === 0) return { sent, cancelled, errors };

    for (const fu of followUps) {
      try {
        const { policy } = await getFollowupPolicy(fu.merchant_id);
        if (!policy.enabled) {
          await pool.execute("UPDATE sales_followups SET cancelled_at=UTC_TIMESTAMP(),cancel_reason='policy_disabled' WHERE id=? AND processing_token=?", [fu.id, claimToken]);
          cancelled++; continue;
        }
        const context = await followUpContext(pool, fu.merchant_id, fu.conversation_id, fu.customer_phone);
        const earlySuppression = suppressReason(context)
          || (fu.anchor_message_id === null ? 'context_unavailable' : Number(context?.incoming_id) > fu.anchor_message_id ? 'customer_replied' : undefined)
          || (!await hasAutomaticFollowupProof(pool, fu) ? 'interpretation_changed' : undefined);
        if (earlySuppression) {
          await pool.execute("UPDATE sales_followups SET cancelled_at=UTC_TIMESTAMP(),cancel_reason=? WHERE id=? AND processing_token=?", [earlySuppression, fu.id, claimToken]);
          cancelled++; continue;
        }
        if (!isFollowupTimeAllowed(policy)) {
          if (fu.follow_up_type === 'customer_requested') {
            // A requested appointment is an absolute instant. Never move it silently after a policy change.
            await pool.execute("UPDATE sales_followups SET cancelled_at=UTC_TIMESTAMP(),cancel_reason='requested_outside_hours' WHERE id=? AND processing_token=?", [fu.id, claimToken]);
            cancelled++;
          } else {
            const next = nextFollowupSendTime(policy);
            if (!next) throw new Error('Follow-up send window unavailable');
            await pool.execute('UPDATE sales_followups SET scheduled_at=?,processing_token=NULL,claimed_at=NULL WHERE id=? AND processing_token=?', [next, fu.id, claimToken]);
          }
          continue;
        }
        const suppression = (!await hasContextualFollowupProof(pool, fu) ? 'interpretation_changed' : undefined)
          || (fu.follow_up_type !== 'customer_requested' && !await hasActiveCampaignConsent(fu.merchant_id, fu.customer_phone) ? 'consent_unavailable' : undefined);
        if (suppression) {
          await pool.execute(
            `UPDATE sales_followups SET cancelled_at = NOW(), cancel_reason = ? WHERE id = ? AND processing_token = ?`,
            [suppression, fu.id, claimToken]
          );
          cancelled++;
          continue;
        }

        // Recheck ownership and the anchor in the final DB read before the external send.
        const [eligible] = await pool.execute<RowDataPacket[]>(`SELECT f.id FROM sales_followups f
          JOIN conversations c ON c.id = f.conversation_id AND c.merchantId = f.merchant_id
          WHERE f.id = ? AND f.processing_token = ? AND f.cancelled_at IS NULL AND f.sent_at IS NULL
          AND c.deal_stage NOT IN ('paid', 'purchased', 'lost')
          AND NOT (c.human_takeover = 1 AND (c.human_expires_at IS NULL OR c.human_expires_at > UTC_TIMESTAMP()))
          AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversationId = c.id
            AND m.direction = 'incoming' AND m.id > f.anchor_message_id)`, [fu.id, claimToken]);
        if (!eligible.length) {
          await pool.execute(`UPDATE sales_followups SET cancelled_at = NOW(), cancel_reason = 'context_changed'
            WHERE id = ? AND processing_token = ? AND sent_at IS NULL`, [fu.id, claimToken]);
          cancelled++;
          continue;
        }
        const result = await sendMerchantWhatsApp({ merchantId: fu.merchant_id, to: fu.customer_phone,
          kind: 'text', text: fu.message_text, idempotencyKey: `sales_followup:${fu.merchant_id}:${fu.id}`,
          followUpGuard: { id: fu.id, token: claimToken } });
        if (!result.accepted) {
          await pool.execute(`UPDATE sales_followups SET cancelled_at = NOW(), cancel_reason = ?
            WHERE id = ? AND processing_token = ?`,
          [result.errorCode === 'followup_suppressed' ? 'context_changed' : result.status === 'failed' ? 'delivery_failed' : 'delivery_review_required', fu.id, claimToken]);
          if (result.errorCode === 'followup_suppressed') cancelled++; else errors++;
          continue;
        }

        // Mark as sent
        await pool.execute(
          `UPDATE sales_followups SET sent_at = NOW() WHERE id = ? AND processing_token = ?`,
          [fu.id, claimToken]
        );

        sent++;
        console.log(`[FollowUp] ✅ Sent ${fu.follow_up_type} to ***${fu.customer_phone.slice(-4)}`);
      } catch (err: any) {
        errors++;
        console.error(`[FollowUp] ❌ Failed to send to ***${fu.customer_phone.slice(-4)}:`, err.message);
      }
    }

    // Cleanup: Release stale processing_tokens (claimed > 10 min ago but never sent — crash recovery)
    await pool.execute(
      `UPDATE sales_followups SET processing_token = NULL
       WHERE processing_token IS NOT NULL AND sent_at IS NULL AND cancelled_at IS NULL
       AND claimed_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE)`
    ).catch(() => {});

    // Cleanup: Cancel follow-ups older than 7 days that were never sent
    await pool.execute(
      `UPDATE sales_followups 
       SET cancelled_at = NOW(), cancel_reason = 'expired'
       WHERE sent_at IS NULL AND cancelled_at IS NULL
       AND scheduled_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`
    ).catch(() => {});

    console.log(`[FollowUp] Run complete: ${sent} sent, ${cancelled} cancelled, ${errors} errors`);
  } catch (err: any) {
    console.error('[FollowUp] Run failed:', err.message);
  }

  return { sent, cancelled, errors };
}

/**
 * Get follow-up stats (for dashboard/debugging).
 */
export async function getFollowUpStats(): Promise<{
  totalScheduled: number;
  pending: number;
  sent: number;
  cancelled: number;
}> {
  try {
    const pool = await getPool();
    if (!pool) return { totalScheduled: 0, pending: 0, sent: 0, cancelled: 0 };

    const [rows] = await pool.execute(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN sent_at IS NULL AND cancelled_at IS NULL THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN sent_at IS NOT NULL THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN cancelled_at IS NOT NULL THEN 1 ELSE 0 END) as cancelled
       FROM sales_followups
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    const row = (rows as any[])[0] || {};
    return {
      totalScheduled: row.total || 0,
      pending: row.pending || 0,
      sent: row.sent || 0,
      cancelled: row.cancelled || 0,
    };
  } catch {
    return { totalScheduled: 0, pending: 0, sent: 0, cancelled: 0 };
  }
}
