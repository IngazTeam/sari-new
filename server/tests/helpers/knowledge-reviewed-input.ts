import { saveKnowledgeReview } from '../../knowledge/intake-reviews';
import { knowledgeIntakeInput, type KnowledgeAnalysis } from '../../../shared/knowledge-intake';
import { capturePlanBasis } from '../../knowledge/intake-plan';

export const fixtureKnowledgeAnalysis: KnowledgeAnalysis = { contentType: 'general', summary: 'Synthetic review report', itemCount: 1, conflicts: ['Review synthetic conflict'], impact: 'Synthetic expected impact', riskLevel: 'medium', sampleQA: [{ question: 'Synthetic question?', answer: 'Synthetic answer' }], recommendation: 'review', recommendationReason: 'Confirm the source before use' };
// Existing receipt/concurrency tests share one real review per tenant/request fixture.
const reviews = new Map<string, Promise<string>>();
export async function saveFixtureReview(merchantId: number, input: unknown, analysis = fixtureKnowledgeAnalysis) {
  const basis = await capturePlanBasis(merchantId);
  return saveKnowledgeReview(merchantId, input, analysis, { basisHash: basis.hash, plan: { version: 1, items: [] } });
}
export async function reviewedKnowledgeInput(merchantId: number, raw: unknown) {
  const input = raw as ReturnType<typeof knowledgeIntakeInput.parse> & { requestId: string };
  const key = `${merchantId}:${input.requestId}`;
  if (!reviews.has(key)) reviews.set(key, saveFixtureReview(merchantId, input).then(review => review.id));
  return { ...input, reviewId: await reviews.get(key)!, acknowledged: true as const };
}
