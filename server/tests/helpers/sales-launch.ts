import { randomUUID } from 'node:crypto';
import { getPool } from '../../db/connection';
import { seedCohortProtocol, syntheticCohortRules } from './sales-cohort';
import { freezeSalesExperimentCohort } from '../../ai/sales-experiment-cohort';
import { startLearningPolicyEvaluation, getLearningPolicyEvaluation } from '../../ai/learning-policy-evaluation';
import { getLearningPolicyOutputReview, recordLearningPolicyOutputReview } from '../../ai/learning-policy-output-review';
import { outputReviewRubricDigest } from '../../ai/learning-policy-output-review-contract';
import { prepareSalesExperimentReview, recordSalesExperimentReview } from '../../ai/sales-experiment-review';
import { policyArtifactDigest } from '../../ai/learning-policy-evaluation-bundle';

/** Synthetic persisted outputs, not a provider quality or real billing measurement. */
export async function seedApprovedSalesPlan(owner: { merchantId: number; userId: number }, reviewerId: number) {
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const seeded = await seedCohortProtocol(owner), p = seeded.protocol;
  const cohort = await freezeSalesExperimentCohort(owner.merchantId, owner.userId, { protocolId: p.protocolId, protocolDigest: p.protocolDigest,
    requestId: randomUUID(), rules: syntheticCohortRules(), matchesRegisteredDefinition: true, mappingReview: 'Explicit predicates match the frozen synthetic definition.' });
  const runId = (await startLearningPolicyEvaluation(owner.merchantId, owner.userId, { candidateId: p.protocol.candidate.id,
    artifactDigest: p.protocol.candidate.artifactDigest, requestId: randomUUID() })).runId;
  for (const sample of (await getLearningPolicyEvaluation(owner.merchantId, { runId })).samples) {
    const text = `${sample.arm} synthetic response ${sample.caseId}`;
    const metadata = { id: `synthetic-${sample.ordinal}`, model: 'synthetic-model', finishReason: 'stop', usage: { prompt_tokens: 20, completion_tokens: 10 } };
    await query("UPDATE ai_learning_policy_evaluation_samples SET state='responded',response_text=?,response_metadata=?,response_digest=?,reservation_key=? WHERE run_id=? AND ordinal=?",
      [text, JSON.stringify(metadata), policyArtifactDigest({ text, metadata }), randomUUID(), runId, sample.ordinal]);
  }
  await query("UPDATE ai_learning_policy_evaluations SET state='completed',observed_model='synthetic-model' WHERE id=?", [runId]);
  const outputs = await getLearningPolicyOutputReview(owner.merchantId, { runId });
  const outputInput = { runId, runDigest: outputs.runDigest!, rubricDigest: outputReviewRubricDigest, requestId: randomUUID(), expectedRevision: outputs.expectedRevision,
    reviewedAllOutputs: true as const, cases: outputs.pairs.map(pair => ({ caseId: pair.caseId,
      baseline: { verdict: 'pass' as const, quote: pair.baseline.response, reason: 'Synthetic baseline reviewer justification.' },
      candidate: { verdict: 'pass' as const, quote: pair.candidate.response, reason: 'Synthetic candidate reviewer justification.' }, preference: 'candidate' as const })) };
  await recordLearningPolicyOutputReview(owner.merchantId, owner.userId, outputInput);
  const basis = await prepareSalesExperimentReview(owner.merchantId, reviewerId, { protocolId: p.protocolId, runId });
  const reviewInput = { protocolId: p.protocolId, runId, requestId: randomUUID(), basisDigest: basis.basisDigest, expectedRevision: 0,
    verdict: 'approved' as const, reviewedFrozenDesignAndOutputs: true as const, understandsNoActivation: true as const,
    assessment: { baselineAndSample: 'Synthetic review of the baseline and independence assumptions.',
      recruitmentFeasibility: 'Synthetic review of recruitment feasibility within the fixed window.',
      qualificationMapping: 'Synthetic review of exact predicates and the frozen qualification definition.',
      safetyAndMeasurement: 'Synthetic review of safety, payments, refunds and fixed-window measurement.' } };
  const review = await recordSalesExperimentReview(owner.merchantId, reviewerId, reviewInput);
  return { ...seeded, cohort, runId, outputInput, reviewInput, review };
}
