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

import { getPool, getWhatsAppInstancesByMerchantId } from '../db';
import { sendMessageWithCredentials } from '../whatsapp';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type FollowUpType = 'hesitating' | 'abandoned_cart' | 'price_no_reply' | 'ghost' | 'post_interest' | 'action_selector';

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
  hesitating: [
    'مرحبا {name} 🙌 قدرت تفكر في الموضوع؟ لو عندك أي سؤال أنا هنا أساعدك',
    'هلا {name}! رجعت أتطمن عليك 😊 إذا تحتاج أي توضيح ثاني ترى أنا جاهز',
    '{name} 👋 بس حبيت أتأكد ما فاتك شي — لو تحتاج مساعدة أنا موجود',
  ],
  abandoned_cart: [
    'مرحبا {name}! لاحظت إن سلتك لسه موجودة 🛒 تحتاج مساعدة تكمل الطلب؟',
    '{name} 👋 طلبك لسه محجوز — تبي أساعدك تكمله؟',
  ],
  price_no_reply: [
    'هلا {name}! أرسلت لك السعر قبل — هل في شي ثاني تحتاج تعرفه؟ 😊',
    '{name} 🙌 لو السعر مناسب تبي أحجز لك؟ ولو عندك استفسار أنا هنا',
  ],
  ghost: [
    'مرحبا {name}! وحشتنا 😊 عندنا عروض جديدة لو تبي تشوفها',
    'هلا {name}! كيف الحال؟ عندنا جديد ممكن يعجبك 🎉',
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
    '{name} 😊 حبيت أخبرك إن عندنا عروض جديدة ممكن تناسب ميزانيتك — تبي أعرض عليك؟',
    'هلا {name}! وصلتنا باقات بأسعار مخفضة 🎉 تحب أرسل لك التفاصيل؟',
  ],
  recovery_trust: [
    '{name} 👋 حبيت أشارك معك تجربة بعض عملائنا — كثير منهم كانوا مترددين زيك وصاروا عملاء دائمين 🤝',
    'هلا {name}! لو تحب تشوف تقييمات العملاء أو تجرب قبل لا تشتري، أنا جاهز أساعدك 😊',
  ],
  recovery_competitor: [
    '{name} 😊 عندنا ميزات حصرية ما تلقاها عند غيرنا — تبي أوضح لك؟',
    'هلا {name}! حبيت أقارن لك بالضبط وش الفرق بيننا وبين البدائل الثانية — عندك دقيقتين؟ 🤝',
  ],
  recovery_delivery: [
    '{name} 👋 حبيت أخبرك إن عندنا خيارات توصيل جديدة ممكن تناسبك! 🚚',
    'هلا {name}! تم تحسين خدمة التوصيل عندنا — تبي أشرح لك الخيارات المتاحة؟ 😊',
  ],
  recovery_payment: [
    '{name} 😊 لاحظت إن الدفع ما اكتمل — لو واجهت مشكلة تقنية أنا أقدر أساعدك',
    'هلا {name}! لو تحتاج رابط دفع جديد أو طريقة دفع بديلة، أنا جاهز أساعدك 💳',
  ],
  recovery_general: [
    '{name} 👋 وحشتنا! عندنا جديد ممكن يعجبك — تبي أعرض عليك؟ 😊',
    'هلا {name}! كيف الحال؟ حبيت أتطمن عليك وأخبرك بآخر عروضنا 🎉',
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
  target.setHours(QUIET_HOUR_END, 0, 0, 0);
  if (target <= saudiNow) {
    target.setDate(target.getDate() + 1);
  }
  return new Date(target.getTime() - saudiOffset);
}

// ═══════════════════════════════════════════════════════════════
// DB Table Auto-Create
// ═══════════════════════════════════════════════════════════════

let _tableCreated = false;

async function ensureTable(): Promise<void> {
  if (_tableCreated) return;
  const pool = await getPool();
  if (!pool) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sales_followups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      conversation_id INT NOT NULL,
      customer_phone VARCHAR(20) NOT NULL,
      follow_up_type VARCHAR(30) NOT NULL,
      scheduled_at TIMESTAMP NOT NULL,
      sent_at TIMESTAMP NULL,
      cancelled_at TIMESTAMP NULL,
      cancel_reason VARCHAR(50) NULL,
      message_text TEXT NOT NULL,
      customer_name VARCHAR(255) NULL,
      source VARCHAR(30) DEFAULT 'proactive' NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      INDEX idx_followup_merchant_phone (merchant_id, customer_phone),
      INDEX idx_followup_scheduled (scheduled_at),
      INDEX idx_followup_pending (merchant_id, sent_at, cancelled_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // ENH-FIX: Auto-add deal_stage column to conversations (no formal migration needed)
  try {
    await pool.execute(`ALTER TABLE conversations ADD COLUMN deal_stage VARCHAR(30) DEFAULT 'new'`);
    console.log('[FollowUp] ✅ Added deal_stage column to conversations');
  } catch (e: any) {
    // Error 1060 = "Duplicate column name" — column already exists, safe to ignore
    if (e.code !== 'ER_DUP_FIELDNAME' && e.errno !== 1060) {
      console.warn('[FollowUp] deal_stage column check:', e.message);
    }
  }
  _tableCreated = true;
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

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
}): Promise<boolean> {
  const { merchantId, customerPhone, conversationId, followUpType, customerName } = params;

  try {
    await ensureTable();
    const pool = await getPool();
    if (!pool) return false;

    // Safety: Check weekly limit (max 3 per customer per week)
    const [weekRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM sales_followups 
       WHERE merchant_id = ? AND customer_phone = ? 
       AND sent_at IS NOT NULL
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [merchantId, customerPhone]
    );
    if ((weekRows as any[])[0]?.cnt >= MAX_WEEKLY_PER_CUSTOMER) {
      console.log(`[FollowUp] Weekly limit reached for ***${customerPhone.slice(-4)} — skipping`);
      return false;
    }

    // Safety: Only 1 active per conversation
    const [existRows] = await pool.execute(
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
    const messageText = params.customMessage || template.replace(/{name}/g, name);

    // Calculate scheduled time
    const delayMs = params.customDelayMs || FOLLOW_UP_DELAYS[followUpType] || FOLLOW_UP_DELAYS.action_selector;
    const scheduledAt = new Date(Date.now() + delayMs);

    await pool.execute(
      `INSERT INTO sales_followups 
       (merchant_id, conversation_id, customer_phone, follow_up_type, scheduled_at, message_text, customer_name, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [merchantId, conversationId, customerPhone, followUpType, scheduledAt, messageText, name, params.source || 'proactive']
    );

    console.log(`[FollowUp] Scheduled ${followUpType} for ***${customerPhone.slice(-4)} at ${scheduledAt.toISOString()} (source: ${params.source || 'proactive'})`);
    return true;
  } catch (err: any) {
    console.warn(`[FollowUp] Schedule failed: ${err.message}`);
    return false;
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

    // Find due follow-ups
    const [rows] = await pool.execute(
      `SELECT f.id, f.merchant_id, f.conversation_id, f.customer_phone, 
              f.follow_up_type, f.message_text, f.customer_name
       FROM sales_followups f
       WHERE f.sent_at IS NULL AND f.cancelled_at IS NULL
       AND f.scheduled_at <= NOW()
       LIMIT 20`
    );

    const followUps = rows as any[];
    if (followUps.length === 0) return { sent, cancelled, errors };

    for (const fu of followUps) {
      try {
        // Check humanTakeover
        const [convRows] = await pool.execute(
          `SELECT human_takeover FROM conversations 
           WHERE id = ? AND merchantId = ? LIMIT 1`,
          [fu.conversation_id, fu.merchant_id]
        );
        if ((convRows as any[])[0]?.human_takeover) {
          await pool.execute(
            `UPDATE sales_followups SET cancelled_at = NOW(), cancel_reason = 'human_takeover' WHERE id = ?`,
            [fu.id]
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

        // Send the message
        const instances = await getWhatsAppInstancesByMerchantId(fu.merchant_id);
        const activeInstance = (instances as any[]).find((i: any) => i.status === 'active');

        if (!activeInstance?.instanceId) {
          throw new Error('No active WhatsApp instance');
        }

        await sendMessageWithCredentials(
          activeInstance.instanceId,
          activeInstance.token,
          activeInstance.apiUrl || 'https://api.green-api.com',
          fu.customer_phone,
          fu.message_text
        );

        // Mark as sent
        await pool.execute(
          `UPDATE sales_followups SET sent_at = NOW() WHERE id = ?`,
          [fu.id]
        );

        sent++;
        console.log(`[FollowUp] ✅ Sent ${fu.follow_up_type} to ***${fu.customer_phone.slice(-4)}`);
      } catch (err: any) {
        errors++;
        console.error(`[FollowUp] ❌ Failed to send to ***${fu.customer_phone.slice(-4)}:`, err.message);
      }
    }

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
