import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { salesReplyReviewSnapshot } from './sales-generation-output-review-contract';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';

export const salesReplyReviewFlags = { dispatchAllowed: false as const, exposureRecorded: false as const, eligibility: 'not_checked' as const };
export class SalesReplyReviewConflict extends Error { constructor() { super('Sales reply review changed or is unavailable'); } }
export const salesReplyReviewConflict = (): never => { throw new SalesReplyReviewConflict(); };
export function readSalesReplyReview(row: any) {
  try {
    const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot, s = salesReplyReviewSnapshot.parse(raw);
    if (policyArtifactDigest(raw) !== row.review_digest || policyArtifactDigest(s) !== row.review_digest
      || s.merchantId !== Number(row.merchant_id) || s.generationId !== Number(row.generation_id) || s.revision !== Number(row.revision)
      || s.basisDigest !== row.basis_digest || s.outcome !== row.outcome || row.actor_user_id !== null && s.actorUserId !== Number(row.actor_user_id)) return salesReplyReviewConflict();
    return { reviewId: z.number().int().positive().safe().parse(Number(row.id)), reviewDigest: String(row.review_digest), snapshot: s, ...salesReplyReviewFlags };
  } catch { return salesReplyReviewConflict(); }
}
/** The recorded judgment is historical. This deliberately does not assert delivery eligibility. */
export async function latestSalesReplyReviewReceipt(c: PoolConnection, merchant: number, generationId: number) {
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_generation_output_reviews WHERE merchant_id=? AND generation_id=? ORDER BY revision DESC LIMIT 1', [merchant, generationId]);
  if (!rows.length) return null;
  const { snapshot: s, ...view } = readSalesReplyReview(rows[0]);
  return { ...view, outcome: s.outcome, revision: s.revision, basisDigest: s.basisDigest, authorizationDigest: s.basis.authorizationDigest,
    responseDigest: s.basis.responseDigest, rubricDigest: s.basis.rubricDigest };
}
