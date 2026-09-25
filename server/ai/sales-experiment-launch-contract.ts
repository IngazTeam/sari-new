import { z } from 'zod';
import { salesExperimentReviewSnapshot } from '../../shared/sales-experiment-review';
import { salesExperimentDesign } from '../../shared/sales-experiment-protocol';

const id = z.number().int().positive().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reason = z.string().trim().min(30).max(3000);
const requestId = z.string().uuid().transform(value => value.toLowerCase());
const utc = z.string().datetime({ precision: 3 }).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);

export const salesExperimentLaunchInput = z.object({ protocolId: id }).strict();
export const authorizeSalesExperimentLaunchInput = salesExperimentLaunchInput.extend({
  requestId, basisDigest: digest, reviewId: id, reviewDigest: digest, reason,
  reviewedBoundPlanAndDecision: z.literal(true), understandsNoMessagesSent: z.literal(true),
}).strict();
export const revokeSalesExperimentLaunchInput = z.object({ launchId: id, launchDigest: digest, requestId, reason }).strict();

export const salesExperimentLaunchBasis = z.object({
  version: z.literal('sales-experiment-launch-basis.v1'),
  reviewId: id, reviewDigest: digest, review: salesExperimentReviewSnapshot,
  window: salesExperimentDesign.shape.window,
}).strict().refine(value => value.review.verdict === 'approved'
  && Date.parse(value.review.reviewedAt) < Date.parse(value.window.enrollmentStartsAt)
  && Date.parse(value.window.enrollmentEndsAt) - Date.parse(value.window.enrollmentStartsAt) >= 86_400_000
  && Date.parse(value.window.enrollmentEndsAt) - Date.parse(value.window.enrollmentStartsAt) <= 180 * 86_400_000
  && Date.parse(value.window.decisionNotBefore) >= Date.parse(value.window.enrollmentEndsAt) + value.window.observationDays * 86_400_000);
export const salesExperimentLaunchSnapshot = z.object({
  version: z.literal('sales-experiment-launch-authorization.v1'),
  merchantId: id, protocolId: id, actorUserId: id, authorizedAt: utc,
  basis: salesExperimentLaunchBasis, basisDigest: digest, reason,
  reviewedBoundPlanAndDecision: z.literal(true), understandsNoMessagesSent: z.literal(true),
  scope: z.literal('launch_authorization_only'), assignmentCreated: z.literal(false), experimentStarted: z.literal(false),
}).strict().refine(value => value.merchantId === value.basis.review.merchantId && value.protocolId === value.basis.review.protocolId
  && Date.parse(value.authorizedAt) >= Date.parse(value.basis.review.reviewedAt)
  && Date.parse(value.authorizedAt) < Date.parse(value.basis.window.enrollmentStartsAt));
export const salesExperimentLaunchRevocation = z.object({
  version: z.literal('sales-experiment-launch-revocation.v1'), merchantId: id, protocolId: id,
  launchId: id, launchDigest: digest, actorUserId: id, revokedAt: utc, reason,
  restartAllowed: z.literal(false), winner: z.null(),
}).strict();

/** A read-time window classification, never a reusable send/assignment permit. */
export function salesExperimentLaunchWindow(now: string, window: z.infer<typeof salesExperimentDesign.shape.window>) {
  const checked = utc.parse(now), w = salesExperimentDesign.shape.window.parse(window);
  const time = Date.parse(checked);
  return time < Date.parse(w.enrollmentStartsAt) ? 'scheduled' as const
    : time < Date.parse(w.enrollmentEndsAt) ? 'enrollment_open' as const : 'enrollment_closed' as const;
}
export type AuthorizeSalesExperimentLaunchInput = z.infer<typeof authorizeSalesExperimentLaunchInput>;
export type RevokeSalesExperimentLaunchInput = z.infer<typeof revokeSalesExperimentLaunchInput>;
