import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { loadSalesExperimentProtocol, SalesExperimentProtocolConflict } from './sales-experiment-protocol';
import { loadApprovedSalesExperimentPlan, SalesExperimentReviewConflict } from './sales-experiment-review';
import { SalesCohortConflict } from './sales-experiment-cohort';
import { LearningPolicyCandidateConflict } from './learning-policy-candidates';
import { LearningPolicyOutputReviewConflict } from './learning-policy-output-review-store';
import { LearningPolicyEvaluationConflict } from './learning-policy-evaluation';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { salesExperimentLaunchInput, authorizeSalesExperimentLaunchInput, revokeSalesExperimentLaunchInput,
  salesExperimentLaunchBasis, salesExperimentLaunchSnapshot, salesExperimentLaunchRevocation, salesExperimentLaunchWindow,
  type AuthorizeSalesExperimentLaunchInput, type RevokeSalesExperimentLaunchInput } from './sales-experiment-launch-contract';

const id = z.number().int().positive().safe();
export class SalesExperimentLaunchConflict extends Error {
  constructor() { super('Sales experiment launch authorization changed or is unavailable'); }
}
const conflict = (): never => { throw new SalesExperimentLaunchConflict(); };
async function lockMerchant(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) conflict();
}
async function clock(c: PoolConnection) {
  const [rows] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
  return String(rows[0].now).replace(/(\.\d{3})\d{3}Z$/, '$1Z');
}
function decode(value: unknown) { return typeof value === 'string' ? JSON.parse(value) : value; }
function authorization(row: any) {
  try {
    const raw = decode(row.snapshot), snapshot = salesExperimentLaunchSnapshot.parse(raw), basis = snapshot.basis;
    if (policyArtifactDigest(raw) !== row.launch_digest || policyArtifactDigest(snapshot) !== row.launch_digest
      || policyArtifactDigest(basis) !== row.basis_digest || snapshot.basisDigest !== row.basis_digest
      || policyArtifactDigest(basis.review) !== basis.reviewDigest || policyArtifactDigest(basis.review.basis) !== basis.review.basisDigest
      || snapshot.merchantId !== Number(row.merchant_id) || snapshot.protocolId !== Number(row.protocol_id)
      || basis.reviewId !== Number(row.review_id) || basis.reviewDigest !== row.review_digest
      || row.actor_user_id !== null && Number(row.actor_user_id) !== snapshot.actorUserId
      || !['authorized', 'revoked'].includes(row.state)) conflict();
    return { launchId: id.parse(Number(row.id)), launchDigest: String(row.launch_digest), snapshot,
      actorPresent: row.actor_user_id !== null, state: row.state as 'authorized' | 'revoked' };
  } catch { return conflict(); }
}
async function receipt(c: PoolConnection, row: any) {
  const saved = authorization(row);
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_launch_revocations WHERE merchant_id=? AND launch_id=? FOR SHARE', [row.merchant_id, row.id]);
  if (rows.length > 1 || (saved.state === 'revoked') !== (rows.length === 1)) conflict();
  const revoked = rows.length ? rows[0] : null;
  let revocation = null;
  if (revoked) {
    try {
      const raw = decode(revoked.snapshot), snapshot = salesExperimentLaunchRevocation.parse(raw);
      if (policyArtifactDigest(raw) !== revoked.revocation_digest || policyArtifactDigest(snapshot) !== revoked.revocation_digest
        || snapshot.launchId !== saved.launchId || snapshot.launchDigest !== saved.launchDigest
        || snapshot.merchantId !== saved.snapshot.merchantId || snapshot.protocolId !== saved.snapshot.protocolId
        || revoked.actor_user_id !== null && Number(revoked.actor_user_id) !== snapshot.actorUserId
        || Date.parse(snapshot.revokedAt) < Date.parse(saved.snapshot.authorizedAt)) conflict();
      revocation = { revocationId: id.parse(Number(revoked.id)), revocationDigest: String(revoked.revocation_digest), snapshot, actorPresent: revoked.actor_user_id !== null };
    } catch { return conflict(); }
  }
  return { ...saved, revocation, eligibility: 'not_checked' as const, activationAllowed: false as const,
    assignmentCreated: false as const, experimentStarted: false as const };
}
async function currentBasis(c: PoolConnection, merchant: number, protocolId: number) {
  const packet = await loadApprovedSalesExperimentPlan(c, merchant, protocolId);
  const basis = salesExperimentLaunchBasis.parse({ version: 'sales-experiment-launch-basis.v1',
    reviewId: packet.review.reviewId, reviewDigest: packet.review.reviewDigest, review: packet.review.snapshot,
    window: packet.evidence.protocol.protocol.design.window });
  if (Date.parse(packet.checkedAt) < Date.parse(basis.review.reviewedAt)) conflict();
  return { basis, basisDigest: policyArtifactDigest(basis), checkedAt: packet.checkedAt };
}

export async function prepareSalesExperimentLaunch(merchantId: number, value: { protocolId: number }) {
  const merchant = id.parse(merchantId), input = salesExperimentLaunchInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const current = await currentBasis(c, merchant, input.protocolId);
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_launches WHERE merchant_id=? AND protocol_id=? FOR SHARE', [merchant, input.protocolId]);
    return { ...current, existing: rows.length ? await receipt(c, rows[0]) : null,
      canAuthorize: !rows.length && salesExperimentLaunchWindow(current.checkedAt, current.basis.window) === 'scheduled',
      activationAllowed: false as const, experimentStarted: false as const };
  });
}

/** One immutable authorization per protocol. This does not connect the experiment to WhatsApp. */
export async function authorizeSalesExperimentLaunch(merchantId: number, actorUserId: number, value: AuthorizeSalesExperimentLaunchInput) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = authorizeSalesExperimentLaunchInput.parse(value);
  const payload = policyArtifactDigest({ actor, input });
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [prior] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_launches WHERE merchant_id=? AND request_id=? FOR SHARE', [merchant, input.requestId]);
    if (prior.length) {
      if (prior[0].payload_digest !== payload) conflict();
      return { ...await receipt(c, prior[0]), reused: true };
    }
    const current = await currentBasis(c, merchant, input.protocolId);
    if (current.basisDigest !== input.basisDigest || current.basis.reviewId !== input.reviewId || current.basis.reviewDigest !== input.reviewDigest
      || salesExperimentLaunchWindow(current.checkedAt, current.basis.window) !== 'scheduled') conflict();
    const [existing] = await c.execute<any[]>('SELECT id FROM ai_sales_experiment_launches WHERE merchant_id=? AND protocol_id=? FOR SHARE', [merchant, input.protocolId]);
    if (existing.length) conflict();
    const snapshot = salesExperimentLaunchSnapshot.parse({ version: 'sales-experiment-launch-authorization.v1',
      merchantId: merchant, protocolId: input.protocolId, actorUserId: actor, authorizedAt: current.checkedAt,
      basis: current.basis, basisDigest: current.basisDigest, reason: input.reason, reviewedBoundPlanAndDecision: true,
      understandsNoMessagesSent: true, scope: 'launch_authorization_only', assignmentCreated: false, experimentStarted: false });
    const [inserted] = await c.execute<any>(`INSERT INTO ai_sales_experiment_launches
      (merchant_id,protocol_id,request_id,payload_digest,basis_digest,review_id,review_digest,launch_digest,snapshot,actor_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [merchant, input.protocolId, input.requestId, payload, current.basisDigest,
      current.basis.reviewId, current.basis.reviewDigest, policyArtifactDigest(snapshot), JSON.stringify(snapshot), actor]);
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_launches WHERE merchant_id=? AND id=?', [merchant, inserted.insertId]);
    return { ...await receipt(c, rows[0]), reused: false };
  });
}

/** Freshness assessment under the caller's merchant lock; never cache this as a dispatch permit. */
export async function loadSalesExperimentLaunchStatus(c: PoolConnection, merchant: number, protocolId: number) {
  const protocol = await loadSalesExperimentProtocol(c, merchant, protocolId);
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_launches WHERE merchant_id=? AND protocol_id=? FOR SHARE', [merchant, protocolId]);
  const saved = rows.length ? await receipt(c, rows[0]) : null;
  const checkedAt = await clock(c);
  const base = { protocolId, checkedAt, authorization: saved, activationAllowed: false as const,
    assignmentCreated: false as const, experimentStarted: false as const, scope: 'point_in_time_authorization_check' as const };
  if (!saved) return { ...base, stage: 'not_authorized' as const, authorizationCurrent: false };
  if (saved.state === 'revoked') return { ...base, stage: 'revoked' as const, authorizationCurrent: false };
  if (Date.parse(checkedAt) < Date.parse(saved.snapshot.authorizedAt)) return { ...base, stage: 'unavailable' as const, authorizationCurrent: false };
  if (!saved.actorPresent || protocol.state !== 'registered') return { ...base, stage: 'stale' as const, authorizationCurrent: false };
  try {
    const current = await currentBasis(c, merchant, protocolId);
    if (current.basisDigest !== saved.snapshot.basisDigest) return { ...base, stage: 'stale' as const, authorizationCurrent: false };
    return { ...base, checkedAt: current.checkedAt, stage: salesExperimentLaunchWindow(current.checkedAt, current.basis.window), authorizationCurrent: true };
  } catch (error) {
    // Unavailable storage or provider configuration must not be reported as current authority.
    const stale = error instanceof SalesExperimentReviewConflict || error instanceof SalesExperimentProtocolConflict
      || error instanceof SalesCohortConflict || error instanceof LearningPolicyCandidateConflict
      || error instanceof LearningPolicyOutputReviewConflict || error instanceof LearningPolicyEvaluationConflict;
    return { ...base, stage: stale ? 'stale' as const : 'unavailable' as const, authorizationCurrent: false };
  }
}
export async function getSalesExperimentLaunchStatus(merchantId: number, value: { protocolId: number }) {
  const merchant = id.parse(merchantId), input = salesExperimentLaunchInput.parse(value);
  return checkoutTransaction(async c => { await lockMerchant(c, merchant); return loadSalesExperimentLaunchStatus(c, merchant, input.protocolId); });
}

/** Irreversible for this protocol. Source drift, withdrawal or a lost reviewer cannot prevent stopping. */
export async function revokeSalesExperimentLaunch(merchantId: number, actorUserId: number, value: RevokeSalesExperimentLaunchInput) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = revokeSalesExperimentLaunchInput.parse(value);
  const payload = policyArtifactDigest({ actor, input });
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [prior] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_launch_revocations WHERE merchant_id=? AND request_id=? FOR SHARE', [merchant, input.requestId]);
    if (prior.length && (prior[0].payload_digest !== payload || Number(prior[0].launch_id) !== input.launchId)) conflict();
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_launches WHERE merchant_id=? AND id=? FOR UPDATE', [merchant, input.launchId]);
    if (rows.length !== 1) conflict();
    const saved = await receipt(c, rows[0]);
    if (saved.launchDigest !== input.launchDigest) conflict();
    if (prior.length) return { ...saved, reused: true };
    if (saved.state !== 'authorized') conflict();
    const snapshot = salesExperimentLaunchRevocation.parse({ version: 'sales-experiment-launch-revocation.v1', merchantId: merchant,
      protocolId: saved.snapshot.protocolId, launchId: saved.launchId, launchDigest: saved.launchDigest, actorUserId: actor,
      revokedAt: await clock(c), reason: input.reason, restartAllowed: false, winner: null });
    if (Date.parse(snapshot.revokedAt) < Date.parse(saved.snapshot.authorizedAt)) conflict();
    await c.execute(`INSERT INTO ai_sales_experiment_launch_revocations
      (merchant_id,launch_id,request_id,payload_digest,revocation_digest,snapshot,actor_user_id) VALUES (?,?,?,?,?,?,?)`,
      [merchant, input.launchId, input.requestId, payload, policyArtifactDigest(snapshot), JSON.stringify(snapshot), actor]);
    const [changed] = await c.execute<any>("UPDATE ai_sales_experiment_launches SET state='revoked' WHERE merchant_id=? AND id=? AND state='authorized'", [merchant, input.launchId]);
    if (changed.affectedRows !== 1) conflict();
    return { ...await receipt(c, { ...rows[0], state: 'revoked' }), reused: false };
  });
}
