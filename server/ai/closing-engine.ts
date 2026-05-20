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
  const allMessages = previousMessages.map(m => 
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
    /تمام|أوك|ok|ماشي|طيب|خلاص|أبي|أبغى|يلا/.test(msg)
  );

  // Product selection signals
  const productSelected = /أبي هذا|أبغى هذا|هذا اللي أبيه|أبي الأول|الثاني|أختار|اختار|i want this|this one/.test(msg);

  // Payment/delivery signals
  const paymentMentioned = /كيف أدفع|طريقة الدفع|payment|توصيل|شحن|عنوان|أدفع|visa|مدى|apple pay|تحويل/.test(msg);

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
  if (intent === 'post_purchase' || intent === 'browsing') {
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
  if (intent === 'ready_to_buy' || signals.paymentMentioned) {
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
      mode: 'assumptive_close',
      confidence: 85,
      prompt: buildAssumptiveClosePrompt(),
      suggestedCTA: 'خلني أجهز طلبك...',
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
      mode: 'urgency_close',
      confidence: 80,
      prompt: buildUrgencyClosePrompt(),
      suggestedCTA: 'الطلب عليه ضغط — تبي أحجز لك قبل ينتهي؟',
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
- لا تشرح مميزات — وقت الشرح انتهى
- كن واثق وسلس: "تمام، خلني أجهز لك..."
- ⚠️ لا تسأل "هل تبغى تشتري؟" — افترض الشراء
`;
}

function buildAssumptiveClosePrompt(): string {
  return `
## 🤝 إغلاق افتراضي — العميل وافق بعد اعتراض:
- العميل قال "تمام/أوك/ماشي" بعد ما كان معترض → هذا موافقة!
- لا تسأل مرة ثانية — انتقل للخطوة التالية
- "تمام! خلني أجهز طلبك..." أو "حلو! أحجز لك الآن؟"
- ⚠️ أي تأخير هنا قد يفقدك العميل
`;
}

function buildSoftClosePrompt(): string {
  return `
## 💬 إغلاق ناعم — العميل مهتم لكن لم يلتزم:
- العميل اختار منتج أو سأل عن السعر أكثر من مرة = اهتمام حقيقي
- اسأل سؤال يفترض الشراء: "تبي أحجز لك؟" أو "أرسل لك التفاصيل؟"
- لا تضغط — اجعله يشعر بالسيطرة
- استخدم "بدون التزام": "تبي أحجز لك مبدئياً بدون التزام؟"
`;
}

function buildUrgencyClosePrompt(): string {
  return `
## ⏰ إغلاق عاجل — وقت ذهبي + اهتمام عالي:
- العميل في وقت ذهبي للشراء ومهتم جداً
- استخدم ندرة طبيعية: "الطلب عليه ضغط" أو "باقي كمية محدودة"
- ⚠️ لا تكذب — استخدم فقط ندرة حقيقية أو ضمنية
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
