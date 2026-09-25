import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { loadSalesExperimentProtocol } from './sales-experiment-protocol';
import { loadSalesExperimentCohort } from './sales-experiment-cohort';
import { requireCurrentLearningPolicyCandidate } from './learning-policy-candidates';
import { loadCompletedLearningPolicyOutputs } from './learning-policy-output-review';
import { readOutputReview } from './learning-policy-output-review-store';
import { outputReviewRubricDigest } from './learning-policy-output-review-contract';
import { getCurrentLearningPolicyEvaluationRoute } from './learning-policy-evaluation';
import { getSalesSectorPlaybook } from '../../shared/sales-sector-playbooks';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { prepareSalesExperimentReviewInput, recordSalesExperimentReviewInput, salesExperimentReviewBasis,
  salesExperimentReviewSnapshot, salesExperimentReviewHistoryInput, salesExperimentReviewWorkspaceInput, type RecordSalesExperimentReviewInput } from './sales-experiment-review-contract';

const id = z.number().int().positive().safe();
export class SalesExperimentReviewConflict extends Error { constructor() { super('Sales experiment review changed or is unavailable'); } }
const conflict = (): never => { throw new SalesExperimentReviewConflict(); };
async function lockMerchant(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) conflict();
}
async function clock(c: PoolConnection) {
  const [rows] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
  return String(rows[0].now).replace(/(\.\d{3})\d{3}Z$/, '$1Z');
}
function receipt(row: any) {
  try {
    const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
    const snapshot = salesExperimentReviewSnapshot.parse(raw);
    if (policyArtifactDigest(raw) !== row.review_digest || policyArtifactDigest(snapshot) !== row.review_digest
      || policyArtifactDigest(snapshot.basis) !== row.basis_digest || snapshot.basisDigest !== row.basis_digest
      || snapshot.merchantId !== Number(row.merchant_id) || snapshot.protocolId !== Number(row.protocol_id)
      || snapshot.revision !== Number(row.revision) || snapshot.verdict !== row.verdict
      || (row.actor_user_id !== null && snapshot.reviewerUserId !== Number(row.actor_user_id))) conflict();
    return { reviewId: id.parse(Number(row.id)), reviewDigest: String(row.review_digest), snapshot,
      reviewerPresent: row.actor_user_id !== null, eligibility: 'not_checked' as const,
      activationAllowed: false as const, experimentStarted: false as const };
  } catch { return conflict(); }
}
async function latest(c: PoolConnection, merchant: number, protocolId: number) {
  const [rows] = await c.execute<any[]>(`SELECT * FROM ai_sales_experiment_reviews
    WHERE merchant_id=? AND protocol_id=? ORDER BY revision DESC LIMIT 1 FOR SHARE`, [merchant, protocolId]);
  return rows.length ? receipt(rows[0]) : null;
}

/** Caller holds the merchant lock. All evidence is re-read; no submitted summaries or old pass flags. */
async function currentBasis(c: PoolConnection, merchant: number, protocolId: number, runId: number) {
  const record = await loadSalesExperimentProtocol(c, merchant, protocolId), p = record.protocol;
  if (record.state !== 'registered' || p.sampleCalculation?.status !== 'meets_calculated_floor') conflict();
  const candidate = await requireCurrentLearningPolicyCandidate(c, merchant, p.candidate.id, p.candidate.artifactDigest);
  if (candidate.baselineDigest !== p.candidate.baselineDigest || candidate.sourceDigest !== p.candidate.sourceDigest
    || candidate.reviewId !== p.candidate.preparationReviewId) conflict();
  const cohort = await loadSalesExperimentCohort(c, merchant, protocolId);
  const [sectorRows] = await c.execute<any[]>('SELECT playbook_id,revision FROM ai_sales_sector_settings WHERE merchant_id=? FOR SHARE', [merchant]);
  const requested = sectorRows[0]?.playbook_id ?? 'general', sector = getSalesSectorPlaybook(requested);
  if (requested !== sector.id || Number(sectorRows[0]?.revision ?? 0) !== p.sector.revision || policyArtifactDigest(sector) !== p.sector.digest) conflict();
  const [runs] = await c.execute<any[]>('SELECT * FROM ai_learning_policy_evaluations WHERE merchant_id=? AND id=? FOR SHARE', [merchant, runId]);
  if (runs.length !== 1) conflict();
  const run = runs[0];
  if (Number(run.candidate_id) !== p.candidate.id || run.artifact_digest !== p.candidate.artifactDigest) conflict();
  const [latestRuns] = await c.execute<any[]>(`SELECT id FROM ai_learning_policy_evaluations
    WHERE merchant_id=? AND candidate_id=? ORDER BY id DESC LIMIT 1 FOR SHARE`, [merchant, p.candidate.id]);
  if (Number(latestRuns[0]?.id) !== runId) conflict();
  const outputs = await loadCompletedLearningPolicyOutputs(c, merchant, run);
  const route = await getCurrentLearningPolicyEvaluationRoute();
  if (route.digest !== run.route_digest || route.provider !== run.provider || route.model !== run.model) conflict();
  const [reviews] = await c.execute<any[]>(`SELECT * FROM ai_learning_policy_output_reviews
    WHERE merchant_id=? AND run_id=? ORDER BY revision DESC LIMIT 1 FOR SHARE`, [merchant, runId]);
  if (reviews.length !== 1) conflict();
  const r = reviews[0], reviewed = readOutputReview(r);
  if (reviewed.outcome !== 'passed' || r.run_digest !== outputs.runDigest || r.rubric_digest !== outputReviewRubricDigest) conflict();
  for (const item of reviewed.review.cases) {
    const pair = outputs.pairs.find(pair => pair.caseId === item.caseId);
    if (!pair || !pair.baseline.response.includes(item.baseline.quote) || !pair.candidate.response.includes(item.candidate.quote)) conflict();
  }
  const [candidates] = await c.execute<any[]>('SELECT actor_user_id FROM ai_learning_policy_candidates WHERE merchant_id=? AND id=? FOR SHARE', [merchant, p.candidate.id]);
  const [preparations] = await c.execute<any[]>('SELECT actor_user_id FROM ai_learning_policy_reviews WHERE merchant_id=? AND id=? FOR SHARE', [merchant, p.candidate.preparationReviewId]);
  // Missing/deleted preparer identity cannot prove independent review. All six roles are checked.
  const participants = [record.actorUserId, cohort.actorUserId, run.actor_user_id, r.actor_user_id, candidates[0]?.actor_user_id, preparations[0]?.actor_user_id];
  if (participants.some(value => !id.safeParse(value === null || value === undefined ? value : Number(value)).success)) conflict();
  const basis = salesExperimentReviewBasis.parse({ version: 'sales-experiment-review-basis.v1', merchantId: merchant,
    protocolId, protocolDigest: record.protocolDigest, cohortId: cohort.cohortId, cohortDigest: cohort.cohortDigest,
    candidateId: p.candidate.id, artifactDigest: p.candidate.artifactDigest, sourceDigest: p.candidate.sourceDigest, sectorDigest: p.sector.digest,
    runId, runDigest: outputs.runDigest, routeDigest: route.digest, provider: route.provider, model: route.model, observedModel: run.observed_model,
    outputReviewId: reviewed.id, outputReviewRevision: reviewed.revision, outputReviewDigest: r.review_digest,
    rubricDigest: r.rubric_digest, participantUserIds: Array.from(new Set(participants.map(Number))).sort((a, b) => a - b) });
  const checkedAt = await clock(c);
  if (Date.parse(checkedAt) >= Date.parse(p.design.window.enrollmentStartsAt)) conflict();
  return { basis, basisDigest: policyArtifactDigest(basis), checkedAt,
    evidence: { protocol: record, cohort, pairs: outputs.pairs, outputReview: reviewed.review } };
}

/** One locked read binds displayed evidence to the exact review basis; no provider calls. */
export async function getSalesExperimentReviewWorkspace(merchantId: number, actorUserId: number, value: z.infer<typeof salesExperimentReviewWorkspaceInput>) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = salesExperimentReviewWorkspaceInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const protocol = await loadSalesExperimentProtocol(c, merchant, input.protocolId);
    const [runs] = await c.execute<any[]>(`SELECT id FROM ai_learning_policy_evaluations
      WHERE merchant_id=? AND candidate_id=? ORDER BY id DESC LIMIT 1 FOR SHARE`, [merchant, protocol.protocol.candidate.id]);
    if (runs.length !== 1) conflict();
    const packet = await currentBasis(c, merchant, input.protocolId, Number(runs[0].id)), saved = await latest(c, merchant, input.protocolId);
    const current = !!saved && saved.reviewerPresent && saved.snapshot.basisDigest === packet.basisDigest;
    return { ...packet, reviewerUserId: actor, latestReview: saved, expectedRevision: saved?.snapshot.revision ?? 0,
      canReview: !packet.basis.participantUserIds.includes(actor),
      stage: !saved ? 'not_reviewed' : !current ? 'review_stale' : saved.snapshot.verdict,
      planningReviewCurrent: current && saved!.snapshot.verdict === 'approved', activationAllowed: false as const, experimentStarted: false as const };
  });
}

export async function prepareSalesExperimentReview(merchantId: number, actorUserId: number, value: z.infer<typeof prepareSalesExperimentReviewInput>) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = prepareSalesExperimentReviewInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const { evidence: _evidence, ...packet } = await currentBasis(c, merchant, input.protocolId, input.runId), saved = await latest(c, merchant, input.protocolId);
    const current = !!saved && saved.reviewerPresent && saved.snapshot.basisDigest === packet.basisDigest;
    return { ...packet, latestReview: saved, expectedRevision: saved?.snapshot.revision ?? 0,
      canReview: !packet.basis.participantUserIds.includes(actor),
      stage: !saved ? 'not_reviewed' : !current ? 'review_stale' : saved.snapshot.verdict,
      planningReviewCurrent: current && saved!.snapshot.verdict === 'approved',
      activationAllowed: false as const, experimentStarted: false as const };
  });
}

export async function recordSalesExperimentReview(merchantId: number, actorUserId: number, value: RecordSalesExperimentReviewInput) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = recordSalesExperimentReviewInput.parse(value);
  const payload = policyArtifactDigest({ actor, input });
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [existing] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_reviews WHERE merchant_id=? AND request_id=? FOR SHARE', [merchant, input.requestId]);
    // A lost acknowledgement can be recovered after withdrawal, supersession or source drift.
    if (existing.length) { if (existing[0].payload_digest !== payload) conflict(); return { ...receipt(existing[0]), reused: true }; }
    const packet = await currentBasis(c, merchant, input.protocolId, input.runId), saved = await latest(c, merchant, input.protocolId);
    const revision = saved?.snapshot.revision ?? 0;
    if (packet.basisDigest !== input.basisDigest || packet.basis.participantUserIds.includes(actor)
      || revision !== input.expectedRevision || revision >= Number.MAX_SAFE_INTEGER) conflict();
    const snapshot = salesExperimentReviewSnapshot.parse({ version: 'sales-experiment-independent-review.v1', merchantId: merchant,
      protocolId: input.protocolId, runId: input.runId, revision: revision + 1, reviewerUserId: actor, reviewedAt: packet.checkedAt,
      basis: packet.basis, basisDigest: packet.basisDigest, verdict: input.verdict, assessment: input.assessment,
      reviewedFrozenDesignAndOutputs: true, understandsNoActivation: true, scope: 'independent_planning_review',
      independence: 'distinct_authenticated_user', activationAllowed: false, experimentStarted: false });
    const [inserted] = await c.execute<any>(`INSERT INTO ai_sales_experiment_reviews
      (merchant_id,protocol_id,revision,request_id,payload_digest,basis_digest,review_digest,snapshot,verdict,actor_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [merchant, input.protocolId, revision + 1, input.requestId, payload, packet.basisDigest,
      policyArtifactDigest(snapshot), JSON.stringify(snapshot), input.verdict, actor]);
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_reviews WHERE merchant_id=? AND id=?', [merchant, inserted.insertId]);
    return { ...receipt(rows[0]), reused: false };
  });
}

/** Historical, bounded read remains available when the evidence no longer qualifies. */
export async function getSalesExperimentReviewHistory(merchantId: number, value: z.input<typeof salesExperimentReviewHistoryInput>) {
  const merchant = id.parse(merchantId), input = salesExperimentReviewHistoryInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [owned] = await c.execute<any[]>('SELECT id FROM ai_sales_experiment_protocols WHERE merchant_id=? AND id=? FOR SHARE', [merchant, input.protocolId]);
    if (owned.length !== 1) conflict();
    const [rows] = await c.execute<any[]>(`SELECT * FROM ai_sales_experiment_reviews WHERE merchant_id=? AND protocol_id=?
      ${input.beforeId ? 'AND id<?' : ''} ORDER BY id DESC LIMIT ${input.limit + 1} FOR SHARE`, [merchant, input.protocolId, ...(input.beforeId ? [input.beforeId] : [])]);
    const items = rows.slice(0, input.limit).map(receipt);
    return { items, nextBeforeId: rows.length > input.limit ? items.at(-1)!.reviewId : null, activationAllowed: false as const };
  });
}
