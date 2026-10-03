/**
 * Occasion campaigns are opt-in definitions. The recurring job only admits an
 * already-enabled definition to the canonical campaign outbox; it never
 * creates or enables marketing on behalf of a merchant and never calls a
 * provider directly.
 */

import { randomBytes } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getActiveSubscriptionByMerchantId,
  getCampaignById,
  getDispatchableOccasionCampaigns,
  getMerchantById,
  getPool,
  getPrimaryWhatsAppInstance,
} from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { campaignDefinitionKey } from '../campaign-definition';
import { readCampaignAudience, requireCompleteCampaignAudience } from '../campaign-audience';
import {
  CampaignDispatchConflictError,
  completeCampaignWithoutRecipients,
  enqueueCampaignDeliveries,
} from './campaign-delivery-outbox';
import {
  filterCampaignRecipients,
  normalizeCampaignPhone,
} from './campaign-guard';

import {OCCASION_PREFIXES,detectCurrentOccasions,getOccasionEndDate,generateOccasionMessage,type OccasionType,type DetectedOccasion} from '../../shared/occasion-calendar';
export {detectCurrentOccasions,detectCurrentOccasion,getUpcomingOccasions,getOccasionDiscountPercentage,generateOccasionMessage,type OccasionType,type DetectedOccasion,type UpcomingOccasion} from '../../shared/occasion-calendar';

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
    if (!row || Number(row.merchantId) !== input.merchantId
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
): Promise<'queued' | 'completed' | 'deferred'> {
  const merchant = await getMerchantById(merchantId);
  if (!merchant || merchant.status !== 'active') return 'deferred';
  const instance = await getPrimaryWhatsAppInstance(merchantId);
  if (!instance || instance.status !== 'active') return 'deferred';
  if (!await getActiveSubscriptionByMerchantId(merchantId)) return 'deferred';

  const { campaignId } = await prepareOccasionCampaignEnvelope({
    occasionCampaignId,
    merchantId,
    occasion,
    now,
  });
  const campaign = await getCampaignById(campaignId);
  if (!campaign || campaign.merchantId !== merchantId || !['draft', 'scheduled'].includes(campaign.status)) {
    throw new CampaignDispatchConflictError();
  }
  const expectedDefinition = campaignDefinitionKey(campaign);
  const conversations = requireCompleteCampaignAudience(await readCampaignAudience(merchantId, campaign.targetAudience, now));
  const unique = new Map<string, { customerId: number; phone: string }>();
  for (const conversation of conversations) {
    const phone = normalizeCampaignPhone(conversation.customerPhone);
    if (phone && !unique.has(phone)) unique.set(phone, { customerId: conversation.id, phone });
  }
  const guard = await filterCampaignRecipients(merchantId, Array.from(unique.keys()));
  // A temporary block must leave the entire occasion pending for a later run.
  if (guard.blocked.some(row => row.reason === 'quiet_hours' || row.reason === 'rate_limit')) return 'deferred';
  const recipients = guard.allowed.flatMap(phone => {
    const recipient = unique.get(phone);
    return recipient ? [recipient] : [];
  });

  if (recipients.length === 0) {
    return await completeCampaignWithoutRecipients(campaignId, merchantId, expectedDefinition) ? 'completed' : 'deferred';
  }
  await enqueueCampaignDeliveries({ campaignId, merchantId, recipients, expectedDefinition });
  return 'queued';
}

export type OccasionAdmissionResult = { checked: number; queued: number; completed: number; deferred: number; failed: number; limited: boolean };

/** Repeated admission within today's occasion; processes only explicit, enabled choices. */
export async function checkAndSendOccasionCampaigns(at: Date = new Date()): Promise<OccasionAdmissionResult> {
  const result: OccasionAdmissionResult = { checked: 0, queued: 0, completed: 0, deferred: 0, failed: 0, limited: false };
  const occasions = detectCurrentOccasions(at);
  if (occasions.length === 0) return result;
  await ensureOccasionOutboxSchema();
  for (const occasion of occasions) {
    let afterId = 0;
    for (let page = 0; page < 100; page += 1) {
      const campaigns = await getDispatchableOccasionCampaigns(occasion.type, occasion.year, 100, afterId);
      if (campaigns.length === 0) break;
      for (const campaign of campaigns) {
        afterId = Math.max(afterId, campaign.id);
        result.checked++;
        try {
          const outcome = await admitOccasionCampaign(campaign.id, campaign.merchantId, occasion, at);
          result[outcome]++;
        } catch (error) {
          if (error instanceof CampaignDispatchConflictError) result.deferred++;
          else result.failed++;
        }
      }
      if (campaigns.length < 100) break;
      if (page === 99) result.limited = true;
    }
  }
  return result;
}
