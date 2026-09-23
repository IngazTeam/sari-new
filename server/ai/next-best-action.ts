/** Current-turn sales guidance. Suggestions never establish payment, reserve stock or schedule contact.
 * The customer decision and current evidence dominate old objections, inactivity and message counts. */

import { getPool } from '../db';
import { asksAboutDiscount, selectSalesDiscounts } from './sales-offer-evidence';
import { decideSalesTurnGoal } from './sales-turn-policy';
import type { CustomerIntent } from './session-context';
import { isSalesRefusal } from './customer-decision';

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
  lastAssistantMessage?: string;
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
  if (ctx.intent === 'declined' || isSalesRefusal(ctx.customerMessage)) {
    return { action: 'continue_conversation', confidence: 1, priority: 'critical',
      reason: 'رفض العميل الحالي يلغي الاستعداد السابق',
      promptInjection: '[قرار ملزم] العميل رفض أو تراجع. احترم قراره ولا تنشئ طلباً أو ترسل رابط دفع أو خصماً أو متابعة دون طلب جديد منه.' };
  }
  if (ctx.intent === 'post_purchase') {
    return { action: 'continue_conversation', confidence: 1, priority: 'high',
      reason: 'الرسالة تخص طلباً قائماً', promptInjection: 'عالج موضوع الطلب القائم باستخدام حالته الموثقة، ولا تعاود البيع أو تضغط للدفع.' };
  }
  if (decideSalesTurnGoal({ intent: ctx.intent as CustomerIntent, customerMessage: ctx.customerMessage,
    lastAssistantMessage: ctx.lastAssistantMessage }) === 'explain_requested_information') {
    return { action: 'continue_conversation', confidence: 1, priority: 'high', reason: 'الموافقة تخص السؤال السابق فقط',
      promptInjection: 'أكمل الشرح المطلوب أو وضح المقصود؛ هذه الموافقة وحدها لا تجيز شراء أو إرسال رابط دفع.' };
  }
  const rules = [
    checkComplaintEscalation(ctx),
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

    // ── Priority 5: Progression ──
    checkQualifyingQuestion(ctx),

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
      action: 'continue_conversation',
      confidence: 0.95,
      reason: 'راجع الاتفاق المحفوظ قبل أي إجراء مالي',
      promptInjection: `[تعليمات مبيعات] استفد من التفاصيل المحسومة وراجع العرض المحفوظ والكميات والإجمالي والموافقة. اطلب فقط ما ينقص الاتفاق. لا تدّع وجود طلب أو رابط صالح قبل نتيجة موثقة من مسار التنفيذ.`,
      priority: 'critical',
    };
  }
  return null;
}

function checkPaymentReminder(ctx: NBAContext): NBAResult | null {
  if (ctx.dealStage === 'payment_link_sent' && ctx.paymentLinkSent && /رابط|link/i.test(ctx.customerMessage)) {
    return {
      action: 'payment_reminder',
      confidence: 0.85,
      reason: `رابط دفع مُرسل منذ ${Math.round(ctx.timeSinceLastMessage)} ساعة بدون دفع`,
      promptInjection: `[تعليمات مبيعات] العميل يسأل عن رابط سابق. تحقّق من حالة الطلب والدفع وصلاحية الرابط قبل مشاركته. وجود رسالة رابط قديمة لا يثبت حجز المخزون أو أن الدفع لم يتم.`,
      priority: 'high',
    };
  }
  return null;
}

function checkPriceObjection(ctx: NBAContext): NBAResult | null {

  const pricePatterns = /غالي|كثير|مبالغ|السعر عالي|أرخص|أقل|خصم|تخفيض|expensive|too much|cheaper/i;
  if (!pricePatterns.test(ctx.customerMessage)) return null;

  if (ctx.hasDiscount && asksAboutDiscount(ctx.customerMessage)) {
    return {
      action: 'offer_discount',
      confidence: 0.88,
      reason: 'طلب معلومات عن خصم له دليل متاح',
      promptInjection: `[تعليمات مبيعات] العميل يسأل عن الخصم. اشرح كوداً واحداً من سجل العروض الحالي مع شروطه؛ لا تسمّه حصرياً أو تعويضاً ولا تعد بتطبيقه قبل تحقق الطلب.`,
      priority: 'high',
    };
  }

  return {
    action: 'offer_alternative',
    confidence: 0.80,
    reason: 'فهم قيد السعر والقيمة قبل اختيار الحل',
    promptInjection: `[تعليمات مبيعات] أجب عن السعر مباشرة إن كان السؤال عنه. عند اعتراض القيمة اربط الفائدة بحاجته أو قارن بديلاً موثقاً يناسب الميزانية. لا تفترض أن الحل خصم، ولا تقل إنه لا يوجد خصم لمجرد عدم اقتراحه.`,
    priority: 'high',
  };
}

function checkTrustObjection(ctx: NBAContext): NBAResult | null {
  const trustPatterns = /ما أعرفكم|مضمون|موثوق|أول مرة|مو نصب|ضمان|ما أثق|مجرب/i;
  if (!trustPatterns.test(ctx.customerMessage)) return null;

  return {
    action: 'send_social_proof',
    confidence: 0.85,
    reason: 'العميل يشك في الموثوقية',
    promptInjection: `[تعليمات مبيعات] العميل لا يثق بعد. أجب عن سبب القلق بدليل معتمد ذي مصدر إن توفر. عند نقصه وضح ما يحتاج التحقق؛ لا تصنع أعداد عملاء أو تقييمات أو ضماناً.`,
    priority: 'high',
  };
}

function checkDeliveryObjection(ctx: NBAContext): NBAResult | null {
  const deliveryPatterns = /توصيل|شحن|يوصل|كم يوم|ما يوصل|بعيد/i;
  if (!deliveryPatterns.test(ctx.customerMessage)) return null;

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
  if (!competitorPatterns.test(ctx.customerMessage)) return null;

  return {
    action: 'escalate_to_human',
    confidence: 0.80,
    reason: 'العميل يقارن مع منافس — يحتاج تدخل بشري',
    promptInjection: `[تعليمات مبيعات] العميل يقارنك بمنافس. ركز على القيمة الفريدة، لا تذم المنافس. اسأل "ما الذي يهمك أكثر؟" لفهم أولوياته. لا تعد بتدخل موظف قبل تسجيل تصعيد فعلي.`,
    priority: 'high',
  };
}

function checkHighValueEscalation(ctx: NBAContext): NBAResult | null {
  if (ctx.productValue && ctx.productValue > 500 && ctx.dealStage === 'ready') {
    return {
      action: 'escalate_to_human',
      confidence: 0.70,
      reason: `صفقة عالية القيمة (${ctx.productValue} ريال) جاهزة — الأفضل تدخل بشري`,
      promptInjection: `[تعليمات مبيعات] هذا طلب بقيمة عالية. قدم أفضل خدمة واسأل إذا يحتاج مساعدة إضافية. لا تعد بمتابعة موظف قبل تسجيل تصعيد فعلي.`,
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
    promptInjection: `[تعليمات مبيعات] العميل غير راضٍ. اعترف بالمشكلة واطلب التصعيد المتاح عند الحاجة؛ لا تدّع تسجيله أو موعد اتصال قبل نتيجة الأداة. لا تحاول البيع الآن.`,
    priority: 'critical',
  };
}

function checkQualifyingQuestion(ctx: NBAContext): NBAResult | null {
  if (ctx.dealStage === 'new' && ctx.messageCount <= 2) {
    return {
      action: 'ask_qualifying_question',
      confidence: 0.65,
      reason: 'عميل جديد — يحتاج أسئلة تأهيل',
      promptInjection: `[تعليمات مبيعات] عميل جديد. أجب عن سؤاله المباشر أولاً. إذا نقصت معلومة تغير الترشيح، اسأل سؤالاً واحداً عنها واستفد من المعلومات السابقة.`,
      priority: 'medium',
    };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Load NBA Context from Database
// ═══════════════════════════════════════════════════════════════

// Objection patterns — used to detect last objection from message history
const NBA_OBJECTION_PATTERNS: Record<string, RegExp> = {
  price: /غالي|كثير|مبالغ|السعر عالي|أرخص|أقل|خصم|تخفيض|expensive|too much|cheaper/i,
  trust: /ما أعرفكم|مضمون|موثوق|أول مرة|مو نصب|ضمان|ما أثق|مجرب/i,
  delivery: /توصيل|شحن|يوصل|كم يوم|ما يوصل|بعيد/i,
  competitor: /مكان ثاني|محل ثاني|أقارن|بشوف عند|لقيت أفضل|عند غيركم|منافس|بديل/i,
};

export async function loadNBAContext(
  merchantId: number,
  conversationId: number,
  customerMessage: string,
  intent: string,
  lastAssistantMessage?: string,
): Promise<NBAContext> {
  const pool = await getPool();

  const defaults: NBAContext = {
    merchantId,
    conversationId,
    dealStage: null,
    lastObjection: null,
    customerMessage,
    intent,
    lastAssistantMessage,
    paymentLinkSent: false,
    timeSinceLastMessage: 0,
    hasDiscount: false,
    messageCount: 0,
  };

  if (!pool) return defaults;

  try {
    // P0-FIX: messageCount is NOT a column in conversations schema.
    // Use subquery from messages table to avoid query failure.
    const [rows] = await pool.execute(
      `SELECT c.customerPhone, c.deal_stage, c.loss_reason, c.payment_link_sent_at,
              TIMESTAMPDIFF(HOUR, c.lastMessageAt, NOW()) as hours_since,
              (SELECT COUNT(*) FROM messages WHERE conversationId = c.id) as msg_count
       FROM conversations c WHERE c.id = ? AND c.merchantId = ? LIMIT 1`,
      [conversationId, merchantId]
    );
    const conv = (rows as any[])[0];
    if (!conv) return defaults;

    // Check if discount system has active offers
    const [discountRows] = await pool.execute(
      `SELECT *, customer_phone AS customerPhone FROM discount_codes WHERE merchantId = ? AND isActive = 1
       AND (expiresAt IS NULL OR expiresAt > UTC_TIMESTAMP()) AND (maxUses IS NULL OR usedCount < maxUses)`,
      [merchantId]
    ).catch(() => [[]] as any);

    // P0-FIX: Detect last objection from recent incoming messages
    // instead of relying on the non-existent strategy_snapshot column
    let lastObjection: string | null = null;
    try {
      const [msgRows] = await pool.execute(
        `SELECT content FROM messages
         WHERE conversationId = ? AND direction = 'incoming'
         ORDER BY id DESC LIMIT 10`,
        [conversationId]
      );
      // Scan messages from newest to oldest, return first objection found
      for (const msg of (msgRows as any[])) {
        const content = msg.content || '';
        for (const [type, pattern] of Object.entries(NBA_OBJECTION_PATTERNS)) {
          if (pattern.test(content)) {
            lastObjection = type;
            break;
          }
        }
        if (lastObjection) break;
      }
    } catch {
      // Non-blocking: if messages query fails, continue without objection
    }

    return {
      ...defaults,
      dealStage: conv.deal_stage || null,
      lossReason: conv.loss_reason || null,
      paymentLinkSent: !!conv.payment_link_sent_at,
      timeSinceLastMessage: conv.hours_since || 0,
      messageCount: conv.msg_count || 0,
      hasDiscount: selectSalesDiscounts(discountRows as any[], { merchantId, customerPhone: conv.customerPhone }).length > 0,
      lastObjection,
    };
  } catch (err) {
    console.warn('[NBA] Context load failed (non-blocking):', err);
    return defaults;
  }
}
