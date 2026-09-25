import { z } from 'zod';

const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().datetime({ precision: 3 }).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
/** Internal enrollment command. Neither customers nor models choose identity, time, eligibility or arm. */
export const assignSalesExperimentInput = z.object({ protocolId: id, launchId: id, launchDigest: digest,
  conversationId: id, incomingMessageId: id, expectedMessageDigest: digest.optional() }).strict();
export const readSalesExperimentAssignmentInput = z.object({ assignmentId: id }).strict();
export const salesExperimentAssignmentSnapshot = z.object({
  version: z.literal('sales-experiment-assignment.v1'), merchantId: id, protocolId: id, protocolDigest: digest,
  launchId: id, launchDigest: digest, cohortId: id, cohortDigest: digest, customerKey: digest,
  candidateId: id, artifactDigest: digest, baselineDigest: digest, sectorDigest: digest,
  arm: z.enum(['baseline', 'candidate']), allocation: z.literal('server_crypto_random_50_50.v1'),
  conversationId: id, incomingMessageId: id, messageDigest: digest, sourceDigest: digest,
  population: z.enum(['new', 'returning']), messageReceivedAt: utc, qualifiedAt: utc, assignedAt: utc,
  enrollmentStartsAt: utc, enrollmentEndsAt: utc, observationDays: z.number().int().min(1).max(180), observationEndsAt: utc, decisionNotBefore: utc,
  scope: z.literal('enrollment_only'), dispatchAllowed: z.literal(false), exposureRecorded: z.literal(false),
}).strict().superRefine((s, ctx) => {
  const start = Date.parse(s.enrollmentStartsAt), end = Date.parse(s.enrollmentEndsAt), qualified = Date.parse(s.qualifiedAt), assigned = Date.parse(s.assignedAt);
  if (start >= end || Date.parse(s.messageReceivedAt) < start || Date.parse(s.messageReceivedAt) > qualified || qualified < start || qualified > assigned || assigned >= end
    || Date.parse(s.observationEndsAt) !== assigned + s.observationDays * 86_400_000
    || Date.parse(s.decisionNotBefore) < end + s.observationDays * 86_400_000) {
    ctx.addIssue({ code: 'custom', message: 'Invalid frozen enrollment or observation window' });
  }
});
export type AssignSalesExperimentInput = z.infer<typeof assignSalesExperimentInput>;
