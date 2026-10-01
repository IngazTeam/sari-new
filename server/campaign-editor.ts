import { sql } from 'drizzle-orm';
import { getDb } from './db/connection';
import { databaseTimeEpoch } from './db/time';
import { campaignDefinitionKey } from './campaign-definition';
import { campaignAudienceSchema, parseCampaignAudience } from '../shared/campaign-audience';
import { campaignEditorInput, campaignEditorSchema, campaignAudiencePreviewSchema, type CampaignEditorSnapshot } from '../shared/campaign-editor';
import { readCampaignAudienceSummary } from './campaign-audience';

export class CampaignEditorMissingError extends Error { constructor() { super('Campaign editor not found'); this.name = 'CampaignEditorMissingError'; } }
export class CampaignEditorUnavailableError extends Error { constructor() { super('Campaign editor unavailable'); this.name = 'CampaignEditorUnavailableError'; } }
function assertScope(actorId: number, merchantId: number, now: Date) {
  if (![actorId, merchantId].every(id => Number.isSafeInteger(id) && id > 0) || !Number.isFinite(now.getTime())) throw new CampaignEditorUnavailableError();
}

export async function readCampaignEditor(actorId: number, merchantId: number, raw: unknown, now = new Date()): Promise<CampaignEditorSnapshot> {
  const { id } = campaignEditorInput.parse(raw); assertScope(actorId, merchantId, now);
  try {
    const db = await getDb(); if (!db) throw new CampaignEditorUnavailableError();
    const [result] = await db.execute(id === undefined
      ? sql`SELECT m.id AS merchantId,m.status AS merchantStatus,m.timezone FROM merchants m WHERE m.id=${merchantId}`
      : sql`SELECT m.id AS merchantId,m.status AS merchantStatus,m.timezone,c.id,c.name,c.message,c.imageUrl,c.targetAudience,c.scheduledAt,c.status
          FROM merchants m INNER JOIN campaigns c ON c.merchantId=m.id WHERE m.id=${merchantId} AND c.id=${id}`);
    const rows = result as unknown as Record<string, any>[];
    if (!Array.isArray(rows) || rows.length > 1) throw new CampaignEditorUnavailableError();
    if (!rows.length) throw new CampaignEditorMissingError();
    const row = rows[0];
    if (Number(row.merchantId) !== merchantId || (id !== undefined && Number(row.id) !== id)) throw new CampaignEditorUnavailableError();
    let timezone: string | null = row.timezone || 'Asia/Riyadh';
    try { new Intl.DateTimeFormat('en', { timeZone: timezone! }); } catch { timezone = null; }
    let campaign: CampaignEditorSnapshot['campaign'] = null;
    if (id !== undefined) {
      let audience: NonNullable<CampaignEditorSnapshot['campaign']>['audience'];
      try { audience = { status: 'valid', filters: parseCampaignAudience(row.targetAudience) }; } catch { audience = { status: 'invalid' }; }
      campaign = { id, name: row.name, message: row.message, imageUrl: row.imageUrl, status: row.status,
        scheduledAt: row.scheduledAt === null ? null : new Date(databaseTimeEpoch(row.scheduledAt)).toISOString(),
        definitionKey: campaignDefinitionKey(row as any), audience };
    }
    return campaignEditorSchema.parse({ actorId, merchantId, canManage: false, checkedAt: now.toISOString(), timezone, merchantStatus: row.merchantStatus, campaign });
  } catch (error) { if (error instanceof CampaignEditorMissingError) throw error; throw new CampaignEditorUnavailableError(); }
}

export async function readCampaignAudiencePreview(actorId: number, merchantId: number, raw: unknown, now = new Date()) {
  const filters = campaignAudienceSchema.parse(raw); assertScope(actorId, merchantId, now);
  try {
    const summary = await readCampaignAudienceSummary(merchantId, JSON.stringify(filters), now);
    return campaignAudiencePreviewSchema.parse({ actorId, merchantId, filters, checkedAt: summary.asOf,
      count: summary.count, recipientCount: summary.recipientCount, invalidPhoneCount: summary.invalidPhoneCount, duplicateCount: summary.duplicateCount,
      recipientLimit: summary.recipientLimit, exceedsLimit: summary.recipientCount > summary.recipientLimit, basis: 'matched_conversations_before_consent' });
  } catch { throw new CampaignEditorUnavailableError(); }
}
