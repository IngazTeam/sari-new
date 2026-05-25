/**
 * Next Best Action (NBA) Engine
 * 
 * Unlike action-selector.ts (which picks supplementary actions AFTER the reply),
 * NBA determines the SALES DECISION BEFORE the reply is generated.
 * 
 * This is the brain that turns Sari from a "smart responder" into a
 * "sales decision maker" — it doesn't just reply well, it decides
 * what's the best move to close this deal.
 * 
 * Decision hierarchy:
 * 1. Payment actions (send link, remind, retry)
 * 2. Objection counters (price → discount, trust → social proof, etc.)
 * 3. Escalation triggers (high value, complaint, competitor)
 * 4. Follow-up scheduling (ghost recovery based on loss reason)
 * 5. Information gathering (ask qualifying questions)
 */

import { getPool } from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type NBAAction =
  | 'send_payment_link'
  | 'payment_reminder'
  | 'offer_discount'
  | 'offer_alternative'
  | 'send_social_proof'
  | 'send_testimonial'
  | 'offer_free_shipping'
  | 'escalate_to_human'
  | 'gentle_followup'
  | 'final_attempt'
  | 'ask_qualifying_question'
  | 'product_recommendation'
  | 'bundle_offer'
  | 'urgency_trigger'
  | 'continue_conversation';

export interface NBAContext {
  merchantId: number;
  conversationId: number;
  dealStage: string | null;
  lastObjection: string | null;
  customerMessage: string;
  intent: string;
  paymentLinkSent: boolean;
  timeSinceLastMessage: number; // hours
  productValue?: number;
  hasDiscount: boolean;
  messageCount: number;
  lossReason?: string | null;
}

export interface NBAResult {
  action: NBAAction;
  confidence: number; // 0-1
  reason: string; // Arabic explanation for logging
  promptInjection?: string; // Injected into the system prompt to guide the AI
  priority: 'critical' | 'high' | 'medium' | 'low';
}

// ═══════════════════════════════════════════════════════════════
// Main Decision Engine
// ═══════════════════════════════════════════════════════════════

export async function determineNextBestAction(ctx: NBAContext): Promise<NBAResult> {
  const rules = [
    // ── Priority 1: Payment Actions ──
    checkPaymentReady(ctx),
    checkPaymentReminder(ctx),

    // ── Priority 2: Objection Counters ──
    checkPriceObjection(ctx),
    checkTrustObjection(ctx),
    checkDeliveryObjection(ctx),
    checkCompetitorMention(ctx),

    // ── Priority 3: Escalation ──
    checkHighValueEscalation(ctx),
    checkComplaintEscalation(ctx),

    // ── Priority 4: Recovery ──
    checkGhostRecovery(ctx),

    // ── Priority 5: Progression ──
    checkQualifyingQuestion(ctx),
    checkUrgencyTrigger(ctx),
  ];

  // Pick the first matching rule (rules are ordered by priority)
  for (const rule of rules) {
    if (rule) return rule;
  }

  // Default: continue conversation normally
  return {
    action: 'continue_conversation',
    confidence: 1.0,
    reason: 'لا توجد حاجة لإجراء خاص — تابع المحادثة',
    priority: 'low',
  };
}

// ═══════════════════════════════════════════════════════════════
// Rule Functions
// ═══════════════════════════════════════════════════════════════

function checkPaymentReady(ctx: NBAContext): NBAResult | null {
  if (ctx.dealStage === 'ready' && !ctx.paymentLinkSent && ctx.intent === 'ready_to_buy') {
    return {
      action: 'send_payment_link',
      confidence: 0.95,
      reason: 'العميل جاهز للشراء ولم يُرسل له رابط دفع',
      promptInjection: `[تعليمات مبيعات] العميل جاهز للشراء! أرسل له رابط الدفع مباشرة مع رسالة حماسية قصيرة. لا تسأل أسئلة إضافية.`,
      priority: 'critical',
    };
  }
  return null;
}

function checkPaymentReminder(ctx: NBAContext): NBAResult | null {
  if (ctx.dealStage === 'payment_link_sent' && ctx.timeSinceLastMessage >= 2 && ctx.timeSinceLastMessage <= 24) {
    return {
      action: 'payment_reminder',
      confidence: 0.85,
      reason: `رابط دفع مُرسل منذ ${Math.round(ctx.timeSinceLastMessage)} ساعة بدون دفع`,
      promptInjection: `[تعليمات مبيعات] العميل عنده رابط دفع لم يستخدمه بعد. ذكّره بلطف بأن الطلب محجوز له. لا تضغط.`,
      priority: 'high',
    };
  }
  return null;
}

function checkPriceObjection(ctx: NBAContext): NBAResult | null {
  if (ctx.lastObjection !== 'price' && ctx.intent !== 'objecting') return null;

  const pricePatterns = /غالي|كثير|مبالغ|السعر عالي|أرخص|أقل|خصم|تخفيض|expensive|too much|cheaper/i;
  if (!pricePatterns.test(ctx.customerMessage) && ctx.lastObjection !== 'price') return null;

  if (ctx.hasDiscount) {
    return {
      action: 'offer_discount',
      confidence: 0.88,
      reason: 'اعتراض على السعر + يوجد خصم متاح',
      promptInjection: `[تعليمات مبيعات] العميل يعترض على السعر. عندك خصم متاح — اعرضه بذكاء كعرض "محدود" أو "خاص". اشرح القيمة أولاً ثم اذكر الخصم.`,
      priority: 'high',
    };
  }

  return {
    action: 'offer_alternative',
    confidence: 0.80,
    reason: 'اعتراض على السعر بدون خصم متاح',
    promptInjection: `[تعليمات مبيعات] العميل يعترض على السعر ولا يوجد خصم حالياً. اعرض بديل أرخص أو اشرح القيمة مقارنة بالسوق. لا تعد بخصم غير موجود.`,
    priority: 'high',
  };
}

function checkTrustObjection(ctx: NBAContext): NBAResult | null {
  const trustPatterns = /ما أعرفكم|مضمون|موثوق|أول مرة|مو نصب|ضمان|ما أثق|مجرب/i;
  if (!trustPatterns.test(ctx.customerMessage) && ctx.lastObjection !== 'trust') return null;

  return {
    action: 'send_social_proof',
    confidence: 0.85,
    reason: 'العميل يشك في الموثوقية',
    promptInjection: `[تعليمات مبيعات] العميل لا يثق بعد. شارك أدلة اجتماعية: عدد العملاء، تقييمات إيجابية، سنوات الخبرة، ضمان الاسترجاع. كن صادقاً ولا تبالغ.`,
    priority: 'high',
  };
}

function checkDeliveryObjection(ctx: NBAContext): NBAResult | null {
  const deliveryPatterns = /توصيل|شحن|يوصل|كم يوم|ما يوصل|بعيد/i;
  if (!deliveryPatterns.test(ctx.customerMessage) && ctx.lastObjection !== 'delivery') return null;

  return {
    action: 'offer_free_shipping',
    confidence: 0.75,
    reason: 'العميل قلق بشأن التوصيل',
    promptInjection: `[تعليمات مبيعات] العميل يسأل عن التوصيل. اشرح خيارات الشحن وأوقات التوصيل. إذا وجد شحن مجاني اذكره. طمئنه.`,
    priority: 'medium',
  };
}

function checkCompetitorMention(ctx: NBAContext): NBAResult | null {
  const competitorPatterns = /مكان ثاني|محل ثاني|أقارن|بشوف عند|لقيت أفضل|عند غيركم|منافس|بديل/i;
  if (!competitorPatterns.test(ctx.customerMessage) && ctx.lastObjection !== 'competitor') return null;

  return {
    action: 'escalate_to_human',
    confidence: 0.80,
    reason: 'العميل يقارن مع منافس — يحتاج تدخل بشري',
    promptInjection: `[تعليمات مبيعات] العميل يقارنك بمنافس. ركز على القيمة الفريدة، لا تذم المنافس. اسأل "ما الذي يهمك أكثر؟" لفهم أولوياته. إذا لم تقنعه، سيتدخل أحد الفريق.`,
    priority: 'high',
  };
}

function checkHighValueEscalation(ctx: NBAContext): NBAResult | null {
  if (ctx.productValue && ctx.productValue > 500 && ctx.dealStage === 'ready') {
    return {
      action: 'escalate_to_human',
      confidence: 0.70,
      reason: `صفقة عالية القيمة (${ctx.productValue} ريال) جاهزة — الأفضل تدخل بشري`,
      promptInjection: `[تعليمات مبيعات] هذا طلب بقيمة عالية. قدم أفضل خدمة واسأل إذا يحتاج مساعدة إضافية. أحد الفريق سيتابع معه.`,
      priority: 'high',
    };
  }
  return null;
}

function checkComplaintEscalation(ctx: NBAContext): NBAResult | null {
  const complaintPatterns = /شكوى|زعلان|مستاء|سيء|أسوأ|ما بشتري|خلاص|ما أبي/i;
  if (!complaintPatterns.test(ctx.customerMessage)) return null;

  return {
    action: 'escalate_to_human',
    confidence: 0.90,
    reason: 'العميل مستاء — يحتاج تدخل بشري فوري',
    promptInjection: `[تعليمات مبيعات] العميل غير راضٍ. اعتذر بصدق وأكد أن أحد المسؤولين سيتواصل معه فوراً. لا تحاول البيع الآن.`,
    priority: 'critical',
  };
}

function checkGhostRecovery(ctx: NBAContext): NBAResult | null {
  if (ctx.timeSinceLastMessage >= 48 && ctx.timeSinceLastMessage < 168 && 
      ctx.dealStage && ['interested', 'qualified', 'ready'].includes(ctx.dealStage)) {
    return {
      action: 'gentle_followup',
      confidence: 0.70,
      reason: `العميل لم يرد منذ ${Math.round(ctx.timeSinceLastMessage)} ساعة`,
      promptInjection: `[تعليمات مبيعات] العميل لم يرد منذ فترة. أرسل رسالة متابعة خفيفة ولطيفة. لا تكرر العرض، بل اسأل سؤال مفتوح أو شارك شيء جديد.`,
      priority: 'medium',
    };
  }

  if (ctx.timeSinceLastMessage >= 168 && 
      ctx.dealStage && ['interested', 'qualified', 'ready'].includes(ctx.dealStage)) {
    return {
      action: 'final_attempt',
      confidence: 0.60,
      reason: `آخر محاولة — العميل لم يرد منذ ${Math.round(ctx.timeSinceLastMessage / 24)} يوم`,
      promptInjection: `[تعليمات مبيعات] هذه المحاولة الأخيرة. أرسل رسالة قصيرة ومحترمة، مثلاً: "حبيت أسأل إذا لسه مهتم — أحترم وقتك". لا تضغط.`,
      priority: 'low',
    };
  }

  return null;
}

function checkQualifyingQuestion(ctx: NBAContext): NBAResult | null {
  if (ctx.dealStage === 'new' && ctx.messageCount <= 2) {
    return {
      action: 'ask_qualifying_question',
      confidence: 0.65,
      reason: 'عميل جديد — يحتاج أسئلة تأهيل',
      promptInjection: `[تعليمات مبيعات] عميل جديد. اسأل 1-2 أسئلة تأهيل: "ما الذي تبحث عنه بالضبط؟" أو "عندك ميزانية محددة؟". لا تعرض منتجات فوراً.`,
      priority: 'medium',
    };
  }
  return null;
}

function checkUrgencyTrigger(ctx: NBAContext): NBAResult | null {
  if (ctx.dealStage === 'qualified' && ctx.timeSinceLastMessage < 1 && ctx.messageCount >= 5) {
    return {
      action: 'urgency_trigger',
      confidence: 0.70,
      reason: 'عميل مؤهل ونشط — يحتاج دفعة للإغلاق',
      promptInjection: `[تعليمات مبيعات] العميل مهتم ونشط لكن لم يقرر. استخدم محفز لطيف: "الكمية محدودة" أو "العرض ينتهي قريباً" فقط إذا كان صحيحاً. لا تكذب.`,
      priority: 'medium',
    };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Load NBA Context from Database
// ═══════════════════════════════════════════════════════════════

export async function loadNBAContext(
  merchantId: number,
  conversationId: number,
  customerMessage: string,
  intent: string
): Promise<NBAContext> {
  const pool = await getPool();

  const defaults: NBAContext = {
    merchantId,
    conversationId,
    dealStage: null,
    lastObjection: null,
    customerMessage,
    intent,
    paymentLinkSent: false,
    timeSinceLastMessage: 0,
    hasDiscount: false,
    messageCount: 0,
  };

  if (!pool) return defaults;

  try {
    const [rows] = await pool.execute(
      `SELECT deal_stage, loss_reason, payment_link_sent_at,
              TIMESTAMPDIFF(HOUR, lastMessageAt, NOW()) as hours_since,
              messageCount
       FROM conversations WHERE id = ? AND merchantId = ? LIMIT 1`,
      [conversationId, merchantId]
    );
    const conv = (rows as any[])[0];
    if (!conv) return defaults;

    // Check if discount system has active offers
    const [discountRows] = await pool.execute(
      `SELECT id FROM discount_codes WHERE merchantId = ? AND isActive = 1 AND 
       (expiresAt IS NULL OR expiresAt > NOW()) LIMIT 1`,
      [merchantId]
    ).catch(() => [[]]);

    // Get last objection from strategy metrics
    const [objRows] = await pool.execute(
      `SELECT JSON_EXTRACT(strategy_snapshot, '$.dominant_objection') as objection
       FROM sari_strategy_metrics
       WHERE merchant_id = ? AND conversation_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [merchantId, conversationId]
    ).catch(() => [[]]);

    return {
      ...defaults,
      dealStage: conv.deal_stage || null,
      lossReason: conv.loss_reason || null,
      paymentLinkSent: !!conv.payment_link_sent_at,
      timeSinceLastMessage: conv.hours_since || 0,
      messageCount: conv.messageCount || 0,
      hasDiscount: (discountRows as any[]).length > 0,
      lastObjection: (objRows as any[])[0]?.objection?.replace(/"/g, '') || null,
    };
  } catch (err) {
    console.warn('[NBA] Context load failed (non-blocking):', err);
    return defaults;
  }
}
