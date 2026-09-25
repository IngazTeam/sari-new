import { planningReviewFixtureRecord, planningReviewFixtureWorkspace, planningReviewFixtureReceipt } from './sales-planning-review-data';
export function launchFixture(record = planningReviewFixtureRecord()): any {
  const review = planningReviewFixtureReceipt(planningReviewFixtureWorkspace(record));
  return { operatorUserId: 7, basis: { version: 'sales-experiment-launch-basis.v1', reviewId: review.reviewId, reviewDigest: review.reviewDigest,
    review: review.snapshot, window: structuredClone(record.protocol.design.window) }, basisDigest: 'a'.repeat(64), checkedAt: new Date().toISOString(),
    existing: null, canAuthorize: true, activationAllowed: false, experimentStarted: false };
}
export function launchFixtureReceipt(p = launchFixture()): any {
  return { launchId: 12, launchDigest: 'c'.repeat(64), actorPresent: true, state: 'authorized', revocation: null, eligibility: 'not_checked',
    activationAllowed: false, assignmentCreated: false, experimentStarted: false, snapshot: { version: 'sales-experiment-launch-authorization.v1',
      merchantId: p.basis.review.merchantId, protocolId: p.basis.review.protocolId, actorUserId: p.operatorUserId, authorizedAt: new Date().toISOString(),
      basis: structuredClone(p.basis), basisDigest: p.basisDigest, reason: 'Explicit authorization after reviewing the bound plan and independent approval.',
      reviewedBoundPlanAndDecision: true, understandsNoMessagesSent: true, scope: 'launch_authorization_only', assignmentCreated: false, experimentStarted: false } };
}
export function launchFixtureStatus(row: any = null): any {
  return { operatorUserId: 7, protocolId: 45, checkedAt: new Date().toISOString(), authorization: row, activationAllowed: false,
    assignmentCreated: false, experimentStarted: false, scope: 'point_in_time_authorization_check', stage: row ? row.state === 'revoked' ? 'revoked' : 'scheduled' : 'not_authorized', authorizationCurrent: !!row && row.state !== 'revoked' };
}
export function launchFixtureRevocation(row: any, actor = 7, reason = 'Permanently revoke this authorization with a documented operational reason.'): any {
  return { ...structuredClone(row), state: 'revoked', revocation: { revocationId: 13, revocationDigest: 'd'.repeat(64), actorPresent: true,
    snapshot: { version: 'sales-experiment-launch-revocation.v1', merchantId: row.snapshot.merchantId, protocolId: row.snapshot.protocolId,
      launchId: row.launchId, launchDigest: row.launchDigest, actorUserId: actor, revokedAt: new Date().toISOString(), reason, restartAllowed: false, winner: null } } };
}
