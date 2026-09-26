import { z } from 'zod';
const id = z.number().int().positive().safe(), digest = z.string().length(64).regex(/^[a-f0-9]{64}$/);
export const replyReviewCriteria = ['answersQuestion', 'groundedInBusiness', 'appropriateNextStep', 'respectsCustomerDecision', 'noUnverifiedCommitment', 'languageAndClarity'] as const;
export const replyReviewChecks = z.object({ answersQuestion: z.boolean(), groundedInBusiness: z.boolean(), appropriateNextStep: z.boolean(),
  respectsCustomerDecision: z.boolean(), noUnverifiedCommitment: z.boolean(), languageAndClarity: z.boolean() }).strict();
export const replyReviewReadInput = z.object({ generationId: id }).strict();
export const replyReviewListInput = z.object({ beforeId: id.optional(), limit: z.number().int().min(1).max(20).default(10) }).strict();
export const replyReviewList = z.object({ items: z.array(z.object({ generationId: id,
  state: z.enum(['dispatching', 'responded', 'invalid', 'blocked', 'uncertain']), reviewOutcome: z.enum(['approved', 'rejected']).nullable(),
  revision: z.number().int().nonnegative().safe() }).strict()).max(20), nextCursor: id.nullable(),
  dispatchAllowed: z.literal(false), exposureRecorded: z.literal(false) }).strict();
export const replyReviewSubmitInput = replyReviewReadInput.extend({ requestId: z.string().uuid().transform(v => v.toLowerCase()), basisDigest: digest,
  rubricDigest: digest, expectedRevision: z.number().int().nonnegative().safe(), checks: replyReviewChecks, quote: z.string().min(1).max(2000).refine(v => !!v.trim()),
  rationale: z.string().trim().min(30).max(3000), reviewedEntireResponse: z.literal(true), understandsNoMessageSent: z.literal(true) }).strict();
export const replyReviewReceipt = z.object({ reviewId: id, generationId: id, actorUserId: id, revision: id, requestId: z.string().uuid(),
  basisDigest: digest, rubricDigest: digest, outcome: z.enum(['approved', 'rejected']), reviewedAt: z.string().datetime(),
  checks: replyReviewChecks, quote: z.string().min(1).max(2000), rationale: z.string().min(30).max(3000),
  dispatchAllowed: z.literal(false), exposureRecorded: z.literal(false), eligibility: z.literal('not_checked') }).strict();
export const replyReviewWorkspace = z.object({ generationId: id, actorUserId: id, state: z.enum(['dispatching', 'responded', 'invalid', 'blocked', 'uncertain']),
  responseText: z.string().max(32000).nullable(), canReview: z.boolean(), stage: z.enum(['ready', 'source_unavailable', 'incomplete', 'owner_required']),
  basis: z.object({ digest, rubricDigest: digest, customerMessage: z.string().min(1).max(4000), lastAssistantMessage: z.string().max(32000),
    checkedAt: z.string().datetime(), observationEndsAt: z.string().datetime(), gate: z.array(z.object({ rule: z.string().max(80), severity: z.enum(['critical', 'warning']) }).strict()).max(32) }).strict().nullable(),
  expectedRevision: z.number().int().nonnegative().safe(), history: z.array(replyReviewReceipt).max(20), reviewCurrentAtRead: z.boolean(),
  dispatchAllowed: z.literal(false), exposureRecorded: z.literal(false) }).strict();
export type ReplyReviewSubmission = z.infer<typeof replyReviewSubmitInput>;
export type ReplyReviewWorkspace = z.infer<typeof replyReviewWorkspace>;
export type ReplyReviewReceipt = z.infer<typeof replyReviewReceipt>;
