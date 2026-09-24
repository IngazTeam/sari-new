import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { learningPolicyProposalInput, learningPolicyReviewSuite, learningPolicyReviewSuiteDigest,
  normalizeLearningPolicyReview, reviewDigest, scoreLearningPolicyReview, type LearningPolicyReviewInput } from './learning-policy-review-contract';

const identity = z.number().int().positive().safe();
const styleDimensions = new Set(['greeting_style', 'tone_preference', 'objection_handling', 'closing_technique']);
export class LearningPolicyReviewConflict extends Error {
  constructor() { super('Learning policy review changed or is unavailable'); }
}
const conflict = () => { throw new LearningPolicyReviewConflict(); };

async function lockMerchant(connection: PoolConnection, merchantId: number) {
  const [rows] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
  if (rows.length !== 1) conflict();
}

async function sourceSnapshot(connection: PoolConnection, merchantId: number, proposalId: number) {
  const [proposals] = await connection.execute<any[]>(`SELECT id, dimension, insight, content_hash, status, generation
    FROM ai_learning_proposals WHERE id=? AND merchant_id=? FOR SHARE`, [proposalId, merchantId]);
  if (proposals.length !== 1) conflict();
  const proposal = proposals[0];
  // Hash every evidence link and source content, including contrary evidence. Do not silently
  // truncate, count stale model claims, or turn a source deletion into an unchanged approval.
  const [links] = await connection.execute<any[]>(`SELECT signal_id, relation, merchant_id FROM ai_learning_evidence_links
    WHERE proposal_id=? ORDER BY signal_id, relation LIMIT 2001 FOR SHARE`, [proposalId]);
  if (links.length > 2000) conflict();
  if (new Set(links.map(row => row.signal_id)).size !== links.length
      || links.some(row => Number(row.merchant_id) !== merchantId || !['observed', 'supporting', 'contrary'].includes(row.relation))) conflict();
  let sources: any[] = [];
  if (links.length) {
    const ids = Array.from(new Set(links.map(row => Number(row.signal_id))));
    const [rows] = await connection.execute<any[]>(`SELECT s.id, s.conversation_id, s.signal_type, s.signal_weight,
      s.bot_message, s.customer_message, s.merchant_correction, s.context_summary, s.source_key, s.created_at
      FROM sari_learning_signals s JOIN conversations c ON c.id=s.conversation_id AND c.merchantId=s.merchant_id
      WHERE s.merchant_id=? AND s.id IN (${ids.map(() => '?').join(',')}) ORDER BY s.id FOR SHARE`, [merchantId, ...ids]);
    if (rows.length !== ids.length) conflict();
    sources = rows;
  }
  const independentConversations = new Set(sources.map(row => row.conversation_id)).size;
  const validContent = createHash('sha256').update(proposal.insight).digest('hex') === proposal.content_hash;
  const eligible = proposal.status === 'proposed' && styleDimensions.has(proposal.dimension) && validContent && independentConversations > 0;
  const sourceDigest = reviewDigest({ merchantId, proposal, links, sources });
  // No duplicated customer transcript in the durable review record.
  return { sourceDigest, eligible, independentConversations, evidenceLinks: links.length,
    evidencePreview: links.slice(-20).reverse().map(link => {
      const source = sources.find(row => Number(row.id) === Number(link.signal_id))!;
      return { signalId: Number(link.signal_id), relation: String(link.relation),
        excerpt: String(source.customer_message || source.context_summary || '').slice(0, 500) };
    }),
    proposal: { id: Number(proposal.id), dimension: String(proposal.dimension), insight: String(proposal.insight) } };
}

async function reviews(connection: PoolConnection, merchantId: number, proposalId: number) {
  const [rows] = await connection.execute<any[]>(`SELECT id, revision, source_digest, suite_digest, outcome,
    passed_cases, regressions, actor_user_id, created_at FROM ai_learning_policy_reviews
    WHERE merchant_id=? AND proposal_id=? ORDER BY revision DESC LIMIT 20`, [merchantId, proposalId]);
  return rows;
}
function receipt(row: any) {
  return { id: Number(row.id), revision: Number(row.revision), outcome: row.outcome as 'passed' | 'failed',
    passedCases: Number(row.passed_cases), regressions: Number(row.regressions), totalCases: learningPolicyReviewSuite.cases.length,
    assessment: 'human_offline_review' as const, activationAllowed: false as const };
}

export async function getLearningPolicyReview(merchantId: number, value: { proposalId: number }) {
  const merchant = identity.parse(merchantId), input = learningPolicyProposalInput.parse(value);
  return checkoutTransaction(async connection => {
    await lockMerchant(connection, merchant);
    const source = await sourceSnapshot(connection, merchant, input.proposalId);
    const history = await reviews(connection, merchant, input.proposalId), latest = history[0];
    const current = !!latest && source.eligible && latest.source_digest === source.sourceDigest
      && latest.suite_digest === learningPolicyReviewSuiteDigest;
    const [detail] = latest ? await connection.execute<any[]>(`SELECT proposal_snapshot, assessment FROM ai_learning_policy_reviews
      WHERE id=? AND merchant_id=? AND proposal_id=?`, [latest.id, merchant, input.proposalId]) : [[]];
    const decode = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value;
    return { ...source, revision: Number(latest?.revision || 0), suite: learningPolicyReviewSuite, suiteDigest: learningPolicyReviewSuiteDigest,
      latestReview: latest ? { ...receipt(latest), proposal: decode(detail[0].proposal_snapshot), assessmentDetail: decode(detail[0].assessment) } : null,
      stage: !latest ? 'not_reviewed' as const : !current ? 'stale' as const : latest.outcome === 'passed' ? 'offline_review_passed' as const : 'offline_review_failed' as const,
      activationAllowed: false as const,
      history: history.map(row => ({ ...receipt(row), current: current && row.id === latest.id,
        actorUserId: row.actor_user_id === null ? null : Number(row.actor_user_id), createdAt: row.created_at })) };
  });
}

export async function recordLearningPolicyReview(merchantId: number, actorUserId: number, value: LearningPolicyReviewInput) {
  // Parse/copy synchronously so a caller cannot mutate authority or assessment while waiting for SQL.
  const merchant = identity.parse(merchantId), actor = identity.parse(actorUserId), input = normalizeLearningPolicyReview(value);
  const payloadDigest = reviewDigest({ actor, input });
  return checkoutTransaction(async connection => {
    await lockMerchant(connection, merchant);
    const [existing] = await connection.execute<any[]>(`SELECT * FROM ai_learning_policy_reviews
      WHERE merchant_id=? AND request_id=? FOR UPDATE`, [merchant, input.requestId]);
    if (existing.length) {
      if (existing[0].payload_digest !== payloadDigest) conflict();
      // Receipt only: a replay never attests that old evidence is still current.
      return { ...receipt(existing[0]), reused: true };
    }
    const source = await sourceSnapshot(connection, merchant, input.proposalId);
    if (!source.eligible || source.sourceDigest !== input.sourceDigest) conflict();
    const history = await reviews(connection, merchant, input.proposalId);
    const revision = Number(history[0]?.revision || 0);
    if (input.expectedRevision !== revision || revision >= Number.MAX_SAFE_INTEGER) conflict();
    const score = scoreLearningPolicyReview(input);
    const [saved] = await connection.execute<any>(`INSERT INTO ai_learning_policy_reviews
      (merchant_id, proposal_id, revision, request_id, payload_digest, source_digest, suite_digest,
       actor_user_id, proposal_snapshot, assessment, outcome, passed_cases, regressions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [merchant, input.proposalId, revision + 1, input.requestId, payloadDigest, source.sourceDigest, input.suiteDigest,
      actor, JSON.stringify({ ...source.proposal, independentConversations: source.independentConversations, evidenceLinks: source.evidenceLinks }),
      JSON.stringify({ kind: 'human_offline_review', suite: learningPolicyReviewSuite, styleOnly: input.styleOnly, cases: input.cases }),
      score.outcome, score.passedCases, score.regressions]);
    return { id: Number(saved.insertId), revision: revision + 1, ...score, assessment: 'human_offline_review' as const,
      activationAllowed: false as const, reused: false };
  });
}
