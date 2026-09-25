import { z } from 'zod';

const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const reason = z.string().trim().min(30).max(3000);
export const prepareSalesExperimentReviewInput = z.object({ protocolId: id, runId: id }).strict();
export const salesExperimentReviewHistoryInput = z.object({ protocolId: id, beforeId: id.optional(), limit: z.number().int().min(1).max(50).default(20) }).strict();
export const recordSalesExperimentReviewInput = prepareSalesExperimentReviewInput.extend({
  requestId: z.string().uuid().transform(value => value.toLowerCase()), basisDigest: digest,
  expectedRevision: z.number().int().nonnegative().safe(), verdict: z.enum(['approved', 'rejected']),
  assessment: z.object({ baselineAndSample: reason, recruitmentFeasibility: reason, qualificationMapping: reason, safetyAndMeasurement: reason }).strict(),
  reviewedFrozenDesignAndOutputs: z.literal(true), understandsNoActivation: z.literal(true),
}).strict();

/** A human assessment of a bound evidence set. Never a delivery or assignment authorization. */
export const salesExperimentReviewBasis = z.object({
  version: z.literal('sales-experiment-review-basis.v1'), merchantId: id, protocolId: id, protocolDigest: digest,
  cohortId: id, cohortDigest: digest, candidateId: id, artifactDigest: digest, sourceDigest: digest, sectorDigest: digest,
  runId: id, runDigest: digest, routeDigest: digest, provider: z.enum(['openai', 'zahypi']), model: z.string().min(1).max(128),
  observedModel: z.string().min(1).max(128), outputReviewId: id, outputReviewRevision: id, outputReviewDigest: digest,
  rubricDigest: digest, participantUserIds: z.array(id).min(1).max(6).refine(values => values.every((value, i) => !i || value > values[i - 1]), 'Sorted distinct participants required'),
}).strict();
export const salesExperimentReviewSnapshot = z.object({
  version: z.literal('sales-experiment-independent-review.v1'), merchantId: id, protocolId: id, runId: id,
  revision: id, reviewerUserId: id, reviewedAt: z.string().datetime({ precision: 3 }),
  basis: salesExperimentReviewBasis, basisDigest: digest,
  verdict: z.enum(['approved', 'rejected']), assessment: recordSalesExperimentReviewInput.shape.assessment,
  reviewedFrozenDesignAndOutputs: z.literal(true), understandsNoActivation: z.literal(true),
  scope: z.literal('independent_planning_review'), independence: z.literal('distinct_authenticated_user'),
  activationAllowed: z.literal(false), experimentStarted: z.literal(false),
}).strict().refine(value => value.merchantId === value.basis.merchantId && value.protocolId === value.basis.protocolId
  && value.runId === value.basis.runId && !value.basis.participantUserIds.includes(value.reviewerUserId), 'Bound identity and independent reviewer required');
export type RecordSalesExperimentReviewInput = z.infer<typeof recordSalesExperimentReviewInput>;
