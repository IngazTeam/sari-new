/** Closing guidance follows current intent and the previous question.
 * Message volume, repeated price questions and time of day are not consent or scarcity evidence. */

import type { CustomerIntent, ConversationSession } from './session-context';
import type { CustomerProfile } from '../db/customer-intelligence';
import { isSalesRefusal, isShortAffirmation, isPurchaseProcessQuestion, pendingDecisionFromQuestion } from './customer-decision';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ClosingMode =
  | 'none'                // Not ready to close
  | 'soft_close'          // Review a selected option without assuming execution consent
  | 'direct_close'        // "أرسل لك رابط الدفع؟" — clear CTA
  | 'urgency_close'       // Legacy mode; no longer inferred by this engine
  | 'assumptive_close'    // Legacy mode; no longer inferred by this engine
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
  positiveAfterObjection: boolean; // Said "تمام" after objecting
  productSelected: boolean;        // Mentioned a specific product
  paymentMentioned: boolean;       // Asked about payment/delivery
  abandonedCartExists: boolean;    // Has abandoned cart
}

/**
 * Analyze message and conversation history for closing signals.
 */
function detectClosingSignals(
  message: string,
  previousMessages: Array<{ role: string; content: string }>,
  session: ConversationSession | null,
  hasAbandonedCart: boolean,
): ClosingSignals {
  const msg = message.toLowerCase();
  // Positive signals after objection phase
  const positiveAfterObjection = (
    (session?.customerIntent === 'objecting' || session?.persuasionUsed?.includes('proactive_discount')) &&
    isShortAffirmation(message) &&
    pendingDecisionFromQuestion(previousMessages.filter(m => m.role === 'assistant').at(-1)?.content) === 'purchase'
  );

  // Product selection signals
  const productSelected = !/[?؟]|بكم|كم سعر|how much|what is/i.test(msg) && /أبي هذا|أبغى هذا|هذا اللي أبيه|أبي الأول|أختار|اختار|i want this|i choose/i.test(msg);

  // Payment signals (NOT delivery/shipping inquiries — those are just logistics questions)
  const paymentMentioned = /كيف أدفع|طريقة الدفع|payment|أدفع|visa|مدى|apple pay|تحويل|ادفع|الدفع/.test(msg);

  return {
    positiveAfterObjection: !!positiveAfterObjection,
    productSelected,
    paymentMentioned,
    abandonedCartExists: hasAbandonedCart,
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
  const { message, intent, previousMessages, session, hasAbandonedCart } = params;

  // Don't try to close in these states
  if (intent === 'declined' || isSalesRefusal(message) || isPurchaseProcessQuestion(message) || intent === 'post_purchase' || intent === 'browsing') {
    return { mode: 'none', confidence: 0, prompt: '' };
  }

  // Don't close on first message
  if (!session || session.messageCount < 2) {
    return { mode: 'none', confidence: 0, prompt: '' };
  }

  const lastAssistant = previousMessages.filter(m => m.role === 'assistant').at(-1)?.content;
  if (isShortAffirmation(message) && pendingDecisionFromQuestion(lastAssistant) !== 'purchase') {
    return { mode: 'none', confidence: 0, prompt: '' };
  }

  const signals = detectClosingSignals(
    message, previousMessages, session, hasAbandonedCart,
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
      suggestedCTA: 'تحب نراجع تفاصيل الخيار؟',
    };
  }

  // ── 5. RECOVERY CLOSE: Has abandoned cart ──
  if (signals.abandonedCartExists && intent !== 'objecting' && /السلة|سلتي|cart/i.test(message)) {
    return {
      mode: 'recovery_close',
      confidence: 70,
      prompt: buildRecoveryClosePrompt(),
      suggestedCTA: 'تبي أكمل طلبك السابق؟',
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
- العميل أبدى اهتماماً باختيار محدد؛ هذا ليس موافقة تنفيذ
- اقترح خطوة مناسبة للاهتمام: "تحب نراجع الخيارات؟" أو "أرسل لك التفاصيل؟"
- لا تضغط — اجعله يشعر بالسيطرة
- لا تعد بحجز مجاني أو تجربة أو ندرة إلا إذا كانت سياسة معتمدة موثقة في السياق
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
