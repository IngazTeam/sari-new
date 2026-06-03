/**
 * Campaign Guard — P2 Fix
 * 
 * Protects campaigns from:
 * 1. Sending to opted-out customers
 * 2. Exceeding daily/monthly message limits per merchant
 * 3. Sending during quiet hours (22:00-08:00 local time)
 * 
 * Design:
 * - Opt-out stored in DB (campaign_optouts table)
 * - Rate limits tracked in-memory per merchant (reset daily)
 * - Quiet hours configurable per merchant (default: 22:00-08:00 KSA)
 * - All functions are non-blocking guards — they filter, not block
 */

// ═══════════════════════════════════════════════════════════════
// Opt-Out Management
// ═══════════════════════════════════════════════════════════════

let optoutTableChecked = false;

async function ensureOptoutTable(): Promise<void> {
  if (optoutTableChecked) return;
  try {
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) return;
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS campaign_optouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        opted_out_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reason VARCHAR(100) DEFAULT 'customer_request',
        UNIQUE KEY idx_merchant_phone (merchant_id, customer_phone),
        INDEX idx_merchant (merchant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    optoutTableChecked = true;
  } catch { /* silent */ }
}

/**
 * Check if a customer has opted out of campaigns.
 */
export async function isOptedOut(merchantId: number, phone: string): Promise<boolean> {
  try {
    await ensureOptoutTable();
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) return false;

    const [rows] = await pool.execute(
      'SELECT 1 FROM campaign_optouts WHERE merchant_id = ? AND customer_phone = ? LIMIT 1',
      [merchantId, phone]
    );
    return (rows as any[]).length > 0;
  } catch {
    return false; // On failure, allow sending (don't block)
  }
}

/**
 * Add a customer to the opt-out list.
 */
export async function addOptOut(merchantId: number, phone: string, reason: string = 'customer_request'): Promise<void> {
  try {
    await ensureOptoutTable();
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) return;

    await pool.execute(
      'INSERT IGNORE INTO campaign_optouts (merchant_id, customer_phone, reason) VALUES (?, ?, ?)',
      [merchantId, phone, reason]
    );
    console.log(`[CampaignGuard] Opted out: ${phone} for merchant ${merchantId}`);
  } catch (e) {
    console.warn('[CampaignGuard] Failed to add opt-out:', (e as Error).message);
  }
}

/**
 * Remove a customer from the opt-out list (re-subscribe).
 */
export async function removeOptOut(merchantId: number, phone: string): Promise<void> {
  try {
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) return;

    await pool.execute(
      'DELETE FROM campaign_optouts WHERE merchant_id = ? AND customer_phone = ?',
      [merchantId, phone]
    );
  } catch { /* silent */ }
}

// ═══════════════════════════════════════════════════════════════
// Rate Limiting (per merchant)
// ═══════════════════════════════════════════════════════════════

interface MerchantRate {
  messages: number;
  date: string; // YYYY-MM-DD
}

const merchantRates = new Map<number, MerchantRate>();

// Daily message limits per plan tier
const DAILY_CAMPAIGN_LIMITS: Record<string, number> = {
  free: 50,
  starter: 500,
  pro: 2000,
  business: 5000,
  unlimited: 10000,
};

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check and increment rate limit for a merchant.
 * Returns remaining capacity (0 = blocked).
 */
export function checkCampaignRate(merchantId: number, recipientCount: number, planSlug?: string): {
  allowed: boolean;
  remaining: number;
  limit: number;
} {
  const todayStr = today();
  const limit = DAILY_CAMPAIGN_LIMITS[planSlug || 'starter'] || 500;

  let rate = merchantRates.get(merchantId);
  if (!rate || rate.date !== todayStr) {
    rate = { messages: 0, date: todayStr };
    merchantRates.set(merchantId, rate);
  }

  const remaining = Math.max(0, limit - rate.messages);
  const allowed = remaining >= recipientCount;

  return { allowed, remaining, limit };
}

/**
 * Track messages sent (call AFTER successful send).
 */
export function trackCampaignSend(merchantId: number, count: number): void {
  const todayStr = today();
  let rate = merchantRates.get(merchantId);
  if (!rate || rate.date !== todayStr) {
    rate = { messages: 0, date: todayStr };
    merchantRates.set(merchantId, rate);
  }
  rate.messages += count;
}

// ═══════════════════════════════════════════════════════════════
// Quiet Hours
// ═══════════════════════════════════════════════════════════════

/**
 * Check if current time is within quiet hours.
 * Default: 22:00-08:00 KSA (UTC+3)
 */
export function isQuietHours(quietStart: number = 22, quietEnd: number = 8): boolean {
  // Get current hour in KSA timezone
  const ksaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
  const hour = ksaTime.getHours();

  // Quiet hours span midnight: 22:00 → 08:00
  if (quietStart > quietEnd) {
    return hour >= quietStart || hour < quietEnd;
  }
  return hour >= quietStart && hour < quietEnd;
}

// ═══════════════════════════════════════════════════════════════
// Unified Guard — Filter recipients
// ═══════════════════════════════════════════════════════════════

/**
 * Filter campaign recipients through all guards.
 * Returns only the phones that are safe to send to.
 */
export async function filterCampaignRecipients(
  merchantId: number,
  phones: string[],
  options?: {
    planSlug?: string;
    skipQuietHours?: boolean;
  }
): Promise<{
  allowed: string[];
  blocked: { phone: string; reason: string }[];
  warnings: string[];
}> {
  const blocked: { phone: string; reason: string }[] = [];
  const warnings: string[] = [];

  // 1. Quiet hours check
  if (!options?.skipQuietHours && isQuietHours()) {
    return {
      allowed: [],
      blocked: phones.map(p => ({ phone: p, reason: 'quiet_hours' })),
      warnings: ['الإرسال محجوب خلال ساعات الهدوء (10 مساءً - 8 صباحاً)'],
    };
  }

  // 2. Rate limit check
  const rateCheck = checkCampaignRate(merchantId, phones.length, options?.planSlug);
  if (!rateCheck.allowed) {
    const maxToSend = rateCheck.remaining;
    if (maxToSend === 0) {
      return {
        allowed: [],
        blocked: phones.map(p => ({ phone: p, reason: 'rate_limit' })),
        warnings: [`تم تجاوز الحد اليومي (${rateCheck.limit} رسالة/يوم)`],
      };
    }
    // Partial send: only send up to remaining capacity
    const excess = phones.slice(maxToSend);
    phones = phones.slice(0, maxToSend);
    for (const p of excess) {
      blocked.push({ phone: p, reason: 'rate_limit' });
    }
    warnings.push(`سيتم إرسال ${maxToSend} فقط من أصل ${phones.length + excess.length} (الحد اليومي: ${rateCheck.limit})`);
  }

  // 3. Opt-out check (batch)
  const allowed: string[] = [];
  for (const phone of phones) {
    const optedOut = await isOptedOut(merchantId, phone);
    if (optedOut) {
      blocked.push({ phone, reason: 'opted_out' });
    } else {
      allowed.push(phone);
    }
  }

  return { allowed, blocked, warnings };
}

// ═══════════════════════════════════════════════════════════════
// Opt-Out Detection from Customer Messages
// ═══════════════════════════════════════════════════════════════

const OPT_OUT_KEYWORDS = [
  'إلغاء الاشتراك', 'الغاء الاشتراك',
  'أوقف', 'اوقف', 'أوقفوا', 'اوقفوا',
  'لا أريد رسائل', 'لا اريد رسائل',
  'كفاية رسائل', 'بلا رسائل',
  'stop', 'unsubscribe', 'opt out', 'optout',
];

/**
 * Check if a customer message is an opt-out request.
 */
export function isOptOutRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return OPT_OUT_KEYWORDS.some(kw => lower.includes(kw));
}

// NQ-2: Register memory cleanup
import('../cron/memory-cleanup').then(({ registerMemoryCleanup }) => {
  registerMemoryCleanup('campaign-rates', () => {
    const todayStr = today();
    let evicted = 0;
    for (const [key, rate] of Array.from(merchantRates.entries())) {
      if (rate.date !== todayStr) { merchantRates.delete(key); evicted++; }
    }
    return evicted;
  });
}).catch(() => {});
