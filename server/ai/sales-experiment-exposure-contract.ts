import { z } from 'zod';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';

const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().datetime({ precision: 3 }).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
/** Transport acceptance is an observation, not proof of delivery, reading, purchase or treatment efficacy. */
export const salesExperimentExposureSnapshot = z.object({
  version: z.literal('sales-experiment-transport-exposure.v1'), merchantId: id, protocolId: id,
  assignmentId: id, assignmentDigest: digest, customerKey: digest, arm: z.enum(['baseline', 'candidate']),
  turnId: id, turnDigest: digest, artifactDigest: digest, baselineDigest: digest, sectorDigest: digest,
  styleApplied: z.boolean(), styleReason: z.enum(['candidate_style','baseline_arm','customer_declined','existing_order']),
  generationId: id, generationDigest: digest, responseDigest: digest, reviewId: id, reviewDigest: digest,
  deliveryId: id, authorizationDigest: digest, outboxId: id, requestDigest: digest,
  provider: z.enum(['green_api','meta_cloud','mock']), providerMessageDigest: digest,
  conversationId: id, incomingMessageId: id, assignmentAt: utc, dispatchStartedAt: utc, observationEndsAt: utc,
  acceptanceObservedAt: utc, observationTiming: z.enum(['ordered','clock_regression']),
  humanReviewed: z.literal(true), scope: z.literal('provider_acceptance_only'),
}).strict().superRefine((s, ctx) => {
  if (Date.parse(s.dispatchStartedAt) < Date.parse(s.assignmentAt) || Date.parse(s.dispatchStartedAt) >= Date.parse(s.observationEndsAt)
    || s.observationTiming !== (Date.parse(s.acceptanceObservedAt) < Date.parse(s.dispatchStartedAt) ? 'clock_regression' : 'ordered')
    || s.styleApplied !== (s.styleReason === 'candidate_style')
    || s.styleReason === 'candidate_style' && s.arm !== 'candidate'
    || s.styleReason === 'baseline_arm' && s.arm !== 'baseline') ctx.addIssue({ code: 'custom', message: 'Invalid transport exposure evidence' });
});
export type SalesExperimentExposureSnapshot = z.infer<typeof salesExperimentExposureSnapshot>;
export function readSalesExperimentExposure(row: any) {
  const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
  const s = salesExperimentExposureSnapshot.parse(raw);
  if (policyArtifactDigest(raw) !== row.exposure_digest || policyArtifactDigest(s) !== row.exposure_digest
    || s.merchantId !== Number(row.merchant_id) || s.deliveryId !== Number(row.delivery_id)
    || s.protocolId !== Number(row.protocol_id) || s.assignmentId !== Number(row.assignment_id)
    || s.outboxId !== Number(row.outbox_id)) throw Error('Sales exposure evidence unavailable');
  return s;
}
