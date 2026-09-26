import { z } from 'zod';
import { generateSalesExperimentTurnInput } from './sales-experiment-generation-contract';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { replyReviewChecks } from '../../shared/sales-reply-review';

const id = z.number().int().positive().safe(), digest = z.string().length(64).regex(/^[a-f0-9]{64}$/);
export const salesReplyReviewRubric = Object.freeze({ version: 'sales-reply-human-review.v1', kind: 'human_original_output_review',
  criteria: ['answersQuestion', 'groundedInBusiness', 'appropriateNextStep', 'respectsCustomerDecision', 'noUnverifiedCommitment', 'languageAndClarity'],
  acceptance: 'All human criteria pass and the deterministic safety gate reports no critical violation.',
  evidence: 'An exact output quote anchors the human judgment; it does not independently verify commercial facts.',
  scope: 'Original saved text only. No rewriting, provider calls, transport authorization or sales exposure.',
});
export const salesReplyReviewRubricDigest = policyArtifactDigest(salesReplyReviewRubric);
export const salesReplyReviewChecks = replyReviewChecks;
export const readSalesReplyReviewInput = z.object({ generationId: id }).strict();
export const prepareSalesReplyReviewInput = generateSalesExperimentTurnInput.pick({ baseSystemPrompt: true, contextMessages: true })
  .extend({ generationId: id }).strict();
export const recordSalesReplyReviewInput = prepareSalesReplyReviewInput.extend({ requestId: z.string().uuid().transform(v => v.toLowerCase()),
  basisDigest: digest, rubricDigest: z.literal(salesReplyReviewRubricDigest), expectedRevision: z.number().int().nonnegative().safe(),
  checks: salesReplyReviewChecks, quote: z.string().min(1).max(2000).refine(v => v.trim().length > 0),
  rationale: z.string().trim().min(30).max(3000), reviewedEntireResponse: z.literal(true), understandsNoMessageSent: z.literal(true),
}).strict();
const utc = z.string().datetime({ precision: 3 }).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
const originalReplyReviewBasis = z.object({ version: z.literal('sales-reply-review-basis.v1'), merchantId: id, generationId: id,
  authorizationDigest: digest, responseDigest: digest, responseText: z.string().min(1).max(32000), turnId: id, turnDigest: digest,
  sourceDigest: digest, promptDigest: digest, contextDigest: digest, routeDigest: digest, observationEndsAt: utc,
  rubricDigest: digest, gate: z.array(z.object({ rule: z.string().min(1).max(80), severity: z.enum(['critical', 'warning']) }).strict()).max(32),
}).strict();
export const currentTurnReplyReviewBasis = originalReplyReviewBasis.extend({ version: z.literal('sales-reply-review-basis.v2'),
  contextVerification: z.literal('current_turn_evidence'), customerMessage: z.string().min(1).max(4000), lastAssistantMessage: z.string().max(32000) }).strict();
export const salesReplyReviewBasis = z.discriminatedUnion('version', [originalReplyReviewBasis, currentTurnReplyReviewBasis]);
export const salesReplyReviewSnapshot = z.object({ version: z.literal('sales-reply-output-review.v1'), merchantId: id, generationId: id,
  actorUserId: id, revision: id, basis: salesReplyReviewBasis, basisDigest: digest, checks: salesReplyReviewChecks,
  quote: z.string().min(1).max(2000), rationale: z.string().min(30).max(3000), outcome: z.enum(['approved', 'rejected']),
  reviewedAt: utc, reviewedEntireResponse: z.literal(true), understandsNoMessageSent: z.literal(true),
  scope: z.literal('human_output_review_only'), dispatchAllowed: z.literal(false), exposureRecorded: z.literal(false),
}).strict().superRefine((s, ctx) => {
  if (s.merchantId !== s.basis.merchantId || s.generationId !== s.basis.generationId || !s.quote.trim()
    || !s.basis.responseText.includes(s.quote) || policyArtifactDigest(s.basis) !== s.basisDigest
    || s.outcome !== salesReplyReviewOutcome(s.checks, s.basis.gate) || Date.parse(s.reviewedAt) >= Date.parse(s.basis.observationEndsAt))
    ctx.addIssue({ code: 'custom', message: 'Invalid reply review evidence' });
});
export function salesReplyReviewOutcome(checks: z.infer<typeof salesReplyReviewChecks>, gate: Array<{ severity: string }>) {
  return Object.values(checks).every(Boolean) && !gate.some(v => v.severity === 'critical') ? 'approved' as const : 'rejected' as const;
}
export type RecordSalesReplyReviewInput = z.input<typeof recordSalesReplyReviewInput>;
