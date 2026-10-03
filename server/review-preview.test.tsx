// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { reviewWorkspaceAr as ar, reviewWorkspaceEn as en } from '../client/src/locales/review-workspace';
import { scopedReviewWorkspace, scopedReviewDetail, scopedReplyResult } from '../client/src/lib/review-workspace';
import { reviewSelection, reviewWorkspace, reviewDetail, type ReviewKind } from '../shared/review-workspace';
import { reviewReplyResult } from '../shared/review-reply';
const state = vi.hoisted(() => ({ language: 'en' }));
vi.mock('@/lib/trpc', () => import('../prototypes/tenant-dashboard/src/service-preview-api'));
vi.mock('wouter', () => import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: state.language }, t: (key: string) => (state.language === 'ar' ? ar : en)[key.split('.').pop() as keyof typeof en] ?? 'Localized status' }) }));
import { ReviewPage } from '../client/src/components/merchant/ReviewPage';
import { ServicePreviewContext } from '../prototypes/tenant-dashboard/src/service-preview-api';
import { ServicePreviewModel, serviceModes } from '../prototypes/tenant-dashboard/src/service-preview-model';
let root: Root, container: HTMLDivElement, model: ServicePreviewModel;
const namespace = (kind: ReviewKind) => kind === 'order' ? 'reviews' : 'bookingReviews';
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true }); state.language = 'en';
  container = document.createElement('div'); document.body.append(container); root = createRoot(container); model = new ServicePreviewModel(269);
  history.replaceState(null, '', '/?path=/merchant/reviews');
});
afterEach(async () => { await act(async () => root.unmount()); model.dispose(); container.remove(); vi.restoreAllMocks(); });
const render = (kind: ReviewKind = 'order') => act(async () => root.render(<ServicePreviewContext.Provider value={model}><ReviewPage kind={kind} /></ServicePreviewContext.Provider>));
const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim().startsWith(text))!;
const click = (text: string) => act(async () => { expect(button(text)).toBeTruthy(); button(text).click(); });
const fill = (value: string) => act(async () => { const el = document.getElementById('rw-reply') as HTMLTextAreaElement; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
const read = (kind: ReviewKind = 'order', input: object = {}, instance = model) => { const r = instance.read(namespace(kind) + '.workspace', input); expect(r.error).toBeFalsy(); return reviewWorkspace.parse(r.data); };
const detail = (kind: ReviewKind = 'order', id = 32, instance = model) => { const r = instance.read(namespace(kind) + '.detail', { id }); expect(r.error).toBeFalsy(); return reviewDetail.parse(r.data); };

for (const kind of ['order', 'booking'] as const) {
  it.each(['ar', 'en'])(`renders the actual ${kind} page, full details and reply save in %s`, async language => {
    state.language = language; const c = language === 'ar' ? ar : en; await render(kind); expect(container.querySelectorAll('.rw-card')).toHaveLength(25);
    await click(c.details); expect(document.body.textContent).toContain(c.replyHelp); if (kind === 'booking') expect(document.body.textContent).toContain(c.professionalism);
    await fill('  A clear response · رد واضح  '); await click(c.save); expect(document.body.textContent).toContain(c.saved); expect(document.activeElement?.textContent).toBe(c.saved);
    expect(detail(kind).row.merchantReply).toBe('A clear response · رد واضح'); expect(model.operations).toBe(1); expect(container.textContent).not.toContain('merchantUx.');
  });
  it.each(serviceModes)(`handles ${kind} mode %s without unintentional writes`, async mode => {
    model = new ServicePreviewModel(269, mode); await render(kind);
    expect(container.querySelectorAll('.rw-card').length > 0).toBe(!['empty', 'loading', 'failure', 'forbidden', 'session', 'foreign', 'stale-error'].includes(mode)); expect(model.operations).toBe(0);
  });
  it.each([269, 270])(`covers all ${kind} rows, exact filters and stable statistics for tenant %s`, id => {
    const other = new ServicePreviewModel(id);
    try {
      const one = read(kind, {}, other), two = read(kind, { page: 2 }, other); expect(one.stats).toMatchObject({ total: 32, linked: 31, unlinked: 1, rated: 30, invalidRatings: 1 });
      expect(new Set([...one.rows, ...two.rows].map(r => r.id)).size).toBe(32); expect(two.rows).toHaveLength(7); expect(read(kind, { page: 99 }, other).currentPage).toBe(2);
      expect(read(kind, { query: '%' }, other).rows.map(r => r.id)).toEqual([1]); expect(read(kind, { rating: 3 }, other).rows.every(r => r.rating === 3)).toBe(true);
      expect(read(kind, { query: 'Thank you', reply: 'replied' }, other).rows.every(r => r.merchantReply?.includes('Thank you'))).toBe(true);
      const oldest = read(kind, { sort: 'oldest' }, other); expect(oldest.rows[0].id).toBe(1); expect(oldest.stats).toEqual(one.stats);
      const low = read(kind, { sort: 'lowest' }, other); expect(low.rows[0].rating).toBe(1); expect(read(kind, { sort: 'highest' }, other).rows[0].rating).toBe(5);
      const selection = reviewSelection.parse({}); expect(scopedReviewWorkspace(one, id + 1000, id, kind, selection)).not.toBeNull();
      expect(scopedReviewWorkspace(one, id + 1000, id === 269 ? 270 : 269, kind, selection)).toBeNull();
      expect(scopedReviewDetail(detail(kind, 32, other), id + 1000, id, kind, 31)).toBeNull();
    } finally { other.dispose(); }
  });
  it(`recovers an uncertain ${kind} save by reading state without writing again`, async () => {
    model = new ServicePreviewModel(269, 'uncertain-save'); await render(kind); await click(en.details); await fill('One change'); await click(en.save);
    expect(document.body.textContent).toContain(en.uncertain); expect(model.operations).toBe(1); await click(en.check); expect(document.body.textContent).toContain(en.checked);
    expect(document.querySelector('.rw-saved')?.textContent).toContain('One change'); expect(model.operations).toBe(1);
  });
  it(`rejects stale ${kind} replacements, foreign revisions and repeat effects`, async () => {
    const old = detail(kind), input = { id: 32, revision: old.row.revision, reply: 'Stored once' };
    const saved = reviewReplyResult.parse(await model.mutate(namespace(kind) + '.saveReply', input)); expect(saved.sendsMessage).toBe(false);
    expect((await model.mutate(namespace(kind) + '.saveReply', input)).effect).toBe('already_current'); expect(model.operations).toBe(1);
    expect(scopedReplyResult(saved, 1269, 269, kind, 32, input.reply)).not.toBeNull(); expect(scopedReplyResult(saved, 1269, 270, kind, 32, input.reply)).toBeNull();
    await expect(model.mutate(namespace(kind) + '.saveReply', { ...input, reply: 'Different' })).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    const other = new ServicePreviewModel(270); try { await expect(other.mutate(namespace(kind) + '.saveReply', input)).rejects.toMatchObject({ data: { code: 'CONFLICT' } }); expect(other.operations).toBe(0); } finally { other.dispose(); }
    expect(read(kind).rows[0].id).toBe(32); expect(read(kind, { sort: 'oldest' }).rows[0].id).toBe(1);
  });
  it(`keeps conflicting ${kind} references redacted and non-actionable`, async () => {
    const r = detail(kind, 30).row; expect(r).toMatchObject({ integrity: 'unlinked', customerName: null, comment: null, rating: null, merchantReply: null });
    await expect(model.mutate(namespace(kind) + '.saveReply', { id: 30, revision: r.revision, reply: 'Blocked' })).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } });
    expect(read(kind, { integrity: 'unlinked' }).matched).toBe(1); expect(read(kind, { query: 'Customer 30' }).matched).toBe(0);
  });
  it(`keeps ${kind} read-only after refreshing`, async () => {
    model = new ServicePreviewModel(269, 'readonly'); await render(kind); await click(en.refresh); expect(read(kind).canReply).toBe(false);
    await click(en.details); expect(button(en.save)).toBeUndefined(); expect(document.getElementById('rw-reply')).toBeNull();
  });
  it(`shows detail failure for ${kind} without leaking an old response`, async () => {
    model = new ServicePreviewModel(269, 'choices-error'); await render(kind); await click(en.details); expect(document.body.textContent).toContain(en.failed); expect(document.getElementById('rw-reply')).toBeNull(); expect(model.operations).toBe(0);
  });
}
it('keeps order and booking replies separate when their numerical IDs overlap', async () => {
  const a = detail('order').row, b = detail('booking').row; expect(a.revision).not.toBe(b.revision);
  await model.mutate('reviews.saveReply', { id: a.id, revision: a.revision, reply: 'Order response' }); expect(detail('booking').row.merchantReply).toBeNull();
  await expect(model.mutate('bookingReviews.saveReply', { id: b.id, revision: a.revision, reply: 'Wrong scope' })).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
});
it('supports a deliberately delayed reply without double-saving', async () => {
  model = new ServicePreviewModel(269, 'pending-save'); await render(); await click(en.details); await fill('Wait for this'); await click(en.save); expect(model.pending).toBe(1); expect(model.operations).toBe(0);
  await act(async () => model.finishPending()); expect(model.operations).toBe(1); expect(document.body.textContent).toContain(en.saved);
});
it('cancels a delayed preview write when its sample is disposed', async () => {
  model = new ServicePreviewModel(269, 'pending-save'); const r = detail().row;
  const pending = model.mutate('reviews.saveReply', { id: r.id, revision: r.revision, reply: 'Late' }); model.dispose();
  await expect(pending).rejects.toMatchObject({ data: { code: 'CONFLICT' } }); expect(model.operations).toBe(0);
});
it('keeps malformed text literal and allows a local reply without inventing a valid rating', async () => {
  model = new ServicePreviewModel(269, 'legacy'); await render(); await click(en.details);
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('<img src=x onerror=alert(1)>'); expect(document.querySelector('img')).toBeNull();
  await fill('A helpful reply'); await click(en.save); expect(detail().row).toMatchObject({ rating: null, isPublic: null, merchantReply: 'A helpful reply' }); expect(model.operations).toBe(1);
});
