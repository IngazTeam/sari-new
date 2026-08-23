/**
 * Occasion campaigns are opt-in definitions. The daily job only admits an
 * already-enabled definition to the canonical campaign outbox; it never
 * creates or enables marketing on behalf of a merchant and never calls a
 * provider directly.
 */

import { randomBytes } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getActiveSubscriptionByMerchantId,
  getConversationsByMerchantId,
  getDispatchableOccasionCampaigns,
  getMerchantById,
  getPool,
  getPrimaryWhatsAppInstance,
} from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  CampaignDispatchConflictError,
  completeCampaignWithoutRecipients,
  enqueueCampaignDeliveries,
} from './campaign-delivery-outbox';
import {
  filterCampaignRecipients,
  normalizeCampaignPhone,
} from './campaign-guard';

export type OccasionType =
  | 'ramadan'
  | 'eid_fitr'
  | 'eid_adha'
  | 'national_day'
  | 'new_year'
  | 'hijri_new_year';

type OccasionDefinition = {
  name: string;
  discountPercent: number;
};

export type DetectedOccasion = OccasionDefinition & {
  type: OccasionType;
  year: number;
};

export type UpcomingOccasion = DetectedOccasion & {
  date: string;
  daysUntil: number;
};

const RIYADH_TIMEZONE = 'Asia/Riyadh';
const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_CALENDAR_SCAN_DAYS = 370;

const OCCASIONS: Record<OccasionType, OccasionDefinition> = {
  ramadan: { name: 'رمضان المبارك', discountPercent: 20 },
  eid_fitr: { name: 'عيد الفطر المبارك', discountPercent: 25 },
  eid_adha: { name: 'عيد الأضحى المبارك', discountPercent: 25 },
  national_day: { name: 'اليوم الوطني السعودي', discountPercent: 23 },
  new_year: { name: 'رأس السنة الميلادية', discountPercent: 15 },
  hijri_new_year: { name: 'رأس السنة الهجرية', discountPercent: 15 },
};

const OCCASION_PREFIXES: Record<OccasionType, string> = {
  ramadan: 'RAMADAN',
  eid_fitr: 'EIDFITR',
  eid_adha: 'EIDADHA',
  national_day: 'NATIONAL',
  new_year: 'NEWYEAR',
  hijri_new_year: 'HIJRI',
};

const gregorianFormatter = new Intl.DateTimeFormat('en-u-ca-gregory-nu-latn', {
  timeZone: RIYADH_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const ummAlQuraFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  timeZone: RIYADH_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function calendarParts(formatter: Intl.DateTimeFormat, date: Date): { year: number; month: number; day: number } {
  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map(part => [part.type, Number(part.value)]),
  );
  if (![values.year, values.month, values.day].every(Number.isSafeInteger)) {
    throw new Error('The runtime does not support the required Saudi calendar');
  }
  return { year: values.year, month: values.month, day: values.day };
}

function riyadhGregorianParts(date: Date) {
  return calendarParts(gregorianFormatter, date);
}

function riyadhDateKey(date: Date): string {
  const { year, month, day } = riyadhGregorianParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function riyadhNoon(date: Date): Date {
  const { year, month, day } = riyadhGregorianParts(date);
  return new Date(Date.UTC(year, month - 1, day, 9, 0, 0));
}

export function getOccasionDiscountPercentage(type: OccasionType): number {
  return OCCASIONS[type].discountPercent;
}

/** Detect every matching fixed/lunar occasion; two calendars may overlap. */
export function detectCurrentOccasions(at: Date = new Date()): DetectedOccasion[] {
  const gregorian = riyadhGregorianParts(at);
  const types: OccasionType[] = [];
  if (gregorian.month === 9 && gregorian.day === 23) types.push('national_day');
  if (gregorian.month === 1 && gregorian.day === 1) types.push('new_year');

  const hijri = calendarParts(ummAlQuraFormatter, at);
  if (hijri.month === 9) types.push('ramadan');
  else if (hijri.month === 10 && hijri.day >= 1 && hijri.day <= 4) types.push('eid_fitr');
  else if (hijri.month === 12 && hijri.day >= 10 && hijri.day <= 13) types.push('eid_adha');
  else if (hijri.month === 1 && hijri.day === 1) types.push('hijri_new_year');

  return types.map(type => ({ type, year: gregorian.year, ...OCCASIONS[type] }));
}

/** Compatibility helper for callers that need only the primary match. */
export function detectCurrentOccasion(at: Date = new Date()): DetectedOccasion | null {
  return detectCurrentOccasions(at)[0] ?? null;
}

/** Return the next start of every supported occasion within the next year. */
export function getUpcomingOccasions(at: Date = new Date()): UpcomingOccasion[] {
  const start = riyadhNoon(at);
  const upcoming = new Map<OccasionType, UpcomingOccasion>();

  for (let offset = 0; offset <= MAX_CALENDAR_SCAN_DAYS && upcoming.size < 6; offset += 1) {
    const cursor = new Date(start.getTime() + (offset * DAY_MS));
    const previousTypes = new Set(
      detectCurrentOccasions(new Date(cursor.getTime() - DAY_MS)).map(item => item.type),
    );
    for (const current of detectCurrentOccasions(cursor)) {
      if (upcoming.has(current.type) || previousTypes.has(current.type)) continue;
      upcoming.set(current.type, {
        ...current,
        date: riyadhDateKey(cursor),
        daysUntil: offset,
      });
    }
  }

  return Array.from(upcoming.values()).sort((left, right) => left.daysUntil - right.daysUntil);
}

function getOccasionEndDate(type: OccasionType, at: Date): Date {
  let cursor = riyadhNoon(at);
  for (let offset = 1; offset <= 40; offset += 1) {
    const next = new Date(cursor.getTime() + DAY_MS);
    if (!detectCurrentOccasions(next).some(occasion => occasion.type === type)) {
      const { year, month, day } = riyadhGregorianParts(next);
      // Riyadh has a fixed UTC+3 offset and no daylight-saving transition.
      return new Date(Date.UTC(year, month - 1, day, -3, 0, 0) - 1);
    }
    cursor = next;
  }
  throw new Error('Unable to determine occasion end date');
}

export function generateOccasionMessage(
  occasionName: string,
  customerName: string | null,
  discountCode: string,
  discountPercent: number,
  businessName: string,
): string {
  const greeting = customerName ? `مرحباً ${customerName}!` : 'مرحباً!';
  return `${greeting}

🎉 *${occasionName}* 🎉

بمناسبة ${occasionName}، يسرنا في ${businessName} أن نقدم لك عرضاً خاصاً:

✨ *خصم ${discountPercent}%* على جميع منتجاتنا!

🎁 استخدم كود الخصم: *${discountCode}*

⏰ العرض محدود ولفترة محدودة فقط!

📦 تسوق الآن واستمتع بأفضل العروض

نتمنى لك ${occasionName} سعيداً! 🌙✨`;
}

type LockedOccasionRow = RowDataPacket & {
  id: number;
  merchantId: number;
  campaignId: number | null;
  occasionType: OccasionType;
  year: number;
  enabled: number;
  discountPercentage: number;
  status: string;
  businessName: string;
  merchantStatus: string;
};

async function createUniqueDiscountCode(
  connection: PoolConnection,
  row: LockedOccasionRow,
  expiresAt: Date,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    const code = `${OCCASION_PREFIXES[row.occasionType]}${row.year}${row.id.toString(36).toUpperCase()}${suffix}`;
    try {
      await connection.execute(
        `INSERT INTO discount_codes
          (merchantId, code, type, value, minOrderAmount, maxUses, usedCount, expiresAt, isActive, is_auto_generated, createdAt, updatedAt)
         VALUES (?, ?, 'percentage', ?, 0, 2000, 0, ?, 1, 1, NOW(), NOW())`,
        [row.merchantId, code, row.discountPercentage, expiresAt],
      );
      return code;
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
    }
  }
  throw new Error('Unable to allocate a unique occasion discount code');
}

async function ensureOccasionOutboxSchema(): Promise<void> {
  await assertRuntimeSchema('occasion campaign outbox', [
    { table: 'occasion_campaigns', columns: ['campaign_id', 'merchantId', 'occasionType', 'year', 'enabled', 'status'] },
    { table: 'campaign_delivery_outbox', columns: ['campaign_id', 'merchant_id', 'status', 'available_at'] },
    { table: 'discount_codes', columns: ['merchantId', 'code', 'is_auto_generated'] },
  ]);
}

/**
 * Create one canonical campaign envelope and discount under an occasion-row
 * lock. Concurrent cron processes converge on the same campaign id.
 */
export async function prepareOccasionCampaignEnvelope(input: {
  occasionCampaignId: number;
  merchantId: number;
  occasion: DetectedOccasion;
  now?: Date;
}): Promise<{ campaignId: number; created: boolean }> {
  await ensureOccasionOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<LockedOccasionRow[]>(
      `SELECT oc.id, oc.merchantId, oc.campaign_id AS campaignId, oc.occasionType,
              oc.year, oc.enabled, oc.discountPercentage, oc.status,
              m.businessName, m.status AS merchantStatus
         FROM occasion_campaigns oc
         INNER JOIN merchants m ON m.id = oc.merchantId
        WHERE oc.id = ? AND oc.merchantId = ? LIMIT 1 FOR UPDATE`,
      [input.occasionCampaignId, input.merchantId],
    );
    const row = rows[0];
    if (!row
      || Number(row.enabled) !== 1
      || row.status !== 'pending'
      || row.merchantStatus !== 'active'
      || row.occasionType !== input.occasion.type
      || Number(row.year) !== input.occasion.year
      || Number(row.discountPercentage) < 5
      || Number(row.discountPercentage) > 50) {
      throw new CampaignDispatchConflictError();
    }

    if (row.campaignId) {
      const [campaigns] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM campaigns WHERE id = ? AND merchantId = ? LIMIT 1`,
        [row.campaignId, row.merchantId],
      );
      if (!campaigns[0]) throw new CampaignDispatchConflictError();
      await connection.commit();
      return { campaignId: Number(row.campaignId), created: false };
    }

    const now = input.now ?? new Date();
    const discountCode = await createUniqueDiscountCode(
      connection,
      row,
      getOccasionEndDate(row.occasionType, now),
    );
    const message = generateOccasionMessage(
      input.occasion.name,
      null,
      discountCode,
      Number(row.discountPercentage),
      row.businessName,
    );
    const [inserted] = await connection.execute<ResultSetHeader>(
      `INSERT INTO campaigns
        (merchantId, name, message, imageUrl, targetAudience, status, scheduledAt, sentCount, totalRecipients, createdAt, updatedAt)
       VALUES (?, ?, ?, NULL, '{}', 'draft', NULL, 0, 0, NOW(), NOW())`,
      [row.merchantId, `مناسبة: ${input.occasion.name} ${row.year}`, message],
    );
    const campaignId = Number(inserted.insertId);
    const [linked] = await connection.execute<ResultSetHeader>(
      `UPDATE occasion_campaigns
          SET campaign_id = ?, discountCode = ?, updatedAt = NOW()
        WHERE id = ? AND merchantId = ? AND status = 'pending' AND campaign_id IS NULL`,
      [campaignId, discountCode, row.id, row.merchantId],
    );
    if (linked.affectedRows !== 1) throw new CampaignDispatchConflictError();
    await connection.commit();
    return { campaignId, created: true };
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function admitOccasionCampaign(
  occasionCampaignId: number,
  merchantId: number,
  occasion: DetectedOccasion,
  now: Date,
): Promise<void> {
  const merchant = await getMerchantById(merchantId);
  if (!merchant || merchant.status !== 'active') return;
  const instance = await getPrimaryWhatsAppInstance(merchantId);
  if (!instance || instance.status !== 'active') return;
  if (!await getActiveSubscriptionByMerchantId(merchantId)) return;

  const { campaignId } = await prepareOccasionCampaignEnvelope({
    occasionCampaignId,
    merchantId,
    occasion,
    now,
  });
  const conversations = await getConversationsByMerchantId(merchantId);
  const unique = new Map<string, { customerId: number; phone: string }>();
  for (const conversation of conversations) {
    const phone = normalizeCampaignPhone(conversation.customerPhone);
    if (phone && !unique.has(phone)) unique.set(phone, { customerId: conversation.id, phone });
  }
  const guard = await filterCampaignRecipients(merchantId, Array.from(unique.keys()));
  const recipients = guard.allowed.flatMap(phone => {
    const recipient = unique.get(phone);
    return recipient ? [recipient] : [];
  });

  if (recipients.length === 0) {
    await completeCampaignWithoutRecipients(campaignId, merchantId);
    return;
  }
  await enqueueCampaignDeliveries({ campaignId, merchantId, recipients });
}

/** Daily admission job. It processes only explicit, enabled merchant choices. */
export async function checkAndSendOccasionCampaigns(at: Date = new Date()): Promise<void> {
  const occasions = detectCurrentOccasions(at);
  if (occasions.length === 0) return;
  await ensureOccasionOutboxSchema();
  for (const occasion of occasions) {
    let afterId = 0;
    for (let page = 0; page < 100; page += 1) {
      const campaigns = await getDispatchableOccasionCampaigns(occasion.type, occasion.year, 100, afterId);
      if (campaigns.length === 0) break;
      for (const campaign of campaigns) {
        afterId = Math.max(afterId, campaign.id);
        try {
          await admitOccasionCampaign(campaign.id, campaign.merchantId, occasion, at);
        } catch (error) {
          if (!(error instanceof CampaignDispatchConflictError)) {
            console.error('[Occasion Campaigns] Admission deferred after a safe failure');
          }
        }
      }
      if (campaigns.length < 100) break;
    }
  }
}
