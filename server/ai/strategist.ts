/**
 * Sales Strategist — The Tactical Brain (Per-Message)
 * 
 * Decides HOW to respond to each message by building a Mission Block.
 * Separates "thinking" from "speaking" — the Strategist thinks, GPT speaks.
 * 
 * Two modes:
 * 1. FULL ANALYSIS: gpt-4o-mini call for first message + critical signals
 * 2. FAST PATH: keyword-based update for messages 2-20 (zero cost)
 */

import type { CustomerIntent, HesitationAnalysis } from './session-context';
import { analyzeHesitation } from './session-context';
import type { CustomerProfile, CustomerTier } from '../db/customer-intelligence';
import type { PersuasionStrategy } from './sales-arsenal';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type SalesPersona = 
  | 'premium_consultative'  // لا تذكر السعر أولاً. ركز: تجربة، حصرية
  | 'value_closer'          // اذكر السعر بثقة — هذا ميزتك
  | 'trust_builder'         // ركز على الاعتماد والشهادات
  | 'fast_closer'           // مباشر، قليل كلام، CTA سريع
  | 'relationship_first'    // بناء علاقة أول ثم بيع
  | 'balanced';             // Default — متوازن

export type CTALevel = 
  | 'open_question'        // سؤال مفتوح خفيف (browsing)
  | 'curiosity'            // إثارة فضول (inquiring)
  | 'differentiation'      // تمييز عن المنافسين (comparing)
  | 'reassurance'          // طمأنة — مو سؤال! (hesitating)
  | 'value_framing'        // إبراز القيمة (objecting)
  | 'direct_cta'           // CTA مباشر (ready_to_buy)
  | 'upsell_natural'       // upsell طبيعي (returning)
  | 'empathy'              // تعاطف (angry/frustrated)
  | 'none';                // post_purchase / support

export type ObjectionType = 'price' | 'trust' | 'need' | 'competitor' | 'friction' | 'delay';
export type ObjectionIntensity = 'low' | 'medium' | 'high';

export interface ObjectionAnalysis {
  type: ObjectionType;
  intensity: ObjectionIntensity;
}

export interface MemoryDirective {
  type: string;
  value: string;
  priority: 'high' | 'medium' | 'low';
  usageHint: string;
}

export interface MissionBlock {
  customerState: CustomerIntent;
  hesitation?: HesitationAnalysis;
  objection?: ObjectionAnalysis;
  primaryStrategy: PersuasionStrategy | 'warm_welcome' | 'need_discovery' | 'value_first' | 'trust_building' | 'friction_removal' | 'smooth_closing';
  ctaLevel: CTALevel;
  salesPersona: SalesPersona;
  mustInclude: string[];
  avoid: string[];
  nextGoal: string;
  memoryDirectives: MemoryDirective[];
  timingContext?: string;
}

// ═══════════════════════════════════════════════════════════════
// Critical Signals — trigger full re-analysis
// ═══════════════════════════════════════════════════════════════

const CRITICAL_SIGNALS: Record<string, string[]> = {
  price_objection:  ['غالي', 'كثير', 'أرخص', 'خصم', 'تخفيض', 'expensive', 'cheaper', 'discount'],
  trust_objection:  ['ما أعرفكم', 'مضمون', 'موثوق', 'أول مرة أسمع', 'مو نصب'],
  need_objection:   ['مو متأكد', 'ما أدري', 'أحتاجه', 'يناسبني'],
  competitor:       ['عند غيركم', 'لقيته أرخص', 'بديل'],
  hesitation:       ['بفكر', 'أفكر', 'بشوف', 'بعدين', 'مو الحين', 'أرجع لك'],
  anger:            ['زعلان', 'مستاء', 'فاشل', 'احتيال', 'نصب'],
  buy_signal:       ['ابغى اطلب', 'سجلني', 'كيف أدفع', 'أبي آخذ', 'تمام أطلب'],
};

/**
 * Check if message contains a critical signal requiring full re-analysis.
 */
export function hasCriticalSignal(message: string): boolean {
  const msg = message.toLowerCase();
  for (const signals of Object.values(CRITICAL_SIGNALS)) {
    if (signals.some(s => msg.includes(s))) return true;
  }
  return false;
}

// SEC-SALES-01: Sanitize customer data before prompt injection
function sanitizeForMission(text: string): string {
  if (!text) return '';
  const normalized = text.normalize('NFKC');
  return normalized
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
    .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
    .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
    .replace(/do\s+not\s+follow/gi, '[filtered]')
    .replace(/override\s+(system|all|your)/gi, '[filtered]')
    .replace(/act\s+as\s+(a|an)?/gi, '[filtered]')
    .replace(/pretend\s+(to\s+be|you\s+are)/gi, '[filtered]')
    .replace(/تصرف\s*(كـ|ك)/gi, '[filtered]')
    .replace(/تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]')
    .replace(/انس[َى]?\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد|اعداداتهم)/gi, '[filtered]')
    .substring(0, 200); // Truncate to prevent prompt bloat
}

// ═══════════════════════════════════════════════════════════════
// Objection Analysis
// ═══════════════════════════════════════════════════════════════

function analyzeObjection(message: string): ObjectionAnalysis {
  const msg = message.toLowerCase();

  // Price objections with intensity
  if (['مو معقول', 'كثير عليه', 'ما يستاهل', 'نصب'].some(s => msg.includes(s))) {
    return { type: 'price', intensity: 'high' };
  }
  if (['غالي', 'كثير', 'مرتفع', 'سعر عالي'].some(s => msg.includes(s))) {
    return { type: 'price', intensity: 'medium' };
  }
  if (['شوي غالي', 'أرخص شوي'].some(s => msg.includes(s))) {
    return { type: 'price', intensity: 'low' };
  }

  // Competitor
  if (['عند غيركم', 'لقيته أرخص', 'بديل'].some(s => msg.includes(s))) {
    return { type: 'competitor', intensity: 'medium' };
  }

  // Trust
  if (['ما أعرفكم', 'مضمون', 'موثوق', 'أول مرة'].some(s => msg.includes(s))) {
    return { type: 'trust', intensity: 'medium' };
  }

  // Need
  if (['مو متأكد', 'أحتاجه', 'يناسبني'].some(s => msg.includes(s))) {
    return { type: 'need', intensity: 'low' };
  }

  // Friction (delivery, distance, time)
  if (['بعيد', 'يأخذ وقت', 'متأخر', 'التوصيل'].some(s => msg.includes(s))) {
    return { type: 'friction', intensity: 'low' };
  }

  // Delay
  if (['بفكر', 'بعدين', 'مو الحين'].some(s => msg.includes(s))) {
    return { type: 'delay', intensity: 'low' };
  }

  return { type: 'price', intensity: 'medium' };
}

// ═══════════════════════════════════════════════════════════════
// CTA Level Selection — Soft CTA per stage
// ═══════════════════════════════════════════════════════════════

function selectCTALevel(intent: CustomerIntent, lastSentiment?: string): CTALevel {
  if (lastSentiment === 'angry' || lastSentiment === 'frustrated') return 'empathy';

  switch (intent) {
    case 'browsing':      return 'open_question';
    case 'inquiring':     return 'curiosity';
    case 'comparing':     return 'differentiation';
    case 'hesitating':    return 'reassurance';
    case 'objecting':     return 'value_framing';
    case 'ready_to_buy':  return 'direct_cta';
    case 'returning':     return 'upsell_natural';
    case 'post_purchase': return 'none';
    default:              return 'open_question';
  }
}

// ═══════════════════════════════════════════════════════════════
// Strategy Selection — Gulf Hierarchy (discount LAST)
// ═══════════════════════════════════════════════════════════════

function selectStrategy(
  intent: CustomerIntent,
  objection?: ObjectionAnalysis,
  hesitation?: HesitationAnalysis,
  persona?: SalesPersona,
): MissionBlock['primaryStrategy'] {
  // Ready to buy → close!
  if (intent === 'ready_to_buy') return 'smooth_closing';

  // Returning customer → upsell
  if (intent === 'returning') return 'cross_sell';

  // Hesitating — depends on type
  if (intent === 'hesitating' && hesitation) {
    if (hesitation.type === 'trust') return 'trust_building';
    if (hesitation.type === 'busy') return 'none'; // Don't push
    if (hesitation.intensity === 'high') return 'social_proof';
    return 'friction_removal'; // Default for medium hesitation
  }

  // Objecting — Gulf hierarchy: value → trust → social proof → discount LAST
  if (intent === 'objecting' && objection) {
    if (objection.type === 'trust') return 'trust_building';
    if (objection.type === 'competitor') return 'value_comparison';
    if (objection.type === 'need') return 'need_discovery';
    if (objection.type === 'friction') return 'friction_removal';
    if (objection.type === 'delay') return 'friction_removal';
    // Price — only discount if high intensity AND persona allows
    if (objection.type === 'price') {
      if (persona === 'premium_consultative') return 'value_comparison'; // Never discount
      if (objection.intensity === 'high') return 'proactive_discount';
      return 'value_comparison'; // Value first!
    }
  }

  // Comparing → differentiation
  if (intent === 'comparing') return 'social_proof';

  // Browsing → discover needs
  if (intent === 'browsing') return 'warm_welcome';

  // Inquiring → value first
  if (intent === 'inquiring') return 'value_first';

  return 'none';
}

// ═══════════════════════════════════════════════════════════════
// Memory Directives — Backend decides what GPT sees
// ═══════════════════════════════════════════════════════════════

function buildMemoryDirectives(
  profile: CustomerProfile | null,
  intent: CustomerIntent,
): MemoryDirective[] {
  if (!profile) return [];
  const directives: MemoryDirective[] = [];
  const daysSinceLastSeen = profile.lastSeenAt
    ? Math.floor((Date.now() - new Date(profile.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Returning customer with recent purchase → mention it
  if (intent === 'returning' && profile.purchaseHistory.length > 0 && daysSinceLastSeen < 90) {
    const lastPurchase = sanitizeForMission(profile.purchaseHistory[profile.purchaseHistory.length - 1]);
    directives.push({
      type: 'last_purchase',
      value: lastPurchase,
      priority: 'high',
      usageHint: `اذكر "${lastPurchase}" طبيعياً واسأل كيف تجربته — ثم اقترح منتج مكمل`,
    });
  }

  // VIP/loyal → treat premium
  if (profile.customerTier === 'vip' || profile.customerTier === 'loyal') {
    directives.push({
      type: 'tier',
      value: profile.customerTier,
      priority: 'high',
      usageHint: profile.customerTier === 'vip'
        ? 'نادِه "عميلنا المميز" وعامله premium'
        : 'اذكر إنه عميل مهم عندنا',
    });
  }

  // Had price objection before → lead with value
  if (profile.lastObjection === 'price' && intent !== 'post_purchase') {
    directives.push({
      type: 'past_objection',
      value: 'price',
      priority: 'medium',
      usageHint: 'ابدأ بالقيمة والمميزات قبل ما تذكر أي سعر',
    });
  }

  // Nickname (أبو فلان) — only Gulf context
  if (profile.nickname && daysSinceLastSeen < 90) {
    const safeNickname = sanitizeForMission(profile.nickname);
    directives.push({
      type: 'nickname',
      value: safeNickname,
      priority: 'medium',
      usageHint: `نادِه "${safeNickname}" بطريقة طبيعية`,
    });
  }

  // At-risk customer
  if (profile.customerTier === 'at_risk') {
    directives.push({
      type: 'tier',
      value: 'at_risk',
      priority: 'high',
      usageHint: 'رحب بحرارة زيادة: "وحشتنا!" واعرض شي جديد',
    });
  }

  return directives;
}

// ═══════════════════════════════════════════════════════════════
// Must Include / Avoid Rules
// ═══════════════════════════════════════════════════════════════

function buildRules(
  intent: CustomerIntent,
  ctaLevel: CTALevel,
  strategy: MissionBlock['primaryStrategy'],
  persona: SalesPersona,
  hesitation?: HesitationAnalysis,
): { mustInclude: string[]; avoid: string[] } {
  const mustInclude: string[] = [];
  const avoid: string[] = [];

  // Global: Conversation Momentum Rule
  avoid.push('لا تنهي الرد بدون زخم — كل رد يجب أن يدفع المحادثة للأمام');
  avoid.push('ممنوع الرد بـ "نعم" أو "لا" فقط');
  avoid.push('لا تقل "إذا تحتاج شي أنا هنا" — هذا إنهاء محادثة');

  // CTA-level specific
  switch (ctaLevel) {
    case 'open_question':
      mustInclude.push('اسأل سؤال مفتوح خفيف لاكتشاف الاحتياج');
      break;
    case 'curiosity':
      mustInclude.push('أضف عبارة تثير الفضول عن المنتج أو الخدمة');
      avoid.push('لا تطرح أكثر من سؤال واحد');
      break;
    case 'reassurance':
      mustInclude.push('طمئن العميل بدليل أو تجربة — مو سؤال');
      avoid.push('لا تسأل سؤال مباشر — استخدم طمأنة');
      break;
    case 'value_framing':
      mustInclude.push('ابدأ بالقيمة والمميزات قبل السعر');
      break;
    case 'direct_cta':
      mustInclude.push('سهّل خطوة الشراء/الحجز بوضوح');
      break;
    case 'upsell_natural':
      mustInclude.push('اذكر منتج مكمل بطريقة طبيعية: "بالمناسبة..."');
      break;
    case 'empathy':
      mustInclude.push('أظهر تعاطف حقيقي أولاً قبل أي حل');
      break;
  }

  // Strategy-specific
  if (strategy === 'social_proof') {
    mustInclude.push('استخدم دليل اجتماعي: "أغلب عملائنا" أو "الأكثر طلباً"');
  }
  if (strategy === 'trust_building') {
    mustInclude.push('اذكر الاعتماد/الشهادات/الضمان');
  }
  if (strategy === 'value_comparison') {
    mustInclude.push('قارن القيمة المضافة — لا تذكر المنافسين بالاسم');
    avoid.push('لا تعرض خصم كأول حل — ابدأ بالقيمة');
  }

  // Persona-specific
  if (persona === 'premium_consultative') {
    avoid.push('لا تعرض خصم أبداً — يقلل القيمة');
    avoid.push('لا تذكر السعر كأول معلومة');
  }
  if (persona === 'fast_closer') {
    mustInclude.push('كن مباشراً وقصيراً — CTA سريع');
  }

  // Hesitation-specific
  if (hesitation?.intensity === 'low' && hesitation.type === 'busy') {
    avoid.push('لا تضغط — العميل مشغول وسيعود');
    mustInclude.push('احترم وقته وقل "بانتظارك"');
  }

  return { mustInclude, avoid };
}

// ═══════════════════════════════════════════════════════════════
// Timing Context
// ═══════════════════════════════════════════════════════════════

function getTimingContext(): string | undefined {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const dateOfMonth = now.getDate();

  if (hour >= 22 || hour < 7) return 'late_night';
  if (day === 5 && hour < 14) return 'friday_morning';
  if (day === 5 && hour >= 16) return 'friday_golden_hour';
  if (dateOfMonth <= 5) return 'post_salary';
  if (dateOfMonth >= 25) return 'end_of_month';
  return undefined;
}

// ═══════════════════════════════════════════════════════════════
// Next Goal
// ═══════════════════════════════════════════════════════════════

function determineNextGoal(intent: CustomerIntent): string {
  switch (intent) {
    case 'browsing':      return 'browsing → inquiring';
    case 'inquiring':     return 'inquiring → comparing أو ready_to_buy';
    case 'comparing':     return 'comparing → ready_to_buy';
    case 'hesitating':    return 'hesitating → ready_to_buy';
    case 'objecting':     return 'objecting → hesitating أو ready_to_buy';
    case 'ready_to_buy':  return 'إتمام البيع + upsell';
    case 'returning':     return 'returning → inquiring أو ready_to_buy';
    case 'post_purchase': return 'دعم + upsell طبيعي';
    default:              return 'اكتشاف الاحتياج';
  }
}

// ═══════════════════════════════════════════════════════════════
// Public API — Build Mission Block
// ═══════════════════════════════════════════════════════════════

/**
 * Build a Mission Block for the current message (FAST PATH — no API call).
 * Called for every message. Pure logic, zero cost.
 */
export function buildMissionBlock(params: {
  message: string;
  intent: CustomerIntent;
  lastSentiment?: string;
  customerProfile: CustomerProfile | null;
  salesPersona?: SalesPersona;
}): MissionBlock {
  const { message, intent, lastSentiment, customerProfile, salesPersona } = params;
  const persona = salesPersona || 'balanced';

  // Analyze hesitation/objection if relevant
  const hesitation = intent === 'hesitating' ? analyzeHesitation(message) : undefined;
  const objection = intent === 'objecting' ? analyzeObjection(message) : undefined;

  // Select strategy and CTA
  const ctaLevel = selectCTALevel(intent, lastSentiment);
  const primaryStrategy = selectStrategy(intent, objection, hesitation, persona);

  // Build rules
  const { mustInclude, avoid } = buildRules(intent, ctaLevel, primaryStrategy, persona, hesitation);

  // Memory directives
  const memoryDirectives = buildMemoryDirectives(customerProfile, intent);

  return {
    customerState: intent,
    hesitation,
    objection,
    primaryStrategy,
    ctaLevel,
    salesPersona: persona,
    mustInclude,
    avoid,
    nextGoal: determineNextGoal(intent),
    memoryDirectives,
    timingContext: getTimingContext(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Convert Mission Block → Prompt Header
// ═══════════════════════════════════════════════════════════════

const STATE_LABELS: Record<string, string> = {
  browsing: 'يتصفح',
  inquiring: 'يسأل عن منتج',
  comparing: 'يقارن خيارات',
  hesitating: 'متردد',
  objecting: 'يعترض',
  ready_to_buy: 'جاهز للشراء',
  returning: 'عميل عائد',
  post_purchase: 'بعد الشراء',
  unknown: 'غير واضح',
};

const STRATEGY_LABELS: Record<string, string> = {
  warm_welcome: 'ترحيب دافي + اكتشاف احتياج',
  need_discovery: 'اكتشاف احتياج بأسئلة ذكية',
  value_first: 'إبراز القيمة قبل السعر',
  trust_building: 'بناء ثقة بالاعتماد والشهادات',
  social_proof: 'دليل اجتماعي — "أغلب عملائنا..."',
  value_comparison: 'مقارنة القيمة المضافة',
  friction_removal: 'إزالة العوائق والتردد',
  smooth_closing: 'إتمام البيع بسلاسة',
  proactive_discount: 'عرض خصم كمكافأة',
  cart_recovery: 'استرداد سلة متروكة',
  empathy_resolve: 'تعاطف وحل المشكلة',
  cross_sell: 'اقتراح منتج مكمل',
  smart_upsell: 'ترقية للمنتج الأعلى',
  none: 'محادثة طبيعية',
};

/**
 * Convert Mission Block to a prompt header string.
 * This is placed at the TOP of the system prompt, before all context.
 */
export function missionToPrompt(mission: MissionBlock): string {
  const parts: string[] = [];

  parts.push(`## 🎯 مهمتك في هذا الرد:`);
  parts.push(`- حالة العميل: **${STATE_LABELS[mission.customerState] || mission.customerState}**`);

  if (mission.hesitation) {
    const intensityLabel = mission.hesitation.intensity === 'high' ? 'شديد' : mission.hesitation.intensity === 'medium' ? 'متوسط' : 'خفيف';
    parts.push(`- نوع التردد: ${mission.hesitation.type} (${intensityLabel})`);
    if (mission.hesitation.recommendedAction === 'wait_and_followup') {
      parts.push(`- ⚠️ العميل غالباً مشغول — لا تضغط`);
    }
  }

  if (mission.objection) {
    const intensityLabel = mission.objection.intensity === 'high' ? 'شديد' : mission.objection.intensity === 'medium' ? 'متوسط' : 'خفيف';
    parts.push(`- نوع الاعتراض: ${mission.objection.type} (${intensityLabel})`);
  }

  parts.push(`- الاستراتيجية: **${STRATEGY_LABELS[mission.primaryStrategy] || mission.primaryStrategy}**`);
  parts.push(`- الهدف: ${mission.nextGoal}`);

  if (mission.timingContext) {
    const timingLabels: Record<string, string> = {
      late_night: 'وقت متأخر — رد خفيف وقصير',
      friday_morning: 'جمعة صباح — لا تضغط',
      friday_golden_hour: 'جمعة بعد العصر — وقت ذهبي',
      post_salary: 'بداية الشهر — العميل مرتاح مالياً',
      end_of_month: 'نهاية الشهر — ركز على القيمة',
    };
    parts.push(`- التوقيت: ${timingLabels[mission.timingContext] || mission.timingContext}`);
  }

  // Memory directives
  if (mission.memoryDirectives.length > 0) {
    parts.push(`\n### ذاكرة العميل:`);
    for (const mem of mission.memoryDirectives) {
      parts.push(`- ${mem.usageHint}`);
    }
  }

  // Must include
  if (mission.mustInclude.length > 0) {
    parts.push(`\n### مطلوب في الرد:`);
    for (const item of mission.mustInclude) {
      parts.push(`- ✅ ${item}`);
    }
  }

  // Avoid
  if (mission.avoid.length > 0) {
    parts.push(`\n### ممنوع:`);
    for (const item of mission.avoid) {
      parts.push(`- ⛔ ${item}`);
    }
  }

  parts.push(''); // Empty line before context
  return parts.join('\n');
}
