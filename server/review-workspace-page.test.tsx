// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { reviewWorkspaceEn as en, reviewWorkspaceAr as ar } from '../client/src/locales/review-workspace';
import { projectReview } from './review-workspace';
const m = vi.hoisted(() => ({ actor: 7, merchant: 20, language: 'en', kind: 'order', source: [] as any[], override: {} as any,
  selection: {} as any, error: null as any, fetching: false, writable: true, refresh: vi.fn(), detail: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/trpc', () => {
  const api = (kind: string) => ({ workspace: { useQuery: (selection: any, options: any) => { if (options?.enabled === false) return { data: undefined, refetch: m.refresh }; m.kind = kind; m.selection = selection; return { data: snapshot(), error: m.error, isFetching: m.fetching, refetch: m.refresh }; } }, saveReply: { useMutation: () => ({ mutateAsync: m.save }) } });
  return { trpc: { auth: { me: { useQuery: () => ({ data: { id: m.actor } }) } }, merchants: { getCurrent: { useQuery: () => ({ data: { id: m.merchant } }) } },
    reviews: api('order'), bookingReviews: api('booking'), useUtils: () => ({ reviews: { detail: { fetch: m.detail } }, bookingReviews: { detail: { fetch: m.detail } } }) } };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: m.language }, t: (key: string) => (m.language === 'ar' ? ar : en)[key.split('.').pop() as keyof typeof en] ?? key }) }));
import Reviews from '../client/src/pages/merchant/Reviews';
import BookingReviews from '../client/src/pages/merchant/BookingReviews';
const row = (id = 1, kind = 'order') => projectReview({ id, merchant_id: 20, record_id: 3, product_id: null, service_id: kind === 'booking' ? 4 : null, staff_id: null,
  customer_name: 'Synthetic customer', customer_phone: '+966500000000', rating: 4, comment: '<img src=x onerror=alert(1)>', merchant_reply: null,
  is_public: 1, created_at: '2026-10-03 09:00:00', updated_at: '2026-10-03 09:00:00', replied_at: null, linked_record_id: 3, record_label: 'ORDER-1',
  linked_product_id: null, product_name: null, linked_service_id: kind === 'booking' ? 4 : null, service_name: kind === 'booking' ? 'Service example' : null,
  linked_staff_id: null, staff_name: null, quality: kind === 'booking' ? 5 : null, professionalism: kind === 'booking' ? 4 : null, value: kind === 'booking' ? 3 : null, is_linked: 1 }, kind as any);
function snapshot() {
  const s = m.selection, rows = m.source, filtered = rows.filter(r => (!s.query || r.customerName?.includes(s.query)) && (s.rating === null || s.rating === r.rating)
    && (s.reply === 'all' || s.reply === r.replyState) && (s.integrity === 'all' || s.integrity === r.integrity)
    && (s.visibility === 'all' || s.visibility === (r.isPublic === null ? 'unknown' : r.isPublic ? 'public' : 'private')));
  const linked = rows.filter(r => r.integrity === 'linked'), rated = linked.filter(r => r.rating !== null), pages = Math.ceil(filtered.length / 25), currentPage = Math.min(s.page, Math.max(1, pages));
  return { actorId: m.actor, merchantId: m.merchant, kind: m.kind, checkedAt: new Date().toISOString(), canReply: m.writable, selection: s,
    stats: { total: rows.length, linked: linked.length, unlinked: rows.length - linked.length, rated: rated.length, invalidRatings: linked.length - rated.length,
      average: rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : null, pending: linked.filter(r => r.replyState === 'pending').length, replied: linked.filter(r => r.replyState === 'replied').length,
      public: linked.filter(r => r.isPublic === true).length, private: linked.filter(r => r.isPublic === false).length, unknownVisibility: linked.filter(r => r.isPublic === null).length,
      distribution: Object.fromEntries([1, 2, 3, 4, 5].map(n => [n, rated.filter(r => r.rating === n).length])) },
    matched: filtered.length, pages, currentPage, pageSize: 25, rows: filtered.slice((currentPage - 1) * 25, currentPage * 25), evidence: 'recorded_reviews', salesAttribution: 'not_verified', ...m.override };
}
const detail = (id = 1) => ({ actorId: m.actor, merchantId: m.merchant, kind: m.kind, checkedAt: new Date().toISOString(), canReply: m.writable, row: m.source.find(r => r.id === id) });
let root: Root, container: HTMLDivElement, memory: ReturnType<typeof memoryLocation>, booking = false;
const render = () => act(async () => { root.render(<Router hook={memory.hook} searchHook={memory.searchHook}>{booking ? <BookingReviews /> : <Reviews />}</Router>); });
const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(n => n.textContent?.trim().startsWith(text))!;
const click = (text: string) => act(async () => { expect(button(text)).toBeTruthy(); button(text).click(); });
const fill = (value: string) => act(async () => { const el = document.getElementById('rw-reply') as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true }); vi.resetAllMocks(); booking = false;
  Object.assign(m, { actor: 7, merchant: 20, language: 'en', kind: 'order', source: [row()], override: {}, error: null, fetching: false, writable: true });
  m.detail.mockImplementation(async ({ id }) => detail(id)); m.refresh.mockImplementation(async () => ({ data: snapshot() }));
  m.save.mockImplementation(async value => { const r = m.source.find(r => r.id === value.id); Object.assign(r, { merchantReply: value.reply, replyState: 'replied', revision: 'b'.repeat(64), repliedAt: '2026-10-03T09:01:00.000Z' }); return { ...detail(value.id), effect: 'saved', sendsMessage: false }; });
  memory = memoryLocation({ path: '/merchant/reviews', record: true }); container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
for (const kind of ['order', 'booking']) for (const language of ['ar', 'en']) it(`shows the actual ${kind} page and complete literal details in ${language}`, async () => {
  booking = kind === 'booking'; m.source = [row(1, kind)]; m.language = language; const c = language === 'ar' ? ar : en;
  await render(); expect(container.textContent).toContain(booking ? c.bookingTitle : c.orderTitle); expect(container.textContent).not.toContain('merchantUx.');
  await click(c.details); expect(document.querySelector('[role=dialog]')?.textContent).toContain('<img src=x onerror=alert(1)>'); expect(document.querySelector('img')).toBeNull();
  expect(document.body.textContent).toContain(c.replyHelp); expect(document.activeElement?.textContent).toBe(c.details);
  if (booking) expect(document.body.textContent).toContain(c.professionalism);
});
it('shows field errors next to the input, focuses it, and prevents invalid saves', async () => {
  await render(); await click(en.details); await click(en.save); expect(document.body.textContent).toContain(en.required); expect(document.activeElement?.id).toBe('rw-reply');
  await fill('x'.repeat(1001)); await click(en.save); expect(document.body.textContent).toContain(en.tooLong); expect(m.save).not.toHaveBeenCalled();
});
it('saves trimmed text against the displayed revision and displays the returned saved reply', async () => {
  const revision = m.source[0].revision; await render(); await click(en.details); await fill('  Helpful answer  '); await click(en.save);
  expect(m.save).toHaveBeenCalledWith({ id: 1, revision, reply: 'Helpful answer' }); expect(document.body.textContent).toContain(en.saved); expect(document.querySelector('.rw-saved')?.textContent).toContain('Helpful answer');
  expect(document.activeElement?.textContent).toBe(en.saved); expect(document.getElementById('rw-reply')?.getAttribute('aria-labelledby')).toBe('rw-reply-label');
});
it('checks the current state after an unknown save without issuing a second mutation', async () => {
  m.save.mockImplementation(async () => { Object.assign(m.source[0], { merchantReply: 'Landed', replyState: 'replied', revision: 'c'.repeat(64) }); throw Error('lost'); });
  await render(); await click(en.details); await fill('Landed'); await click(en.save);
  expect(document.body.textContent).toContain(en.uncertain); expect(document.getElementById('rw-reply')).toHaveProperty('disabled', true);
  await click(en.check); expect(document.querySelector('.rw-saved')?.textContent).toContain('Landed'); expect(document.body.textContent).toContain(en.checked); expect(m.save).toHaveBeenCalledOnce();
});
it('requires a fresh read after a conflict and preserves the current saved response', async () => {
  m.save.mockImplementation(async () => { Object.assign(m.source[0], { merchantReply: 'Another editor', replyState: 'replied', revision: 'd'.repeat(64) }); throw { data: { code: 'CONFLICT' } }; });
  await render(); await click(en.details); await fill('My change'); await click(en.save); expect(document.body.textContent).toContain(en.stale);
  await click(en.check); expect(document.getElementById('rw-reply')).toHaveProperty('value', 'Another editor'); expect(m.save).toHaveBeenCalledOnce();
});
it('hides all write controls for viewers while still showing the existing reply', async () => {
  m.writable = false; Object.assign(m.source[0], { merchantReply: 'Saved before', replyState: 'replied' }); await render(); await click(en.details);
  expect(document.body.textContent).toContain('Saved before'); expect(document.getElementById('rw-reply')).toBeNull(); expect(button(en.save)).toBeUndefined();
});
it('does not render foreign list data or stale successful data beside an error', async () => {
  m.override = { merchantId: 999 }; await render(); expect(container.textContent).not.toContain('Synthetic customer');
  m.override = {}; m.error = Error('Database'); await render(); expect(container.textContent).not.toContain('Synthetic customer');
});
it('does not display a foreign detail or accept a foreign action response', async () => {
  m.detail.mockResolvedValue({ ...detail(), merchantId: 999 }); await render(); await click(en.details);
  expect(document.querySelector('[role=dialog]')?.textContent).not.toContain('+966500000000'); expect(button(en.save)).toBeUndefined();
  m.detail.mockImplementation(async () => detail()); await click(en.check); await fill('Safe'); m.save.mockResolvedValue({ ...detail(), merchantId: 999, effect: 'saved', sendsMessage: false }); await click(en.save);
  expect(document.body.textContent).not.toContain(en.saved); expect(document.body.textContent).toContain(en.uncertain);
});
it('finds all rows beyond the old fifty-row limit and preserves URL selection', async () => {
  m.source = Array.from({ length: 105 }, (_, i) => row(i + 1)); await render(); expect(container.querySelectorAll('.rw-card')).toHaveLength(25);
  for (let i = 0; i < 4; i++) await click(en.next); expect(container.querySelectorAll('.rw-card')).toHaveLength(5); expect(m.selection.page).toBe(5);
  await act(async () => memory.navigate('/merchant/reviews?rating=4&reply=pending&visibility=public&integrity=linked&sort=oldest&q=Synthetic'));
  expect(m.selection).toMatchObject({ page: 1, rating: 4, reply: 'pending', visibility: 'public', integrity: 'linked', sort: 'oldest', query: 'Synthetic' });
  expect(container.textContent).toContain('105');
});
it('discards an old tenant response after switching the selected merchant', async () => {
  let finish!: (v: any) => void; m.save.mockImplementation(() => new Promise(r => finish = r));
  await render(); await click(en.details); await fill('Pending'); await click(en.save); const saved = { ...detail(), effect: 'saved', sendsMessage: false, row: { ...m.source[0], merchantReply: 'Pending', replyState: 'replied' } };
  m.merchant = 21; await render(); await act(async () => finish(saved)); expect(document.body.textContent).not.toContain(en.saved); expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('serializes double clicks during a write', async () => {
  let finish!: (v: any) => void; m.save.mockImplementation(() => new Promise(r => finish = r));
  await render(); await click(en.details); await fill('Once'); await act(async () => { button(en.save).click(); button(en.save).click(); }); expect(m.save).toHaveBeenCalledOnce();
  await act(async () => finish({ ...detail(), effect: 'saved', sendsMessage: false, row: { ...m.source[0], merchantReply: 'Once', replyState: 'replied' } })); expect(document.body.textContent).toContain(en.saved);
});
