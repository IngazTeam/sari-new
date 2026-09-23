/**
 * Proactive Follow-up Engine — DB-Persisted
 * 
 * Schedules and sends follow-up messages to customers who:
 * - Said "بفكر" (hesitating) → after 2.5 hours
 * - Abandoned cart → after 1 hour
 * - Asked about price but didn't respond → after 4 hours
 * - Ghost (inactive 48h) → after 48 hours
 * 
 * Safety Guards:
 * - Max 1 follow-up per customer per conversation
 * - Max 3 follow-ups per customer per week
 * - Cancel if customer replies before scheduled time
 * - Never send if humanTakeover is active
 * 
 * BUG-FIX: Migrated from in-memory array to `sales_followups` DB table.
 * Previously all follow-ups were lost on server restart, and 3 systems
 * (proactive-followup, followup-reminders, action-selector) competed
 * on the same `agent_history` TEXT field.
 */

import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { isSalesRefusal } from './customer-decision';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { hasActiveCampaignConsent, withCampaignOptOutNotice } from '../automation/campaign-guard';
import { parseRequestedFollowupTime } from './requested-followup-time';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type FollowUpType = 'hesitating' | 'abandoned_cart' | 'price_no_reply' | 'ghost' | 'post_interest' | 'action_selector'
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

const FOLLOW_UP_TEMPLATES: Record<string, string[]> = {
  customer_requested: ['مرحباً {name}، أتابع معك في الموعد الذي طلبته. هل يناسبك إكمال حديثنا السابق؟'],
  hesitating: [
    'مرحبا {name} 🙌 قدرت تفكر في الموضوع؟ لو عندك أي سؤال أنا هنا أساعدك',
    'هلا {name}! رجعت أتطمن عليك 😊 إذا تحتاج أي توضيح ثاني ترى أنا جاهز',
    '{name} 👋 بس حبيت أتأكد ما فاتك شي — لو تحتاج مساعدة أنا موجود',
  ],
  abandoned_cart: [
    'مرحبا {name}! تحتاج مساعدة بخصوص المنتجات اللي كنت مهتماً بها؟',
    '{name} 👋 تحتاج مساعدة في تفاصيل الطلب اللي ناقشناه؟',
  ],
  price_no_reply: [
    'هلا {name}! أرسلت لك السعر قبل — هل في شي ثاني تحتاج تعرفه؟ 😊',
    '{name} 🙌 لو السعر مناسب تبي أحجز لك؟ ولو عندك استفسار أنا هنا',
  ],
  ghost: [
    'مرحبا {name}! هل ما زلت تبحث عن الحل اللي ناقشناه؟ أقدر أوضح لك الخيارات.',
    'هلا {name}! حبيت أتابع استفسارك السابق، تحتاج توضيحاً إضافياً؟',
  ],
  post_interest: [
    '{name} 😊 حبيت أتأكد إنك لقيت اللي تبيه — تحتاج مساعدة ثانية؟',
  ],
  action_selector: [
    'مرحباً! 😊 رجعت أتطمن عليك — هل قدرت تاخذ قرار بخصوص ما ناقشناه؟ إذا عندك أي سؤال أنا هنا 🙏',
    'أهلاً! 👋 أبغى أتأكد إنك لقيت اللي تبحث عنه — تبي أساعدك بشي إضافي؟',
    'هلا! 😄 حبيت أتابع معك — لا تتردد إذا فيه أي استفسار!',
  ],
  // ═══════ P2: Loss-Reason Recovery Templates ═══════
  recovery_price: [
    '{name}، لو تحب نراجع الخيارات حسب ميزانيتك، أقدر أوضح لك الفروق.',
    'هلا {name}! هل تحتاج توضيح ما يشمله السعر قبل اتخاذ قرارك؟',
  ],
  recovery_trust: [
    '{name}، هل بقيت نقطة تحتاج تتأكد منها قبل القرار؟ أراجع لك المعلومات المتاحة.',
    'هلا {name}! أقدر أوضح لك السياسات وتفاصيل الخدمة إذا احتجت.',
  ],
  recovery_competitor: [
    '{name}، ما أهم نقطة بالنسبة لك في المقارنة؟ أقدر أوضح لك تفاصيل خيارنا.',
    'هلا {name}! حبيت أقارن لك بالضبط وش الفرق بيننا وبين البدائل الثانية — عندك دقيقتين؟ 🤝',
  ],
  recovery_delivery: [
    '{name}، لو ما زال عندك استفسار عن التوصيل أقدر أتحقق من الخيارات لمنطقتك.',
    'هلا {name}! هل تحتاج نراجع تفاصيل التوصيل قبل إكمال الطلب؟',
  ],
  recovery_payment: [
    '{name} 😊 لاحظت إن الدفع ما اكتمل — لو واجهت مشكلة تقنية أنا أقدر أساعدك',
    'هلا {name}! لو تحتاج رابط دفع جديد أو طريقة دفع بديلة، أنا جاهز أساعدك 💳',
  ],
  recovery_general: [
    '{name}، أتابع معك بخصوص استفسارك السابق. هل تحتاج معلومة إضافية؟',
    'هلا {name}! هل ما زال الموضوع مناسباً لك أم تفضل نوقف المتابعة؟',
  ],
};

// Delay per follow-up type (in ms)
const FOLLOW_UP_DELAYS: Record<string, number> = {
  hesitating: 2.5 * 60 * 60 * 1000,    // 2.5 hours
  abandoned_cart: 1 * 60 * 60 * 1000,    // 1 hour
  price_no_reply: 4 * 60 * 60 * 1000,    // 4 hours
  ghost: 48 * 60 * 60 * 1000,            // 48 hours
  post_interest: 3 * 60 * 60 * 1000,     // 3 hours
  action_selector: 4 * 60 * 60 * 1000,   // 4 hours (default for action-selector)
};

// Quiet hours: 11 PM - 8 AM Saudi time (UTC+3)
const QUIET_HOUR_START = 23; // 11 PM
const QUIET_HOUR_END = 8;    // 8 AM
const MAX_WEEKLY_PER_CUSTOMER = 3;

function isQuietHours(): boolean {
  const now = new Date();
  const saudiHour = (now.getUTCHours() + 3) % 24;
  return saudiHour >= QUIET_HOUR_START || saudiHour < QUIET_HOUR_END;
}

function getNextAllowedSendTime(): Date {
  const now = new Date();
  const saudiOffset = 3 * 60 * 60 * 1000;
  const saudiNow = new Date(now.getTime() + saudiOffset);
  const target = new Date(saudiNow);
  target.setUTCHours(QUIET_HOUR_END, 0, 0, 0);
  if (target <= saudiNow) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return new Date(target.getTime() - saudiOffset);
}

// ═══════════════════════════════════════════════════════════════
// DB Table Auto-Create
// ═══════════════════════════════════════════════════════════════

async function ensureTable(): Promise<void> {
  await assertRuntimeSchema('proactive follow-ups', [
    { table: 'sales_followups', columns: ['processing_token', 'anchor_message_id', 'claimed_at'] },
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
    (SELECT m.content FROM messages m WHERE m.conversationId = c.id AND m.direction = 'incoming' ORDER BY m.id DESC LIMIT 1) AS last_message
    , (SELECT m.createdAt FROM messages m WHERE m.conversationId = c.id AND m.direction = 'incoming' ORDER BY m.id DESC LIMIT 1) AS source_created_at
    FROM conversations c WHERE c.id = ? AND c.merchantId = ? AND c.customerPhone = ?`,
  [conversationId, merchantId, phone]);
  return rows[0];
}

function suppressReason(context: RowDataPacket | undefined): string | undefined {
  if (!context || !context.incoming_id) return 'context_unavailable';
  if (context.human_owned) return 'human_takeover';
  if (['paid', 'purchased'].includes(context.deal_stage)) return 'purchase_completed';
  if (context.deal_stage === 'lost' || isSalesRefusal(context.last_message || '')) return 'customer_declined';
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
}): Promise<boolean> {
  const { merchantId, customerPhone, conversationId, followUpType, customerName } = params;
  let connection: Awaited<ReturnType<Pool['getConnection']>> | undefined;
  try {
    await ensureTable();
    const pool = await getPool();
    if (!pool) return false;
    // Interest or a past purchase is not permission for unsolicited sales follow-ups.
    if (followUpType !== 'customer_requested' && !await hasActiveCampaignConsent(merchantId, customerPhone)) return false;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    // Serialize the short scheduling transaction across this merchant, including different conversations.
    await connection.execute('SELECT id FROM merchants WHERE id = ? FOR UPDATE', [merchantId]);
    const context = await followUpContext(connection, merchantId, conversationId, customerPhone);
    if (suppressReason(context)) return false;
    const requested = followUpType === 'customer_requested'
      ? parseRequestedFollowupTime(context!.last_message || '', new Date(context!.source_created_at)) : null;
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
       WHERE merchant_id = ? AND customer_phone = ? 
       AND cancelled_at IS NULL
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [merchantId, customerPhone]
    );
    if ((weekRows as any[])[0]?.cnt >= MAX_WEEKLY_PER_CUSTOMER) {
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
    const templates = FOLLOW_UP_TEMPLATES[followUpType] || FOLLOW_UP_TEMPLATES.action_selector;
    const template = templates[Math.floor(Math.random() * templates.length)];
    const name = customerName || 'عميلنا';
    const messageText = withCampaignOptOutNotice((followUpType !== 'customer_requested' && params.customMessage) || template.replace(/{name}/g, name));

    // Calculate scheduled time
    const delayMs = params.customDelayMs ?? FOLLOW_UP_DELAYS[followUpType] ?? FOLLOW_UP_DELAYS.action_selector;
    if (!Number.isFinite(delayMs) || delayMs < 0 || messageText.length > 4096) return false;
    const scheduledAt = requested?.kind === 'requested' ? requested.at : new Date(Date.now() + delayMs);

    await connection.execute(
      `INSERT INTO sales_followups 
       (merchant_id, conversation_id, customer_phone, follow_up_type, scheduled_at, message_text, customer_name, source, anchor_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [merchantId, conversationId, customerPhone, followUpType, scheduledAt, messageText, name, params.source || 'proactive', context!.incoming_id]
    );
    await connection.commit();

    console.log(`[FollowUp] Scheduled ${followUpType} for ***${customerPhone.slice(-4)} at ${scheduledAt.toISOString()} (source: ${params.source || 'proactive'})`);
    return true;
  } catch (err: any) {
    console.warn(`[FollowUp] Schedule failed: ${err.message}`);
    return false;
  } finally {
    if (connection) { await connection.rollback(); connection.release(); }
  }
}

/**
 * Cancel any pending follow-ups for a customer (call when they reply).
 */
export async function cancelFollowUps(merchantId: number, customerPhone: string): Promise<number> {
  try {
    await ensureTable();
    const pool = await getPool();
    if (!pool) return 0;

    const [result] = await pool.execute(
      `UPDATE sales_followups 
       SET cancelled_at = NOW(), cancel_reason = 'customer_replied'
       WHERE merchant_id = ? AND customer_phone = ?
       AND sent_at IS NULL AND cancelled_at IS NULL`,
      [merchantId, customerPhone]
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

    // Don't send during quiet hours — reschedule to morning
    if (isQuietHours()) {
      const nextSend = getNextAllowedSendTime();
      const [rescheduleResult] = await pool.execute(
        `UPDATE sales_followups 
         SET scheduled_at = ?
         WHERE sent_at IS NULL AND cancelled_at IS NULL
         AND scheduled_at <= NOW()`,
        [nextSend]
      );
      const rescheduled = (rescheduleResult as any).affectedRows || 0;
      if (rescheduled > 0) {
        console.log(`[FollowUp] Rescheduled ${rescheduled} follow-ups to ${nextSend.toISOString()} (quiet hours)`);
      }
      return { sent, cancelled, errors };
    }

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
              f.follow_up_type, f.message_text, f.customer_name, f.anchor_message_id
       FROM sales_followups f
       WHERE f.processing_token = ?`,
      [claimToken]
    );

    const followUps = rows as any[];
    if (followUps.length === 0) return { sent, cancelled, errors };

    for (const fu of followUps) {
      try {
        const context = await followUpContext(pool, fu.merchant_id, fu.conversation_id, fu.customer_phone);
        const suppression = suppressReason(context)
          || (fu.follow_up_type !== 'customer_requested' && !await hasActiveCampaignConsent(fu.merchant_id, fu.customer_phone) ? 'consent_unavailable' : undefined)
          || (fu.anchor_message_id === null ? 'context_unavailable' : Number(context?.incoming_id) > fu.anchor_message_id ? 'customer_replied' : undefined);
        if (suppression) {
          await pool.execute(
            `UPDATE sales_followups SET cancelled_at = NOW(), cancel_reason = ? WHERE id = ? AND processing_token = ?`,
            [suppression, fu.id, claimToken]
          );
          cancelled++;
          continue;
        }

        // Re-check weekly limit at send time
        const [weekCheck] = await pool.execute(
          `SELECT COUNT(*) as cnt FROM sales_followups 
           WHERE merchant_id = ? AND customer_phone = ?
           AND sent_at IS NOT NULL
           AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
          [fu.merchant_id, fu.customer_phone]
        );
        if ((weekCheck as any[])[0]?.cnt >= MAX_WEEKLY_PER_CUSTOMER) {
          await pool.execute(
            `UPDATE sales_followups SET cancelled_at = NOW(), cancel_reason = 'weekly_limit' WHERE id = ?`,
            [fu.id]
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
