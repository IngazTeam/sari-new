/**
 * Proactive Follow-up Engine
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
 */

import { getPool, getWhatsAppInstancesByMerchantId } from '../db';
import { sendMessageWithCredentials } from '../whatsapp';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type FollowUpType = 'hesitating' | 'abandoned_cart' | 'price_no_reply' | 'ghost' | 'post_interest';

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
}

// ═══════════════════════════════════════════════════════════════
// Follow-up Templates (Gulf Arabic, natural tone)
// ═══════════════════════════════════════════════════════════════

const FOLLOW_UP_TEMPLATES: Record<FollowUpType, string[]> = {
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
};

// Delay per follow-up type (in ms)
const FOLLOW_UP_DELAYS: Record<FollowUpType, number> = {
  hesitating: 2.5 * 60 * 60 * 1000,    // 2.5 hours
  abandoned_cart: 1 * 60 * 60 * 1000,    // 1 hour
  price_no_reply: 4 * 60 * 60 * 1000,    // 4 hours
  ghost: 48 * 60 * 60 * 1000,            // 48 hours
  post_interest: 3 * 60 * 60 * 1000,     // 3 hours
};

// Quiet hours: 11 PM - 8 AM Saudi time (UTC+3)
const QUIET_HOUR_START = 23; // 11 PM
const QUIET_HOUR_END = 8;    // 8 AM

function isQuietHours(): boolean {
  const now = new Date();
  // Convert to Saudi time (UTC+3)
  const saudiHour = (now.getUTCHours() + 3) % 24;
  return saudiHour >= QUIET_HOUR_START || saudiHour < QUIET_HOUR_END;
}

function getNextAllowedSendTime(): Date {
  const now = new Date();
  const saudiOffset = 3 * 60 * 60 * 1000;
  const saudiNow = new Date(now.getTime() + saudiOffset);
  // Set to 8 AM Saudi time today or tomorrow
  const target = new Date(saudiNow);
  target.setHours(QUIET_HOUR_END, 0, 0, 0);
  if (target <= saudiNow) {
    target.setDate(target.getDate() + 1);
  }
  // Convert back to UTC
  return new Date(target.getTime() - saudiOffset);
}

// ═══════════════════════════════════════════════════════════════
// In-memory schedule (production would use DB table)
// ═══════════════════════════════════════════════════════════════

const scheduledFollowUps: FollowUpRecord[] = [];
const MAX_WEEKLY_PER_CUSTOMER = 3;
const MAX_SCHEDULED = 500;

// Track weekly sends per customer
const weeklySends = new Map<string, { count: number; weekStart: number }>();

function getWeekKey(merchantId: number, phone: string): string {
  return `${merchantId}:${phone}`;
}

function getWeekStart(): number {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  return new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0).getTime();
}

function canSendThisWeek(merchantId: number, phone: string): boolean {
  const key = getWeekKey(merchantId, phone);
  const record = weeklySends.get(key);
  const currentWeek = getWeekStart();
  
  if (!record || record.weekStart !== currentWeek) {
    return true; // New week or no record
  }
  return record.count < MAX_WEEKLY_PER_CUSTOMER;
}

function recordWeeklySend(merchantId: number, phone: string): void {
  const key = getWeekKey(merchantId, phone);
  const currentWeek = getWeekStart();
  const record = weeklySends.get(key);
  
  if (!record || record.weekStart !== currentWeek) {
    weeklySends.set(key, { count: 1, weekStart: currentWeek });
  } else {
    record.count++;
  }
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Schedule a follow-up message for a customer.
 * 
 * Safety checks:
 * - Only 1 active follow-up per customer per conversation
 * - Max 3 per week per customer
 * - Max 500 total scheduled
 */
export function scheduleFollowUp(params: {
  merchantId: number;
  customerPhone: string;
  conversationId: number;
  followUpType: FollowUpType;
  customerName?: string;
  instanceId?: string;
  apiToken?: string;
}): boolean {
  const { merchantId, customerPhone, conversationId, followUpType, customerName } = params;

  // Safety: Check weekly limit
  if (!canSendThisWeek(merchantId, customerPhone)) {
    console.log(`[FollowUp] Weekly limit reached for ***${customerPhone.slice(-4)} — skipping`);
    return false;
  }

  // Safety: Only 1 active per conversation
  const existing = scheduledFollowUps.find(
    f => f.merchantId === merchantId && 
         f.customerPhone === customerPhone && 
         f.conversationId === conversationId &&
         !f.cancelled && !f.sentAt
  );
  if (existing) {
    console.log(`[FollowUp] Already scheduled for ***${customerPhone.slice(-4)} in conv ${conversationId}`);
    return false;
  }

  // Safety: Global cap
  const activeCount = scheduledFollowUps.filter(f => !f.cancelled && !f.sentAt).length;
  if (activeCount >= MAX_SCHEDULED) {
    console.log(`[FollowUp] Global cap reached (${MAX_SCHEDULED}) — skipping`);
    return false;
  }

  // Pick random template
  const templates = FOLLOW_UP_TEMPLATES[followUpType];
  const template = templates[Math.floor(Math.random() * templates.length)];
  const name = customerName || 'عميلنا';

  const record: FollowUpRecord = {
    merchantId,
    customerPhone,
    conversationId,
    followUpType,
    scheduledAt: new Date(Date.now() + FOLLOW_UP_DELAYS[followUpType]),
    sentAt: null,
    cancelled: false,
    messageTemplate: template.replace(/{name}/g, name),
    customerName: name,
  };

  scheduledFollowUps.push(record);
  console.log(`[FollowUp] Scheduled ${followUpType} for ***${customerPhone.slice(-4)} at ${record.scheduledAt.toISOString()}`);
  return true;
}

/**
 * Cancel any pending follow-ups for a customer (call when they reply).
 */
export function cancelFollowUps(merchantId: number, customerPhone: string): number {
  let cancelled = 0;
  for (const f of scheduledFollowUps) {
    if (f.merchantId === merchantId && 
        f.customerPhone === customerPhone && 
        !f.cancelled && !f.sentAt) {
      f.cancelled = true;
      cancelled++;
    }
  }
  if (cancelled > 0) {
    console.log(`[FollowUp] Cancelled ${cancelled} follow-up(s) for ***${customerPhone.slice(-4)} (customer replied)`);
  }
  return cancelled;
}

/**
 * Process and send due follow-ups.
 * Called by cron every 15 minutes.
 */
export async function runFollowUps(): Promise<{ sent: number; cancelled: number; errors: number }> {
  const now = Date.now();
  let sent = 0;
  let cancelled = 0;
  let errors = 0;

  for (const followUp of scheduledFollowUps) {
    // Skip already processed
    if (followUp.cancelled || followUp.sentAt) continue;

    // Not yet due
    if (followUp.scheduledAt.getTime() > now) continue;

    // PEN-04: Don't send during quiet hours (11 PM - 8 AM Saudi time)
    if (isQuietHours()) {
      // Reschedule to 8 AM next morning
      followUp.scheduledAt = getNextAllowedSendTime();
      continue;
    }

    // Safety: Re-check weekly limit at send time
    if (!canSendThisWeek(followUp.merchantId, followUp.customerPhone)) {
      followUp.cancelled = true;
      cancelled++;
      continue;
    }

    // Check humanTakeover (from DB)
    try {
      const pool = await getPool();
      if (pool) {
        const [convRows] = await pool.execute(
          `SELECT human_takeover FROM conversations 
           WHERE id = ? AND merchant_id = ?
           LIMIT 1`,
          [followUp.conversationId, followUp.merchantId]
        );
        if (Array.isArray(convRows) && (convRows as any[])[0]?.human_takeover) {
          followUp.cancelled = true;
          cancelled++;
          console.log(`[FollowUp] Cancelled — human takeover active for conv ${followUp.conversationId}`);
          continue;
        }
      }
    } catch { /* proceed if can't check */ }

    // Send the message
    try {
      // Get merchant's WhatsApp instance (same pattern as smart-escalation)
      const instances = await getWhatsAppInstancesByMerchantId(followUp.merchantId);
      const activeInstance = (instances as any[]).find((i: any) => i.status === 'active');
      
      if (!activeInstance?.instanceId) {
        throw new Error('No active WhatsApp instance');
      }

      await sendMessageWithCredentials(
        activeInstance.instanceId,
        activeInstance.token,
        activeInstance.apiUrl || 'https://api.green-api.com',
        followUp.customerPhone,
        followUp.messageTemplate
      );

      followUp.sentAt = new Date();
      recordWeeklySend(followUp.merchantId, followUp.customerPhone);
      sent++;
      console.log(`[FollowUp] ✅ Sent ${followUp.followUpType} to ***${followUp.customerPhone.slice(-4)}`);
    } catch (err: any) {
      errors++;
      console.error(`[FollowUp] ❌ Failed to send to ***${followUp.customerPhone.slice(-4)}:`, err.message);
    }
  }

  // Cleanup: Remove old processed entries (older than 7 days)
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const beforeCount = scheduledFollowUps.length;
  for (let i = scheduledFollowUps.length - 1; i >= 0; i--) {
    const f = scheduledFollowUps[i];
    if ((f.sentAt || f.cancelled) && f.scheduledAt.getTime() < weekAgo) {
      scheduledFollowUps.splice(i, 1);
    }
  }
  const cleaned = beforeCount - scheduledFollowUps.length;

  console.log(`[FollowUp] Run complete: ${sent} sent, ${cancelled} cancelled, ${errors} errors, ${cleaned} cleaned`);

  // PEN-05: Clean stale weeklySends entries
  const currentWeek = getWeekStart();
  const weekKeys = Array.from(weeklySends.keys());
  for (const key of weekKeys) {
    const rec = weeklySends.get(key);
    if (rec && rec.weekStart < currentWeek) {
      weeklySends.delete(key);
    }
  }

  return { sent, cancelled, errors };
}

/**
 * Get follow-up stats (for dashboard/debugging).
 */
export function getFollowUpStats(): {
  totalScheduled: number;
  pending: number;
  sent: number;
  cancelled: number;
} {
  return {
    totalScheduled: scheduledFollowUps.length,
    pending: scheduledFollowUps.filter(f => !f.cancelled && !f.sentAt).length,
    sent: scheduledFollowUps.filter(f => !!f.sentAt).length,
    cancelled: scheduledFollowUps.filter(f => f.cancelled).length,
  };
}
