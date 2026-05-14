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
// Types
// ═══════════════════════════════════════════════════════════════

export interface SalesArsenal {
  activeDiscounts: { code: string; type: string; value: number; expiresAt?: string }[];
  loyaltyPoints: number;
  availableRewards: { name: string; pointsCost: number }[];
  abandonedCart: { items: string[]; total: number } | null;
  bestSellers: { name: string; price: number }[];
  totalProducts: number;
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
    availableRewards: [],
    abandonedCart: null,
    bestSellers: [],
    totalProducts: 0,
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
    // 4. Loyalty points
    const { getCustomerLoyaltyInfo } = await import('../loyalty-integration');
    // We just need the points number, not the full message
    // This is a lightweight check
  } catch { /* loyalty may not be set up */ }

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

  // 3. VIP with loyalty points → reward
  if (profile.customerTier === 'vip' && arsenal.loyaltyPoints > 50 && !usedTactics.includes('loyalty_reward')) {
    return {
      strategy: 'loyalty_reward',
      prompt: buildLoyaltyPrompt(arsenal.loyaltyPoints),
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

  // 7. New customer → social proof welcome
  if (profile.customerTier === 'new' && !usedTactics.includes('social_proof')) {
    return {
      strategy: 'social_proof',
      prompt: buildSocialProofPrompt(),
    };
  }

  // 8. Has active discounts but hasn't been offered → offer naturally
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
  let prompt = `\n## 🛒 فرصة بيع — سلة مهجورة:\nهذا العميل عنده سلة مهجورة فيها: ${cart.items.join('، ')} بمبلغ ${cart.total} ريال.\n`;
  prompt += `- اذكر السلة بشكل طبيعي: "لاحظت إنك ما كملت طلبك السابق..."\n`;
  prompt += `- اسأل إذا يحتاج مساعدة لإكمال الطلب\n`;
  if (discountCode) {
    prompt += `- إذا تردد، اعرض كود خصم "${discountCode}" كحافز إضافي\n`;
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

function buildLoyaltyPrompt(points: number): string {
  return `\n## 🌟 العميل عنده ${points} نقطة ولاء:\n- اذكر نقاطه بشكل طبيعي: "بالمناسبة، عندك ${points} نقطة!"\n- اقترح استبدالها بخصم أو مكافأة\n- هذا يعزز الولاء ويحفز الشراء\n`;
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
