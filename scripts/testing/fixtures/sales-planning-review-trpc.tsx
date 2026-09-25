import { useEffect, useState } from 'react';
import { cohortProtocolRecord } from './sales-protocol-ui-trpc';
import { planningReviewFixtureWorkspace, planningReviewFixtureReceipt } from './sales-planning-review-data';
import { recordSalesExperimentReviewInput } from '../../../shared/sales-experiment-review';
const mode = (new URL(location.href).searchParams.get('case') || '').replace('plan-review-', ''), win = window as any;
const listeners = new Set<() => void>(), state = { revision: 0, workspace: null as any, saved: null as any, rows: [] as any[], changed: false };
const emit = () => listeners.forEach(listener => listener());
function workspace() {
  if (!state.workspace) {
    state.workspace = planningReviewFixtureWorkspace(cohortProtocolRecord());
    if (mode === 'self') { state.workspace.reviewerUserId = 7; state.workspace.canReview = false; }
    if (['history', 'history-error', 'historical-unavailable', 'xss'].includes(mode)) {
      state.rows = Array.from({ length: 45 }, (_, i) => planningReviewFixtureReceipt(state.workspace, i + 1)); state.revision = 45;
    }
  }
  const w = structuredClone(state.workspace); w.expectedRevision = state.revision; w.latestReview = state.rows.at(-1) ?? null;
  if (w.latestReview) { w.stage = state.changed ? 'review_stale' : w.latestReview.snapshot.verdict; w.planningReviewCurrent = !state.changed && w.stage === 'approved'; }
  if (mode === 'unsupported') w.activationAllowed = true;
  if (mode === 'wrong-protocol') w.basis.protocolId = 99;
  if (mode === 'missing-pair') w.evidence.pairs.pop();
  if (mode === 'xss') { const text = '<img src=x onerror="window.__reviewXss=1">' + 'Unbroken'.repeat(32); w.evidence.pairs[0].userPrompt = text; w.evidence.pairs[0].candidate.response = text; w.evidence.outputReview.cases[0].candidate.quote = text; }
  return w;
}
function value(kind: string, input: any) {
  const w = workspace(); if (kind === 'workspace') return w;
  const rows = [...state.rows].reverse().filter(row => !input.beforeId || row.reviewId < input.beforeId).slice(0, 21);
  return { items: rows.slice(0, 20), nextBeforeId: rows.length > 20 ? rows[19].reviewId : null, activationAllowed: false };
}
function query(kind: string) { return { useQuery: (input: any, options: any = {}) => {
  const [, tick] = useState(0), [fetching, setFetching] = useState(false), [recovered, setRecovered] = useState(false);
  useEffect(() => { const listener = () => tick(n => n + 1); listeners.add(listener); return () => { listeners.delete(listener); }; }, []);
  const isError = kind === 'workspace' && ['unavailable', 'historical-unavailable'].includes(mode) || mode === 'refresh-error' && !!state.saved
    || kind === 'history' && mode === 'history-error' && !!input.beforeId && !recovered;
  return { data: mode === 'loading' ? undefined : value(kind, input), isLoading: mode === 'loading', isFetching: fetching || mode === 'fetching', isError,
    refetch: async () => { setFetching(true); await new Promise(resolve => setTimeout(resolve, 20)); setFetching(false); setRecovered(true);
      return { data: value(kind, input), isError: kind === 'workspace' && ['unavailable', 'historical-unavailable'].includes(mode) || mode === 'refresh-error' && !!state.saved }; } };
} }; }
export const planningReviewFixture = {
  getSalesExperimentReviewWorkspace: query('workspace'), getSalesExperimentReviewHistory: query('history'),
  recordSalesExperimentReview: { useMutation: () => ({ mutateAsync: async (raw: any) => {
    win.__reviewWrites = [...(win.__reviewWrites || []), structuredClone(raw)]; const count = win.__reviewWrites.length;
    const w = workspace(); await new Promise(resolve => setTimeout(resolve, mode === 'slow' ? 400 : 20));
    if (mode === 'conflict') throw { data: { code: 'PRECONDITION_FAILED' }, message: 'private SQL error' };
    if (mode === 'outage' && count === 1) throw Error('private disconnected');
    const input = recordSalesExperimentReviewInput.parse(raw);
    if (!state.saved) { state.saved = planningReviewFixtureReceipt(w, input.expectedRevision + 1); state.saved.snapshot.verdict = input.verdict;
      state.saved.snapshot.assessment = input.assessment; state.rows.push(state.saved); state.revision = state.saved.snapshot.revision; emit(); }
    if (count === 1 && mode === 'unknown') throw Error('private acknowledgement lost');
    if (count === 1 && mode === 'mismatch') return { ...state.saved, snapshot: { ...state.saved.snapshot, reviewerUserId: 99 } };
    return { ...structuredClone(state.saved), reused: count > 1 };
  } }) },
};
win.__reviewChangeBasis = () => { workspace(); state.workspace.basisDigest = 'a'.repeat(64); state.workspace.basis.outputReviewRevision++; state.workspace.evidence.outputReview.revision++; state.changed = true; emit(); };
win.__reviewNewDecision = () => { const w = workspace(); state.rows.push(planningReviewFixtureReceipt(w, ++state.revision)); emit(); };
