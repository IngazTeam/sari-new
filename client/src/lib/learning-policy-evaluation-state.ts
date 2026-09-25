import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
export type Run = inferRouterOutputs<AppRouter>['sariBrain']['getLearningPolicyEvaluation'];
export type Packet = inferRouterOutputs<AppRouter>['sariBrain']['getLearningPolicyOutputReview'];
export type ReviewSubmission = inferRouterInputs<AppRouter>['sariBrain']['recordLearningPolicyOutputReview'];
export type ReviewAnswer = { caseId: string; baseline: { verdict: '' | 'pass' | 'fail'; quote: string; reason: string };
  candidate: { verdict: '' | 'pass' | 'fail'; quote: string; reason: string }; preference: '' | 'baseline' | 'candidate' | 'tie' };
export const supportedOutputRubricDigest = 'd0bd1aa2b177399e5da22e9e61635a31c744cd8d2a62fc02669bec3e31feb20f';
const scenarios = ['need','comparison','price','consent','refusal','truth','handoff','injection'];
export const outputCaseIds = ['general','training','recruitment','store'].flatMap(sector => scenarios.map(id => `${sector}:${id}`));
export function compatibleRun(run: Run | undefined, runId: number): run is Run {
  return !!run && run.runId === runId && run.totalSamples === 64 && run.recipe?.version === 'sales-style-generation.v1'
    && run.recipe.totalSamples === 64 && run.recipe.maxTokens === 800 && run.recipe.temperature === 0.3
    && run.recipe.taskType === 'sari.reply' && run.activationAllowed === false && run.samples.length === 64
    && run.samples.every((sample, ordinal) => sample.ordinal === ordinal && outputCaseIds.includes(sample.caseId)
      && ['baseline','candidate'].includes(sample.arm) && ['queued','dispatching','responded','invalid','uncertain','blocked'].includes(sample.state))
    && run.completedSamples === run.samples.filter(sample => sample.state === 'responded').length
    && new Set(run.samples.map(sample => `${sample.caseId}:${sample.arm}`)).size === 64;
}
export function compatiblePacket(packet: Packet | undefined, runId: number): packet is Packet {
  return !!packet && packet.runId === runId && packet.rubricDigest === supportedOutputRubricDigest
    && packet.rubric.version === 'sales-style-output-human-review.v1' && packet.activationAllowed === false
    && packet.pairs.length === 32 && packet.pairs.every(pair => outputCaseIds.includes(pair.caseId))
    && new Set(packet.pairs.map(pair => pair.caseId)).size === 32;
}
export function validPreference(row: ReviewAnswer) {
  if (!row.baseline.verdict || !row.candidate.verdict || !row.preference) return false;
  if (row.baseline.verdict === row.candidate.verdict) return row.baseline.verdict === 'pass' || row.preference === 'tie';
  return row.preference === (row.candidate.verdict === 'pass' ? 'candidate' : 'baseline');
}
export function completeOutputAnswer(row: ReviewAnswer, pair: Packet['pairs'][number]) {
  return validPreference(row) && (['baseline','candidate'] as const).every(arm => {
    const value = row[arm]; return value.quote.trim().length > 0 && value.quote.trim().length <= 500
      && pair[arm].response.includes(value.quote.trim()) && value.reason.trim().length >= 20 && value.reason.trim().length <= 1500;
  });
}
export const definiteReviewError = (error: unknown) => ['PRECONDITION_FAILED','FORBIDDEN','UNAUTHORIZED','BAD_REQUEST']
  .includes((error as { data?: { code?: string } })?.data?.code || '');
export function evaluationCost(run: Run) {
  let settled = 0, held = 0, incomplete = false;
  for (const sample of run.samples) {
    const cost = sample.cost;
    if (!cost) { if (sample.state !== 'queued') incomplete = true; continue; }
    if (cost.state === 'unavailable' || cost.heldMicroUsd === null) incomplete = true;
    if (typeof cost.heldMicroUsd === 'number' && Number.isFinite(cost.heldMicroUsd)) held += cost.heldMicroUsd;
    if (cost.state === 'settled' && typeof cost.settledMicroUsd === 'number') settled += cost.settledMicroUsd;
  }
  return { settled: (settled / 1e6).toFixed(6), held: (held / 1e6).toFixed(6), incomplete };
}
