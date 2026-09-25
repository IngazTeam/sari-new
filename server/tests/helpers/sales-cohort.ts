import { randomUUID } from 'node:crypto';
import { getPool } from '../../db/connection';
import { upsertDNA } from '../../db/learning';
import { attachLearningEvidence } from '../../ai/learning-evidence';
import { getLearningPolicyReview, recordLearningPolicyReview } from '../../ai/learning-policy-review';
import { learningPolicyReviewSuite, learningPolicyReviewSuiteDigest } from '../../ai/learning-policy-review-contract';
import { createLearningPolicyCandidate, getLearningPolicyCandidate } from '../../ai/learning-policy-candidates';
import { registerSalesExperimentProtocol } from '../../ai/sales-experiment-protocol';
import { syntheticSalesExperimentDesign } from './sales-experiment-design';
import type { SalesCohortRules } from '../../ai/sales-experiment-cohort-contract';

export const syntheticCohortRules = (): SalesCohortRules => ({ version: 'sales-cohort-rules.v1', historyDefinition: 'owned_inbound_before_enrollment',
  messageType: 'text', minimumCharacters: 3, maximumCharacters: 4000, requiredAnyTerms: [],
  allowedDealStages: ['new', 'interested', 'qualified', 'ready'], excludedPhones: [],
  requireActiveConversation: true, excludeHumanTakeover: true, requireLatestInbound: true, requirePostHandoffInbound: true });
export async function seedCohortProtocol(owner: { merchantId: number; userId: number }, population: 'all' | 'new' | 'returning' = 'all') {
  const query = async (sql: string, values: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, values))[0];
  const conversationId = (await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000299')", [owner.merchantId])).insertId;
  const signalId = (await query("INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type,customer_message) VALUES (?,?,'price_objection','Synthetic evidence')", [owner.merchantId, conversationId])).insertId;
  const proposal = { merchantId: owner.merchantId, generation: 1, dimension: 'objection_handling' as const, insight: 'Explain value clearly', evidenceCount: 1, confidence: 0.7 };
  await upsertDNA(proposal); const proposalId = Number((await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?', [owner.merchantId]))[0].id);
  await attachLearningEvidence({ ...proposal, observedSignalIds: [signalId] });
  const source = await getLearningPolicyReview(owner.merchantId, { proposalId });
  await recordLearningPolicyReview(owner.merchantId, owner.userId, { proposalId, requestId: randomUUID(), sourceDigest: source.sourceDigest,
    suiteDigest: learningPolicyReviewSuiteDigest, expectedRevision: 0, styleOnly: true, cases: learningPolicyReviewSuite.cases.map(row => ({ caseId: row.id as any,
      baselineResponse: 'Fixture baseline', candidateResponse: 'Fixture candidate', baselineVerdict: 'pass', candidateVerdict: 'pass', reason: 'Synthetic preparatory review for test data.' })) });
  const basis = await getLearningPolicyCandidate(owner.merchantId, { proposalId });
  const candidate = await createLearningPolicyCandidate(owner.merchantId, owner.userId, { proposalId, reviewId: basis.reviewId!, sourceDigest: basis.sourceDigest,
    baselineDigest: basis.baselineDigest, expectedVersion: 0, requestId: randomUUID() });
  const design = syntheticSalesExperimentDesign(); design.cohort.population = population;
  design.cohort.qualificationRule = 'Latest owned inbound text in the frozen allowed deal stages and length interval.';
  design.cohort.exclusions = 'Exclude inactive chats, human takeover, stale messages and explicitly listed customer phones.';
  const protocol = await registerSalesExperimentProtocol(owner.merchantId, owner.userId, { candidateId: candidate.id, artifactDigest: candidate.artifactDigest,
    expectedSectorRevision: 0, requestId: randomUUID(), design });
  return { protocol, signalId, proposalId };
}
