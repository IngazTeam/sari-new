import { z } from 'zod';

const id = z.number().int().positive().safe();
export const staffAttemptKind = z.enum(['text', 'voice']);
export const staffAttemptListInput = z.object({
  conversationId: id, kind: staffAttemptKind, beforeId: id.optional(),
}).strict();
export const staffAttemptCheckInput = z.object({
  conversationId: id, kind: staffAttemptKind, sourceId: id,
}).strict();
export const staffAttemptReviewAuthority = z.object({ actorUserId: id, conversationId: id }).strict();
export const staffAttemptDiagnostic = z.enum(['upload_unconfirmed', 'transport_unconfirmed', 'transport_pending', 'outcome_unknown', 'settlement_available', 'provider_failed', 'dispatch_suppressed', 'evidence_conflict']);
export const staffDiagnosticState = {
  upload_unconfirmed: 'pending', transport_unconfirmed: 'pending', transport_pending: 'pending', outcome_unknown: 'pending', settlement_available: 'pending',
  provider_failed: 'failed', dispatch_suppressed: 'suppressed', evidence_conflict: 'unavailable',
} as const;
export const staffAttemptItem = z.object({
  id, createdAt: z.string().datetime({ precision: 3 }),
  state: z.enum(['pending', 'accepted', 'failed', 'suppressed', 'unavailable']),
  persisted: z.boolean().nullable(),
  // Optional during rollout; current unresolved SQL reads always supply it.
  diagnostic: staffAttemptDiagnostic.optional(),
}).strict().superRefine((item, ctx) => {
  if ((item.state === 'accepted') !== (item.persisted !== null) || item.diagnostic && staffDiagnosticState[item.diagnostic] !== item.state)
    ctx.addIssue({ code: 'custom', message: 'Invalid attempt result' });
});
export const staffAttemptPage = z.object({
  items: z.array(staffAttemptItem).max(20), nextCursor: id.nullable(),
}).strict().superRefine((page, ctx) => {
  if (page.items.some((item, index) => index > 0 && item.id >= page.items[index - 1].id)
    || page.nextCursor !== null && (page.items.length !== 20 || page.nextCursor !== page.items.at(-1)?.id))
    ctx.addIssue({ code: 'custom', message: 'Invalid attempt page' });
});
export const staffAttemptCheckResult = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), status: z.literal('accepted'), persisted: z.boolean() }).strict(),
  z.object({ success: z.literal(false), status: z.enum(['pending', 'failed', 'suppressed']), persisted: z.literal(false) }).strict(),
]);
export const staffAttemptSnapshot = z.object({
  merchantId: id, actorUserId: id, conversationId: id, kind: staffAttemptKind,
  beforeId: id.nullable(), page: staffAttemptPage,
}).strict();
export type StaffAttemptReviewAuthority = z.infer<typeof staffAttemptReviewAuthority>;
