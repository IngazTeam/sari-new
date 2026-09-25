import { useEffect, useState } from 'react';
import { outputCaseIds, supportedOutputRubricDigest } from '../../../client/src/lib/learning-policy-evaluation-state';
import { learningPolicyReviewAr } from '../../../client/src/locales/learning-policy-review';
const mode = new URL(location.href).searchParams.get('case')?.replace('evaluation-', '') || 'ready';
const win = window as any, listeners = new Set<() => void>();
const state = { prepared: !mode.startsWith('prepare'), completed: mode.startsWith('review') || mode === 'xss' ? 64 : 0,
  status: mode === 'halted' ? 'halted' : mode === 'cancelled' ? 'cancelled' : mode.startsWith('review') || mode === 'xss' ? 'completed' : 'running',
  sourceChanged: false, review: null as any, reads: 0, revoked: false };
const emit = () => { for (const listener of listeners) listener(); };
const bad = '<img src=x onerror="window.__evaluationXss=1">' + 'LongUnbrokenWord'.repeat(45);
function response(caseId: string, arm: string) { return mode === 'xss' ? bad : `رد ${arm} محفوظ للحالة ${caseId}. Synthetic saved answer.`; }
function samples() { return outputCaseIds.flatMap(caseId => ['baseline','candidate'].map(arm => ({ caseId, arm }))).map((row, ordinal) => ({
  ...row, ordinal, state: ordinal < state.completed ? 'responded' : mode === 'waiting' && ordinal === 0 ? 'dispatching' : 'queued',
  response: ordinal < state.completed ? response(row.caseId,row.arm) : null, metadata: { model: 'fixture-snapshot' }, inputDigest: 'a'.repeat(64), responseDigest: 'b'.repeat(64),
  cost: ordinal < state.completed ? { state: 'settled', heldMicroUsd: 0, settledMicroUsd: 12500 } : null,
})); }
function run() { return { runId: 5, candidateId: 4, provider: 'openai', model: 'fixture-model', observedModel: state.completed ? 'fixture-snapshot' : null,
  state: state.status, completedSamples: state.completed, totalSamples: 64, activationAllowed: false,
  recipe: { version: mode === 'unsupported' ? 'unknown' : 'sales-style-generation.v1', totalSamples: 64, maxTokens: 800, temperature: 0.3, taskType: 'sari.reply' }, samples: samples() }; }
function packet() {
  const pairs = outputCaseIds.map(caseId => ({ caseId, sector: caseId.split(':')[0],
    criterion: learningPolicyReviewAr[`${caseId.split(':')[1]}Criterion` as keyof typeof learningPolicyReviewAr],
    systemPrompt: mode === 'xss' ? bad : 'Synthetic evaluation input: option A costs 100; option B costs 150. No authorized discount.', userPrompt: 'ما الفرق بين الخيارين؟', candidateStyleInstruction: 'Explain relevant value.',
    baseline: { response: response(caseId,'baseline') }, candidate: { response: response(caseId,'candidate') } }));
  const review = state.review;
  const receipt = review ? { id: 8, revision: 1, outcome: review.cases.some((row: any) => row.candidate.verdict === 'fail') ? 'failed' : review.cases.every((row:any)=>row.preference==='tie') ? 'inconclusive' : 'passed', candidatePassed: 32, totalCases: 32, regressions: 0, candidateWins: 0, baselineWins: 0, ties: 32, current: !state.sourceChanged, review } : null;
  return { runId: 5, runDigest: (state.sourceChanged ? 'b' : 'a').repeat(64), rubricDigest: mode === 'review-unsupported' ? 'f'.repeat(64) : supportedOutputRubricDigest,
    rubric: { version: 'sales-style-output-human-review.v1' }, pairs, expectedRevision: review && mode !== 'review-refresh-stale' ? 1 : 0,
    canReview: !state.sourceChanged && !state.revoked && mode !== 'review-stale', activationAllowed: false, latestReview: receipt, history: receipt ? [receipt] : [] };
}
function candidate() { return { proposalId: 16, reviewId: 2, sourceDigest: 'a'.repeat(64), baselineDigest: 'b'.repeat(64), expectedVersion: state.prepared ? 1 : 0,
  canCreate: !state.prepared && mode !== 'prepare-ineligible', activationAllowed: false,
  latestCandidate: state.prepared ? { id: 4, version: 1, current: mode !== 'candidate-stale', artifactDigest: 'c'.repeat(64), activationAllowed: false, bundle: { version: 'sales-style-candidate.v1' } } : null,
  evaluationRuns: mode.startsWith('prepare') && !win.__evalStartInputs?.length ? [] : [{ runId: 5, state: state.status, provider: 'openai', model: 'fixture-model' }] }; }
function query(kind: 'candidate' | 'run' | 'review', value: () => any) {
  return { useQuery: () => {
    const [, tick] = useState(0), [fetching, setFetching] = useState(false), [recovered, setRecovered] = useState(false);
    useEffect(() => { const update = () => tick(n => n + 1); listeners.add(update); return () => { listeners.delete(update); }; }, []);
    const isError = state.revoked || mode === `${kind}-error` && !recovered;
    return { data: mode === `${kind}-loading` ? undefined : value(), isError, isLoading: mode === `${kind}-loading`, isFetching: fetching || mode === `${kind}-fetching`,
      refetch: async () => { setFetching(true); await new Promise(resolve => setTimeout(resolve, 5)); setFetching(false); setRecovered(true); state.reads++;
        const error = state.revoked || kind === 'run' && mode === 'generation-read-error' && state.completed > 0;
        return { data: value(), isError: error }; } };
  } };
}
function mutation(name: string, operation: (input: any, count: number) => any) {
  return { useMutation: () => { const [isPending, setPending] = useState(false); return { isPending, mutateAsync: async (input: any) => {
    const key = `__eval${name}Inputs`; win[key] = [...(win[key] || []), structuredClone(input)]; setPending(true);
    await new Promise(resolve => setTimeout(resolve, ['pause','close','learning-review-card','revoke'].includes(mode) ? 250 : 15));
    try { const result = operation(input, win[key].length); emit(); return result; } finally { setPending(false); }
  } }; } };
}
win.__changeEvaluationSource = () => { state.sourceChanged = true; emit(); };
win.__revokeEvaluationRole = () => { state.revoked = true; emit(); };
export const evaluationFixture = {
  getLearningPolicyCandidate: query('candidate', candidate),
  createLearningPolicyCandidate: mutation('Candidate', (input, count) => {
    state.prepared = true; if (mode === 'prepare-unknown' && count === 1) throw Error('private candidate commit');
    return { id: 4, version: 1, artifactDigest: 'c'.repeat(64), activationAllowed: false };
  }),
  startLearningPolicyEvaluation: mutation('Start', (input, count) => {
    if (mode === 'prepare-start-unknown' && count === 1) throw Error('private run commit'); return run();
  }),
  getLearningPolicyEvaluation: query('run', run),
  advanceLearningPolicyEvaluation: mutation('Advance', (input, count) => {
    if (mode === 'advance-conflict') throw { data: { code: 'PRECONDITION_FAILED' }, message: 'private config' };
    if (mode === 'advance-outage' && count === 1) throw Error('private provider');
    if (mode === 'waiting') return run();
    if (mode === 'halt-after-one') { state.status = 'halted'; return run(); }
    if (input.expectedOrdinal === state.completed && state.status === 'running') state.completed++;
    if (state.completed === 64) state.status = 'completed';
    if (mode === 'advance-unknown' && count === 1) throw Error('private response lost');
    return run();
  }),
  cancelLearningPolicyEvaluation: mutation('Cancel', (input, count) => { state.status = 'cancelled'; if (mode === 'cancel-unknown' && count === 1) throw Error('private cancel ack'); return run(); }),
  getLearningPolicyOutputReview: query('review', packet),
  recordLearningPolicyOutputReview: mutation('Review', (input, count) => {
    if (mode === 'review-conflict') throw { data: { code: 'PRECONDITION_FAILED' }, message: 'private SQL' };
    if (mode === 'review-outage' && count === 1) throw Error('private write outage');
    state.review ||= structuredClone(input); if (mode === 'review-unknown' && count === 1) throw Error('private commit');
    return { revision: 1, outcome: 'inconclusive', activationAllowed: false };
  }),
};
