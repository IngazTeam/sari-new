import { z } from 'zod';
import { scheduledMessageRow, scheduledMessageSelection } from './scheduled-message-workspace';
const id = z.number().int().positive().max(2147483647), count = z.number().int().nonnegative().safe();
export const scheduledOccurrence = z.object({
  id, dueAt: z.string().datetime(), expiresAt: z.string().datetime(),
  campaignId: id.nullable(), campaignState: z.enum(['draft', 'scheduled', 'sending', 'completed', 'failed']).nullable(),
  linkState: z.enum(['verified', 'missing', 'changed']),
  recipients: count.nullable(), acceptedByProvider: count.nullable(), unconfirmed: count.nullable(), needsReview: count.nullable(),
  evidence: z.literal('scoped_provider_receipts'), salesVerified: z.literal(false),
}).strict().superRefine((v, c) => {
  if (v.linkState !== 'verified' && [v.recipients, v.acceptedByProvider, v.unconfirmed, v.needsReview, v.campaignId, v.campaignState].some(x => x !== null)
    || v.linkState === 'verified' && (v.recipients === null || v.acceptedByProvider === null || v.unconfirmed === null || v.needsReview === null || v.campaignId === null || v.campaignState === null
      || v.recipients !== v.acceptedByProvider + v.unconfirmed || v.needsReview > v.recipients)) c.addIssue({ code: 'custom', message: 'Inconsistent occurrence evidence' });
});
export const scheduledAuthorizationEvidence = z.object({
  state: z.enum(['missing', 'revoked', 'invalid', 'changed', 'recorded']),
  actorId: id.nullable(), reviewedAt: z.string().datetime().nullable(), timezone: z.string().max(100).nullable(), instanceId: id.nullable(), firstDueAt: z.string().datetime().nullable(),
}).strict();
export const scheduledEvidenceRow = scheduledMessageRow.extend({
  authorization: scheduledAuthorizationEvidence, nextDueAt: z.string().datetime().nullable(),
  nextIssue: z.enum(['definition', 'nonexistent', 'ambiguous', 'out_of_range']).nullable(), occurrenceCount: count, latestOccurrence: scheduledOccurrence.nullable(),
});
export const scheduledHistoryInput = z.object({ id, page: z.number().int().min(1).max(1000000).default(1) }).strict();
export const scheduledHistory = z.object({ actorId: id, merchantId: id, selection: scheduledHistoryInput, checkedAt: z.string().datetime(),
  total: count, pages: count, currentPage: count, pageSize: z.literal(25), rows: z.array(scheduledOccurrence).max(25) }).strict();
export type ScheduledOccurrence = z.infer<typeof scheduledOccurrence>;
export type ScheduledEvidenceRow = z.infer<typeof scheduledEvidenceRow>;
export const scheduledMessageWorkspace = z.object({
  actorId: id, merchantId: id, checkedAt: z.string().datetime(), canManage: z.boolean(), selection: scheduledMessageSelection,
  pageSize: z.literal(25), currentPage: count, pages: count, total: count, matched: count,
  counts: z.object({ enabled: count, disabled: count, unknown: count }).strict(), definitionsWithRecordedTimestamp: count,
  timezone: z.string().max(100).nullable(), timeBasis: z.literal('explicit_activation_review'), deliveryEvidence: z.literal('scoped_provider_receipts'),
  audienceEvidence: z.literal('rechecked_at_dispatch'), channelEvidence: z.literal('reviewed_primary'), salesAttribution: z.literal('not_verified'),
  rows: z.array(scheduledEvidenceRow).max(25),
}).strict();
export type ScheduledMessageWorkspace = z.infer<typeof scheduledMessageWorkspace>;
