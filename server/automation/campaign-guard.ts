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
 * - Suppression is fail-closed: an unavailable list blocks marketing sends
 */

// ═══════════════════════════════════════════════════════════════
// Opt-Out Management
// ═══════════════════════════════════════════════════════════════

import { assertRuntimeSchema } from '../db/schema-readiness';
import { privacyHashExact } from '../accounts/privacy-hash';
import { createHash } from 'node:crypto';

const CAMPAIGN_SUPPRESSION_QUERY_BATCH = 100;
export const CAMPAIGN_CONSENT_VERSION = 'campaign-marketing-v1';
const CAMPAIGN_DECISION_SOURCES = new Set(['whatsapp_text', 'interactive_control']);
const CAMPAIGN_DECISION_PROVIDERS = new Set(['green_api', 'meta_cloud']);

export const CAMPAIGN_OPT_OUT_NOTICE_AR = 'لإيقاف الرسائل التسويقية أرسل «إلغاء الاشتراك».';

export class CampaignSuppressionUnavailableError extends Error {
  constructor() {
    super('Campaign suppression list is unavailable');
    this.name = 'CampaignSuppressionUnavailableError';
  }
}

function mysqlErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
}

export function normalizeCampaignPhone(phone: string): string | null {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
}

function campaignPhoneLookupForms(phone: string): string[] {
  const forms = new Set([phone, `+${phone}`, `00${phone}`]);
  if (/^9665\d{8}$/.test(phone)) {
    forms.add(`0${phone.slice(3)}`);
    forms.add(phone.slice(3));
  }
  return Array.from(forms);
}

function requireMerchantId(merchantId: number): void {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new CampaignSuppressionUnavailableError();
  }
}

async function suppressionPool() {
  try {
    await ensureCampaignConsentTables();
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) throw new CampaignSuppressionUnavailableError();
    return pool;
  } catch (error) {
    if (error instanceof CampaignSuppressionUnavailableError) throw error;
    throw new CampaignSuppressionUnavailableError();
  }
}

async function ensureCampaignConsentTables(): Promise<void> {
  await assertRuntimeSchema('customer campaign consent', [
    { table: 'campaign_optouts' },
    { table: 'campaign_consent_receipts' },
    { table: 'campaign_consent_state' },
  ]);
}

/**
 * Check if a customer has opted out of campaigns.
 */
export async function hasActiveCampaignConsent(merchantId: number, phone: string): Promise<boolean> {
  const normalized = normalizeCampaignPhone(phone);
  if (!normalized) return false;
  const states = await getCampaignConsentStates(merchantId, [normalized]);
  return states.get(normalized) === 'granted';
}

export async function recordCustomerMarketingDecision(input: {
  merchantId: number;
  phone: string;
  decision: 'granted' | 'withdrawn';
  source: 'whatsapp_text' | 'interactive_control';
  provider: 'green_api' | 'meta_cloud';
  providerEventId: string;
  evidenceText: string;
  occurredAt: Date;
}): Promise<{
  recorded: boolean;
  decision: 'granted' | 'withdrawn';
  confirmationIdempotencyKey: string;
}> {
  requireMerchantId(input.merchantId);
  const phone = normalizeCampaignPhone(input.phone);
  const providerEventId = String(input.providerEventId || '').trim();
  const evidenceText = String(input.evidenceText || '').normalize('NFKC').trim();
  const occurredAt = input.occurredAt instanceof Date ? input.occurredAt : new Date(Number.NaN);
  if (
    !phone
    || (input.decision !== 'granted' && input.decision !== 'withdrawn')
    || !CAMPAIGN_DECISION_SOURCES.has(input.source)
    || !CAMPAIGN_DECISION_PROVIDERS.has(input.provider)
    || !providerEventId
    || providerEventId.length > 255
    || !evidenceText
    || evidenceText.length > 4096
    || !Number.isFinite(occurredAt.getTime())
    || occurredAt.getTime() > Date.now() + 5 * 60_000
  ) {
    throw new CampaignSuppressionUnavailableError();
  }

  const decidedAt = occurredAt.toISOString().replace('T', ' ').replace('Z', '');
  // Provider IDs are high-entropy opaque identifiers. An unkeyed digest keeps
  // replay identity stable across privacy-key rotation without storing the ID.
  const providerEventDigest = createHash('sha256').update(JSON.stringify([
    'campaign-consent-event-v1', input.merchantId, input.provider, providerEventId,
  ]), 'utf8').digest('hex');
  const confirmationIdempotencyKey = `consent:${providerEventDigest.slice(0, 48)}`;
  const evidenceDigest = privacyHashExact(JSON.stringify([
    'campaign-consent-evidence-v1', input.merchantId, phone, input.decision,
    input.source, input.provider, CAMPAIGN_CONSENT_VERSION, evidenceText,
  ]));
  const pool = await suppressionPool();
  let connection;
  try {
    connection = await pool.getConnection();
  } catch {
    throw new CampaignSuppressionUnavailableError();
  }
  if (!connection) throw new CampaignSuppressionUnavailableError();
  try {
    await connection.beginTransaction();
    let receiptResult: { affectedRows?: number; insertId?: number };
    try {
      const [result] = await connection.execute(
        `INSERT INTO campaign_consent_receipts
          (merchant_id, customer_phone, decision, source, provider, consent_version,
           evidence_digest, provider_event_digest, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.merchantId, phone, input.decision, input.source, input.provider,
          CAMPAIGN_CONSENT_VERSION, evidenceDigest, providerEventDigest, decidedAt,
        ],
      );
      receiptResult = result as { affectedRows?: number; insertId?: number };
    } catch (error) {
      if (mysqlErrorCode(error) !== 'ER_DUP_ENTRY') throw error;
      await connection.commit();
      return { recorded: false, decision: input.decision, confirmationIdempotencyKey };
    }
    const recorded = Number(receiptResult.affectedRows || 0) === 1;
    const receiptId = Number((receiptResult as { insertId?: number }).insertId || 0);
    if (!recorded || !Number.isSafeInteger(receiptId) || receiptId <= 0) {
      throw new Error('CAMPAIGN_CONSENT_RECEIPT_NOT_INSERTED');
    }
    if (recorded) {
      await connection.execute(
        `INSERT INTO campaign_consent_state
          (merchant_id, customer_phone, status, consent_version, source,
           evidence_digest, last_decided_at, last_receipt_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          status = IF(
            VALUES(last_decided_at) > last_decided_at
              OR (VALUES(last_decided_at) = last_decided_at AND VALUES(status) = 'withdrawn'),
            VALUES(status), status),
          consent_version = IF(
            VALUES(last_decided_at) > last_decided_at
              OR (VALUES(last_decided_at) = last_decided_at AND VALUES(status) = 'withdrawn'),
            VALUES(consent_version), consent_version),
          source = IF(
            VALUES(last_decided_at) > last_decided_at
              OR (VALUES(last_decided_at) = last_decided_at AND VALUES(status) = 'withdrawn'),
            VALUES(source), source),
          evidence_digest = IF(
            VALUES(last_decided_at) > last_decided_at
              OR (VALUES(last_decided_at) = last_decided_at AND VALUES(status) = 'withdrawn'),
            VALUES(evidence_digest), evidence_digest),
          last_receipt_id = IF(
            VALUES(last_decided_at) > last_decided_at
              OR (VALUES(last_decided_at) = last_decided_at AND VALUES(status) = 'withdrawn'),
            VALUES(last_receipt_id), last_receipt_id),
          last_decided_at = GREATEST(VALUES(last_decided_at), last_decided_at)`,
        [
          input.merchantId, phone, input.decision, CAMPAIGN_CONSENT_VERSION,
          input.source, evidenceDigest, decidedAt, receiptId,
        ],
      );
      if (input.decision === 'withdrawn') {
        await connection.execute(
          `INSERT INTO campaign_optouts (merchant_id, customer_phone, opted_out_at, reason)
           VALUES (?, ?, ?, 'customer_request')
           ON DUPLICATE KEY UPDATE
            opted_out_at = GREATEST(opted_out_at, VALUES(opted_out_at)),
            reason = VALUES(reason)`,
          [input.merchantId, phone, decidedAt],
        );
      }
    }
    await connection.commit();
    return { recorded, decision: input.decision, confirmationIdempotencyKey };
  } catch {
    try {
      await connection.rollback();
    } catch {
      // Preserve the generic fail-closed error even if rollback itself fails.
    }
    throw new CampaignSuppressionUnavailableError();
  } finally {
    try {
      connection.release();
    } catch {
      // The decision is already committed or rolled back; never leak driver detail.
    }
  }
}

export async function getCampaignConsentStates(
  merchantId: number,
  phones: string[],
): Promise<Map<string, 'granted' | 'withdrawn'>> {
  requireMerchantId(merchantId);
  const normalized = Array.from(new Set(
    phones.map(normalizeCampaignPhone).filter((phone): phone is string => Boolean(phone)),
  ));
  if (!normalized.length) return new Map();
  const pool = await suppressionPool();
  const states = new Map<string, 'granted' | 'withdrawn'>();
  try {
    for (let offset = 0; offset < normalized.length; offset += CAMPAIGN_SUPPRESSION_QUERY_BATCH) {
      const batch = normalized.slice(offset, offset + CAMPAIGN_SUPPRESSION_QUERY_BATCH);
      const lookupForms = Array.from(new Set(batch.flatMap(campaignPhoneLookupForms)));
      const placeholders = lookupForms.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT customer_phone AS customerPhone, status
           FROM campaign_consent_state
          WHERE merchant_id = ? AND customer_phone IN (${placeholders})`,
        [merchantId, ...lookupForms],
      );
      for (const row of rows as Array<{ customerPhone?: string; status?: string }>) {
        const phone = normalizeCampaignPhone(String(row.customerPhone || ''));
        if (phone && (row.status === 'granted' || row.status === 'withdrawn')) {
          if (row.status === 'withdrawn' || !states.has(phone)) states.set(phone, row.status);
        }
      }
    }
    return states;
  } catch {
    throw new CampaignSuppressionUnavailableError();
  }
}

export async function filterSuppressedCampaignRecipients(
  merchantId: number,
  phones: string[],
): Promise<{ allowed: string[]; blocked: { phone: string; reason: 'invalid_phone' | 'missing_consent' | 'opted_out' }[] }> {
  const blocked: { phone: string; reason: 'invalid_phone' | 'missing_consent' | 'opted_out' }[] = [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const original of phones) {
    const phone = normalizeCampaignPhone(original);
    if (!phone) {
      blocked.push({ phone: original, reason: 'invalid_phone' });
    } else if (!seen.has(phone)) {
      seen.add(phone);
      normalized.push(phone);
    }
  }
  const states = await getCampaignConsentStates(merchantId, normalized);
  const allowed: string[] = [];
  for (const phone of normalized) {
    const status = states.get(phone);
    if (status === 'granted') allowed.push(phone);
    else blocked.push({ phone, reason: status === 'withdrawn' ? 'opted_out' : 'missing_consent' });
  }
  return { allowed, blocked };
}

export function withCampaignOptOutNotice(message: string): string {
  const trimmed = message.trim();
  if (isOptOutNoticePresent(trimmed)) return trimmed;
  return `${trimmed}\n\n${CAMPAIGN_OPT_OUT_NOTICE_AR}`;
}

function isOptOutNoticePresent(message: string): boolean {
  const normalized = message.normalize('NFKC').toLowerCase();
  return normalized.includes('إلغاء الاشتراك')
    || normalized.includes('الغاء الاشتراك')
    || /\b(?:unsubscribe|opt[ -]?out)\b/i.test(normalized);
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
 * Default: 22:00-08:00 in merchant's timezone (fallback: Asia/Riyadh)
 */
export function isQuietHours(quietStart: number = 22, quietEnd: number = 8, merchantTimezone: string = 'Asia/Riyadh'): boolean {
  // Get current hour in merchant's configured timezone
  const localTime = new Date(new Date().toLocaleString('en-US', { timeZone: merchantTimezone }));
  const hour = localTime.getHours();

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
  const suppression = await filterSuppressedCampaignRecipients(merchantId, phones);
  phones = suppression.allowed;
  blocked.push(...suppression.blocked);

  // Resolve merchant timezone for quiet hours
  let merchantTz = 'Asia/Riyadh';
  try {
    const { getMerchantById } = await import('../db');
    const merchant = await getMerchantById(merchantId);
    if ((merchant as any)?.timezone) merchantTz = (merchant as any).timezone;
  } catch { /* fallback to default */ }

  // 1. Quiet hours check
  if (!options?.skipQuietHours && isQuietHours(22, 8, merchantTz)) {
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

  return { allowed: phones, blocked, warnings };
}

// ═══════════════════════════════════════════════════════════════
// Opt-Out Detection from Customer Messages
// ═══════════════════════════════════════════════════════════════

const OPT_OUT_REQUESTS = [
  /^(?:من فضلك |لو سمحت |رجاء )?(?:إلغاء الاشتراك|الغاء الاشتراك)(?: من الرسائل| التسويقية| نهائيا| شكر[اأ])?$/,
  /^(?:من فضلك |لو سمحت |رجاء )?(?:أوقف|اوقف|أوقفوا|اوقفوا)(?: الرسائل| الرسائل التسويقية)?(?: من فضلك| شكر[اأ])?$/,
  /^(?:لا أريد رسائل|لا اريد رسائل|كفاية رسائل|بلا رسائل)(?: منكم| تسويقية| بعد الآن)?$/,
  /^(?:stop|unsubscribe|opt out|optout|no more messages)(?: please)?$/i,
];

const OPT_IN_REQUESTS = [
  /^(?:أوافق على |اوافق على )?(?:الاشتراك|اشتراك)(?: في)?(?: العروض| الرسائل التسويقية| رسائل العروض)$/,
  /^(?:اشترك|سجلني)(?: في)?(?: العروض| الرسائل التسويقية| رسائل العروض)$/,
  /^(?:start|subscribe|opt in|optin)(?: please)?$/i,
];

/**
 * Check if a customer message is an opt-out request.
 */
export function isOptOutRequest(message: string): boolean {
  const normalized = normalizeCampaignDecisionText(message);
  if (!normalized) return false;
  return OPT_OUT_REQUESTS.some(pattern => pattern.test(normalized));
}

export function isOptInRequest(message: string): boolean {
  const normalized = normalizeCampaignDecisionText(message);
  if (!normalized) return false;
  return OPT_IN_REQUESTS.some(pattern => pattern.test(normalized));
}

function normalizeCampaignDecisionText(message: string): string {
  const normalized = String(message || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[.!،,;؛؟?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.length > 120) return '';
  return normalized;
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
