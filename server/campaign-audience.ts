import type { RowDataPacket } from 'mysql2/promise';
import { getPool, formatDateForDB } from './db/connection';
import { campaignAudienceClock, campaignRecipientLimit, parseCampaignAudience } from '../shared/campaign-audience';

export class CampaignAudienceLimitError extends Error {
  constructor() { super('ضيّق جمهور الحملة إلى 2000 رقم أو أقل قبل الإرسال. لم يُرسل أي جزء من الحملة.'); this.name = 'CampaignAudienceLimitError'; }
}

export type CampaignAudienceRecipient = { id: number; customerPhone: string };
export function requireCompleteCampaignAudience(audience: Awaited<ReturnType<typeof readCampaignAudience>>) {
  if (audience.recipientCount > campaignRecipientLimit || audience.customers.length !== audience.recipientCount) {
    throw new CampaignAudienceLimitError();
  }
  return audience.customers;
}

/** A full aggregate and bounded identity projection from the same read-only snapshot.
 * Phone normalization mirrors campaign-guard, including its Saudi local aliases.
 * Counts describe matching conversations/numbers, never consent or delivery eligibility.
 */
export async function readCampaignAudience(merchantId: number, targetAudience: string | null | undefined, now = new Date()) {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new Error('Invalid campaign audience scope');
  const filters = parseCampaignAudience(targetAudience);
  const through = campaignAudienceClock(now);
  const conditions = ['merchantId = ?'];
  const params: Array<string | number> = [merchantId];
  if (filters.lastActivityDays !== undefined) {
    conditions.push('lastActivityAt >= ? AND lastActivityAt <= ?');
    params.push(formatDateForDB(new Date(through - filters.lastActivityDays * 86_400_000)), formatDateForDB(new Date(through)));
  }
  if (filters.purchaseCountMin !== undefined || filters.purchaseCountMax !== undefined) conditions.push('purchaseCount >= 0');
  if (filters.purchaseCountMin !== undefined) { conditions.push('purchaseCount >= ?'); params.push(filters.purchaseCountMin); }
  if (filters.purchaseCountMax !== undefined) { conditions.push('purchaseCount <= ?'); params.push(filters.purchaseCountMax); }
  const cte = `WITH matched AS (
    SELECT id, REGEXP_REPLACE(customerPhone, '[^0-9]', '') AS digits
      FROM conversations WHERE ${conditions.join(' AND ')}
  ), international AS (
    SELECT id, CASE WHEN LEFT(digits, 2) = '00' THEN SUBSTRING(digits, 3) ELSE digits END AS digits FROM matched
  ), normalized AS (
    SELECT id, CASE WHEN digits REGEXP '^05[0-9]{8}$' THEN CONCAT('966', SUBSTRING(digits, 2))
      WHEN digits REGEXP '^5[0-9]{8}$' THEN CONCAT('966', digits) ELSE digits END AS phone FROM international
  ), identities AS (
    SELECT id, CASE WHEN phone REGEXP '^[1-9][0-9]{7,14}$' THEN phone ELSE NULL END AS phone FROM normalized
  )`;
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION READ ONLY');
    const [counts] = await connection.execute<RowDataPacket[]>(`${cte}
      SELECT COUNT(*) AS matched, COUNT(DISTINCT phone) AS recipients, COUNT(*) - COUNT(phone) AS invalid FROM identities`, params);
    const count = Number(counts[0]?.matched), recipientCount = Number(counts[0]?.recipients), invalidPhoneCount = Number(counts[0]?.invalid);
    if (![count, recipientCount, invalidPhoneCount].every(value => Number.isSafeInteger(value) && value >= 0)
      || recipientCount + invalidPhoneCount > count) throw new Error('Invalid campaign audience aggregate');
    const [rows] = await connection.execute<RowDataPacket[]>(`${cte}
      SELECT MAX(id) AS id, phone AS customerPhone FROM identities WHERE phone IS NOT NULL
      GROUP BY phone ORDER BY id DESC LIMIT ${campaignRecipientLimit}`, params);
    const customers: CampaignAudienceRecipient[] = rows.map(row => ({ id: Number(row.id), customerPhone: String(row.customerPhone) }));
    if (customers.length !== Math.min(recipientCount, campaignRecipientLimit)
      || customers.some(row => !Number.isSafeInteger(row.id) || row.id <= 0 || !/^[1-9]\d{7,14}$/.test(row.customerPhone))) {
      throw new Error('Invalid campaign audience projection');
    }
    await connection.commit();
    return { count, recipientCount, invalidPhoneCount, duplicateCount: count - invalidPhoneCount - recipientCount,
      customers, customersTruncated: recipientCount > campaignRecipientLimit, recipientLimit: campaignRecipientLimit, asOf: new Date(through).toISOString() };
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve the failure */ }
    throw error;
  } finally { connection.release(); }
}
