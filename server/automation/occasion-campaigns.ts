/**
 * Occasion campaigns are opt-in definitions. The recurring job only admits an
 * already-enabled definition to the canonical campaign outbox; it never
 * creates or enables marketing on behalf of a merchant and never calls a
 * provider directly.
 */

import {validPreparedOccasion} from '../occasion-envelope-policy';
import {assertCampaignContent} from '../campaign-content';
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
  discountCode: string|null;
  messageTemplate:string|null;
  recipientCount:number;
  sentAt:string|null;
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
export class OccasionEnvelopeStateUnknownError extends Error {
  constructor(){super('occasion_envelope_state_unknown');this.name='OccasionEnvelopeStateUnknownError';}
}
export async function prepareOccasionCampaignEnvelope(input: {
  occasionCampaignId: number;
  merchantId: number;
  occasion: DetectedOccasion;
  now?: Date;
}): Promise<{ campaignId: number; created: boolean }> {
  const now=input.now??new Date();
  if(![input.merchantId,input.occasionCampaignId].every(id=>Number.isInteger(id)&&id>0&&id<=2147483647)
    ||!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new CampaignDispatchConflictError();
  const occasion=detectCurrentOccasions(now).find(o=>o.type===input.occasion.type&&o.year===input.occasion.year);
  if(!occasion)throw new CampaignDispatchConflictError();
  await ensureOccasionOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  let committing=false,reusable=true;
  try {
    await connection.beginTransaction();
    // Explicit parent -> campaign -> occasion order matches reviewed actions and transport.
    const [merchants]=await connection.execute<RowDataPacket[]>(
      'SELECT id,status,businessName FROM merchants WHERE id=? FOR UPDATE',[input.merchantId]);
    const merchant=merchants[0];
    if(merchants.length!==1||merchant.id!==input.merchantId||merchant.status!=='active'
      ||typeof merchant.businessName!=='string'||!merchant.businessName.trim()||merchant.businessName.length>255)throw new CampaignDispatchConflictError();
    const [hints]=await connection.execute<RowDataPacket[]>(
      'SELECT campaign_id FROM occasion_campaigns WHERE id=? AND merchantId=?',[input.occasionCampaignId,input.merchantId]);
    if(hints.length!==1)throw new CampaignDispatchConflictError();
    const campaignId=hints[0].campaign_id;
    let campaign:RowDataPacket|undefined;
    if(campaignId!==null){
      const [campaigns]=await connection.execute<RowDataPacket[]>(
        'SELECT id,merchantId,status,message,imageUrl,targetAudience FROM campaigns WHERE id=? AND merchantId=? FOR UPDATE',[campaignId,input.merchantId]);
      if(campaigns.length!==1||campaigns[0].id!==campaignId||campaigns[0].merchantId!==input.merchantId)throw new CampaignDispatchConflictError();
      campaign=campaigns[0];
    }
    const [rows]=await connection.execute<LockedOccasionRow[]>(
      'SELECT id,merchantId,campaign_id AS campaignId,occasionType,year,enabled,discountPercentage,status,discountCode,messageTemplate,recipientCount,sentAt FROM occasion_campaigns WHERE id=? AND merchantId=? FOR UPDATE',
      [input.occasionCampaignId,input.merchantId]);
    const row=rows[0];
    if(rows.length!==1||row.id!==input.occasionCampaignId||row.merchantId!==input.merchantId||row.campaignId!==campaignId
      ||row.enabled!==1||row.status!=='pending'||row.occasionType!==occasion.type||row.year!==occasion.year
      ||!Number.isInteger(row.discountPercentage)||row.discountPercentage<5||row.discountPercentage>50
      ||row.messageTemplate!==null||row.recipientCount!==0||row.sentAt!==null)throw new CampaignDispatchConflictError();
    row.businessName=merchant.businessName;
    if(campaign){
      if(typeof row.discountCode!=='string'||!row.discountCode.trim())throw new CampaignDispatchConflictError();
      const [discounts]=await connection.execute<RowDataPacket[]>(
        'SELECT id,type,value,minOrderAmount,maxUses,usedCount,isActive,expiresAt,customer_phone FROM discount_codes WHERE merchantId=? AND code=? FOR SHARE',[input.merchantId,row.discountCode]);
      const [outbox]=await connection.execute<RowDataPacket[]>('SELECT id FROM campaign_delivery_outbox WHERE campaign_id=? LIMIT 1 FOR UPDATE',[campaignId]);
      if(outbox.length||discounts.length!==1||!validPreparedOccasion(campaign,discounts[0],row.discountPercentage,row.occasionType,now,now))throw new CampaignDispatchConflictError();
      committing=true;await connection.commit();
      return {campaignId:Number(campaignId),created:false};
    }
    if(row.discountCode!==null)throw new CampaignDispatchConflictError();

    const discountCode = await createUniqueDiscountCode(
      connection,
      row,
      new Date(Math.floor(getOccasionEndDate(row.occasionType, now).getTime()/1000)*1000),
    );
    const message = generateOccasionMessage(
      occasion.name,
      null,
      discountCode,
      Number(row.discountPercentage),
      row.businessName,
    );
    assertCampaignContent(message,null);
    const [inserted] = await connection.execute<ResultSetHeader>(
      `INSERT INTO campaigns
        (merchantId, name, message, imageUrl, targetAudience, status, scheduledAt, sentCount, totalRecipients, createdAt, updatedAt)
       VALUES (?, ?, ?, NULL, '{}', 'draft', NULL, 0, 0, NOW(), NOW())`,
      [row.merchantId, `مناسبة: ${occasion.name} ${row.year}`, message],
    );
    const createdCampaignId = Number(inserted.insertId);
    if(inserted.affectedRows!==1||!Number.isInteger(createdCampaignId)||createdCampaignId<=0)throw new CampaignDispatchConflictError();
    const [linked] = await connection.execute<ResultSetHeader>(
      `UPDATE occasion_campaigns
          SET campaign_id = ?, discountCode = ?, updatedAt = NOW()
        WHERE id = ? AND merchantId = ? AND status = 'pending' AND campaign_id IS NULL AND enabled = 1`,
      [createdCampaignId, discountCode, row.id, row.merchantId],
    );
    if (linked.affectedRows !== 1) throw new CampaignDispatchConflictError();
    committing=true;await connection.commit();
    return { campaignId:createdCampaignId, created: true };
  } catch (error) {
    if(committing)reusable=false;
    else try { await connection.rollback(); } catch { reusable=false; }
    if(committing)throw new OccasionEnvelopeStateUnknownError();
    throw error;
  } finally {
    if(reusable)connection.release();else connection.destroy();
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
