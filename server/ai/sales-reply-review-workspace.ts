import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { loadSalesGenerationReviewRecord, loadCurrentSalesGenerationReviewSource } from './sales-experiment-generation';
import { salesReplyReviewConflict as conflict, readSalesReplyReview, salesReplyReviewFlags } from './sales-generation-output-review-store';
import { currentTurnReplyReviewBasis, salesReplyReviewSnapshot, salesReplyReviewOutcome, salesReplyReviewRubricDigest } from './sales-generation-output-review-contract';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { fastPreCheck, refusalAcknowledgement } from './response-validator';
import { isSalesRefusal } from './customer-decision';
import { replyReviewReadInput, replyReviewListInput, replyReviewSubmitInput, replyReviewReceipt, replyReviewWorkspace, type ReplyReviewSubmission } from '../../shared/sales-reply-review';

const id = z.number().int().positive().safe(), flags = { dispatchAllowed: false as const, exposureRecorded: false as const };
async function lock(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT userId FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) return conflict(); return Number(rows[0].userId);
}
function receipt(row: any) {
  const r = readSalesReplyReview(row), s = r.snapshot;
  return replyReviewReceipt.parse({ reviewId: r.reviewId, generationId: s.generationId, actorUserId: s.actorUserId, revision: s.revision,
    requestId: row.request_id, basisDigest: s.basisDigest, rubricDigest: s.basis.rubricDigest, outcome: s.outcome, reviewedAt: s.reviewedAt,
    checks: s.checks, quote: s.quote, rationale: s.rationale, ...salesReplyReviewFlags });
}
async function history(c: PoolConnection, merchant: number, generationId: number, limit: 1 | 20 = 20) {
  const [rows] = await c.execute<any[]>(`SELECT * FROM ai_sales_generation_output_reviews WHERE merchant_id=? AND generation_id=? ORDER BY revision DESC LIMIT ${limit}`, [merchant, generationId]);
  return rows.map(receipt);
}
export async function loadCurrentSalesReplyReviewBasis(c: PoolConnection, merchant: number, generationId: number) {
  const source = await loadCurrentSalesGenerationReviewSource(c, merchant, generationId), s = source.snapshot, t = source.current;
  const responseText = source.response.text!, refusal = t.snapshot.effectiveIntent === 'declined' || isSalesRefusal(t.customerMessage);
  const gate = refusal && responseText === refusalAcknowledgement(t.customerMessage) ? []
    : fastPreCheck(responseText, t.customerMessage, t.lastAssistantMessage).map(({ rule, severity }) => ({ rule, severity }));
  const violations: Array<{ rule: string; severity: 'critical' | 'warning' }> = [...gate];
  if (refusal && responseText !== refusalAcknowledgement(t.customerMessage)) violations.push({ rule: 'refusal_not_respected', severity: 'critical' });
  const evidence = currentTurnReplyReviewBasis.parse({ version: 'sales-reply-review-basis.v2', contextVerification: 'current_turn_evidence',
    merchantId: merchant, generationId, authorizationDigest: source.authorizationDigest, responseDigest: source.responseDigest, responseText,
    turnId: s.turnId, turnDigest: s.turnDigest, sourceDigest: t.snapshot.sourceDigest, promptDigest: s.promptDigest, contextDigest: s.contextDigest,
    routeDigest: s.routeDigest, observationEndsAt: s.observationEndsAt, rubricDigest: salesReplyReviewRubricDigest, gate: violations,
    customerMessage: t.customerMessage, lastAssistantMessage: t.lastAssistantMessage });
  return { evidence, digest: policyArtifactDigest(evidence), checkedAt: t.checkedAt, source };
}
export async function listSalesReplyReviews(merchantId: number, value: z.input<typeof replyReviewListInput>) {
  const merchant = id.parse(merchantId), input = replyReviewListInput.parse(value);
  return checkoutTransaction(async c => {
    await lock(c, merchant);
    const [rows] = await c.execute<any[]>(`SELECT id FROM ai_sales_experiment_generations WHERE merchant_id=? ${input.beforeId ? 'AND id<?' : ''} ORDER BY id DESC LIMIT ${input.limit + 1}`,
      input.beforeId ? [merchant, input.beforeId] : [merchant]);
    const items = [];
    for (const row of rows.slice(0, input.limit)) {
      const saved = await loadSalesGenerationReviewRecord(c, merchant, Number(row.id)), latest = (await history(c, merchant, saved.generationId, 1))[0];
      items.push({ generationId: saved.generationId, state: saved.state, reviewOutcome: latest?.outcome ?? null, revision: latest?.revision ?? 0 });
    }
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.generationId : null, ...flags };
  });
}
export async function getSalesReplyReviewWorkspace(merchantId: number, actorUserId: number, value: z.infer<typeof replyReviewReadInput>) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = replyReviewReadInput.parse(value);
  return checkoutTransaction(async c => {
    const owner = await lock(c, merchant), saved = await loadSalesGenerationReviewRecord(c, merchant, input.generationId), reviews = await history(c, merchant, input.generationId);
    let current: Awaited<ReturnType<typeof loadCurrentSalesReplyReviewBasis>> | null = null;
    if (saved.state === 'responded' && owner === actor) { try { current = await loadCurrentSalesReplyReviewBasis(c, merchant, input.generationId); } catch { /* A failed freshness read never permits a new review. */ } }
    return replyReviewWorkspace.parse({ generationId: input.generationId, actorUserId: actor, state: saved.state, responseText: saved.response.text,
      canReview: !!current, stage: owner !== actor ? 'owner_required' : saved.state !== 'responded' ? 'incomplete' : current ? 'ready' : 'source_unavailable',
      basis: current ? { digest: current.digest, rubricDigest: salesReplyReviewRubricDigest, customerMessage: current.evidence.customerMessage,
        lastAssistantMessage: current.evidence.lastAssistantMessage, checkedAt: current.checkedAt, observationEndsAt: current.evidence.observationEndsAt, gate: current.evidence.gate } : null,
      expectedRevision: reviews[0]?.revision ?? 0, history: reviews, reviewCurrentAtRead: !!current && reviews[0]?.basisDigest === current.digest, ...flags });
  });
}
export async function submitSalesReplyReview(merchantId: number, actorUserId: number, value: ReplyReviewSubmission) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = replyReviewSubmitInput.parse(value);
  const payload = policyArtifactDigest({ version: 'public-current-turn-review.v1', actor, input });
  return checkoutTransaction(async c => {
    const owner = await lock(c, merchant);
    const [prior] = await c.execute<any[]>('SELECT * FROM ai_sales_generation_output_reviews WHERE merchant_id=? AND request_id=? FOR UPDATE', [merchant, input.requestId]);
    if (prior.length) { if (prior[0].payload_digest !== payload) return conflict(); return receipt(prior[0]); }
    if (owner !== actor || input.rubricDigest !== salesReplyReviewRubricDigest) return conflict();
    const current = await loadCurrentSalesReplyReviewBasis(c, merchant, input.generationId), reviews = await history(c, merchant, input.generationId), revision = reviews[0]?.revision ?? 0;
    if (revision !== input.expectedRevision || revision >= Number.MAX_SAFE_INTEGER || input.basisDigest !== current.digest || !current.evidence.responseText.includes(input.quote)) return conflict();
    const [clock] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
    const reviewedAt = String(clock[0].now).replace(/(\.\d{3})\d{3}Z$/, '$1Z');
    if (Date.parse(reviewedAt) < Date.parse(current.checkedAt) || Date.parse(reviewedAt) >= Date.parse(current.evidence.observationEndsAt)) return conflict();
    const snapshot = salesReplyReviewSnapshot.parse({ version: 'sales-reply-output-review.v1', merchantId: merchant, generationId: input.generationId, actorUserId: actor,
      revision: revision + 1, basis: current.evidence, basisDigest: current.digest, checks: input.checks, quote: input.quote, rationale: input.rationale,
      outcome: salesReplyReviewOutcome(input.checks, current.evidence.gate), reviewedAt, reviewedEntireResponse: true, understandsNoMessageSent: true, scope: 'human_output_review_only', ...flags });
    const [inserted] = await c.execute<any>(`INSERT INTO ai_sales_generation_output_reviews
      (merchant_id,generation_id,actor_user_id,revision,request_id,payload_digest,basis_digest,review_digest,snapshot,outcome) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [merchant, input.generationId, actor, revision + 1, input.requestId, payload, current.digest, policyArtifactDigest(snapshot), JSON.stringify(snapshot), snapshot.outcome]);
    const [saved] = await c.execute<any[]>('SELECT * FROM ai_sales_generation_output_reviews WHERE id=?', [inserted.insertId]);
    return receipt(saved[0]);
  });
}
