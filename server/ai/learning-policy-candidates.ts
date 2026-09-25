import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { getLearningPolicySourceSnapshot, LearningPolicyReviewConflict } from './learning-policy-review';
import { learningPolicyProposalInput, learningPolicyReviewSuiteDigest } from './learning-policy-review-contract';
import { buildLearningPolicyCandidateBundle, buildLearningPolicyEvaluationBaseline, candidateProposal,
  policyArtifactDigest, policyCandidateInput, policyCandidateVersionInput, type LearningPolicyCandidateBundle, type PolicyCandidateInput } from './learning-policy-evaluation-bundle';

const identity = z.number().int().positive().safe();
export class LearningPolicyCandidateConflict extends Error {
  constructor() { super('Learning policy candidate changed or is unavailable'); }
}
const conflict = (): never => { throw new LearningPolicyCandidateConflict(); };
async function lockMerchant(connection: PoolConnection, merchantId: number) {
  const [rows] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
  if (rows.length !== 1) conflict();
}
async function currentBasis(connection: PoolConnection, merchantId: number, proposalId: number) {
  const source = await getLearningPolicySourceSnapshot(connection, merchantId, proposalId).catch(error => {
    if (error instanceof LearningPolicyReviewConflict) conflict(); throw error;
  });
  const [reviews] = await connection.execute<any[]>(`SELECT id,revision,outcome,passed_cases,regressions,source_digest,suite_digest
    FROM ai_learning_policy_reviews WHERE merchant_id=? AND proposal_id=? ORDER BY revision DESC LIMIT 1 FOR SHARE`, [merchantId, proposalId]);
  const review = reviews[0];
  const eligible = source.eligible && candidateProposal.safeParse(source.proposal).success && !!review
    && review.outcome === 'passed' && Number(review.passed_cases) === 8 && Number(review.regressions) === 0
    && review.source_digest === source.sourceDigest && review.suite_digest === learningPolicyReviewSuiteDigest;
  return { source, review, eligible };
}
function receipt(row: any) {
  return { id: Number(row.id), version: Number(row.version), reviewId: Number(row.review_id),
    baselineDigest: String(row.baseline_digest), artifactDigest: String(row.artifact_digest),
    evaluationStatus: 'not_run' as const, activationAllowed: false as const };
}
function readBundle(row: any): LearningPolicyCandidateBundle {
  try {
    const bundle: LearningPolicyCandidateBundle = typeof row.bundle === 'string' ? JSON.parse(row.bundle) : row.bundle;
    if (policyArtifactDigest(bundle) !== row.artifact_digest || bundle.baselineDigest !== row.baseline_digest
      || policyArtifactDigest(bundle.baseline) !== bundle.baselineDigest || bundle.sourceDigest !== row.source_digest
      || bundle.reviewId !== Number(row.review_id) || bundle.proposal.id !== Number(row.proposal_id)
      || bundle.version !== 'sales-style-candidate.v1' || bundle.activationAllowed !== false || bundle.evaluationStatus !== 'not_run') conflict();
    return bundle;
  } catch { return conflict(); }
}

/** Caller holds the merchant lock; the returned artifact is bound to the latest review and renderer. */
export async function requireCurrentLearningPolicyCandidate(connection: PoolConnection, merchantId: number, candidateId: number, artifactDigest: string) {
  const [rows] = await connection.execute<any[]>('SELECT * FROM ai_learning_policy_candidates WHERE id=? AND merchant_id=? FOR SHARE', [candidateId, merchantId]);
  const row = rows[0]; if (!row || row.artifact_digest !== artifactDigest) conflict();
  const bundle = readBundle(row), basis = await currentBasis(connection, merchantId, Number(row.proposal_id));
  const [latest] = await connection.execute<any[]>('SELECT id FROM ai_learning_policy_candidates WHERE merchant_id=? AND proposal_id=? ORDER BY version DESC LIMIT 1 FOR SHARE', [merchantId, row.proposal_id]);
  if (!basis.eligible || Number(latest[0]?.id) !== candidateId || Number(basis.review.id) !== Number(row.review_id)
    || basis.source.sourceDigest !== row.source_digest || policyArtifactDigest(buildLearningPolicyEvaluationBaseline()) !== row.baseline_digest) conflict();
  return bundle;
}

export async function getLearningPolicyCandidate(merchantId: number, value: { proposalId: number }) {
  const merchant = identity.parse(merchantId), input = learningPolicyProposalInput.parse(value);
  const baselineDigest = policyArtifactDigest(buildLearningPolicyEvaluationBaseline());
  return checkoutTransaction(async connection => {
    await lockMerchant(connection, merchant);
    const basis = await currentBasis(connection, merchant, input.proposalId);
    const [rows] = await connection.execute<any[]>(`SELECT * FROM ai_learning_policy_candidates
      WHERE merchant_id=? AND proposal_id=? ORDER BY version DESC LIMIT 20`, [merchant, input.proposalId]);
    const latest = rows[0], bundle = latest ? readBundle(latest) : null;
    const current = !!latest && basis.eligible && Number(latest.review_id) === Number(basis.review.id)
      && latest.source_digest === basis.source.sourceDigest && latest.baseline_digest === baselineDigest;
    const [evaluations] = await connection.execute<any[]>(`SELECT e.id,e.candidate_id,e.state,e.provider,e.model,e.created_at
      FROM ai_learning_policy_evaluations e JOIN ai_learning_policy_candidates c ON c.id=e.candidate_id AND c.merchant_id=e.merchant_id
      WHERE e.merchant_id=? AND c.proposal_id=? ORDER BY e.id DESC LIMIT 20`, [merchant,input.proposalId]);
    return { proposalId: input.proposalId, sourceDigest: basis.source.sourceDigest, baselineDigest,
      reviewId: basis.review ? Number(basis.review.id) : null, expectedVersion: Number(latest?.version || 0),
      canCreate: basis.eligible && !current && Number(latest?.version || 0) < Number.MAX_SAFE_INTEGER, activationAllowed: false as const,
      latestCandidate: latest ? { ...receipt(latest), current, bundle } : null,
      evaluationRuns: evaluations.map(row=>({runId:Number(row.id),candidateId:Number(row.candidate_id),state:String(row.state),
        provider:String(row.provider),model:String(row.model),createdAt:row.created_at,assessment:'not_assessed' as const,activationAllowed:false as const})),
      history: rows.map(row => ({ ...receipt(row), current: current && row.id === latest.id,
        actorUserId: row.actor_user_id === null ? null : Number(row.actor_user_id), createdAt: row.created_at })) };
  });
}

/** Historical export: independent of the current renderer/source and explicitly not a freshness gate. */
export async function getLearningPolicyCandidateVersion(merchantId: number, value: { candidateId: number }) {
  const merchant = identity.parse(merchantId), input = policyCandidateVersionInput.parse(value);
  return checkoutTransaction(async connection => {
    const [rows] = await connection.execute<any[]>(`SELECT * FROM ai_learning_policy_candidates WHERE id=? AND merchant_id=? FOR SHARE`,
      [input.candidateId, merchant]);
    if (rows.length !== 1) conflict();
    return { ...receipt(rows[0]), bundle: readBundle(rows[0]), eligibility: 'not_checked' as const };
  });
}

export async function createLearningPolicyCandidate(merchantId: number, actorUserId: number, value: PolicyCandidateInput) {
  const merchant = identity.parse(merchantId), actor = identity.parse(actorUserId), input = policyCandidateInput.parse(value);
  const baseline = buildLearningPolicyEvaluationBaseline(), baselineDigest = policyArtifactDigest(baseline);
  const payloadDigest = policyArtifactDigest({ actor, input });
  return checkoutTransaction(async connection => {
    await lockMerchant(connection, merchant);
    const [existing] = await connection.execute<any[]>(`SELECT * FROM ai_learning_policy_candidates
      WHERE merchant_id=? AND request_id=? FOR UPDATE`, [merchant, input.requestId]);
    if (existing.length) {
      if (existing[0].payload_digest !== payloadDigest) conflict();
      readBundle(existing[0]);
      // A receipt survives source/runtime drift; replay never certifies current eligibility.
      return { ...receipt(existing[0]), reused: true };
    }
    const basis = await currentBasis(connection, merchant, input.proposalId);
    if (!basis.eligible || Number(basis.review.id) !== input.reviewId || basis.source.sourceDigest !== input.sourceDigest
      || baselineDigest !== input.baselineDigest) conflict();
    const [rows] = await connection.execute<any[]>(`SELECT version,review_id,baseline_digest FROM ai_learning_policy_candidates
      WHERE merchant_id=? AND proposal_id=? ORDER BY version DESC LIMIT 1 FOR UPDATE`, [merchant, input.proposalId]);
    const latest = rows[0], version = Number(latest?.version || 0);
    if (version !== input.expectedVersion || version >= Number.MAX_SAFE_INTEGER
      || (latest && Number(latest.review_id) === input.reviewId && latest.baseline_digest === baselineDigest)) conflict();
    const bundle = buildLearningPolicyCandidateBundle({ proposal: candidateProposal.parse(basis.source.proposal),
      reviewId: input.reviewId, reviewRevision: Number(basis.review.revision), sourceDigest: input.sourceDigest }, baseline);
    const artifactDigest = policyArtifactDigest(bundle);
    const [saved] = await connection.execute<any>(`INSERT INTO ai_learning_policy_candidates
      (merchant_id,proposal_id,review_id,version,request_id,payload_digest,source_digest,baseline_digest,artifact_digest,actor_user_id,bundle)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [merchant, input.proposalId, input.reviewId, version + 1, input.requestId, payloadDigest,
      input.sourceDigest, baselineDigest, artifactDigest, actor, JSON.stringify(bundle)]);
    return { id: Number(saved.insertId), version: version + 1, reviewId: input.reviewId, baselineDigest, artifactDigest,
      evaluationStatus: 'not_run' as const, activationAllowed: false as const, reused: false };
  });
}
