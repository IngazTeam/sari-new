/**
 * Sales Arsenal — Phase 3 of Adaptive Sales Engine
 * 
 * Loads ALL available sales weapons for a merchant and selects
 * the optimal persuasion strategy based on customer state.
 * 
 * Loaded ONCE per conversation session, not per message.
 */

import * as db from '../db';
import type { CustomerProfile, CustomerTier } from '../db/customer-intelligence';
import type { CustomerIntent, ConversationSession } from './session-context';

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
  activeDiscounts: { code: string; type: string; value: number; expiresAt?: string }[];
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
 * Load all available sales weapons for this merchant + customer.
 * Called ONCE at session creation, not per message.
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
    const discounts = await db.getDiscountCodesByMerchantId(merchantId);
    arsenal.activeDiscounts = discounts
      .filter((d: any) => d.isActive && (!d.maxUses || d.usedCount < d.maxUses))
      .slice(0, 5)
      .map((d: any) => ({
        code: d.code,
        type: d.discountType || 'percentage',
        value: d.discountValue || d.discountPercentage || 0,
        expiresAt: d.expiresAt?.toISOString?.() || d.expiresAt,
      }));
  } catch { /* discounts table may not exist */ }

  try {
    // 2. Products (for upsell + best sellers context)
    const products = await db.getProductsByMerchantId(merchantId);
    arsenal.totalProducts = products.length;
    arsenal.bestSellers = products
      .slice(0, 5)
      .map((p: any) => ({ name: p.name, price: p.price || 0 }));
  } catch { /* silent */ }

  try {
    // 3. Abandoned cart for this customer
    const carts = await db.getAbandonedCartsByMerchantId(merchantId);
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
        if (tier) {
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
    const bookings = await db.getBookingsByCustomer(merchantId, customerPhone);
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
    const services = await db.getServicesByMerchant(merchantId);
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
  profile: CustomerProfile,
  arsenal: SalesArsenal,
  intent: CustomerIntent,
  lastSentiment: string,
  usedTactics: string[]
): PersuasionPlan {
  
  // 1. Abandoned cart → highest priority recovery
  if (arsenal.abandonedCart && !usedTactics.includes('cart_recovery')) {
    const sweetener = arsenal.activeDiscounts[0]?.code;
    return {
      strategy: 'cart_recovery',
      prompt: buildCartRecoveryPrompt(arsenal.abandonedCart, sweetener),
      sweetener,
    };
  }

  // 2. Angry/frustrated → empathy + compensation
  if ((lastSentiment === 'angry' || lastSentiment === 'frustrated') && !usedTactics.includes('empathy_resolve')) {
    const sweetener = arsenal.activeDiscounts[0]?.code;
    return {
      strategy: 'empathy_resolve',
      prompt: buildEmpathyPrompt(sweetener),
      sweetener,
    };
  }

  // 3. VIP/loyal with loyalty points → reward (enhanced v6)
  if ((profile.customerTier === 'vip' || profile.customerTier === 'loyal') && arsenal.loyaltyPoints > 50 && !usedTactics.includes('loyalty_reward')) {
    return {
      strategy: 'loyalty_reward',
      prompt: buildLoyaltyPrompt(arsenal.loyaltyPoints, arsenal.loyaltyTier, arsenal.availableRewards),
    };
  }

  // 4. Price objection → value comparison + proactive discount
  if (intent === 'objecting' && !usedTactics.includes('proactive_discount') && arsenal.activeDiscounts.length > 0) {
    const discount = arsenal.activeDiscounts[0];
    return {
      strategy: 'proactive_discount',
      prompt: buildDiscountPrompt(discount),
      sweetener: discount.code,
    };
  }

  // 5. Comparing → social proof
  if (intent === 'comparing' && !usedTactics.includes('social_proof')) {
    return {
      strategy: 'social_proof',
      prompt: buildSocialProofPrompt(),
    };
  }

  // 6. Ready to buy → smart upsell
  if (intent === 'ready_to_buy' && arsenal.bestSellers.length > 1 && !usedTactics.includes('smart_upsell')) {
    return {
      strategy: 'smart_upsell',
      prompt: buildUpsellPrompt(arsenal.bestSellers),
    };
  }

  // 7. Cross-sell from purchase history (v6)
  if (arsenal.crossSellSuggestions.length > 0 && !usedTactics.includes('cross_sell')) {
    return {
      strategy: 'cross_sell',
      prompt: buildCrossSellPrompt(arsenal.crossSellSuggestions),
    };
  }

  // 8. Upcoming booking → follow-up (v6)
  if (arsenal.upcomingBookings.length > 0 && !usedTactics.includes('booking_followup')) {
    return {
      strategy: 'booking_followup',
      prompt: buildBookingFollowupPrompt(arsenal.upcomingBookings, arsenal.availableServices),
    };
  }

  // 9. New customer → social proof welcome
  if (profile.customerTier === 'new' && !usedTactics.includes('social_proof')) {
    return {
      strategy: 'social_proof',
      prompt: buildSocialProofPrompt(),
    };
  }

  // 10. Has active discounts but hasn't been offered → offer naturally
  if (arsenal.activeDiscounts.length > 0 && !usedTactics.includes('proactive_discount')) {
    const discount = arsenal.activeDiscounts[0];
    return {
      strategy: 'proactive_discount',
      prompt: buildDiscountPrompt(discount),
      sweetener: discount.code,
    };
  }

  // Default: no special tactic
  return { strategy: 'none', prompt: '' };
}

// ═══════════════════════════════════════════════════════════════
// Prompt Builders
// ═══════════════════════════════════════════════════════════════

function buildCartRecoveryPrompt(cart: { items: string[]; total: number }, discountCode?: string): string {
  // SEC-V6-01 FIX: sanitize cart item names
  const safeItems = cart.items.map(i => sanitizeForArsenalPrompt(i));
  let prompt = `\n## 🛒 فرصة بيع — سلة مهجورة:\nهذا العميل عنده سلة مهجورة فيها: ${safeItems.join('، ')} بمبلغ ${cart.total} ريال.\n`;
  prompt += `- اذكر السلة بشكل طبيعي: "لاحظت إنك ما كملت طلبك السابق..."\n`;
  prompt += `- اسأل إذا يحتاج مساعدة لإكمال الطلب\n`;
  if (discountCode) {
    prompt += `- إذا تردد، اعرض كود خصم "${sanitizeForArsenalPrompt(discountCode)}" كحافز إضافي\n`;
  }
  prompt += `- ⚠️ لا تضغط — اجعلها محادثة طبيعية\n`;
  return prompt;
}

function buildEmpathyPrompt(discountCode?: string): string {
  let prompt = `\n## ⚠️ العميل غاضب/محبط — استراتيجية التعاطف:\n`;
  prompt += `- ابدأ بالاعتذار الصادق والتفهم\n`;
  prompt += `- اسأل عن المشكلة بالتحديد\n`;
  prompt += `- قدّم حل عملي فوري\n`;
  if (discountCode) {
    prompt += `- كتعويض، اعرض كود خصم "${discountCode}" على طلبه القادم\n`;
  }
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
      prompt += `  • ${sanitizeForArsenalPrompt(r.name)} (${r.pointsCost} نقطة) ${canRedeem ? '✅ يقدر الآن' : '🔒'}\n`;
    });
  }
  prompt += `- ⚠️ اذكر النقاط بشكل طبيعي: "بالمناسبة عندك ${points} نقطة!"\n`;
  return prompt;
}

function buildDiscountPrompt(discount: { code: string; type: string; value: number }): string {
  const label = discount.type === 'percentage' ? `${discount.value}%` : `${discount.value} ريال`;
  return `\n## 💰 خصم متاح — اعرضه بذكاء:\n- كود الخصم: "${discount.code}" (${label})\n- ⚠️ لا تبدأ بالخصم! ابدأ بشرح القيمة والمميزات\n- بعد ما يبدي اهتمام، اعرض الخصم كـ "مكافأة": "وبما إنك عميل مميز، عندي لك كود خصم ${label}!"\n- لا تعطي الخصم إلا بعد ما يسأل عن السعر أو يتردد\n`;
}

function buildSocialProofPrompt(): string {
  return `\n## 👥 استخدم الدليل الاجتماعي:\n- اذكر أن المنتج "الأكثر طلباً" أو "المفضل عند عملائنا"\n- استخدم عبارات مثل: "أغلب عملائنا يختارون هذا"\n- لا تخترع أرقام — استخدم عبارات عامة صادقة\n`;
}

function buildUpsellPrompt(products: { name: string; price: number }[]): string {
  const suggestions = products.slice(1, 3).map(p => p.name).join(' أو ');
  return `\n## 📦 فرصة بيع إضافي (Upsell):\n- بعد ما يختار المنتج، اقترح منتج مكمل بشكل طبيعي\n- مثل: "أغلب اللي طلبوا هذا أخذوا معاه ${suggestions}"\n- ⚠️ اقترح منتج واحد فقط — لا تبالغ\n`;
}

// ═══════════════════════════════════════════════════════════════
// v6 Prompt Builders
// ═══════════════════════════════════════════════════════════════

function buildCrossSellPrompt(suggestions: { productName: string; reason: string }[]): string {
  let prompt = `\n## 🔗 اقتراحات ذكية مبنية على مشترياته السابقة:\n`;
  // SEC-V6-08 FIX: show max 2 in prompt
  suggestions.slice(0, 2).forEach(s => {
    // SEC-V6-01 FIX: sanitize product names
    prompt += `- "${sanitizeForArsenalPrompt(s.productName)}" (${sanitizeForArsenalPrompt(s.reason)})\n`;
  });
  prompt += `- ⚠️ اقترح واحد فقط بشكل طبيعي: "بما إنك أخذت X، ممكن يعجبك Y"\n`;
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

  const lastPurchase = purchaseHistory[purchaseHistory.length - 1];
  const purchasedNames = new Set(purchaseHistory.map(p => p.toLowerCase()));

  // Find the category of the last purchased product
  const lastProduct = allProducts.find((p: any) =>
    p.name?.toLowerCase() === lastPurchase.toLowerCase()
  );
  const lastCategory = lastProduct?.category || lastProduct?.categoryId;

  const suggestions: { productName: string; reason: string }[] = [];

  if (lastCategory) {
    // Same category products they haven't bought
    const sameCat = allProducts.filter((p: any) =>
      (p.category === lastCategory || p.categoryId === lastCategory) &&
      !purchasedNames.has(p.name?.toLowerCase()) &&
      (p.isActive ?? true)
    );
    sameCat.slice(0, 2).forEach((p: any) => {
      suggestions.push({
        productName: p.name,
        reason: `من نفس فئة "${lastPurchase}"`,
      });
    });
  }

  // If not enough, add best sellers they haven't bought
  if (suggestions.length < 3) {
    const unbought = allProducts.filter((p: any) =>
      !purchasedNames.has(p.name?.toLowerCase()) &&
      (p.isActive ?? true)
    );
    unbought.slice(0, 3 - suggestions.length).forEach((p: any) => {
      suggestions.push({
        productName: p.name,
        reason: `منتج مميز يكمّل مشترياتك`,
      });
    });
  }

  return suggestions.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════
// Strategy Metrics Tracking
// ═══════════════════════════════════════════════════════════════

import * as dbPool from '../db';

let _metricsTableCreated = false;

// SEC-V6-06 FIX: Strategy whitelist
const VALID_STRATEGIES = new Set([
  'cart_recovery', 'empathy_resolve', 'loyalty_reward', 'scarcity',
  'proactive_discount', 'smart_upsell', 'social_proof', 'value_comparison',
  'cross_sell', 'booking_followup', 'none'
]);

async function ensureMetricsTable(): Promise<void> {
  if (_metricsTableCreated) return;
  const pool = await dbPool.getPool();
  if (!pool) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sari_strategy_metrics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      strategy VARCHAR(50) NOT NULL,
      was_used TINYINT(1) DEFAULT 1,
      led_to_purchase TINYINT(1) DEFAULT 0,
      conversation_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_merchant_strategy (merchant_id, strategy),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  _metricsTableCreated = true;
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
