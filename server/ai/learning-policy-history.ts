import type { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { outputReviewConflict, readOutputReview } from './learning-policy-output-review-store';
import { evaluationHistoryInput, outputHistoryInput, outputRecordInput, historyIdentity, policyHistoryPageSize } from './learning-policy-history-contract';

async function requireRun(c: PoolConnection, merchantId: number, runId: number) {
  const [rows] = await c.execute<any[]>('SELECT id FROM ai_learning_policy_evaluations WHERE id=? AND merchant_id=? FOR SHARE', [runId, merchantId]);
  if (rows.length !== 1) outputReviewConflict();
}
function summarizeReview(row: any) {
  const { review, ...receipt } = readOutputReview(row);
  return { ...receipt, actorUserId: row.actor_user_id === null ? null : Number(row.actor_user_id), createdAt: row.created_at as Date };
}
function page<T>(rows: T[], scopeId: number, cursor: { through: number } | null | undefined, key: (row: T) => number) {
  const items = rows.slice(0, policyHistoryPageSize), through = cursor?.through ?? (items.length ? key(items[0]) : null);
  return { items, pageCursor: through === null ? null : { scopeId, through }, nextCursor: rows.length > policyHistoryPageSize && through !== null
    ? { scopeId, through, before: key(items.at(-1)!) } : null, activationAllowed: false as const, eligibility: 'not_checked' as const };
}

/** Historical metadata only. This does not require today's source or authorize generation. */
export async function getLearningPolicyEvaluationHistory(merchantId: number, value: z.infer<typeof evaluationHistoryInput>) {
  const merchant = historyIdentity.parse(merchantId), input = evaluationHistoryInput.parse(value), cursor = input.cursor;
  return checkoutTransaction(async c => {
    const [owned] = await c.execute<any[]>('SELECT id FROM ai_learning_proposals WHERE id=? AND merchant_id=? FOR SHARE', [input.proposalId, merchant]);
    if (owned.length !== 1) outputReviewConflict();
    const [rows] = await c.execute<any[]>(`SELECT e.id,e.candidate_id,e.state,e.provider,e.model,e.created_at,c.version
      FROM ai_learning_policy_evaluations e JOIN ai_learning_policy_candidates c ON c.id=e.candidate_id AND c.merchant_id=e.merchant_id
      WHERE e.merchant_id=? AND c.proposal_id=? ${cursor ? 'AND e.id<=?' : ''} ${cursor?.before ? 'AND e.id<?' : ''}
      ORDER BY e.id DESC LIMIT 21`, [merchant, input.proposalId, ...(cursor ? [cursor.through] : []), ...(cursor?.before ? [cursor.before] : [])]);
    return page(rows.map(row => ({ runId: Number(row.id), candidateVersion: Number(row.version), state: String(row.state),
      provider: String(row.provider), model: String(row.model), createdAt: row.created_at as Date })), input.proposalId, cursor, row => row.runId);
  });
}

/** Immutable summaries, including stale/failed reviews. Never label an archive entry current. */
export async function getLearningPolicyOutputReviewHistory(merchantId: number, value: z.infer<typeof outputHistoryInput>) {
  const merchant = historyIdentity.parse(merchantId), input = outputHistoryInput.parse(value), cursor = input.cursor;
  return checkoutTransaction(async c => {
    await requireRun(c, merchant, input.runId);
    const [rows] = await c.execute<any[]>(`SELECT * FROM ai_learning_policy_output_reviews
      WHERE merchant_id=? AND run_id=? ${cursor ? 'AND revision<=?' : ''} ${cursor?.before ? 'AND revision<?' : ''}
      ORDER BY revision DESC LIMIT 21`, [merchant, input.runId, ...(cursor ? [cursor.through] : []), ...(cursor?.before ? [cursor.before] : [])]);
    return page(rows.map(summarizeReview), input.runId, cursor, row => row.revision);
  });
}

/** Read the saved judgment independently of today's source/output eligibility. No provider calls or writes. */
export async function getLearningPolicyOutputReviewRecord(merchantId: number, value: z.infer<typeof outputRecordInput>) {
  const merchant = historyIdentity.parse(merchantId), input = outputRecordInput.parse(value);
  return checkoutTransaction(async c => {
    await requireRun(c, merchant, input.runId);
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_learning_policy_output_reviews WHERE id=? AND merchant_id=? AND run_id=? FOR SHARE', [input.reviewId, merchant, input.runId]);
    if (rows.length !== 1) outputReviewConflict();
    const row = rows[0], saved = readOutputReview(row);
    return { ...summarizeReview(row), review: saved.review, runDigest: String(row.run_digest), rubricDigest: String(row.rubric_digest) };
  });
}
