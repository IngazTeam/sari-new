/**
 * Smart Escalation Protocol — Cascading Multi-Phone Escalation
 * 
 * When the bot doesn't know an answer:
 * 1. Respond professionally — "Let me check with the team" (NOT "call this number")
 * 2. Alert phone #1 in the escalation chain via WhatsApp
 * 3. If no reply after 5 minutes → cascade to phone #2
 * 4. If no reply after another 5 min → cascade to phone #3
 * 5. If ALL phones exhausted → send customer a professional apology
 * 6. When ANY contact replies — relay the answer to the customer + cache Q&A
 * 
 * Based on professional customer service frameworks:
 * - Acknowledge & validate the question
 * - Set clear expectations (timeframe)
 * - Follow up proactively
 * - Never send customers to external channels
 */

import { getMerchantById, getWhatsAppInstancesByMerchantId } from '../db';
import { sendMessageWithCredentials } from '../whatsapp';
import {
  createEscalation,
  markEscalationNotified,
  updateEscalationLevel,
  markEscalationExhausted,
  resolveEscalation,
  getActiveEscalation,
  getEscalationsNeedingCascade,
  type EscalationItem,
} from '../db/learning';
import { cacheSuccessfulResponse } from './rag-engine';
import { captureSignal } from '../db/learning';
import { sendNotification } from '../_core/notificationService';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// Escalation Contact Chain Types
// ═══════════════════════════════════════════════════════════════

export interface EscalationContact {
  phone: string;
  label: string;
  order: number;
}

// ═══════════════════════════════════════════════════════════════
// Professional Hold Responses — What Sari tells the customer
// ═══════════════════════════════════════════════════════════════

const HOLD_RESPONSES_BUSINESS_HOURS = [
  'سؤال ممتاز! 👌 أبغى أتأكد من المعلومة الدقيقة عشان ما أعطيك شي غلط. خلني أرجع لك خلال دقائق 🙏',
  'سؤال مهم 🎯 خلني أرجع للفريق المختص عشان أعطيك الإجابة الصحيحة. ما يأخذ وقت إن شاء الله!',
  'أحب أتأكد وأعطيك المعلومة الأكيدة ✅ خلني أتحقق وأرد عليك بأسرع وقت!',
];

const HOLD_RESPONSES_AFTER_HOURS = [
  'شكراً على سؤالك! ☺️ سؤالك مسجل عندي وبرد عليك أول ما أحصل الجواب — غالباً خلال الصباح 🌅',
  'سؤال حلو! 👌 الفريق مو متوفر حالياً لكن سؤالك مسجل — بكرة الصبح بإذن الله أرد عليك',
];

const FOLLOW_UP_RESPONSES = [
  'مرحباً 👋 لسا أتابع موضوعك — ما نسيتك! أعدك أرد عليك اليوم إن شاء الله 🙏',
  'أهلاً! لسا أنتظر الجواب من الفريق — بس تأكد إنك أولوية عندي! 🎯',
];

/** Final message when ALL escalation contacts have been exhausted */
const EXHAUSTION_MESSAGE = 'شكراً على صبرك! 🙏 سجلنا استفسارك وسنرد عليك في أقرب وقت ممكن. تقدر تسأل نفس السؤال لاحقاً وبيكون الجواب جاهز إن شاء الله ✅';

// ═══════════════════════════════════════════════════════════════
// Alert Message Templates — per escalation level
// ═══════════════════════════════════════════════════════════════

function buildAlertMessage(params: {
  customerName: string;
  customerPhone: string;
  question: string;
  level: number;
  totalLevels: number;
}): string {
  const { customerName, customerPhone, question, level } = params;
  const q = question.substring(0, 300);
  // PEN-ESC-06 FIX: Mask customer phone to protect privacy (PDPL compliance)
  const maskedPhone = customerPhone.length > 6
    ? customerPhone.slice(0, 3) + '***' + customerPhone.slice(-3)
    : '***';

  if (level === 0) {
    // Level 1 — Initial alert
    return `🔔 *تنبيه من ساري — سؤال عميل*

👤 *العميل:* ${customerName} (${maskedPhone})
❓ *السؤال:* ${q}

💡 *رد على هذه الرسالة بالجواب وساري سيوصله للعميل تلقائياً*
⏰ العميل ينتظر ردك...`;
  }

  if (level === 1) {
    // Level 2 — Escalated (5 min passed)
    return `🔴 *تصعيد عاجل من ساري — لم يُرد على سؤال العميل*

👤 *العميل:* ${customerName} (${maskedPhone})
❓ *السؤال:* ${q}

⚠️ لم يرد المسؤول الأول خلال 5 دقائق
💡 *رد على هذه الرسالة بالجواب وساري سيوصله للعميل فوراً*`;
  }

  // Level 3+ — Final escalation
  const minutesPassed = (level + 1) * 5;
  return `🚨 *تصعيد أخير من ساري — عميل ينتظر!*

👤 *العميل:* ${customerName} (${maskedPhone})
❓ *السؤال:* ${q}

⛔ لم يرد أحد خلال ${minutesPassed} دقيقة — العميل ما زال ينتظر!
💡 *رد على هذه الرسالة الآن لإنقاذ العميل*`;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Get merchant's escalation phone chain
// ═══════════════════════════════════════════════════════════════

// PEN-ESC-07 FIX: Schema validation for escalation chain JSON
const escalationChainSchema = z.array(z.object({
  phone: z.string().min(1),
  label: z.string().default(''),
  order: z.number().int().min(1).max(10),
})).max(5);

async function getEscalationChain(merchantId: number): Promise<EscalationContact[]> {
  const merchant = await getMerchantById(merchantId);
  if (!merchant) return [];

  // Try JSON escalation chain first — with schema validation
  try {
    const raw = (merchant as any).escalationPhones;
    if (raw) {
      const parsed = JSON.parse(raw);
      const chain = escalationChainSchema.parse(parsed);
      if (chain.length > 0) return chain.sort((a, b) => a.order - b.order);
    }
  } catch (parseErr: any) {
    console.warn(`[Escalation] Invalid escalation_phones JSON for merchant ${merchantId}:`, parseErr.message);
  }

  // Fallback to legacy single phone
  const phone = (merchant as any).emergencyPhone || merchant.phone;
  if (phone) return [{ phone, label: 'المسؤول', order: 1 }];

  return [];
}

// ═══════════════════════════════════════════════════════════════
// Core Escalation Logic
// ═══════════════════════════════════════════════════════════════

/**
 * Handle a knowledge gap professionally.
 * Returns the hold message to send to the customer.
 */
export async function handleSmartEscalation(params: {
  merchantId: number;
  conversationId: number;
  customerPhone: string;
  customerName?: string;
  customerQuestion: string;
  botResponse?: string;
}): Promise<string> {
  try {
    // 1. Create escalation entry
    const escalationId = await createEscalation({
      merchantId: params.merchantId,
      conversationId: params.conversationId,
      customerPhone: params.customerPhone,
      customerName: params.customerName,
      question: params.customerQuestion,
      botResponse: params.botResponse,
      priority: 'standard',
    });

    if (!escalationId) {
      // Fallback: couldn't create escalation — return a professional generic response
      return HOLD_RESPONSES_BUSINESS_HOURS[0];
    }

    // 2. Alert first contact in the chain (fire-and-forget)
    notifyEscalationContact({
      merchantId: params.merchantId,
      escalationId,
      customerPhone: params.customerPhone,
      customerName: params.customerName || 'عميل',
      question: params.customerQuestion,
      level: 0, // First contact
    }).catch(err => console.warn('[Escalation] Merchant notification failed:', err.message));

    // 3. Capture learning signal
    captureSignal({
      merchantId: params.merchantId,
      conversationId: params.conversationId,
      signalType: 'knowledge_gap',
      signalWeight: 1.5,
      customerMessage: params.customerQuestion.substring(0, 500),
      botMessage: params.botResponse?.substring(0, 500),
      contextSummary: 'تم تصعيد السؤال للتاجر عبر بروتوكول التصعيد الذكي',
    }).catch(() => {});

    // 4. Choose response based on time of day
    const hour = new Date().getHours();
    const isBusinessHours = hour >= 8 && hour < 22;

    if (isBusinessHours) {
      const idx = Math.floor(Math.random() * HOLD_RESPONSES_BUSINESS_HOURS.length);
      return HOLD_RESPONSES_BUSINESS_HOURS[idx];
    } else {
      const idx = Math.floor(Math.random() * HOLD_RESPONSES_AFTER_HOURS.length);
      return HOLD_RESPONSES_AFTER_HOURS[idx];
    }
  } catch (err: any) {
    console.error('[Escalation] handleSmartEscalation failed:', err.message);
    return HOLD_RESPONSES_BUSINESS_HOURS[0];
  }
}

// ═══════════════════════════════════════════════════════════════
// Notify Escalation Contact — Send alert to specific phone
// ═══════════════════════════════════════════════════════════════

/**
 * Send escalation alert to a specific contact in the chain.
 * Level 0 = first contact, Level 1 = second, etc.
 */
async function notifyEscalationContact(params: {
  merchantId: number;
  escalationId: number;
  customerPhone: string;
  customerName: string;
  question: string;
  level: number;
}): Promise<void> {
  const chain = await getEscalationChain(params.merchantId);

  if (chain.length === 0) {
    console.warn(`[Escalation] No escalation phones for merchant ${params.merchantId} — using push only`);
    await sendNotification({
      merchantId: params.merchantId,
      type: 'new_message',
      title: '❓ سؤال عميل يحتاج ردك',
      body: `عميل ${params.customerName} يسأل: "${params.question.substring(0, 100)}"`,
      url: '/merchant/conversations',
      metadata: { escalationId: params.escalationId, customerPhone: params.customerPhone },
    });
    return;
  }

  // Which phone to notify at this level?
  const contact = chain[params.level];
  if (!contact) {
    // All phones exhausted — this shouldn't happen here, handled by cascading job
    console.warn(`[Escalation] Level ${params.level} exceeds chain length ${chain.length}`);
    return;
  }

  // Get bot's WhatsApp instance
  const instances = await getWhatsAppInstancesByMerchantId(params.merchantId);
  const activeInstance = instances.find((i: any) => i.status === 'active');

  if (!activeInstance) {
    console.warn(`[Escalation] No active WhatsApp instance for merchant ${params.merchantId}`);
    await sendNotification({
      merchantId: params.merchantId,
      type: 'new_message',
      title: '❓ سؤال عميل يحتاج ردك',
      body: `عميل ${params.customerName} يسأل: "${params.question.substring(0, 100)}"`,
      url: '/merchant/conversations',
    });
    return;
  }

  // Build message based on escalation level
  const alertMessage = buildAlertMessage({
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    question: params.question,
    level: params.level,
    totalLevels: chain.length,
  });

  try {
    await sendMessageWithCredentials(
      (activeInstance as any).instanceId,
      (activeInstance as any).token,
      (activeInstance as any).apiUrl || 'https://api.green-api.com',
      contact.phone,
      alertMessage
    );

    await markEscalationNotified(params.escalationId, params.merchantId, params.level);
    const levelLabel = params.level === 0 ? 'أول' : params.level === 1 ? 'ثاني' : `${params.level + 1}`;
    console.log(`[Escalation] ✅ Level ${params.level + 1} (${contact.label || levelLabel}) notified: ${contact.phone.slice(-4)}`);
  } catch (err: any) {
    console.error(`[Escalation] WhatsApp notification failed for level ${params.level}:`, err.message);
    // Fallback to push
    await sendNotification({
      merchantId: params.merchantId,
      type: 'new_message',
      title: '❓ سؤال عميل يحتاج ردك',
      body: `عميل ${params.customerName} يسأل: "${params.question.substring(0, 100)}"`,
      url: '/merchant/conversations',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Cascading Job — Check & escalate to next phone every minute
// ═══════════════════════════════════════════════════════════════

/**
 * Process pending escalations that need cascading.
 * Called by a background interval (every 60 seconds).
 * If 5 minutes passed without reply → try next phone in chain.
 * If all phones exhausted → send customer apology.
 */
export async function processCascadingEscalations(): Promise<number> {
  try {
    const pending = await getEscalationsNeedingCascade();
    if (pending.length === 0) return 0;

    let processed = 0;

    for (const escalation of pending) {
      const esc = escalation as any; // raw DB row with snake_case
      const merchantId = esc.merchant_id || esc.merchantId;
      const currentLevel = esc.current_escalation_level ?? esc.currentEscalationLevel ?? 0;
      const nextLevel = currentLevel + 1;

      const chain = await getEscalationChain(merchantId);

      if (nextLevel >= chain.length) {
        // ═══ All phones exhausted — send customer apology ═══
        console.log(`[Escalation] ⛔ All ${chain.length} contacts exhausted for escalation #${esc.id} — sending apology to customer`);

        // Send apology to customer
        const instances = await getWhatsAppInstancesByMerchantId(merchantId);
        const activeInstance = instances.find((i: any) => i.status === 'active');
        const customerPhone = esc.customer_phone || esc.customerPhone;

        if (activeInstance && customerPhone) {
          try {
            await sendMessageWithCredentials(
              (activeInstance as any).instanceId,
              (activeInstance as any).token,
              (activeInstance as any).apiUrl || 'https://api.green-api.com',
              customerPhone,
              EXHAUSTION_MESSAGE
            );
            console.log(`[Escalation] 📩 Apology sent to customer ${customerPhone.slice(-4)}`);
          } catch (sendErr: any) {
            console.error(`[Escalation] Failed to send apology:`, sendErr.message);
          }
        }

        await markEscalationExhausted(esc.id, merchantId);
        processed++;
        continue;
      }

      // ═══ Cascade to next phone ═══
      console.log(`[Escalation] 🔁 Cascading escalation #${esc.id} to level ${nextLevel + 1}/${chain.length}`);

      await notifyEscalationContact({
        merchantId,
        escalationId: esc.id,
        customerPhone: esc.customer_phone || esc.customerPhone,
        customerName: esc.customer_name || esc.customerName || 'عميل',
        question: esc.question,
        level: nextLevel,
      });

      processed++;
    }

    if (processed > 0) {
      console.log(`[Escalation] 🔄 Processed ${processed} cascading escalation(s)`);
    }
    return processed;
  } catch (err: any) {
    console.error('[Escalation] processCascadingEscalations failed:', err.message);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// Merchant Reply Handler — Relay answer to customer
// ═══════════════════════════════════════════════════════════════

/**
 * Handle merchant's reply to an escalation.
 * Called from webhook when ANY phone in the chain sends a reply.
 */
export async function handleMerchantEscalationReply(params: {
  merchantId: number;
  merchantPhone: string;
  replyText: string;
}): Promise<{ handled: boolean; escalation?: EscalationItem }> {
  try {
    // Find active escalation for this merchant
    // The merchant's reply comes from their personal number (any phone in the chain)
    const resolved = await resolveEscalation({
      merchantId: params.merchantId,
      customerPhone: '', // We need to find by merchant, not customer
      merchantAnswer: params.replyText,
    });

    if (!resolved) return { handled: false };

    // Get WhatsApp instance to send reply to customer
    const instances = await getWhatsAppInstancesByMerchantId(params.merchantId);
    const activeInstance = instances.find((i: any) => i.status === 'active');

    if (activeInstance && resolved.customerPhone) {
      // PEN-GAP-04 FIX: Sanitize reply before sending to customer AND caching
      const safeReplyText = params.replyText
        .substring(0, 2000)
        .replace(/https?:\/\/[^\s]+/g, '[رابط]')      // Strip raw URLs
        .replace(/\[.*?\]\(.*?\)/g, '[رابط]');          // Strip markdown links

      // Build a natural response incorporating the merchant's sanitized answer
      const customerReply = `أهلاً مجدداً! 😊 حصلت لك الجواب:\n\n${safeReplyText}\n\nهل فيه شي ثاني أقدر أساعدك فيه؟ 🙏`;

      await sendMessageWithCredentials(
        (activeInstance as any).instanceId,
        (activeInstance as any).token,
        (activeInstance as any).apiUrl || 'https://api.green-api.com',
        resolved.customerPhone,
        customerReply
      );

      console.log(`[Escalation] ✅ Answer delivered to customer ***${resolved.customerPhone?.slice(-4)}`);

      // Cache this Q&A for future reuse — the bot learns permanently
      try {
        await cacheSuccessfulResponse(
          params.merchantId,
          resolved.question,
          safeReplyText
        );
        console.log(`[Escalation] 🧬 Q&A cached for future use (sanitized)`);
      } catch { /* cache is optional */ }
    }

    return { handled: true, escalation: resolved };
  } catch (err: any) {
    console.error('[Escalation] handleMerchantEscalationReply failed:', err.message);
    return { handled: false };
  }
}

/**
 * Check if a phone number belongs to a merchant's escalation chain.
 * Used by the webhook to detect if an incoming message is an escalation reply.
 */
export async function isPhoneInEscalationChain(merchantId: number, phone: string): Promise<boolean> {
  const chain = await getEscalationChain(merchantId);
  // Normalize: strip symbols + convert Saudi local 05→966
  const normalize = (p: string) => {
    let n = p.replace(/[\s+\-()]/g, '');
    if (/^05\d{8}$/.test(n)) n = '966' + n.slice(1);
    return n;
  };
  const normalizedPhone = normalize(phone);
  return chain.some(c => normalize(c.phone) === normalizedPhone);
}

/**
 * Get a follow-up message for waiting customers.
 * Called periodically (e.g., every 15 minutes).
 */
export function getFollowUpMessage(): string {
  const idx = Math.floor(Math.random() * FOLLOW_UP_RESPONSES.length);
  return FOLLOW_UP_RESPONSES[idx];
}

// ═══════════════════════════════════════════════════════════════
// Knowledge Gap Digest — Daily/Weekly summary for merchant
// ═══════════════════════════════════════════════════════════════

/**
 * Build and send daily knowledge gap digest.
 * Shows the merchant what customers are asking about that the bot can't answer.
 */
export async function sendKnowledgeGapDigest(merchantId: number): Promise<void> {
  try {
    const { getDailyKnowledgeGaps } = await import('../db/learning');
    const gaps = await getDailyKnowledgeGaps(merchantId);

    if (gaps.length === 0) return;

    const gapList = gaps
      .map((g, i) => `${i + 1}. "${g.question.substring(0, 80)}" — سأل عنها ${g.count} عميل`)
      .join('\n');

    const body = `❓ أسئلة لم أجد لها إجابة اليوم:\n${gapList}\n\n💡 أضف هذه المعلومات في عقل ساري لأتمكن من الرد تلقائياً في المستقبل`;

    await sendNotification({
      merchantId,
      type: 'custom',
      title: '📋 تقرير ساري — فجوات المعرفة',
      body,
      url: '/merchant/sari-brain',
      metadata: { type: 'knowledge_gap_digest', gapCount: gaps.length },
    });

    console.log(`[Escalation] 📋 Gap digest sent to merchant ${merchantId}: ${gaps.length} gaps`);
  } catch (err: any) {
    console.error('[Escalation] Gap digest failed:', err.message);
  }
}
