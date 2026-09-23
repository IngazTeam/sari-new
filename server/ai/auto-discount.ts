import { asksAboutDiscount, selectSalesDiscounts } from './sales-offer-evidence';
import { normalizeCampaignPhone } from '../automation/campaign-guard';
import { isSalesRefusal } from './customer-decision';
/**
 * Auto-Discount Engine — Personalized Discount Code Generation
 * 
 * Creates single-use, personalized discount codes when:
 * 1. Customer explicitly asks about a discount; price resistance alone is not authorization
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

import { randomBytes } from 'node:crypto';
import { databaseTimeEpoch } from '../db/time';
import { withSalesOfferAuthority, hasSalesOfferAttempt, recordSalesOfferAttempt } from './sales-offer-authority';

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

// Issuance limits and source idempotency are durable in sales_offer_limits / sales_offer_attempts.

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
  const clamped = Math.min(maxPercent, 50); // Never raise the merchant-authorized ceiling to 5%.
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

  return `${prefix}-${percent}-${randomBytes(6).toString('hex').toUpperCase()}`;
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
  conversationId?: number;
  incomingMessageId?: number;
}): Promise<AutoDiscountResult | null> {
  try {
    if (!asksAboutDiscount(params.customerMessage) || isSalesRefusal(params.customerMessage)) return null;
    if (!/^[+\d][\d ()-]*(?:@c\.us)?$/.test(params.customerPhone)) return null;
    const customerPhone = normalizeCampaignPhone(params.customerPhone);
    if (!customerPhone || !Number.isSafeInteger(params.conversationId) || !Number.isSafeInteger(params.incomingMessageId)) return null;
    const identity = { merchantId: params.merchantId, customerPhone,
      conversationId: params.conversationId!, incomingMessageId: params.incomingMessageId! };
    return await withSalesOfferAuthority(identity, async ({ connection, phone, source, now, issueLimited }) => {
      if (issueLimited || await hasSalesOfferAttempt(connection, identity, 'issue')) return null; // 24h cooldown, across workers
      const [settingsRows] = await connection.execute<any[]>(`SELECT auto_discount_enabled AS autoDiscountEnabled,
        auto_discount_max_percent AS autoDiscountMaxPercent, auto_discount_expire_hours AS autoDiscountExpireHours
        FROM bot_settings WHERE merchant_id=? FOR UPDATE`, [params.merchantId]);
      if (settingsRows.length !== 1) return null; // Ambiguous policy is not authority to issue money.
      const settings = settingsRows[0];
      if (settings?.autoDiscountEnabled !== 1 && settings?.autoDiscountEnabled !== true) return null; // Feature disabled
      const maxPercent = settings.autoDiscountMaxPercent ?? 15;
      const expireHours = settings.autoDiscountExpireHours ?? 48;
      if (!Number.isSafeInteger(maxPercent) || maxPercent < 1 || maxPercent > 50
        || !Number.isSafeInteger(expireHours) || expireHours < 1 || expireHours > 168) return null;
      const [existingCodes] = await connection.execute<any[]>(`SELECT *, customer_phone AS customerPhone FROM discount_codes
        WHERE merchantId=? AND is_auto_generated=1 FOR UPDATE`, [params.merchantId]);
      // Honour pre-migration issuance too, including exhausted/deactivated codes. Deletion after this release cannot reset the ledger.
      if (existingCodes.some(c => normalizeCampaignPhone(c.customerPhone || '') === phone
        && databaseTimeEpoch(c.createdAt) > now - 24 * 3600_000)) return null;
      const hasUnusedAutoCode = selectSalesDiscounts(existingCodes.filter(c => c.customerPhone), { merchantId: params.merchantId, customerPhone: phone, now }).length > 0;
      if (hasUnusedAutoCode) return null; // Customer already has an unused auto-code
      const strength = detectObjectionStrength(source) || 'mild';
      const percent = getDiscountPercent(strength, maxPercent);
      const code = generateCodeName(params.customerName, percent);
      const expiresAt = new Date(now + expireHours * 3600_000);
      const payload = { merchantId: params.merchantId, code, type: 'percentage', value: percent,
        minOrderAmount: 0, maxUses: 1, usedCount: 0, expiresAt: expiresAt.toISOString(), isActive: 1, isAutoGenerated: 1,
        customerPhone,
      };
      const [inserted] = await connection.execute<any>(`INSERT INTO discount_codes
        (merchantId,code,type,value,minOrderAmount,maxUses,usedCount,expiresAt,isActive,is_auto_generated,customer_phone)
        VALUES (?,?,'percentage',?,0,1,0,?,1,1,?)`,
      [params.merchantId, code, percent, expiresAt.toISOString().slice(0,23).replace('T',' '), phone]);
      const offer = selectSalesDiscounts([{ ...payload, id: Number(inserted.insertId) }], { merchantId: params.merchantId, customerPhone: phone, now })[0];
      if (!offer) throw new Error('Generated sales offer failed validation');
      await recordSalesOfferAttempt(connection, identity, phone, 'issue', offer);
      return { code, value: percent, type: 'percentage' as const, expiresAt };
    });
  } catch {
    // An ambiguous commit must never be retried as another issuance. The durable source/limit fence survives a successful commit.
    console.warn('[AutoDiscount] Issuance unavailable or requires review');
    return null;
  }
}
