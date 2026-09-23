/**
 * Closing Engine — Determines WHEN and HOW to close the sale
 * 
 * Analyzes conversation signals to decide the optimal closing moment.
 * Works WITH the Strategist — doesn't replace it.
 * 
 * Signals:
 *   - Customer asked about price 2+ times → "time to close"
 *   - Customer said "تمام" / "أبي" after objection → "smooth close"  
 *   - Customer in golden hour + high momentum → "urgent close"
 *   - Customer picked a product → "ask for commitment"
 * 
 * Output: A closing directive injected into the Mission Block prompt.
 */

import type { CustomerIntent, ConversationSession } from './session-context';
import type { CustomerProfile } from '../db/customer-intelligence';
import { isSalesRefusal, isShortAffirmation, pendingDecisionFromQuestion } from './customer-decision';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ClosingMode =
  | 'none'                // Not ready to close
  | 'soft_close'          // "تبي أحجز لك؟" — low pressure
  | 'direct_close'        // "أرسل لك رابط الدفع؟" — clear CTA
  | 'urgency_close'       // "باقي 2 فقط!" — scarcity + time pressure
  | 'assumptive_close'    // "خلني أجهز طلبك..." — assume the sale
  | 'recovery_close';     // "شفت إنك ما كملت..." — re-engage

export interface ClosingDirective {
  mode: ClosingMode;
  confidence: number;         // 0-100: how confident we are this is the right time
  prompt: string;             // Instructions injected into GPT
  suggestedCTA?: string;      // Specific CTA text suggestion
}

// ═══════════════════════════════════════════════════════════════
// Signal Detection
// ═══════════════════════════════════════════════════════════════

interface ClosingSignals {
  priceInquiryCount: number;       // How many times they asked about price
  positiveAfterObjection: boolean; // Said "تمام" after objecting
  productSelected: boolean;        // Mentioned a specific product
  paymentMentioned: boolean;       // Asked about payment/delivery
  highMomentum: boolean;           // Multiple messages in short time
  abandonedCartExists: boolean;    // Has abandoned cart
  isGoldenHour: boolean;           // Conductor says golden hour
}

/**
 * Analyze message and conversation history for closing signals.
 */
function detectClosingSignals(
  message: string,
  previousMessages: Array<{ role: string; content: string }>,
  session: ConversationSession | null,
  intent: CustomerIntent,
  hasAbandonedCart: boolean,
  isGoldenHour: boolean,
): ClosingSignals {
  const msg = message.toLowerCase();
  const allMessages = previousMessages.filter(m => m.role === 'user').map(m =>
    typeof m.content === 'string' ? m.content.toLowerCase() : ''
  );

  // Count price inquiries in conversation
  const priceKeywords = ['كم', 'سعر', 'أسعار', 'price', 'cost', 'كم سعر', 'بكم'];
  let priceInquiryCount = 0;
  for (const m of allMessages) {
    if (priceKeywords.some(k => m.includes(k))) priceInquiryCount++;
  }
  if (priceKeywords.some(k => msg.includes(k))) priceInquiryCount++;

  // Positive signals after objection phase
  const positiveAfterObjection = (
    (session?.customerIntent === 'objecting' || session?.persuasionUsed?.includes('proactive_discount')) &&
    isShortAffirmation(message) &&
    pendingDecisionFromQuestion(previousMessages.filter(m => m.role === 'assistant').at(-1)?.content) === 'purchase'
  );

  // Product selection signals
  const productSelected = /أبي هذا|أبغى هذا|هذا اللي أبيه|أبي الأول|الثاني|أختار|اختار|i want this|this one/.test(msg);

  // Payment signals (NOT delivery/shipping inquiries — those are just logistics questions)
  const paymentMentioned = /كيف أدفع|طريقة الدفع|payment|أدفع|visa|مدى|apple pay|تحويل|ادفع|الدفع/.test(msg);

  // High momentum: 5+ messages in session
  const highMomentum = (session?.messageCount || 0) >= 5;

  return {
    priceInquiryCount,
    positiveAfterObjection: !!positiveAfterObjection,
    productSelected,
    paymentMentioned,
    highMomentum,
    abandonedCartExists: hasAbandonedCart,
    isGoldenHour,
  };
}

// ═══════════════════════════════════════════════════════════════
// Closing Decision Engine
// ═══════════════════════════════════════════════════════════════

/**
 * Build a closing directive based on conversation signals.
 * Returns { mode: 'none' } if it's not the right time to close.
 */
export function buildClosingDirective(params: {
  message: string;
  intent: CustomerIntent;
  previousMessages: Array<{ role: string; content: string }>;
  session: ConversationSession | null;
  customerProfile: CustomerProfile | null;
  hasAbandonedCart: boolean;
  isGoldenHour: boolean;
}): ClosingDirective {
  const { message, intent, previousMessages, session, customerProfile, hasAbandonedCart, isGoldenHour } = params;

  // Don't try to close in these states
  if (intent === 'declined' || isSalesRefusal(message) || intent === 'post_purchase' || intent === 'browsing') {
    return { mode: 'none', confidence: 0, prompt: '' };
  }

  // Don't close on first message
  if (!session || session.messageCount < 2) {
    return { mode: 'none', confidence: 0, prompt: '' };
  }

  const signals = detectClosingSignals(
    message, previousMessages, session, intent, hasAbandonedCart, isGoldenHour,
  );

  // ── 1. DIRECT CLOSE: Customer already wants to buy ──
  if (intent === 'ready_to_buy') {
    return {
      mode: 'direct_close',
      confidence: 95,
      prompt: buildDirectClosePrompt(),
      suggestedCTA: 'أرسل لك رابط الطلب؟',
    };
  }

  // ── 2. ASSUMPTIVE CLOSE: Positive after objection ──
  if (signals.positiveAfterObjection) {
    return {
      mode: 'soft_close',
      confidence: 85,
      prompt: buildAssumptiveClosePrompt(),
      suggestedCTA: 'نراجع تفاصيل طلبك؟',
    };
  }

  // ── 3. SOFT CLOSE: Product selected but hasn't committed ──
  if (signals.productSelected && !signals.paymentMentioned) {
    return {
      mode: 'soft_close',
      confidence: 75,
      prompt: buildSoftClosePrompt(),
      suggestedCTA: 'تبي أحجز لك؟',
    };
  }

  // ── 4. URGENCY CLOSE: Golden hour + high momentum + price asked 2+ times ──
  if (signals.isGoldenHour && signals.highMomentum && signals.priceInquiryCount >= 2) {
    return {
      mode: 'soft_close',
      confidence: 80,
      prompt: buildSoftClosePrompt(),
      suggestedCTA: 'تحب نراجع التفاصيل ونكمل؟',
    };
  }

  // ── 5. RECOVERY CLOSE: Has abandoned cart ──
  if (signals.abandonedCartExists && intent !== 'objecting') {
    return {
      mode: 'recovery_close',
      confidence: 70,
      prompt: buildRecoveryClosePrompt(),
      suggestedCTA: 'تبي أكمل طلبك السابق؟',
    };
  }

  // ── 6. SOFT CLOSE: Asked price 2+ times = serious interest ──
  if (signals.priceInquiryCount >= 2 && signals.highMomentum) {
    return {
      mode: 'soft_close',
      confidence: 65,
      prompt: buildSoftClosePrompt(),
    };
  }

  return { mode: 'none', confidence: 0, prompt: '' };
}

// ═══════════════════════════════════════════════════════════════
// Prompt Builders
// ═══════════════════════════════════════════════════════════════

function buildDirectClosePrompt(): string {
  return `
## 🎯 إغلاق مباشر — العميل جاهز:
- العميل أبدى رغبة واضحة بالشراء/الحجز
- اطلب منه الخطوة التالية مباشرة: "أرسل لك رابط الطلب؟" أو "كم القطع؟"
- راجع الخيار والكمية والسعر النهائي وما ينقص الاتفاق
- نفذ فقط الاتفاق الذي وافق عليه العميل؛ تغير السعر أو الخيارات يحتاج تأكيداً جديداً
- لا تقل إن الطلب أو الدفع نجح قبل وجود نتيجة مؤكدة من الأداة
`;
}

function buildAssumptiveClosePrompt(): string {
  return `
## 🤝 تأكيد الخطوة المتفق عليها:
- الموافقة تخص سؤال التأكيد السابق فقط؛ لا توسعها إلى خصم أو منتج أو كمية جديدة
- راجع تفاصيل الاتفاق الناقصة قبل التنفيذ
- لا تدّع إنشاء طلب أو حجز حتى تعيد الأداة نتيجة نجاح مؤكدة
`;
}

function buildSoftClosePrompt(): string {
  return `
## 💬 إغلاق ناعم — العميل مهتم لكن لم يلتزم:
- العميل اختار منتج أو سأل عن السعر أكثر من مرة = اهتمام حقيقي
- اقترح خطوة مناسبة للاهتمام: "تحب نراجع الخيارات؟" أو "أرسل لك التفاصيل؟"
- لا تضغط — اجعله يشعر بالسيطرة
- لا تعد بحجز مجاني أو تجربة أو ندرة إلا إذا كانت سياسة معتمدة موثقة في السياق
`;
}

function buildUrgencyClosePrompt(): string {
  return `
## ⏰ إغلاق عاجل — وقت ذهبي + اهتمام عالي:
- العميل في وقت ذهبي للشراء ومهتم جداً
- لا تستنتج ندرة من الوقت أو كثرة الرسائل؛ يلزم مصدر مخزون أو عرض مؤرخ
- لا تستخدم ضغطاً زمنياً دون موعد انتهاء معتمد
- اقترح خطوة فورية: "تبي أحجز لك قبل ينتهي؟"
`;
}

function buildRecoveryClosePrompt(): string {
  return `
## 🔄 إغلاق استرداد — سلة مهجورة:
- العميل عنده طلب سابق ما كمله
- اذكرها بشكل طبيعي: "لاحظت إنك ما كملت طلبك — تحتاج مساعدة؟"
- لا تضغط — اسأل فقط
- إذا أبدى اهتمام، ساعده يكمل فوراً
`;
}
