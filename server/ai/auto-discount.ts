/**
 * Auto-Discount Engine — Personalized Discount Code Generation
 * 
 * Creates single-use, personalized discount codes when:
 * 1. Customer objects to price (intent: objecting)
 * 2. No existing discount codes are available
 * 3. Merchant has enabled auto-discount in bot_settings
 * 
 * The discount percentage escalates with objection strength:
 *   mild   → 5%   (first price complaint)
 *   strong → 10%  (repeated or emphatic complaint)
 *   final  → max% (customer threatening to leave)
 * 
 * Code format: CUSTOMERPREFIX-PERCENT-RANDOM (e.g., AHMED-10-X7K9)
 * Each code is single-use and expires per merchant settings.
 */

import { createDiscountCode, getDiscountCodesByMerchantId } from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ObjectionStrength = 'mild' | 'strong' | 'final';

export interface AutoDiscountResult {
  code: string;
  value: number;
  type: 'percentage';
  expiresAt: Date;
}

// Rate-limit: 1 auto-discount per customer per 24 hours
const _autoDiscountRateLimit = new Map<string, number>();

// ═══════════════════════════════════════════════════════════════
// Objection Strength Detection
// ═══════════════════════════════════════════════════════════════

const MILD_PATTERNS = [
  /غالي\s*شوي/i, /سعر.*عالي/i, /ممكن.*أقل/i, /في.*خصم/i,
  /عندكم.*عرض/i, /expensive/i, /too much/i,
  /مافي\s*خصم/i, /ما\s*في\s*خصم/i, /مافيه\s*خصم/i,
  /خصم\s*من\s*(حيث|ناحية)/i, /ممكن\s*خصم/i, /عندكم\s*خصم/i,
  /نبي\s*خصم/i, /أبغى\s*خصم/i, /ابي\s*خصم/i,
];

const STRONG_PATTERNS = [
  /كثير\s*والله/i, /مبالغ/i, /غالي\s*جداً/i, /ما\s*أقدر/i,
  /فوق\s*ميزانيتي/i, /أرخص\s*عند/i, /ليش\s*غالي/i,
];

const FINAL_PATTERNS = [
  /خلاص\s*ما\s*أبي/i, /بروح\s*(ل)?غيركم/i, /مكان\s*ثاني/i,
  /بتركك?م/i, /مو\s*مقتنع/i, /شكراً\s*ما\s*أبي/i,
  /لقيت\s*أفضل/i, /عند\s*غيركم\s*أرخص/i,
];

/**
 * Detect how strongly the customer is objecting to the price.
 * Returns null if no price objection is detected.
 */
export function detectObjectionStrength(message: string): ObjectionStrength | null {
  if (FINAL_PATTERNS.some(p => p.test(message))) return 'final';
  if (STRONG_PATTERNS.some(p => p.test(message))) return 'strong';
  if (MILD_PATTERNS.some(p => p.test(message))) return 'mild';
  // Fallback: generic price keywords
  if (/غالي|خصم|تخفيض/i.test(message)) return 'mild';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Discount Percentage by Objection Strength
// ═══════════════════════════════════════════════════════════════

function getDiscountPercent(strength: ObjectionStrength, maxPercent: number): number {
  const clamped = Math.max(5, Math.min(maxPercent, 50)); // Safety: 5-50%
  switch (strength) {
    case 'mild':   return Math.min(5, clamped);
    case 'strong': return Math.min(10, clamped);
    case 'final':  return clamped; // Full merchant-allowed max
  }
}

// ═══════════════════════════════════════════════════════════════
// Code Name Generation — Personalized with customer name
// ═══════════════════════════════════════════════════════════════

function generateCodeName(customerName: string | undefined, percent: number): string {
  // Clean and extract first name (Arabic/English safe)
  let prefix = 'VIP';
  if (customerName) {
    const cleaned = customerName
      .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, '') // Keep Arabic + English + numbers
      .substring(0, 6)
      .toUpperCase();
    if (cleaned.length >= 2) prefix = cleaned;
  }

  // Random suffix (4 chars)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 (avoid confusion)
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }

  return `${prefix}-${percent}-${suffix}`;
}

// ═══════════════════════════════════════════════════════════════
// Core: Generate Auto-Discount
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a personalized, single-use discount code for a customer.
 * Returns null if:
 * - Auto-discount is disabled for this merchant
 * - Rate-limited (1 per customer per 24h)
 * - Code creation fails
 */
export async function generateAutoDiscount(params: {
  merchantId: number;
  customerPhone: string;
  customerName?: string;
  customerMessage: string;
}): Promise<AutoDiscountResult | null> {
  try {
    // 1. Check merchant settings
    const { getBotSettings } = await import('../db');
    const settings = await getBotSettings(params.merchantId);
    
    if (!(settings as any)?.autoDiscountEnabled) {
      return null; // Feature disabled
    }

    const maxPercent = (settings as any)?.autoDiscountMaxPercent || 15;
    const expireHours = (settings as any)?.autoDiscountExpireHours || 48;

    // 2. Rate-limit: 1 per customer per 24h
    const rateLimitKey = `${params.merchantId}:${params.customerPhone}`;
    const lastGenerated = _autoDiscountRateLimit.get(rateLimitKey);
    if (lastGenerated && Date.now() - lastGenerated < 24 * 3600_000) {
      console.log(`[AutoDiscount] ⏳ Rate-limited for ${params.customerPhone.slice(-4)} (24h cooldown)`);
      return null;
    }

    // 3. Check if customer already has an unused auto-generated code
    const existingCodes = await getDiscountCodesByMerchantId(params.merchantId);
    const hasUnusedAutoCode = existingCodes.some((c: any) =>
      c.isAutoGenerated &&
      c.customerPhone === params.customerPhone &&
      c.isActive &&
      c.usedCount === 0 &&
      (!c.expiresAt || new Date(c.expiresAt) > new Date())
    );
    if (hasUnusedAutoCode) {
      console.log(`[AutoDiscount] ℹ️ Customer already has an unused auto-code`);
      return null;
    }

    // 4. Detect objection strength
    const strength = detectObjectionStrength(params.customerMessage);
    if (!strength) {
      return null; // No price objection detected
    }

    // 5. Calculate discount
    const percent = getDiscountPercent(strength, maxPercent);
    const code = generateCodeName(params.customerName, percent);
    const expiresAt = new Date(Date.now() + expireHours * 3600_000);

    // 6. Create in DB (same discount_codes table)
    const discountCode = await createDiscountCode({
      merchantId: params.merchantId,
      code,
      type: 'percentage',
      value: percent,
      maxUses: 1,
      usedCount: 0,
      expiresAt: expiresAt.toISOString().slice(0, 19).replace('T', ' '),
      isActive: 1,
      isAutoGenerated: 1,
      customerPhone: params.customerPhone,
    } as any);

    if (!discountCode) {
      console.error(`[AutoDiscount] ❌ Failed to create discount code`);
      return null;
    }

    // 7. Set rate-limit
    _autoDiscountRateLimit.set(rateLimitKey, Date.now());

    console.log(`[AutoDiscount] ✅ Created ${code} (${percent}% off, strength: ${strength}) for ${params.customerPhone.slice(-4)}, expires in ${expireHours}h`);

    return {
      code,
      value: percent,
      type: 'percentage',
      expiresAt,
    };
  } catch (err: any) {
    console.error(`[AutoDiscount] Error:`, err.message);
    return null;
  }
}

// Cleanup stale rate-limit entries every hour
setInterval(() => {
  const now = Date.now();
  const cutoff = 24 * 3600_000;
  const entries = Array.from(_autoDiscountRateLimit.entries());
  for (const [key, ts] of entries) {
    if (now - ts > cutoff) _autoDiscountRateLimit.delete(key);
  }
}, 3600_000);
