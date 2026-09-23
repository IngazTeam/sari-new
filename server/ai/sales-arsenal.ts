/** Fresh factual sales context and tactics subordinate to the current customer decision. */

import {
  getAbandonedCartsByMerchantId,
  getBookingsByCustomer,
  getDiscountCodesByMerchantId,
  getProductsByMerchantId,
  getServicesByMerchant,
} from '../db';
import { decideSalesTurnGoal } from './sales-turn-policy';
import { asksAboutDiscount, salesDiscountPrompt, selectSalesDiscounts, type SalesDiscountEvidence } from './sales-offer-evidence';
import { filterProductsAvailableForSale } from './product-availability';
import type { CustomerProfile } from '../db/customer-intelligence';
import type { CustomerIntent } from './session-context';
import { assertRuntimeSchema } from '../db/schema-readiness';

// ═══════════════════════════════════════════════════════════════
// SEC-V6-01 FIX: Shared prompt sanitizer for all user-controlled data
// ═══════════════════════════════════════════════════════════════

function sanitizeForArsenalPrompt(text: string): string {
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
    .replace(/انس[َى]?\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد|اعداداتهم)/gi, '[filtered]');
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface SalesArsenal {
  activeDiscounts: SalesDiscountEvidence[];
  loyaltyPoints: number;
  loyaltyTier: { name: string; icon: string; discount: number } | null;
  availableRewards: { name: string; pointsCost: number }[];
  abandonedCart: { items: string[]; total: number } | null;
  bestSellers: { name: string; price: number }[];
  totalProducts: number;
  // v6 enhancements
  crossSellSuggestions: { productName: string; reason: string }[];
  upcomingBookings: { serviceName: string; date: string }[];
  availableServices: { name: string; price: number }[];
}

export type PersuasionStrategy =
  | 'cart_recovery'      // عنده سلة مهجورة → استرداد
  | 'empathy_resolve'    // غاضب → تعاطف + تعويض
  | 'loyalty_reward'     // VIP → مكافأة ولاء
  | 'scarcity'           // عرض محدود → ندرة
  | 'proactive_discount' // يقارن أسعار → خصم استباقي
  | 'smart_upsell'       // اختار منتج → upsell
  | 'social_proof'       // جديد/متردد → دليل اجتماعي
  | 'value_comparison'   // اعتراض سعر → مقارنة القيمة
  | 'cross_sell'         // v6: اقتراح منتج مكمّل
  | 'booking_followup'   // v6: تذكير بحجز قادم أو اقتراح خدمة
  | 'none';              // لا تستخدم تكتيك (محادثة عادية)

export interface PersuasionPlan {
  strategy: PersuasionStrategy;
  prompt: string;        // Instructions to inject into GPT
  sweetener?: string;    // Optional discount code to offer
}

// ═══════════════════════════════════════════════════════════════
// Load Arsenal (once per conversation)
// ═══════════════════════════════════════════════════════════════

/**
 * Load fresh merchant/customer facts for the full path. Fast-path reads use the same offer validation.
 */
export async function loadArsenal(
  merchantId: number,
  customerPhone: string
): Promise<SalesArsenal> {
  const arsenal: SalesArsenal = {
    activeDiscounts: [],
    loyaltyPoints: 0,
    loyaltyTier: null,
    availableRewards: [],
    abandonedCart: null,
    bestSellers: [],
    totalProducts: 0,
    crossSellSuggestions: [],
    upcomingBookings: [],
    availableServices: [],
  };

  try {
    // 1. Active discount codes
    const discounts = await getDiscountCodesByMerchantId(merchantId);
    arsenal.activeDiscounts = selectSalesDiscounts(discounts, { merchantId, customerPhone });
  } catch { /* discounts table may not exist */ }

  try {
    // 2. Products (for upsell + best sellers context)
    const products = filterProductsAvailableForSale(await getProductsByMerchantId(merchantId));
    arsenal.totalProducts = products.length;
    arsenal.bestSellers = products
      .slice(0, 5)
      .map((p: any) => ({ name: p.name, price: p.priceUnit === 'minor' ? p.price / 100 : 0 }));
  } catch { /* silent */ }

  try {
    // 3. Abandoned cart for this customer
    const carts = await getAbandonedCartsByMerchantId(merchantId);
    const customerCart = carts.find((c: any) => 
      c.customerPhone === customerPhone && !c.recovered && !c.reminderSent
    );
    if (customerCart) {
      let items: string[] = [];
      try { items = JSON.parse(customerCart.items || '[]').map((i: any) => i.name || i); } catch { items = []; }
      arsenal.abandonedCart = {
        items,
        total: Number(customerCart.totalAmount || 0),
      };
    }
  } catch { /* silent */ }

  try {
    // 4. Loyalty points — REAL integration with db_loyalty
    const loyaltyDb = await import('../db_loyalty');
    const customerPoints = await loyaltyDb.getCustomerPoints(merchantId, customerPhone);
    if (customerPoints) {
      arsenal.loyaltyPoints = customerPoints.totalPoints || 0;
      if (customerPoints.currentTierId) {
        const tier = await loyaltyDb.getLoyaltyTierById(customerPoints.currentTierId);
        if (tier && tier.merchantId === merchantId) {
          arsenal.loyaltyTier = {
            name: tier.nameAr || tier.name,
            icon: tier.icon || '⭐',
            discount: tier.discountPercentage || 0,
          };
        }
      }
    }
    // Available rewards
    const rewards = await loyaltyDb.getLoyaltyRewards(merchantId, true);
    arsenal.availableRewards = rewards.slice(0, 5).map((r: any) => ({
      name: r.titleAr || r.title,
      pointsCost: r.pointsCost,
    }));
  } catch { /* loyalty may not be set up */ }

  try {
    // 5. Customer bookings (upcoming)
    const bookings = await getBookingsByCustomer(merchantId, customerPhone);
    arsenal.upcomingBookings = (bookings as any[])
      .filter((b: any) => b.status === 'confirmed' || b.status === 'pending')
      .slice(0, 3)
      .map((b: any) => ({
        serviceName: b.serviceName || b.service_name || '',
        date: b.bookingDate || b.booking_date || '',
      }));
  } catch { /* bookings may not exist */ }

  try {
    // 6. Available services
    const services = await getServicesByMerchant(merchantId);
    arsenal.availableServices = (services as any[])
      .filter((s: any) => s.isActive || s.is_active)
      .slice(0, 5)
      .map((s: any) => ({ name: s.name, price: Number(s.price || 0) }));
  } catch { /* services may not exist */ }

  return arsenal;
}

// ═══════════════════════════════════════════════════════════════
// Persuasion Strategy Selector
// ═══════════════════════════════════════════════════════════════

/**
 * Select the best persuasion strategy based on customer state.
 * Pure logic — no API calls.
 */
export function selectPersuasion(
  profile: CustomerProfile, arsenal: SalesArsenal, intent: CustomerIntent, lastSentiment: string, usedTactics: string[],
  turn: { customerMessage: string; lastAssistantMessage?: string } = { customerMessage: '' },
): PersuasionPlan {
  const goal = decideSalesTurnGoal({ intent, ...turn });
  if (['respect_decline', 'resolve_existing_order', 'explain_requested_information', 'confirm_agreement'].includes(goal)
    || !arsenal || typeof arsenal !== 'object') return { strategy: 'none', prompt: '' };
  const used = usedTactics || [];
  // Solve the current problem before considering a basket, loyalty or an incentive.
  if (['angry', 'frustrated'].includes(lastSentiment)) return { strategy: 'empathy_resolve', prompt: buildEmpathyPrompt() };
  if (asksAboutDiscount(turn.customerMessage) && arsenal.activeDiscounts?.length) {
    return { strategy: 'proactive_discount', prompt: salesDiscountPrompt(arsenal.activeDiscounts.slice(0,1)), sweetener: arsenal.activeDiscounts[0].code };
  }
  if (goal === 'understand_objection' || goal === 'compare_suitable_options') return {
    strategy: 'value_comparison', prompt: '\nعالج السبب الحالي للاعتراض أو المقارنة بخصائص موثقة مرتبطة بالاحتياج. إن لم يتضح السبب اسأل عنه مرة واحدة. لا تفترض أن الخصم أو الشهادة أو رأي عملاء آخرين هو الحل.\n',
  };
  if (arsenal.abandonedCart && /السلة|سلتي|cart/i.test(turn.customerMessage) && !used.includes('cart_recovery')) {
    return { strategy: 'cart_recovery', prompt: buildCartRecoveryPrompt(arsenal.abandonedCart) };
  }
  if (/نقاط|ولاء|مكافآت|points|loyalty|rewards/i.test(turn.customerMessage) && (arsenal.loyaltyPoints || 0) > 0) {
    return { strategy: 'loyalty_reward', prompt: buildLoyaltyPrompt(arsenal.loyaltyPoints, arsenal.loyaltyTier, arsenal.availableRewards) };
  }
  if (/مكمل|إكسسوار|اكسسوار|accessor|complement/i.test(turn.customerMessage) && arsenal.crossSellSuggestions?.length && !used.includes('cross_sell')) {
    return { strategy: 'cross_sell', prompt: buildCrossSellPrompt(arsenal.crossSellSuggestions) };
  }
  return { strategy: 'none', prompt: '' };
}

// ═══════════════════════════════════════════════════════════════
// Prompt Builders
// ═══════════════════════════════════════════════════════════════

function buildCartRecoveryPrompt(cart: { items: string[]; total: number }): string {
  // SEC-V6-01 FIX: sanitize cart item names
  const safeItems = cart.items.map(i => sanitizeForArsenalPrompt(i));
  let prompt = `\n## 🛒 فرصة بيع — سلة مهجورة:\nهذا العميل عنده سلة مهجورة فيها: ${safeItems.join('، ')} بمبلغ ${cart.total} ريال.\n`;
  prompt += `- اذكر السلة بشكل طبيعي: "لاحظت إنك ما كملت طلبك السابق..."\n`;
  prompt += `- اسأل إذا يحتاج مساعدة لإكمال الطلب\n`;
  prompt += `- ⚠️ لا تضغط — اجعلها محادثة طبيعية\n`;
  return prompt;
}

function buildEmpathyPrompt(): string {
  let prompt = `\n## ⚠️ العميل غاضب/محبط — استراتيجية التعاطف:\n`;
  prompt += `- ابدأ بالاعتذار الصادق والتفهم\n`;
  prompt += `- اسأل عن المشكلة بالتحديد\n`;
  prompt += `- قدّم الحل الذي تثبته الأدوات أو وضّح ما يحتاج تحققاً؛ لا تعد بتعويض أو اتصال لم ينفذ\n`;
  prompt += `- لا تدافع — فقط حل واعتذر\n`;
  return prompt;
}

function buildLoyaltyPrompt(
  points: number,
  tier?: { name: string; icon: string; discount: number } | null,
  rewards?: { name: string; pointsCost: number }[]
): string {
  let prompt = `\n## 🌟 نظام الولاء — استخدمه بذكاء:\n`;
  prompt += `- عنده ${points} نقطة ولاء\n`;
  if (tier) {
    // SEC-V6-01 FIX: sanitize tier name
    const safeTierName = sanitizeForArsenalPrompt(tier.name);
    prompt += `- مستواه: ${tier.icon} ${safeTierName} (خصم ${tier.discount}%)\n`;
    prompt += `- اذكر مستواه بفخر: "أنت عميل ${safeTierName} عندنا!"\n`;
  }
  // SEC-V6-08 FIX: show max 2 rewards in prompt to reduce context bloat
  if (rewards && rewards.length > 0) {
    prompt += `- مكافآت يقدر يستبدلها:\n`;
    rewards.slice(0, 2).forEach(r => {
      const canRedeem = points >= r.pointsCost;
      // SEC-V6-01 FIX: sanitize reward name
      prompt += `  • ${sanitizeForArsenalPrompt(r.name)} (${r.pointsCost} نقطة) ${canRedeem ? 'رصيده يكفي؛ تحقق من شروط الاستبدال' : '🔒'}\n`;
    });
  }
  prompt += `- ⚠️ اذكر النقاط بشكل طبيعي: "بالمناسبة عندك ${points} نقطة!"\n`;
  return prompt;
}

// ═══════════════════════════════════════════════════════════════
// v6 Prompt Builders
// ═══════════════════════════════════════════════════════════════

function buildCrossSellPrompt(suggestions: { productName: string; reason: string }[]): string {
  let prompt = `\n## 🔗 خيارات مرشحة للمقارنة؛ تحقق من الملاءمة ولا تفترض التوافق:\n`;
  // SEC-V6-08 FIX: show max 2 in prompt
  suggestions.slice(0, 2).forEach(s => {
    // SEC-V6-01 FIX: sanitize product names
    prompt += `- "${sanitizeForArsenalPrompt(s.productName)}" (${sanitizeForArsenalPrompt(s.reason)})\n`;
  });
  prompt += `- ⚠️ اقترح واحد فقط بشكل طبيعي: "إذا كان Y يناسب الاستخدام الذي ذكرته يمكن مقارنته"\n`;
  prompt += `- لا تذكر كل الاقتراحات دفعة وحدة\n`;
  return prompt;
}

function buildBookingFollowupPrompt(
  bookings: { serviceName: string; date: string }[],
  services: { name: string; price: number }[]
): string {
  let prompt = `\n## 📅 حجوزات وخدمات:\n`;
  // SEC-V6-08 FIX: max 2 bookings + 2 services
  if (bookings.length > 0) {
    prompt += `- عنده حجوزات قادمة:\n`;
    bookings.slice(0, 2).forEach(b => {
      // SEC-V6-01 FIX: sanitize service name
      prompt += `  • ${sanitizeForArsenalPrompt(b.serviceName)} يوم ${b.date}\n`;
    });
    prompt += `- اسأله: "كيف استعداداتك لموعد ${sanitizeForArsenalPrompt(bookings[0].serviceName)}؟"\n`;
  }
  if (services.length > 0) {
    prompt += `- خدمات متاحة يمكن تقترحها:\n`;
    // SEC-V6-01 FIX: sanitize service names
    services.slice(0, 2).forEach(s => {
      prompt += `  • ${sanitizeForArsenalPrompt(s.name)}${s.price > 0 ? ` (${s.price} ريال)` : ''}\n`;
    });
  }
  prompt += `- ⚠️ اذكر الخدمات بشكل طبيعي فقط إذا مناسبة للسياق\n`;
  return prompt;
}

// ═══════════════════════════════════════════════════════════════
// Cross-sell Logic
// ═══════════════════════════════════════════════════════════════

/**
 * Build cross-sell suggestions from customer's purchase history.
 * Uses category matching to find complementary products.
 */
export function buildCrossSellSuggestions(
  purchaseHistory: string[],
  allProducts: any[]
): { productName: string; reason: string }[] {
  if (!purchaseHistory || purchaseHistory.length === 0 || !allProducts.length) return [];

  const history = purchaseHistory.filter(p => typeof p === 'string' && p.trim());
  if (!history.length) return [];
  const lastPurchase = history[history.length - 1];
  const purchased = new Set(history.map(p => p.toLowerCase()));
  const last = allProducts.find(p => p.name?.toLowerCase() === lastPurchase.toLowerCase());
  const category = last?.category || last?.categoryId;
  if (!category) return []; // Catalogue order alone says nothing about complementary products.
  const seen = new Set<string>();
  return filterProductsAvailableForSale(allProducts).filter(p => {
    if (typeof p.name !== 'string' || !p.name.trim() || purchased.has(p.name.toLowerCase()) || seen.has(p.name.toLowerCase())) return false;
    if (p.category !== category && p.categoryId !== category) return false;
    seen.add(p.name.toLowerCase()); return true;
  }).slice(0,3).map(p => ({ productName: p.name, reason: 'خيار في فئة "' + lastPurchase + '"؛ الفئة وحدها لا تثبت أنه مكمل أو متوافق' }));
}

// ═══════════════════════════════════════════════════════════════
// Strategy Metrics Tracking
// ═══════════════════════════════════════════════════════════════

import * as dbPool from '../db';

// SEC-V6-06 FIX: Strategy whitelist
const VALID_STRATEGIES = new Set([
  'cart_recovery', 'empathy_resolve', 'loyalty_reward', 'scarcity',
  'proactive_discount', 'smart_upsell', 'social_proof', 'value_comparison',
  'cross_sell', 'booking_followup', 'none'
]);

async function ensureMetricsTable(): Promise<void> {
  await assertRuntimeSchema('sales strategy metrics', [{ table: 'sari_strategy_metrics' }]);
}

/**
 * SEC-V6-02 FIX: Auto-cleanup old metrics (fire-and-forget, runs at most once/hour).
 */
let _lastCleanup = 0;
async function cleanupOldMetrics(): Promise<void> {
  if (Date.now() - _lastCleanup < 60 * 60 * 1000) return; // max once/hour
  _lastCleanup = Date.now();
  try {
    const pool = await dbPool.getPool();
    if (!pool) return;
    await pool.execute(
      `DELETE FROM sari_strategy_metrics WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)`
    );
  } catch { /* fire and forget */ }
}

/**
 * Record that a strategy was used (fire-and-forget).
 * SEC-V6-02 FIX: caps at 500 rows/merchant/day.
 * SEC-V6-06 FIX: validates strategy against whitelist.
 */
export async function recordStrategyUse(params: {
  merchantId: number;
  strategy: string;
  conversationId?: number;
  ledToPurchase?: boolean;
}): Promise<void> {
  try {
    // SEC-V6-06 FIX: validate strategy
    if (!VALID_STRATEGIES.has(params.strategy)) return;

    await ensureMetricsTable();
    const pool = await dbPool.getPool();
    if (!pool) return;

    // SEC-V6-02 FIX: check daily cap per merchant
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM sari_strategy_metrics WHERE merchant_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)`,
      [params.merchantId]
    );
    if ((countRows as any[])[0]?.cnt >= 500) return; // daily cap

    await pool.execute(
      `INSERT INTO sari_strategy_metrics (merchant_id, strategy, conversation_id, led_to_purchase) VALUES (?, ?, ?, ?)`,
      [params.merchantId, params.strategy, params.conversationId || null, params.ledToPurchase ? 1 : 0]
    );

    // SEC-V6-02 FIX: periodic cleanup
    cleanupOldMetrics().catch(() => {});
  } catch { /* fire and forget */ }
}

/**
 * Mark a strategy as having led to a purchase (when intent changes to ready_to_buy).
 */
export async function markStrategySuccess(merchantId: number, conversationId: number): Promise<void> {
  try {
    await ensureMetricsTable();
    const pool = await dbPool.getPool();
    if (!pool) return;
    await pool.execute(
      `UPDATE sari_strategy_metrics SET led_to_purchase = 1
       WHERE merchant_id = ? AND conversation_id = ? AND led_to_purchase = 0
       ORDER BY created_at DESC LIMIT 1`,
      [merchantId, conversationId]
    );
  } catch { /* fire and forget */ }
}
