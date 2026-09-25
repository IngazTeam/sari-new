import { z } from 'zod';
import { salesExperimentLaunchBasis, salesExperimentLaunchSnapshot, salesExperimentLaunchRevocation, salesExperimentLaunchWindow,
  type AuthorizeSalesExperimentLaunchInput, type RevokeSalesExperimentLaunchInput } from '../../../shared/sales-experiment-launch';
import type { ProtocolRecord } from './sales-experiment-form';
import { compatiblePlanningReceipt, sameReviewValue } from './sales-experiment-review';

const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().datetime({ precision: 3 }).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
const flags = { activationAllowed: z.literal(false), experimentStarted: z.literal(false) };
const receiptSchema = z.object({ launchId: id, launchDigest: digest, snapshot: salesExperimentLaunchSnapshot, actorPresent: z.boolean(),
  state: z.enum(['authorized', 'revoked']), revocation: z.object({ revocationId: id, revocationDigest: digest, snapshot: salesExperimentLaunchRevocation, actorPresent: z.boolean() }).strict().nullable(),
  eligibility: z.literal('not_checked'), ...flags, assignmentCreated: z.literal(false), reused: z.boolean().optional() }).strict();
export type LaunchReceipt = z.infer<typeof receiptSchema>;
const preparedSchema = z.object({ operatorUserId: id, basis: salesExperimentLaunchBasis, basisDigest: digest, checkedAt: utc,
  existing: receiptSchema.nullable(), canAuthorize: z.boolean(), ...flags }).strict();
export type LaunchPrepared = z.infer<typeof preparedSchema>;
const statusSchema = z.object({ operatorUserId: id, protocolId: id, checkedAt: utc, authorization: receiptSchema.nullable(),
  stage: z.enum(['not_authorized', 'revoked', 'stale', 'unavailable', 'scheduled', 'enrollment_open', 'enrollment_closed']), authorizationCurrent: z.boolean(),
  scope: z.literal('point_in_time_authorization_check'), assignmentCreated: z.literal(false), ...flags }).strict();
export type LaunchStatus = z.infer<typeof statusSchema>;
function boundBasis(basis: LaunchPrepared['basis'], record: ProtocolRecord) {
  return sameReviewValue(basis.window, record.protocol.design.window) && compatiblePlanningReceipt({ reviewId: basis.reviewId, reviewDigest: basis.reviewDigest,
    snapshot: basis.review, reviewerPresent: true, eligibility: 'not_checked', activationAllowed: false, experimentStarted: false }, record);
}
export function compatibleLaunchReceipt(value: unknown, record: ProtocolRecord): value is LaunchReceipt {
  const parsed = receiptSchema.safeParse(value); if (!parsed.success || !sameReviewValue(parsed.data, value)) return false;
  const row = parsed.data, s = row.snapshot, r = row.revocation?.snapshot;
  return s.protocolId === record.protocolId && s.merchantId === record.protocol.merchantId && boundBasis(s.basis, record)
    && (row.state === 'revoked') === !!r && (!r || r.launchId === row.launchId && r.launchDigest === row.launchDigest
      && r.protocolId === s.protocolId && r.merchantId === s.merchantId && Date.parse(r.revokedAt) >= Date.parse(s.authorizedAt));
}
export function compatibleLaunchPrepared(value: unknown, record: ProtocolRecord): value is LaunchPrepared {
  const parsed = preparedSchema.safeParse(value); if (!parsed.success || !sameReviewValue(parsed.data, value)) return false;
  const p = parsed.data;
  return record.state === 'registered' && boundBasis(p.basis, record) && Date.parse(p.checkedAt) >= Date.parse(p.basis.review.reviewedAt)
    && (!p.existing || compatibleLaunchReceipt(p.existing, record))
    && p.canAuthorize === (!p.existing && salesExperimentLaunchWindow(p.checkedAt, p.basis.window) === 'scheduled');
}
export function compatibleLaunchStatus(value: unknown, record: ProtocolRecord): value is LaunchStatus {
  const parsed = statusSchema.safeParse(value); if (!parsed.success || !sameReviewValue(parsed.data, value)) return false;
  const s = parsed.data, row = s.authorization;
  if (s.protocolId !== record.protocolId || row && !compatibleLaunchReceipt(row, record)) return false;
  if (!row) return s.stage === 'not_authorized' && !s.authorizationCurrent;
  if (row.state === 'revoked') return s.stage === 'revoked' && !s.authorizationCurrent;
  if (!s.authorizationCurrent) return s.stage === 'stale' || s.stage === 'unavailable';
  return row.actorPresent && record.state === 'registered' && Date.parse(s.checkedAt) >= Date.parse(row.snapshot.authorizedAt)
    && s.stage === salesExperimentLaunchWindow(s.checkedAt, row.snapshot.basis.window);
}
export function matchingLaunchAuthorization(value: unknown, packet: LaunchPrepared, input: AuthorizeSalesExperimentLaunchInput, record: ProtocolRecord): value is LaunchReceipt {
  return compatibleLaunchReceipt(value, record) && typeof value.reused === 'boolean' && value.snapshot.actorUserId === packet.operatorUserId
    && value.snapshot.protocolId === input.protocolId && value.snapshot.reason === input.reason.trim() && value.snapshot.basisDigest === input.basisDigest
    && value.snapshot.basis.reviewId === input.reviewId && value.snapshot.basis.reviewDigest === input.reviewDigest
    && sameReviewValue(value.snapshot.basis, packet.basis) && Date.parse(value.snapshot.authorizedAt) >= Date.parse(packet.checkedAt);
}
export function matchingLaunchRevocation(value: unknown, previous: LaunchReceipt, actor: number, input: RevokeSalesExperimentLaunchInput, record: ProtocolRecord): value is LaunchReceipt {
  return compatibleLaunchReceipt(value, record) && typeof value.reused === 'boolean' && value.state === 'revoked'
    && value.launchId === input.launchId && value.launchDigest === input.launchDigest && sameReviewValue(value.snapshot, previous.snapshot)
    && value.revocation!.snapshot.actorUserId === actor && value.revocation!.snapshot.reason === input.reason.trim();
}
