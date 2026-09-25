import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { loadSalesGenerationReviewSource } from './sales-experiment-generation';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { fastPreCheck, refusalAcknowledgement } from './response-validator';
import { isSalesRefusal } from './customer-decision';
import { salesReplyReviewFlags as flags, salesReplyReviewConflict as conflict, readSalesReplyReview as receipt } from './sales-generation-output-review-store';
import { prepareSalesReplyReviewInput, readSalesReplyReviewInput, recordSalesReplyReviewInput, salesReplyReviewBasis,
  salesReplyReviewSnapshot, salesReplyReviewRubric, salesReplyReviewRubricDigest, salesReplyReviewOutcome, type RecordSalesReplyReviewInput } from './sales-generation-output-review-contract';

const id = z.number().int().positive().safe();
async function lock(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT userId FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) return conflict(); return Number(rows[0].userId);
}
async function now(c: PoolConnection) {
  const [rows] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
  return String(rows[0].now).replace(/(\.\d{3})\d{3}Z$/, '$1Z');
}
async function history(c: PoolConnection, merchant: number, generationId: number) {
  const [generation] = await c.execute<any[]>('SELECT id FROM ai_sales_experiment_generations WHERE merchant_id=? AND id=? FOR SHARE', [merchant, generationId]);
  if (generation.length !== 1) return conflict();
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_generation_output_reviews WHERE merchant_id=? AND generation_id=? ORDER BY revision DESC LIMIT 20', [merchant, generationId]);
  return rows.map(receipt);
}
async function basis(c: PoolConnection, merchant: number, input: z.infer<typeof prepareSalesReplyReviewInput>) {
  const source = await loadSalesGenerationReviewSource(c, merchant, input.generationId, input), s = source.snapshot;
  const refusal = source.turn.effectiveIntent === 'declined' || isSalesRefusal(source.customerMessage);
  // The live review gate returns this exact acknowledgement before its general checks.
  const gate = refusal && source.responseText === refusalAcknowledgement(source.customerMessage) ? []
    : fastPreCheck(source.responseText, source.customerMessage, source.lastAssistantMessage).map(({ rule, severity }) => ({ rule: String(rule), severity }));
  if (refusal && source.responseText !== refusalAcknowledgement(source.customerMessage)) gate.push({ rule: 'refusal_not_respected', severity: 'critical' });
  const evidence = salesReplyReviewBasis.parse({ version: 'sales-reply-review-basis.v1', merchantId: merchant, generationId: input.generationId,
    authorizationDigest: source.authorizationDigest, responseDigest: source.responseDigest, responseText: source.responseText,
    turnId: s.turnId, turnDigest: s.turnDigest, sourceDigest: source.turn.sourceDigest, promptDigest: s.promptDigest, contextDigest: s.contextDigest,
    routeDigest: s.routeDigest, observationEndsAt: s.observationEndsAt, rubricDigest: salesReplyReviewRubricDigest, gate });
  return { evidence, basisDigest: policyArtifactDigest(evidence), checkedAt: source.checkedAt };
}
/** Explicit internal preparation. Freshness is a point-in-time observation, never a send permission. */
export async function prepareSalesGenerationOutputReview(merchantId: number, value: z.input<typeof prepareSalesReplyReviewInput>) {
  const merchant = id.parse(merchantId), input = prepareSalesReplyReviewInput.parse(value);
  return checkoutTransaction(async c => {
    await lock(c, merchant); const b = await basis(c, merchant, input), reviews = await history(c, merchant, input.generationId), latest = reviews[0] ?? null;
    return { ...b, rubric: salesReplyReviewRubric, expectedRevision: latest?.snapshot.revision ?? 0, latestReview: latest,
      reviewCurrentAtRead: !!latest && latest.snapshot.basisDigest === b.basisDigest, ...flags };
  });
}
/** Historical reads keep reviews after source deletion/revocation, without asserting current validity. */
export async function getSalesGenerationOutputReviews(merchantId: number, value: z.infer<typeof readSalesReplyReviewInput>) {
  const merchant = id.parse(merchantId), input = readSalesReplyReviewInput.parse(value);
  return checkoutTransaction(async c => { await lock(c, merchant); return { generationId: input.generationId, history: await history(c, merchant, input.generationId), ...flags }; });
}
export async function recordSalesGenerationOutputReview(merchantId: number, actorUserId: number, value: RecordSalesReplyReviewInput) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = recordSalesReplyReviewInput.parse(value);
  const { baseSystemPrompt, contextMessages, ...metadata } = input;
  const payload = policyArtifactDigest({ actor, metadata, basePromptDigest: policyArtifactDigest(baseSystemPrompt), contextDigest: policyArtifactDigest(contextMessages) });
  return checkoutTransaction(async c => {
    const owner = await lock(c, merchant);
    const [prior] = await c.execute<any[]>('SELECT * FROM ai_sales_generation_output_reviews WHERE merchant_id=? AND request_id=? FOR UPDATE', [merchant, input.requestId]);
    if (prior.length) { if (prior[0].payload_digest !== payload) return conflict(); return { ...receipt(prior[0]), reused: true }; }
    if (owner !== actor) return conflict();
    const b = await basis(c, merchant, input), reviews = await history(c, merchant, input.generationId), revision = reviews[0]?.snapshot.revision ?? 0;
    if (b.basisDigest !== input.basisDigest || revision !== input.expectedRevision || revision >= Number.MAX_SAFE_INTEGER
      || !b.evidence.responseText.includes(input.quote)) return conflict();
    const reviewedAt = await now(c);
    if (Date.parse(reviewedAt) < Date.parse(b.checkedAt) || Date.parse(reviewedAt) >= Date.parse(b.evidence.observationEndsAt)) return conflict();
    const snapshot = salesReplyReviewSnapshot.parse({ version: 'sales-reply-output-review.v1', merchantId: merchant, generationId: input.generationId,
      actorUserId: actor, revision: revision + 1, basis: b.evidence, basisDigest: b.basisDigest, checks: input.checks, quote: input.quote, rationale: input.rationale,
      outcome: salesReplyReviewOutcome(input.checks, b.evidence.gate), reviewedAt, reviewedEntireResponse: true, understandsNoMessageSent: true,
      scope: 'human_output_review_only', dispatchAllowed: false, exposureRecorded: false });
    const [inserted] = await c.execute<any>(`INSERT INTO ai_sales_generation_output_reviews
      (merchant_id,generation_id,actor_user_id,revision,request_id,payload_digest,basis_digest,review_digest,snapshot,outcome) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [merchant, input.generationId, actor, revision + 1, input.requestId, payload, b.basisDigest, policyArtifactDigest(snapshot), JSON.stringify(snapshot), snapshot.outcome]);
    const [saved] = await c.execute<any[]>('SELECT * FROM ai_sales_generation_output_reviews WHERE id=?', [inserted.insertId]);
    return { ...receipt(saved[0]), reused: false };
  });
}
