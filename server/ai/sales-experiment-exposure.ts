import type { PoolConnection } from 'mysql2/promise';
import type { z } from 'zod';
import { databaseTimeEpoch } from '../db/time';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { loadSalesExperimentAssignment } from './sales-experiment-assignment';
import { loadSalesExperimentTurnHistory } from './sales-experiment-turn';
import { loadSalesGenerationReviewRecord } from './sales-experiment-generation';
import { readSalesReplyReview } from './sales-generation-output-review-store';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { salesReplyDeliveryAuthorization, salesReplyDeliveryKey } from './sales-reply-delivery-contract';
import { readSalesExperimentExposure, salesExperimentExposureSnapshot } from './sales-experiment-exposure-contract';

type Delivery = { deliveryId: number; authorizationDigest: string; state: 'authorized' | 'dispatching';
  authorization: z.infer<typeof salesReplyDeliveryAuthorization> };
const unavailable = (): never => { throw Error('Sales exposure evidence unavailable'); };
export async function assertSalesExperimentExposureSchema() {
  await assertRuntimeSchema('sales experiment transport exposure', [{ table: 'ai_sales_experiment_exposures',
    columns: ['merchant_id','delivery_id','protocol_id','assignment_id','outbox_id','exposure_digest','snapshot'],
    uniqueIndexes: [{ name: 'uq_sales_exposure_delivery', columns: ['merchant_id','delivery_id'] },
      { name: 'uq_sales_exposure_outbox', columns: ['merchant_id','outbox_id'] }] }]);
}
/** Caller holds the merchant and delivery locks. Historical evidence never enables sending. */
export async function loadSalesReplyExposure(c: PoolConnection, d: Delivery) {
  const b = d.authorization.basis;
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_exposures WHERE merchant_id=? AND delivery_id=?', [b.merchantId,d.deliveryId]);
  if (!rows.length) return null;
  const s = readSalesExperimentExposure(rows[0]);
  if (rows.length !== 1 || d.state !== 'dispatching' || s.authorizationDigest !== d.authorizationDigest || s.generationId !== b.generationId
    || s.conversationId !== b.conversationId || s.incomingMessageId !== b.incomingMessageId
    || s.reviewId !== b.reviewId || s.reviewDigest !== b.reviewDigest || s.provider !== b.provider
    || s.observationEndsAt !== b.observationEndsAt
    || s.customerKey !== policyArtifactDigest({ version: 'sales-experiment-customer.v1', merchantId: b.merchantId, phone: b.recipient })) return unavailable();
  return s;
}
/** SQL only. Record one accepted transport per reply; never re-enroll, send, mutate allocation or start learning. */
export async function recordSalesReplyExposure(c: PoolConnection, d: Delivery, row: any, outbox: any, transport: string) {
  const previous = await loadSalesReplyExposure(c, d), b = d.authorization.basis;
  if (!['accepted','delivered','read','failed'].includes(transport) || d.state !== 'dispatching' || !outbox?.provider_message_id) return previous !== null;
  const raw = typeof outbox.request_json === 'string' ? JSON.parse(outbox.request_json) : outbox.request_json;
  const requestDigest = policyArtifactDigest({ to: b.recipient, kind: 'text', text: b.responseText,
    salesReplyGuard: { deliveryId: d.deliveryId, authorizationDigest: d.authorizationDigest } });
  if (outbox.idempotency_key !== salesReplyDeliveryKey(b.merchantId,d.deliveryId) || Number(outbox.merchant_id) !== b.merchantId
    || outbox.provider !== b.provider || outbox.direction !== 'outgoing' || policyArtifactDigest(raw) !== requestDigest) return unavailable();
  const providerMessageDigest = policyArtifactDigest({ merchantId: b.merchantId, instanceRecordId: b.instanceRecordId,
    provider: b.provider, providerMessageId: String(outbox.provider_message_id) });
  if (previous) {
    if (previous.outboxId !== Number(outbox.id) || previous.requestDigest !== requestDigest
      || previous.providerMessageDigest !== providerMessageDigest) return unavailable();
    return true;
  }
  // Read the frozen chain. Revocation, a later message or an expired window cannot erase an already accepted send.
  const g = await loadSalesGenerationReviewRecord(c,b.merchantId,b.generationId), gs = g.snapshot;
  const t = await loadSalesExperimentTurnHistory(c,b.merchantId,{ turnId: gs.turnId, turnDigest: gs.turnDigest }), ts = t.snapshot;
  const a = await loadSalesExperimentAssignment(c,b.merchantId,ts.assignmentId), as = a.snapshot;
  const [reviews] = await c.execute<any[]>('SELECT * FROM ai_sales_generation_output_reviews WHERE merchant_id=? AND id=? FOR SHARE', [b.merchantId,b.reviewId]);
  if (reviews.length !== 1) return unavailable();
  const r = readSalesReplyReview(reviews[0]), rs = r.snapshot, rb = rs.basis;
  if (g.state !== 'responded' || g.response.text !== b.responseText || gs.conversationId !== b.conversationId || gs.incomingMessageId !== b.incomingMessageId
    || gs.actorUserId !== b.actorUserId || gs.promptDigest !== ts.promptDigest || gs.routeDigest !== ts.routeDigest
    || gs.observationEndsAt !== b.observationEndsAt || ts.observationEndsAt !== b.observationEndsAt
    || ts.conversationId !== b.conversationId || ts.incomingMessageId !== b.incomingMessageId
    || ts.assignmentDigest !== a.assignmentDigest || ts.protocolId !== as.protocolId || ts.arm !== as.arm
    || ts.launchId !== as.launchId || ts.launchDigest !== as.launchDigest || ts.artifactDigest !== as.artifactDigest
    || ts.baselineDigest !== as.baselineDigest || ts.sectorDigest !== as.sectorDigest || ts.assignmentAt !== as.assignedAt
    || as.observationEndsAt !== b.observationEndsAt
    || as.customerKey !== policyArtifactDigest({ version: 'sales-experiment-customer.v1', merchantId: b.merchantId, phone: b.recipient })
    || r.reviewDigest !== b.reviewDigest || rs.revision !== b.reviewRevision || rs.basisDigest !== b.reviewBasisDigest
    || rs.generationId !== b.generationId || rs.actorUserId !== b.actorUserId || rs.outcome !== 'approved'
    || rb.version !== 'sales-reply-review-basis.v2' || rb.authorizationDigest !== g.authorizationDigest || rb.responseDigest !== g.responseDigest
    || rb.responseText !== b.responseText || rb.turnId !== t.turnId || rb.turnDigest !== t.turnDigest
    || rb.promptDigest !== gs.promptDigest || rb.contextDigest !== gs.contextDigest || rb.routeDigest !== gs.routeDigest
    || rb.sourceDigest !== ts.sourceDigest || rb.observationEndsAt !== b.observationEndsAt) return unavailable();
  const [clock] = await c.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  // Preserve the actual observation clock. A clock regression cannot erase a receipt or invent an earlier send;
  // downstream time-window analysis must inspect this flag instead of silently treating it as ordered evidence.
  const observed = databaseTimeEpoch(clock[0].now), dispatched = databaseTimeEpoch(row.dispatch_started_at);
  const s = salesExperimentExposureSnapshot.parse({ version: 'sales-experiment-transport-exposure.v1', merchantId: b.merchantId,
    protocolId: as.protocolId, assignmentId: a.assignmentId, assignmentDigest: a.assignmentDigest, customerKey: as.customerKey, arm: as.arm,
    turnId: t.turnId, turnDigest: t.turnDigest, artifactDigest: as.artifactDigest, baselineDigest: as.baselineDigest, sectorDigest: as.sectorDigest,
    styleApplied: ts.styleApplied, styleReason: ts.styleReason, generationId: b.generationId, generationDigest: g.authorizationDigest,
    responseDigest: g.responseDigest, reviewId: b.reviewId, reviewDigest: b.reviewDigest, deliveryId: d.deliveryId, authorizationDigest: d.authorizationDigest,
    outboxId: Number(outbox.id), requestDigest, provider: b.provider, providerMessageDigest, conversationId: b.conversationId, incomingMessageId: b.incomingMessageId,
    assignmentAt: as.assignedAt, dispatchStartedAt: new Date(dispatched).toISOString(), observationEndsAt: as.observationEndsAt,
    acceptanceObservedAt: new Date(observed).toISOString(), observationTiming: observed < dispatched ? 'clock_regression' : 'ordered',
    humanReviewed: true, scope: 'provider_acceptance_only' });
  await c.execute(`INSERT INTO ai_sales_experiment_exposures
    (merchant_id,delivery_id,protocol_id,assignment_id,outbox_id,exposure_digest,snapshot) VALUES (?,?,?,?,?,?,?)`,
    [s.merchantId,s.deliveryId,s.protocolId,s.assignmentId,s.outboxId,policyArtifactDigest(s),JSON.stringify(s)]);
  return true;
}
