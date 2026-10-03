import { reviewSelection, reviewRow, reviewWorkspace, reviewDetailInput, reviewDetail, type ReviewKind, type ReviewRow } from '../../../shared/review-workspace';
import { reviewReplyInput, reviewReplyResult } from '../../../shared/review-reply';
import type { ServiceMode } from './service-preview-model';
export const reviewPreviewQueries = ['reviews.workspace', 'reviews.detail', 'bookingReviews.workspace', 'bookingReviews.detail'] as const;
export const reviewPreviewMutations = ['reviews.saveReply', 'bookingReviews.saveReply'] as const;
const fault = (reason: string, code = 'BAD_REQUEST') => ({ message: 'review_reply:' + reason, data: { code } });

/** Temporary records for UI review, never customer data or delivery evidence. */
export class ReviewPreviewStore {
  writes = 0;
  private version = 0;
  private started = Date.now();
  private rows = new Map<string, ReviewRow>();
  constructor(readonly actorId: number, readonly merchantId: number, readonly now: string, private mode: () => ServiceMode) {
    if (mode() === 'empty') return;
    for (const kind of ['order', 'booking'] as const) for (let id = 1; id <= 32; id++) {
      const legacy = mode() === 'legacy' && id === 32, unlinked = id === 30 || mode() === 'unavailable-reference' && id === 32;
      const rating = legacy || id === 29 ? null : id % 5 + 1, isPublic = legacy ? null : id % 4 !== 0;
      const reply = id % 5 === 1 ? 'شكرًا لملاحظتك. سعداء بخدمتك. Thank you for your feedback.' : null;
      const issues: ReviewRow['issues'] = [...(rating === null ? ['rating' as const] : []), ...(isPublic === null ? ['visibility' as const] : [])];
      const r = reviewRow.parse({ id, kind, revision: this.marker(kind, id), integrity: 'linked',
        customerName: `${merchantId === 269 ? 'نواة · Nawa' : 'مدار · Madar'} · عميل Customer ${id}${id === 1 ? ' %_literal' : ''}`,
        customerPhone: '+966500000000', rating, isPublic, comment: legacy ? '<img src=x onerror=alert(1)> · نص حرفي قديم' : id === 32 ? 'تجربة جيدة، وأتمنى توضيح موعد التسليم.\nA good experience. Please make the delivery time clearer.' : 'خدمة تستحق الاهتمام بملاحظات العميل. Customer feedback helps improve the experience.',
        merchantReply: reply, replyState: reply ? 'replied' : 'pending', createdAt: this.shift(-(33 - id) * 60000), updatedAt: now, repliedAt: reply ? now : null,
        record: { id: id + 100, label: kind === 'order' ? 'LOCAL-' + id : null },
        product: kind === 'order' && id % 3 !== 0 ? { id: id + 200, name: 'منتج تجريبي · Sample product' } : null,
        service: kind === 'booking' ? { id: id + 200, name: 'استشارة تجريبية · Sample consultation' } : null,
        staff: kind === 'booking' && id % 3 !== 0 ? { id: 1, name: 'مقدم الخدمة · Service provider' } : null,
        dimensions: kind === 'booking' ? { quality: 4, professionalism: 5, value: 3 } : null,
        issues, replyDelivery: 'not_verified', purchaseVerification: 'not_verified' });
      this.rows.set(kind + ':' + id, unlinked ? reviewRow.parse({ ...r, integrity: 'unlinked', customerName: null, customerPhone: null, rating: null, isPublic: null,
        comment: null, merchantReply: null, replyState: 'unknown', repliedAt: null, record: null, product: null, service: null, staff: null, dimensions: null, issues: ['reference'] }) : r);
    }
  }
  private shift(ms: number) { return new Date(Date.parse(this.now) + ms).toISOString(); }
  private get time() { return this.shift(Date.now() - this.started); }
  private marker(kind: ReviewKind, id: number) { return [this.actorId, this.merchantId, kind === 'order' ? 1 : 2, id, this.version, 0, 0, 0].map(n => n.toString(16).padStart(8, '0')).join(''); }
  private kind(name: string): ReviewKind {
    if (name.startsWith('reviews.')) return 'order'; if (name.startsWith('bookingReviews.')) return 'booking'; throw fault('missing', 'NOT_FOUND');
  }
  private scope(kind: ReviewKind) { return { actorId: this.actorId, merchantId: this.merchantId, kind, checkedAt: this.time, canReply: this.mode() !== 'readonly' }; }
  private getRow(kind: ReviewKind, id: number) { const r = this.rows.get(kind + ':' + id); if (!r) throw fault('missing', 'NOT_FOUND'); return structuredClone(r); }
  read(name: string, input: unknown = {}) {
    const kind = this.kind(name);
    if (name.endsWith('.detail')) {
      if (this.mode() === 'choices-error') throw fault('unavailable', 'INTERNAL_SERVER_ERROR');
      return reviewDetail.parse({ ...this.scope(kind), row: this.getRow(kind, reviewDetailInput.parse(input).id) });
    }
    if (!name.endsWith('.workspace')) throw fault('missing', 'NOT_FOUND');
    const selection = reviewSelection.parse(input), all = Array.from(this.rows.values()).filter(r => r.kind === kind), q = selection.query.toLowerCase();
    const linked = all.filter(r => r.integrity === 'linked'), rated = linked.filter(r => r.rating !== null), replied = linked.filter(r => r.replyState === 'replied');
    const matches = all.filter(r => (selection.integrity === 'all' || r.integrity === selection.integrity)
      && (selection.rating === null || r.integrity === 'linked' && r.rating === selection.rating)
      && (selection.reply === 'all' || r.integrity === 'linked' && r.replyState === selection.reply)
      && (selection.visibility === 'all' || r.integrity === 'linked' && selection.visibility === (r.isPublic === null ? 'unknown' : r.isPublic ? 'public' : 'private'))
      && (!q || String(r.id) === q || r.integrity === 'linked' && [r.customerName, r.customerPhone, r.comment, r.merchantReply, r.record?.label, r.product?.name, r.service?.name, r.staff?.name].some(v => v?.toLowerCase().includes(q))));
    matches.sort((a, b) => selection.sort === 'highest' || selection.sort === 'lowest' ? Number(a.rating === null) - Number(b.rating === null)
      || (selection.sort === 'highest' ? (b.rating ?? 0) - (a.rating ?? 0) : (a.rating ?? 0) - (b.rating ?? 0)) || b.id - a.id
      : selection.sort === 'oldest' ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id - b.id : (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id);
    const pages = Math.ceil(matches.length / 25), currentPage = Math.min(selection.page, Math.max(1, pages));
    return reviewWorkspace.parse({ ...this.scope(kind), selection, stats: { total: all.length, linked: linked.length, unlinked: all.length - linked.length,
      rated: rated.length, invalidRatings: linked.length - rated.length, average: rated.length ? rated.reduce((sum, r) => sum + r.rating!, 0) / rated.length : null,
      pending: linked.length - replied.length, replied: replied.length, public: linked.filter(r => r.isPublic === true).length, private: linked.filter(r => r.isPublic === false).length,
      unknownVisibility: linked.filter(r => r.isPublic === null).length, distribution: Object.fromEntries([1, 2, 3, 4, 5].map(n => [String(n), rated.filter(r => r.rating === n).length])) },
      matched: matches.length, pages, currentPage, pageSize: 25, rows: matches.slice((currentPage - 1) * 25, currentPage * 25), evidence: 'recorded_reviews', salesAttribution: 'not_verified', collection: 'scoped_invitation_required' });
  }
  mutate(name: string, input: unknown) {
    if (!reviewPreviewMutations.includes(name as any)) throw fault('missing', 'NOT_FOUND');
    if (this.mode() === 'readonly') throw fault('forbidden', 'FORBIDDEN');
    const kind = this.kind(name), value = reviewReplyInput.parse(input), row = this.getRow(kind, value.id);
    if (row.integrity !== 'linked') throw fault('reference', 'PRECONDITION_FAILED');
    const effect = row.merchantReply === value.reply ? 'already_current' : 'saved';
    if (effect === 'saved') {
      if (row.revision !== value.revision) throw fault('stale', 'CONFLICT');
      this.version++; this.writes++; Object.assign(row, { merchantReply: value.reply, replyState: 'replied', repliedAt: this.time, updatedAt: this.time, revision: this.marker(kind, row.id) });
      this.rows.set(kind + ':' + row.id, reviewRow.parse(row));
    }
    return reviewReplyResult.parse({ ...this.scope(kind), row, effect, sendsMessage: false });
  }
}
