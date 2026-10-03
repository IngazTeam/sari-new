import type { PoolConnection } from 'mysql2/promise';
import { ALL_ROLES, hasPermission, type MerchantRole } from './_core/permissions';
import { parseScheduledAuthorization, type ScheduledAuthorization } from './scheduled-message-authorization';
import { scheduledWeeklySlot, scheduledMessagePreview } from '../shared/scheduled-message-policy';
import { policyArtifactDigest } from './ai/learning-policy-evaluation-bundle';
import { databaseTimeEpoch } from './db/time';

export class ScheduledMessageAuthorityDenied extends Error { constructor() { super('scheduled_message_authority_denied'); } }
const deny = (): never => { throw new ScheduledMessageAuthorityDenied(); };
const rows = async (tx: PoolConnection, sql: string, args: any[]) => { const [r] = await tx.execute(sql, args); if (!Array.isArray(r)) throw Error('Scheduled authority unavailable'); return r as any[]; };
export type LockedScheduledAuthority = { record: any; contract: ScheduledAuthorization };
export type LockedScheduledOccurrence = LockedScheduledAuthority & { occurrence: any };
export function scheduledCampaignDigest(c: any) {
  const at = databaseTimeEpoch(c.scheduledAt);
  if (!Number.isFinite(at)) return null;
  return policyArtifactDigest({ id: c.id, merchantId: c.merchantId, name: c.name, message: c.message, imageUrl: c.imageUrl,
    targetAudience: c.targetAudience, scheduledAt: new Date(at).toISOString(), occurrenceId: c.scheduled_message_occurrence_id });
}
export function validScheduledDeliveryWindow(a: LockedScheduledOccurrence, now: Date) {
  const due = databaseTimeEpoch(a.occurrence.due_at), end = databaseTimeEpoch(a.occurrence.expires_at);
  return Number.isFinite(now.getTime()) && now.getTime() >= due && now.getTime() < end;
}
/** Merchant and definition locks precede this. Callers hold them through the effect and receipt. */
export async function lockScheduledWorkerAuthority(tx: PoolConnection, merchant: any, definition: any, now: () => Date): Promise<LockedScheduledAuthority> {
  const merchantId = merchant?.id, definitionId = definition?.id;
  if (!Number.isInteger(merchantId) || !Number.isInteger(definitionId) || merchant.status !== 'active'
    || definition.merchant_id !== merchantId || definition.is_active !== 1) return deny();
  const grants = await rows(tx, 'SELECT * FROM scheduled_message_authorizations WHERE merchant_id=? AND scheduled_message_id=? AND active=1 FOR UPDATE', [merchantId, definitionId]);
  if (grants.length !== 1) return deny();
  const record = grants[0], contract = parseScheduledAuthorization(record, merchantId, definitionId);
  if (!contract) return deny();
  const d = contract.definition;
  if (definition.title !== d.title || definition.message !== d.message || definition.day_of_week !== d.dayOfWeek || definition.time !== d.time || merchant.timezone !== d.timezone) return deny();
  const users = await rows(tx, 'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE', [contract.actorId, merchant.userId]);
  if (!users.some(u => u.id === contract.actorId && u.account_status === 'active') || !users.some(u => u.id === merchant.userId && u.account_status === 'active')) return deny();
  const members = await rows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, contract.actorId]);
  const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : members.length === 0 && merchant.userId === contract.actorId ? 'owner' : null;
  if (!ALL_ROLES.includes(role) || !hasPermission(role as MerchantRole, 'campaigns.manage')) return deny();
  const instances = await rows(tx, 'SELECT id,status FROM whatsapp_instances WHERE merchant_id=? AND is_primary=1 FOR SHARE', [merchantId]);
  if (instances.length !== 1 || instances[0].id !== contract.instanceId || instances[0].status !== 'active') return deny();
  const at = now().getTime(), created = databaseTimeEpoch(record.created_at), reviewed = Date.parse(contract.reviewedAt);
  if (!Number.isFinite(at) || !Number.isFinite(created) || created > at || reviewed > at) return deny();
  return { record, contract };
}
/** A source marker AND a durable reverse link are required; losing either never yields a generic campaign. */
export async function lockCampaignScheduledAuthority(tx: PoolConnection, merchant: any, campaign: any, phase: 'admission' | 'dispatch', now: () => Date = () => new Date()): Promise<LockedScheduledOccurrence | null> {
  const found = await rows(tx, 'SELECT * FROM scheduled_message_occurrences WHERE campaign_id=? FOR UPDATE', [campaign.id]);
  const marker = campaign.scheduled_message_occurrence_id ?? null;
  if (marker === null && found.length === 0) return null;
  if (found.length !== 1 || marker !== found[0].id || found[0].merchant_id !== merchant.id || campaign.merchantId !== merchant.id) return deny();
  const occurrence = found[0];
  const definitions = await rows(tx, 'SELECT * FROM scheduled_messages WHERE id=? AND merchant_id=? FOR UPDATE', [occurrence.scheduled_message_id, merchant.id]);
  if (definitions.length !== 1) return deny();
  const authority = await lockScheduledWorkerAuthority(tx, merchant, definitions[0], now), c = authority.contract;
  const due = databaseTimeEpoch(occurrence.due_at), end = databaseTimeEpoch(occurrence.expires_at);
  const slot = scheduledWeeklySlot(c.definition, new Date(due), 'due');
  if (occurrence.authorization_id !== authority.record.id || slot.status !== 'ready' || Date.parse(slot.dueAt) !== due || Date.parse(slot.expiresAt) !== end
    || due < Date.parse(c.firstDueAt) || databaseTimeEpoch(campaign.scheduledAt) !== due
    || campaign.message !== c.definition.message || scheduledMessagePreview(c.definition) !== c.messagePreview
    || campaign.name !== c.definition.title || campaign.imageUrl !== null || campaign.targetAudience !== '{}'
    || scheduledCampaignDigest(campaign) !== occurrence.campaign_digest
    || campaign.status !== (phase === 'dispatch' ? 'sending' : 'scheduled')) return deny();
  const result = { ...authority, occurrence }; if (!validScheduledDeliveryWindow(result, now())) return deny(); return result;
}
