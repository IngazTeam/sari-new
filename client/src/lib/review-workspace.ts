import { reviewSelection, reviewWorkspace, reviewDetail, type ReviewSelection, type ReviewKind } from '@shared/review-workspace';
import { reviewReplyResult } from '@shared/review-reply';
export const reviewSelectionKey = (s: ReviewSelection) => JSON.stringify([s.query, s.rating, s.reply, s.visibility, s.integrity, s.sort, s.page]);
export function reviewNavigation(search: string) {
  const p = new URLSearchParams(search), page = p.get('page'), rating = p.get('rating');
  return reviewSelection.parse({ query: (p.get('q') ?? '').trim().slice(0, 100), rating: rating && /^[1-5]$/.test(rating) ? Number(rating) : null,
    reply: ['pending', 'replied'].includes(p.get('reply') ?? '') ? p.get('reply') : 'all',
    visibility: ['public', 'private', 'unknown'].includes(p.get('visibility') ?? '') ? p.get('visibility') : 'all',
    integrity: ['linked', 'unlinked'].includes(p.get('integrity') ?? '') ? p.get('integrity') : 'all',
    sort: ['oldest', 'highest', 'lowest'].includes(p.get('sort') ?? '') ? p.get('sort') : 'newest',
    page: page && /^[1-9]\d*$/.test(page) && Number(page) <= 1000000 ? Number(page) : 1 });
}
export function scopedReviewWorkspace(raw: unknown, actor: number, merchant: number, kind: ReviewKind, selection: ReviewSelection) {
  const p = reviewWorkspace.safeParse(raw); if (!p.success) return null; const d = p.data;
  return d.actorId === actor && d.merchantId === merchant && d.kind === kind && reviewSelectionKey(d.selection) === reviewSelectionKey(selection)
    && d.rows.every(r => r.kind === kind) && d.matched <= d.stats.total && d.pages === Math.ceil(d.matched / 25)
    && d.currentPage === Math.min(selection.page, Math.max(1, d.pages)) && d.rows.length === Math.min(25, Math.max(0, d.matched - (d.currentPage - 1) * 25))
    && new Set(d.rows.map(r => r.id)).size === d.rows.length ? d : null;
}
export function scopedReviewDetail(raw: unknown, actor: number, merchant: number, kind: ReviewKind, id: number) {
  const p = reviewDetail.safeParse(raw);
  return p.success && p.data.actorId === actor && p.data.merchantId === merchant && p.data.kind === kind && p.data.row.kind === kind && p.data.row.id === id ? p.data : null;
}
export function scopedReplyResult(raw: unknown, actor: number, merchant: number, kind: ReviewKind, id: number, reply: string) {
  const p = reviewReplyResult.safeParse(raw); if (!p.success) return null;
  const { effect, sendsMessage, ...detail } = p.data;
  return scopedReviewDetail(detail, actor, merchant, kind, id) && detail.row.integrity === 'linked'
    && detail.row.merchantReply === reply.trim() ? p.data : null;
}
