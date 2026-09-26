import { replyReviewCriteria, replyReviewReceipt, replyReviewWorkspace, replyReviewSubmitInput,
  type ReplyReviewSubmission, type ReplyReviewWorkspace } from '../../../shared/sales-reply-review';

export type ReplyReviewDraft = { checks: Record<typeof replyReviewCriteria[number], '' | 'pass' | 'fail'>; quote: string; rationale: string };
export const emptyReplyReviewDraft = (): ReplyReviewDraft => ({ checks: { answersQuestion: '', groundedInBusiness: '', appropriateNextStep: '',
  respectsCustomerDecision: '', noUnverifiedCommitment: '', languageAndClarity: '' }, quote: '', rationale: '' });
export function reviewWorkspace(value: unknown, generationId: number) {
  const result = replyReviewWorkspace.safeParse(value);
  if (!result.success) return null;
  const w = result.data;
  if (w.generationId !== generationId || w.history.some(r => r.generationId !== generationId)
    || w.history.some((r, i) => i > 0 && r.revision >= w.history[i - 1].revision)
    || w.expectedRevision !== (w.history[0]?.revision ?? 0)
    || (w.canReview && (w.stage !== 'ready' || w.state !== 'responded' || !w.responseText || !w.basis))
    || (!w.canReview && w.stage === 'ready')) return null;
  return w;
}
export const replyReviewKey = (w: ReplyReviewWorkspace) => JSON.stringify([w.generationId, w.actorUserId, w.basis?.digest, w.basis?.rubricDigest, w.expectedRevision]);
export function buildReplyReviewSubmission(w: ReplyReviewWorkspace, draft: ReplyReviewDraft, requestId: string) {
  if (!w.canReview || !w.basis || !draft.quote.trim() || !w.responseText?.includes(draft.quote)
    || replyReviewCriteria.some(key => !['pass', 'fail'].includes(draft.checks[key]))) return null;
  const parsed = replyReviewSubmitInput.safeParse({ generationId: w.generationId, requestId, basisDigest: w.basis.digest,
    rubricDigest: w.basis.rubricDigest, expectedRevision: w.expectedRevision,
    checks: Object.fromEntries(replyReviewCriteria.map(key => [key, draft.checks[key] === 'pass'])), quote: draft.quote, rationale: draft.rationale,
    reviewedEntireResponse: true, understandsNoMessageSent: true });
  return parsed.success ? parsed.data : null;
}
export function matchingReplyReviewReceipt(value: unknown, request: ReplyReviewSubmission, actorUserId: number, critical: boolean) {
  const result = replyReviewReceipt.safeParse(value);
  if (!result.success) return null;
  const r = result.data, outcome = Object.values(request.checks).every(Boolean) && !critical ? 'approved' : 'rejected';
  return r.generationId === request.generationId && r.requestId === request.requestId && r.actorUserId === actorUserId
    && r.revision === request.expectedRevision + 1 && r.basisDigest === request.basisDigest && r.rubricDigest === request.rubricDigest
    && r.outcome === outcome && r.quote === request.quote && r.rationale === request.rationale
    && replyReviewCriteria.every(key => r.checks[key] === request.checks[key]) ? r : null;
}
// After an uncertain attempt, even a later authorization error cannot disprove an earlier commit.
export function definiteFirstReplyReviewError(error: unknown) {
  return ['PRECONDITION_FAILED', 'BAD_REQUEST', 'FORBIDDEN', 'UNAUTHORIZED'].includes((error as { data?: { code?: string } })?.data?.code ?? '');
}
