import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { loadLearningPolicyCandidateArtifact, requireCurrentLearningPolicyCandidate, LearningPolicyCandidateConflict } from './learning-policy-candidates';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { evaluationCompletion, evaluationRecipe, evaluationSamples } from './learning-policy-evaluation-contract';
import { outputReviewInput, outputReviewReadInput, outputReviewRubric, outputReviewRubricDigest, scoreOutputReview, type OutputReviewInput } from './learning-policy-output-review-contract';
import { outputReviewConflict as conflict, readOutputReview } from './learning-policy-output-review-store';

const identity = z.number().int().positive().safe();
const decode = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
async function lockMerchant(c: PoolConnection, merchantId: number) {
  const [rows] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
  if (rows.length !== 1) conflict();
}
async function loadRun(c: PoolConnection, merchantId: number, runId: number) {
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_learning_policy_evaluations WHERE id=? AND merchant_id=? FOR UPDATE', [runId, merchantId]);
  if (rows.length !== 1) conflict();
  return rows[0];
}
async function reviewHistory(c: PoolConnection, merchantId: number, runId: number) {
  const [rows] = await c.execute<any[]>(`SELECT * FROM ai_learning_policy_output_reviews
    WHERE merchant_id=? AND run_id=? ORDER BY revision DESC LIMIT 20`, [merchantId, runId]);
  return rows.map(row => ({ ...readOutputReview(row), runDigest: row.run_digest, rubricDigest: row.rubric_digest,
    actorUserId: row.actor_user_id === null ? null : Number(row.actor_user_id), createdAt: row.created_at }));
}

export async function loadCompletedLearningPolicyOutputs(c: PoolConnection, merchantId: number, run: any) {
  const { bundle } = await loadLearningPolicyCandidateArtifact(c, merchantId, Number(run.candidate_id), run.artifact_digest);
  if (run.state !== 'completed' || !run.observed_model || policyArtifactDigest(decode(run.recipe)) !== policyArtifactDigest(evaluationRecipe)) conflict();
  const expected = evaluationSamples(bundle);
  const [saved] = await c.execute<any[]>('SELECT * FROM ai_learning_policy_evaluation_samples WHERE run_id=? ORDER BY ordinal FOR SHARE', [run.id]);
  if (saved.length !== expected.length) conflict();
  const samples = saved.map((sample, ordinal) => {
    const input = expected[ordinal], metadata = evaluationCompletion.parse(decode(sample.response_metadata));
    if (Number(sample.ordinal) !== ordinal || sample.state !== 'responded' || sample.case_id !== input.caseId
      || sample.arm !== input.arm || sample.input_digest !== input.inputDigest || !sample.reservation_key
      || typeof sample.response_text !== 'string' || !sample.response_text.trim() || sample.response_text.length > 16000
      || metadata.finishReason !== 'stop' || metadata.model !== run.observed_model
      || policyArtifactDigest({ text: sample.response_text, metadata }) !== sample.response_digest) conflict();
    return { ordinal, caseId: input.caseId, arm: input.arm, inputDigest: input.inputDigest,
      reservationKey: String(sample.reservation_key), response: String(sample.response_text), metadata,
      responseDigest: String(sample.response_digest) };
  });
  const runDigest = policyArtifactDigest({ runId: Number(run.id), candidateId: Number(run.candidate_id),
    artifactDigest: run.artifact_digest, routeDigest: run.route_digest, provider: run.provider,
    model: run.model, observedModel: run.observed_model, recipe: decode(run.recipe), samples });
  const pairs = bundle.baseline.cases.map(item => ({ caseId: item.id, sector: item.sector, criterion: item.criterion,
    systemPrompt: item.systemPrompt, userPrompt: item.userPrompt, candidateStyleInstruction: bundle.candidateStyleInstruction,
    baseline: samples.find(sample => sample.caseId === item.id && sample.arm === 'baseline')!,
    candidate: samples.find(sample => sample.caseId === item.id && sample.arm === 'candidate')! }));
  return { runDigest, pairs };
}

export async function getLearningPolicyOutputReview(merchantId: number, value: z.infer<typeof outputReviewReadInput>) {
  const merchant = identity.parse(merchantId), input = outputReviewReadInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const run = await loadRun(c, merchant, input.runId), history = await reviewHistory(c, merchant, input.runId), latest = history[0];
    const outputs = run.state === 'completed' ? await loadCompletedLearningPolicyOutputs(c, merchant, run) : null;
    let candidateCurrent = false;
    if (outputs) {
      try { await requireCurrentLearningPolicyCandidate(c, merchant, Number(run.candidate_id), run.artifact_digest); candidateCurrent = true; }
      catch (error) { if (!(error instanceof LearningPolicyCandidateConflict)) throw error; }
    }
    const current = !!outputs && candidateCurrent && !!latest && latest.runDigest === outputs.runDigest && latest.rubricDigest === outputReviewRubricDigest;
    return { runId: input.runId, generationState: String(run.state), provider: String(run.provider), model: String(run.model),
      observedModel: run.observed_model as string | null, runDigest: outputs?.runDigest ?? null,
      rubric: outputReviewRubric, rubricDigest: outputReviewRubricDigest, pairs: outputs?.pairs ?? [],
      expectedRevision: latest?.revision ?? 0, canReview: !!outputs && candidateCurrent,
      stage: !outputs ? 'generation_incomplete' : !candidateCurrent ? 'source_stale'
        : !latest ? 'not_reviewed' : !current ? 'review_stale' : `human_review_${latest.outcome}`,
      latestReview: latest ? { ...latest, current } : null,
      history: history.map(({ review, ...item }) => ({ ...item, current: current && item.id === latest.id })),
      activationAllowed: false as const };
  });
}

export async function recordLearningPolicyOutputReview(merchantId: number, actorUserId: number, value: OutputReviewInput) {
  const merchant = identity.parse(merchantId), actor = identity.parse(actorUserId), input = outputReviewInput.parse(value);
  const payloadDigest = policyArtifactDigest({ actor, input });
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [existing] = await c.execute<any[]>('SELECT * FROM ai_learning_policy_output_reviews WHERE merchant_id=? AND request_id=? FOR UPDATE', [merchant, input.requestId]);
    if (existing.length) {
      if (existing[0].payload_digest !== payloadDigest) conflict();
      const { review, ...receipt } = readOutputReview(existing[0]);
      return { ...receipt, reused: true };
    }
    const run = await loadRun(c, merchant, input.runId);
    await requireCurrentLearningPolicyCandidate(c, merchant, Number(run.candidate_id), run.artifact_digest);
    const outputs = await loadCompletedLearningPolicyOutputs(c, merchant, run);
    if (outputs.runDigest !== input.runDigest) conflict();
    const history = await reviewHistory(c, merchant, input.runId), revision = history[0]?.revision ?? 0;
    if (input.expectedRevision !== revision || revision >= Number.MAX_SAFE_INTEGER) conflict();
    for (const row of input.cases) {
      const pair = outputs.pairs.find(item => item.caseId === row.caseId);
      if (!pair || !pair.baseline.response.includes(row.baseline.quote) || !pair.candidate.response.includes(row.candidate.quote)) conflict();
    }
    const score = scoreOutputReview(input.cases);
    const review = { kind: 'human_paired_output_review', runId: input.runId, revision: revision + 1,
      runDigest: outputs.runDigest, rubric: outputReviewRubric, reviewedAllOutputs: true,
      cases: input.cases, score, activationAllowed: false };
    const [saved] = await c.execute<any>(`INSERT INTO ai_learning_policy_output_reviews
      (merchant_id,run_id,revision,request_id,payload_digest,run_digest,rubric_digest,review_digest,review,outcome,actor_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [merchant, input.runId, revision + 1, input.requestId, payloadDigest, outputs.runDigest,
      outputReviewRubricDigest, policyArtifactDigest(review), JSON.stringify(review), score.outcome, actor]);
    return { id: Number(saved.insertId), runId: input.runId, revision: revision + 1, ...score,
      kind: 'human_paired_output_review' as const, eligibility: 'not_checked' as const, activationAllowed: false as const, reused: false };
  });
}
