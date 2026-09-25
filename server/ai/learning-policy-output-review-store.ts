import type { PoolConnection } from 'mysql2/promise';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { outputReviewCases, scoreOutputReview } from './learning-policy-output-review-contract';

export class LearningPolicyOutputReviewConflict extends Error {
  constructor() { super('Learning policy output review changed or is unavailable'); }
}
export const outputReviewConflict = (): never => { throw new LearningPolicyOutputReviewConflict(); };
export function readOutputReview(row: any) {
  try {
    const review = typeof row.review === 'string' ? JSON.parse(row.review) : row.review;
    if (policyArtifactDigest(review) !== row.review_digest || review.runId !== Number(row.run_id)
      || review.revision !== Number(row.revision) || review.runDigest !== row.run_digest
      || policyArtifactDigest(review.rubric) !== row.rubric_digest || review.reviewedAllOutputs !== true
      || review.kind !== 'human_paired_output_review' || review.activationAllowed !== false
      || review.score.outcome !== row.outcome) outputReviewConflict();
    // Recompute recorded arithmetic; caller-submitted summary counts are never trusted.
    const cases = outputReviewCases.parse(review.cases);
    if (policyArtifactDigest(scoreOutputReview(cases)) !== policyArtifactDigest(review.score)) outputReviewConflict();
    return { id: Number(row.id), runId: Number(row.run_id), revision: Number(row.revision),
      ...review.score as ReturnType<typeof scoreOutputReview>, kind: 'human_paired_output_review' as const,
      eligibility: 'not_checked' as const, activationAllowed: false as const, review };
  } catch { return outputReviewConflict(); }
}

/** A historical receipt only. Freshness is checked by the full review read/record operation. */
export async function latestOutputReviewReceipt(c: PoolConnection, merchantId: number, runId: number) {
  const [rows] = await c.execute<any[]>(`SELECT * FROM ai_learning_policy_output_reviews
    WHERE merchant_id=? AND run_id=? ORDER BY revision DESC LIMIT 1`, [merchantId, runId]);
  if (!rows.length) return null;
  const { review, ...receipt } = readOutputReview(rows[0]);
  return receipt;
}
