import type { PoolConnection } from 'mysql2/promise';
import { scheduledOccurrence, scheduledEvidenceRow, type ScheduledOccurrence } from '../shared/scheduled-message-evidence';
import type { ScheduledMessageRow } from '../shared/scheduled-message-workspace';
import { parseScheduledAuthorization } from './scheduled-message-authorization';
import { scheduledWeeklySlot } from '../shared/scheduled-message-policy';
import { scheduledCampaignDigest } from './scheduled-message-worker-authority';
import { databaseTimeEpoch } from './db/time';
const rows = async (tx: PoolConnection, sql: string, args: any[]) => { const [r] = await tx.execute(sql, args); if (!Array.isArray(r)) throw Error('Scheduled evidence unavailable'); return r as any[]; };
const iso = (v: any) => { const ms = databaseTimeEpoch(v); if (!Number.isFinite(ms)) throw Error('Invalid occurrence timestamp'); return new Date(ms).toISOString(); };
const campaignOf = (r: any) => ({ id: r.linked_id, merchantId: r.linked_merchant, name: r.linked_name, message: r.linked_message, imageUrl: r.linked_image,
  targetAudience: r.linked_audience, scheduledAt: r.linked_schedule, scheduled_message_occurrence_id: r.linked_marker });
export const SCHEDULED_OCCURRENCE_SELECT = `o.*,c.id AS linked_id,c.merchantId AS linked_merchant,c.name AS linked_name,c.message AS linked_message,c.imageUrl AS linked_image,
  c.targetAudience AS linked_audience,c.scheduledAt AS linked_schedule,c.scheduled_message_occurrence_id AS linked_marker,c.status AS linked_status`;
export async function projectScheduledOccurrences(tx: PoolConnection, merchantId: number, source: any[]): Promise<ScheduledOccurrence[]> {
  const valid = source.filter(r => r.linked_id === r.campaign_id && r.linked_merchant === merchantId && r.linked_marker === r.id && scheduledCampaignDigest(campaignOf(r)) === r.campaign_digest);
  const ids = valid.map(r => r.campaign_id), totals = ids.length ? await rows(tx, `SELECT o.campaign_id,COUNT(DISTINCT o.id) AS total,
    COUNT(DISTINCT CASE WHEN r.status IN ('sent','delivered','read','failed') AND NULLIF(TRIM(r.provider_message_id),'') IS NOT NULL THEN o.id END) AS accepted,
    COUNT(DISTINCT CASE WHEN o.status='manual_review' THEN o.id END) AS review
    FROM campaign_delivery_outbox o LEFT JOIN whatsapp_message_deliveries r
      ON r.merchant_id=o.merchant_id AND r.direction='outgoing' AND r.idempotency_key=CONCAT('campaign:',o.campaign_id,':',o.id)
    WHERE o.merchant_id=? AND o.campaign_id IN (${ids.map(() => '?').join(',')}) GROUP BY o.campaign_id`, [merchantId, ...ids]) : [];
  const byCampaign = new Map(totals.map(r => [r.campaign_id, r]));
  return source.map(r => {
    const linked = valid.includes(r), stats = linked ? byCampaign.get(r.campaign_id) : null;
    const total = Number(stats?.total ?? 0), accepted = Number(stats?.accepted ?? 0);
    return scheduledOccurrence.parse({ id: r.id, dueAt: iso(r.due_at), expiresAt: iso(r.expires_at),
      campaignId: linked ? r.campaign_id : null, campaignState: linked ? r.linked_status : null,
      linkState: linked ? 'verified' : r.linked_id === null || r.campaign_id === null ? 'missing' : 'changed',
      recipients: linked ? total : null, acceptedByProvider: linked ? accepted : null, unconfirmed: linked ? total - accepted : null, needsReview: linked ? Number(stats?.review ?? 0) : null,
      evidence: 'scoped_provider_receipts', salesVerified: false });
  });
}
export async function enrichScheduledRows(tx: PoolConnection, merchant: any, definitions: any[], projected: ScheduledMessageRow[], now: Date) {
  if (!definitions.length) return [];
  const ids = definitions.map(r => r.id), marks = ids.map(() => '?').join(','), merchantId = merchant.id;
  const grants = await rows(tx, `SELECT a.* FROM scheduled_message_authorizations a WHERE a.merchant_id=? AND a.scheduled_message_id IN (${marks})
    AND a.id=(SELECT MAX(g.id) FROM scheduled_message_authorizations g WHERE g.merchant_id=a.merchant_id AND g.scheduled_message_id=a.scheduled_message_id)`, [merchantId, ...ids]);
  const occurrences = await rows(tx, `SELECT ${SCHEDULED_OCCURRENCE_SELECT},
    (SELECT COUNT(*) FROM scheduled_message_occurrences n WHERE n.merchant_id=o.merchant_id AND n.scheduled_message_id=o.scheduled_message_id) AS occurrence_count
    FROM scheduled_message_occurrences o LEFT JOIN campaigns c ON c.id=o.campaign_id AND c.merchantId=o.merchant_id
    WHERE o.merchant_id=? AND o.scheduled_message_id IN (${marks})
      AND o.id=(SELECT n.id FROM scheduled_message_occurrences n WHERE n.merchant_id=o.merchant_id AND n.scheduled_message_id=o.scheduled_message_id ORDER BY n.due_at DESC,n.id DESC LIMIT 1)`, [merchantId, ...ids]);
  const results = await projectScheduledOccurrences(tx, merchantId, occurrences);
  const byDefinition = new Map(grants.map(r => [r.scheduled_message_id, r]));
  const byOccurrence = new Map(occurrences.map((r, i) => [r.scheduled_message_id, { count: Number(r.occurrence_count), latest: results[i] }]));
  return definitions.map((raw, i) => {
    const grant = byDefinition.get(raw.id), contract = grant ? parseScheduledAuthorization(grant, merchantId, raw.id) : null;
    let state = !grant ? 'missing' : grant.active === null && grant.revoked_at !== null ? 'revoked' : !contract ? 'invalid' : 'recorded';
    if (contract && (raw.title !== contract.definition.title || raw.message !== contract.definition.message || raw.day_of_week !== contract.definition.dayOfWeek
      || raw.time !== contract.definition.time || merchant.timezone !== contract.definition.timezone)) state = 'changed';
    const next = contract && state === 'recorded' && raw.is_active === 1 ? scheduledWeeklySlot(contract.definition, now, 'next') : null;
    const occurrence = byOccurrence.get(raw.id);
    return scheduledEvidenceRow.parse({ ...projected[i], authorization: { state, actorId: contract?.actorId ?? null, reviewedAt: contract?.reviewedAt ?? null,
      timezone: contract?.definition.timezone ?? null, instanceId: contract?.instanceId ?? null, firstDueAt: contract?.firstDueAt ?? null },
      nextDueAt: next?.status === 'ready' ? next.dueAt : null, nextIssue: next?.status === 'invalid' ? next.reason : null,
      occurrenceCount: occurrence?.count ?? 0, latestOccurrence: occurrence?.latest ?? null });
  });
}
