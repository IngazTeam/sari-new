import { useEffect, useState } from 'react';
import { replyReviewSubmitInput, type ReplyReviewReceipt, type ReplyReviewWorkspace } from '../../../shared/sales-reply-review';
const mode = (new URL(location.href).searchParams.get('case') || '').replace('reply-review-', ''), win = window as any;
const listeners = new Set<() => void>(), emit = () => listeners.forEach(f => f());
const original = 'أنصحك بالخيار المناسب لاحتياجك بعد التأكد من التفاصيل. ما الأهم بالنسبة لك عند الاختيار؟';
let saved: ReplyReviewReceipt | null = null, actor = 7, digest = 'a'.repeat(64), readable = true, allowed = true, refreshed = false, revision = 0;
function packet(generationId: number): ReplyReviewWorkspace {
  const incomplete = ['invalid', 'uncertain', 'blocked', 'dispatching'].includes(mode);
  const w: ReplyReviewWorkspace = { generationId, actorUserId: actor, state: incomplete ? mode as any : 'responded',
    responseText: incomplete ? null : mode === 'xss' ? '<img src=x onerror="window.__replyXss=1">' + 'Unbroken'.repeat(50) : original,
    canReview: allowed && !incomplete && mode !== 'manager' && mode !== 'stale', stage: !allowed || mode === 'manager' ? 'owner_required' : incomplete ? 'incomplete' : mode === 'stale' ? 'source_unavailable' : 'ready',
    basis: { digest, rubricDigest: 'b'.repeat(64), customerMessage: 'أحتاج معرفة الخيار الأنسب قبل الشراء.', lastAssistantMessage: 'أهلًا بك، يسعدني مساعدتك.', checkedAt: '2026-09-26T01:00:00.000Z', observationEndsAt: mode === 'expired' ? '2020-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z',
      gate: mode === 'critical' ? [{ severity: 'critical', rule: 'unsupported_transaction_claim' }] : [] },
    expectedRevision: revision, history: saved ? [saved] : [], reviewCurrentAtRead: !!saved && saved.basisDigest === digest, dispatchAllowed: false, exposureRecorded: false };
  if (!w.canReview) w.basis = null;
  if (mode === 'foreign') w.generationId = 999;
  if (mode === 'unsupported') (w as any).dispatchAllowed = true;
  return w;
}
function query(kind: 'list' | 'read') { return { useQuery: (input: any) => {
  const [, tick] = useState(0), [fetching, setFetching] = useState(false);
  useEffect(() => { const f = () => tick(v => v + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const data = () => kind === 'read' ? packet(input.generationId) : { items: mode === 'empty' ? [] : [{ generationId: input.beforeId ? 9 : 21,
    state: 'responded', reviewOutcome: saved?.outcome ?? null, revision }], nextCursor: input.beforeId ? null : 21, dispatchAllowed: false, exposureRecorded: false };
  const failed = () => !readable || mode === 'read-error' && !refreshed || mode === 'refresh-error' && !!saved;
  return { data: data(), isLoading: mode === 'loading', isError: failed(), isFetching: fetching || mode === 'fetching',
    refetch: async () => { setFetching(true); await new Promise(r => setTimeout(r, 30)); refreshed = true; setFetching(false); emit(); return { data: data(), error: failed() ? Error('private read error') : null }; } };
} }; }
export const replyReviewFixture = { listSalesReplyReviews: query('list'), getSalesReplyReviewWorkspace: query('read'), submitSalesReplyReview: { useMutation: () => ({ mutateAsync: async (raw: any) => {
  win.__replyWrites = [...(win.__replyWrites || []), structuredClone(raw)]; const count = win.__replyWrites.length, input = replyReviewSubmitInput.parse(raw);
  await new Promise(r => setTimeout(r, mode === 'slow' ? 400 : 25));
  if (mode === 'conflict') throw { data: { code: 'PRECONDITION_FAILED' }, message: 'private SQL' };
  if (mode === 'outage' && count === 1) throw Error('private connection');
  if (mode === 'retry-forbidden' && count === 2) throw { data: { code: 'FORBIDDEN' }, message: 'private credentials' };
  if (!saved) { saved = { reviewId: 41, generationId: input.generationId, actorUserId: actor, requestId: input.requestId, revision: input.expectedRevision + 1,
    basisDigest: input.basisDigest, rubricDigest: input.rubricDigest, reviewedAt: '2026-09-26T01:01:00.000Z', outcome: mode === 'critical' || !Object.values(input.checks).every(Boolean) ? 'rejected' : 'approved',
    quote: input.quote, rationale: input.rationale, checks: input.checks, dispatchAllowed: false, exposureRecorded: false, eligibility: 'not_checked' }; revision = saved.revision; emit(); }
  if (count === 1 && ['unknown', 'retry-forbidden'].includes(mode)) throw Error('private lost acknowledgement');
  if (count === 1 && mode.startsWith('mismatch-')) {
    const r: any = structuredClone(saved), field = mode.replace('mismatch-', '');
    if (field === 'actor') r.actorUserId++; if (field === 'request') r.requestId = '00000000-0000-4000-8000-000000000099';
    if (field === 'checks') r.checks.answersQuestion = false; if (field === 'outcome') r.outcome = 'rejected'; if (field === 'quote') r.quote = 'changed';
    return r;
  }
  return structuredClone(saved);
} }) } };
win.__replyChange = (kind: string) => { if (kind === 'basis') digest = 'c'.repeat(64); if (kind === 'actor') actor++; if (kind === 'permission') allowed = false;
  if (kind === 'error') readable = false; if (kind === 'recover') { readable = true; allowed = true; } emit(); };
