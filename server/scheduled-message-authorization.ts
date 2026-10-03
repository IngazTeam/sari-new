import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { policyArtifactDigest } from './ai/learning-policy-evaluation-bundle';
import { assertRuntimeSchema, type SchemaRequirement } from './db/schema-readiness';
import { scheduledDefinitionFields, scheduledMessagePreview, scheduledAdmissionMinutes, scheduledDeliveryMinutes, scheduledWeeklySlot, type ScheduledDefinition } from '../shared/scheduled-message-policy';

const id = z.number().int().positive().max(2147483647), hash = z.string().regex(/^[a-f0-9]{64}$/);
export const SCHEDULED_AUTHORITY_REQUIREMENTS: readonly SchemaRequirement[] = [
  { table: 'scheduled_message_authorizations', columns: ['grant_key', 'scheduled_message_id', 'merchant_id', 'actor_id', 'active', 'review_revision', 'contract_digest', 'reviewed_contract', 'created_at', 'revoked_at'], uniqueIndexes: [{ name: 'uq_scheduled_grant_key', columns: ['grant_key'] }, { name: 'uq_scheduled_active_grant', columns: ['scheduled_message_id', 'active'] }], checkConstraints: ['chk_scheduled_grant_active'] },
  { table: 'scheduled_message_occurrences', columns: ['merchant_id', 'scheduled_message_id', 'authorization_id', 'due_at', 'expires_at', 'campaign_id', 'campaign_digest', 'created_at'], uniqueIndexes: [{ name: 'uq_scheduled_occurrence', columns: ['scheduled_message_id', 'due_at'] }, { name: 'uq_scheduled_occurrence_campaign', columns: ['campaign_id'] }], checkConstraints: ['chk_scheduled_occurrence_campaign', 'chk_scheduled_occurrence_window'] },
  { table: 'scheduled_message_action_receipts', columns: ['merchant_id', 'actor_id', 'request_key', 'request_digest', 'state', 'result_json', 'created_at'], uniqueIndexes: [{ name: 'uq_scheduled_action_request', columns: ['merchant_id', 'request_key'] }], checkConstraints: ['chk_scheduled_action_digest'] },
  { table: 'campaigns', columns: ['scheduled_message_occurrence_id'], uniqueIndexes: [{ name: 'uq_campaign_scheduled_occurrence', columns: ['scheduled_message_occurrence_id'] }] },
];
export const ensureScheduledAuthoritySchema = () => assertRuntimeSchema('scheduled message authority', SCHEDULED_AUTHORITY_REQUIREMENTS, { cacheSuccess: false });
export const scheduledAuthorizationContract = z.object({
  version: z.literal(1), actorId: id, merchantId: id, scheduledMessageId: id, reviewRevision: hash,
  definition: scheduledDefinitionFields, instanceId: id, reviewedAt: z.string().datetime(), firstDueAt: z.string().datetime(),
  messagePreview: z.string().min(1).max(4096), repeat: z.literal('weekly_until_paused'),
  audience: z.literal('current_consented_conversations'), audienceLimit: z.literal(2000),
  admissionMinutes: z.literal(scheduledAdmissionMinutes), deliveryMinutes: z.literal(scheduledDeliveryMinutes),
}).strict().superRefine((v, c) => {
  const next = scheduledWeeklySlot(v.definition, new Date(v.reviewedAt), 'next');
  if (next.status !== 'ready' || next.dueAt !== v.firstDueAt || scheduledMessagePreview(v.definition) !== v.messagePreview)
    c.addIssue({ code: 'custom', message: 'Inconsistent scheduled authorization terms' });
});
export type ScheduledAuthorization = z.infer<typeof scheduledAuthorizationContract>;
export const scheduledAuthorizationDigest = (value: ScheduledAuthorization) => policyArtifactDigest(scheduledAuthorizationContract.parse(value));
export function buildScheduledAuthorization(input: { actorId: number; merchantId: number; scheduledMessageId: number; reviewRevision: string; definition: ScheduledDefinition; instanceId: number }, now: Date) {
  const definition = scheduledDefinitionFields.parse(input.definition), next = scheduledWeeklySlot(definition, now, 'next');
  if (next.status !== 'ready') throw Error('Scheduled occurrence cannot be resolved');
  return scheduledAuthorizationContract.parse({ ...input, definition, version: 1, reviewedAt: now.toISOString(), firstDueAt: next.dueAt,
    messagePreview: scheduledMessagePreview(definition), repeat: 'weekly_until_paused', audience: 'current_consented_conversations', audienceLimit: 2000,
    admissionMinutes: scheduledAdmissionMinutes, deliveryMinutes: scheduledDeliveryMinutes });
}
export function parseScheduledAuthorization(row: any, merchantId: number, scheduledMessageId: number): ScheduledAuthorization | null {
  try {
    if (row?.active !== 1 || row.revoked_at !== null || row.merchant_id !== merchantId || row.scheduled_message_id !== scheduledMessageId) return null;
    const c = scheduledAuthorizationContract.parse(typeof row.reviewed_contract === 'string' ? JSON.parse(row.reviewed_contract) : row.reviewed_contract);
    return c.actorId === row.actor_id && c.merchantId === merchantId && c.scheduledMessageId === scheduledMessageId
      && c.reviewRevision === row.review_revision && scheduledAuthorizationDigest(c) === row.contract_digest ? c : null;
  } catch { return null; }
}
/** Call under merchant/definition locks. Preserve authorization history when the definition is deleted. */
export async function revokeScheduledAuthorization(tx: PoolConnection, merchantId: number, scheduledMessageId: number) {
  await tx.execute('UPDATE scheduled_message_authorizations SET active=NULL,revoked_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND scheduled_message_id=? AND active=1', [merchantId, scheduledMessageId]);
}
export async function writeScheduledAuthorization(tx: PoolConnection, value: ScheduledAuthorization) {
  const c = scheduledAuthorizationContract.parse(value); await revokeScheduledAuthorization(tx, c.merchantId, c.scheduledMessageId);
  const [saved] = await tx.execute<any>(`INSERT INTO scheduled_message_authorizations (grant_key,scheduled_message_id,merchant_id,actor_id,active,review_revision,contract_digest,reviewed_contract)
    VALUES (?,?,?,?,1,?,?,?)`, [randomUUID(), c.scheduledMessageId, c.merchantId, c.actorId, c.reviewRevision, scheduledAuthorizationDigest(c), JSON.stringify(c)]);
  if (saved.affectedRows !== 1 || !Number.isInteger(saved.insertId) || saved.insertId <= 0) throw Error('Scheduled authorization could not be persisted');
  return saved.insertId as number;
}
