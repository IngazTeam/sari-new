// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import en from '../client/src/locales/merchant-ux.en';
import ar from '../client/src/locales/merchant-ux.ar';
const m = vi.hoisted(() => ({ actor: 7, merchant: 20, language: 'en', overview: {} as any, data: {} as any, input: {} as any, refresh: vi.fn(), dataRefresh: vi.fn(), change: vi.fn(), request: vi.fn(), lookup: vi.fn() }));
vi.mock('@/lib/trpc', () => ({ trpc: { useUtils: () => ({ byaan: { resyncAttempt: { fetch: m.lookup } } }), auth: { me: { useQuery: () => ({ data: { id: m.actor } }) } }, merchants: { getCurrent: { useQuery: () => ({ data: { id: m.merchant } }) } }, byaan: {
  dashboardOverview: { useQuery: () => m.overview }, dataWorkspace: { useQuery: (input: any) => { m.input = input; return m.data; } }, changeFaq: { useMutation: () => ({ mutateAsync: m.change }) }, requestResync: { useMutation: () => ({ mutateAsync: m.request }) },
} } }));
vi.mock('@/components/ByaanSalesReview', () => ({ ByaanSalesReview: () => <section data-sales-review>Existing sales review and recovery</section> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: m.language }, t: (key: string) => { let value: any = m.language === 'ar' ? ar : en; for (const item of key.split('.').slice(1)) value = value?.[item]; return typeof value === 'string' ? value : key; } }) }));
import ByaanDashboard from '../client/src/pages/ByaanDashboard';
import { saveByaanResync } from '../client/src/lib/byaan-resync-request';
let root: Root, container: HTMLDivElement;
const connection = () => ({ actorId: 7, merchantId: 20, checkedAt: '2026-10-02T12:00:00Z', source: 'byaan', present: true, state: 'configured', tenantDomain: 'academy.example.test', revision: 'a'.repeat(64), verifiedAt: '2026-10-01T12:00:00Z', lastSyncAt: null, hasSyncErrors: false, managedContent: true, blockingPlatforms: [], counts: { catalog: 601, activeTrainees: 503, activeFaqs: 30, sitePages: 5 } });
const faq = () => ({ id: 3, merchantId: 20, kind: 'faqs', state: 'included', syncedAt: null, question: 'Question', answer: '<script>unsafe()</script> Answer', category: null, isActive: true, useInBot: true, revision: 'b'.repeat(64) });
const data = (kind = 'faqs') => ({ actorId: 7, merchantId: 20, checkedAt: '2026-10-02T12:00:00Z', selection: { search: '', page: 1, kind, state: 'all' }, summary: { stored: 1, matched: 1, groups: kind === 'faqs' ? [{ key: 'included', count: 1 }, { key: 'excluded', count: 0 }, { key: 'disabled', count: 0 }, { key: 'unknown', count: 0 }] : [{ key: 'content', count: 1 }, { key: 'empty', count: 0 }] }, pagination: { page: 1, pages: 1, pageSize: 25, total: 1 }, rows: kind === 'faqs' ? [faq()] : [{ id: 3, merchantId: 20, syncedAt: null, kind: 'site', state: 'content', pageType: 'about', title: 'Academy', content: '<script>unsafe()</script>' }] });
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true }); vi.resetAllMocks(); sessionStorage.clear(); m.actor = 7; m.merchant = 20; m.language = 'en';
  m.overview = { data: { connection: connection(), access: { trainees: true, faqs: true, site: true, sales: true, integrations: true }, lastRequest: null }, refetch: m.refresh };
  m.data = { data: data(), refetch: m.dataRefresh }; m.refresh.mockImplementation(async () => ({ data: m.overview.data })); m.dataRefresh.mockImplementation(async () => ({ data: m.data.data }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = async () => act(async () => root.render(<Router hook={memoryLocation({ path: '/merchant/byaan-dashboard' }).hook}><ByaanDashboard/></Router>));
const buttons = (text: string) => Array.from(document.querySelectorAll('button')).filter(node => node.textContent === text);
const click = async (text: string) => act(async () => { expect(buttons(text).length).toBeGreaterThan(0); buttons(text)[0].click(); });
it.each(['ar','en'])('renders all five sections, full counts and translated copy in %s', async lang => {
  m.language = lang; await render(); const copy = (lang === 'ar' ? ar : en).byaanData;
  expect(container.querySelectorAll('h1')).toHaveLength(1); expect(container.querySelectorAll('.bd-tabs button')).toHaveLength(5); expect(container.querySelectorAll('.bd-summary dd')).toHaveLength(4); expect(container.textContent).toContain(copy.sourceHint); expect(container.textContent).not.toContain('merchantUx.'); expect(m.request).not.toHaveBeenCalled();
});
it.each(['actorId','merchantId'])('hides mismatched overview %s', async key => { m.overview.data.connection[key] = 99; await render(); expect(container.querySelector('[data-byaan-data]')).toBeNull(); });
it.each(['FORBIDDEN','UNAUTHORIZED','INTERNAL_SERVER_ERROR'])('hides stale records on %s', async code => { m.overview.error = { data: { code }, message: 'PRIVATE' }; await render(); expect(container.textContent).not.toContain('academy'); expect(container.textContent).not.toContain('PRIVATE'); });
it('removes unauthorized tabs and controls while preserving the overview', async () => { m.overview.data.access = { trainees: false, faqs: false, site: false, sales: false, integrations: false }; await render(); expect(container.querySelectorAll('.bd-tabs button')).toHaveLength(1); expect(buttons(en.byaanData.resync)).toHaveLength(0); });
it('keeps stored counts with disabled connection and does not fetch protected data', async () => { m.overview.data.connection.state = 'disabled'; await render(); await click(en.byaanData.faqs); expect(container.textContent).toContain(en.byaanData.connectionRequired); expect(container.querySelector('.sc-filters')).toBeNull(); });
it('shows plain-text site content, with no executable markup', async () => { m.data.data = data('site'); await render(); await click(en.byaanData.site); await click(en.byaanData.details); expect(document.querySelector('[role=dialog]')!.textContent).toContain('<script>unsafe()</script>'); expect(document.querySelector('[role=dialog] script')).toBeNull(); });
it('preserves the sales review and enrollment recovery section', async () => { await render(); await click(en.byaanData.sales); expect(container.querySelector('[data-sales-review]')).not.toBeNull(); });
it.each(['actorId','merchantId'])('rejects cross-scope %s list data', async key => { m.data.data[key] = 99; await render(); await click(en.byaanData.faqs); expect(container.textContent).not.toContain('Question'); });
it('requires a review and cancellation sends nothing', async () => { await render(); await click(en.byaanData.faqs); await click(en.byaanData.exclude); expect(document.body.textContent).toContain(en.byaanData.knowledgeReview); expect(m.change).not.toHaveBeenCalled(); await click(en.byaanData.cancel); expect(m.change).not.toHaveBeenCalled(); });
it('sends the reviewed version and confirms the persisted choice', async () => {
  m.change.mockResolvedValue({ actorId: 7, merchantId: 20, faqId: 3, success: true }); m.dataRefresh.mockImplementation(async () => { const next = data(); next.rows[0] = { ...faq(), state: 'excluded', useInBot: false, revision: 'c'.repeat(64) }; next.summary.groups[0].count = 0; next.summary.groups[1].count = 1; m.data.data = next; return { data: next }; });
  await render(); await click(en.byaanData.faqs); await click(en.byaanData.exclude); await click(en.byaanData.confirm);
  expect(m.change).toHaveBeenCalledWith({ faqId: 3, revision: 'b'.repeat(64), field: 'use_in_bot', value: false }); expect(container.textContent).toContain(en.byaanData.saved);
});
it('rejects a changed version while its review is open', async () => { await render(); await click(en.byaanData.faqs); await click(en.byaanData.exclude); m.data.data.rows[0].revision = 'c'.repeat(64); await render(); expect(buttons(en.byaanData.confirm)[0].disabled).toBe(true); expect(document.body.textContent).toContain(en.byaanData.changed); });
it('blocks an uncertain write and hides raw errors until scoped refresh', async () => {
  m.change.mockRejectedValue(Error('PRIVATE')); await render(); await click(en.byaanData.faqs); await click(en.byaanData.exclude); await click(en.byaanData.confirm); expect(container.textContent).toContain(en.byaanData.uncertain); expect(buttons(en.byaanData.exclude)[0].disabled).toBe(true); expect(container.textContent).not.toContain('PRIVATE');
  await act(async () => buttons(en.byaanData.refresh).at(-1)!.click()); expect(buttons(en.byaanData.exclude)[0].disabled).toBe(false);
});
it('does not claim success when the refreshed choice still has its old value', async () => { m.change.mockResolvedValue({ actorId: 7, merchantId: 20, faqId: 3, success: true }); await render(); await click(en.byaanData.faqs); await click(en.byaanData.exclude); await click(en.byaanData.confirm); expect(container.textContent).toContain(en.byaanData.uncertain); expect(container.textContent).not.toContain(en.byaanData.saved); });
it('hides open details if access fails during refresh', async () => { await render(); await click(en.byaanData.faqs); await click(en.byaanData.details); m.data.error = { data: { code: 'FORBIDDEN' } }; await render(); expect(document.querySelector('[role=dialog]')).toBeNull(); expect(container.textContent).not.toContain('Question'); });
it('persists the resync id before dispatch and treats queue acknowledgement as incomplete', async () => {
  m.request.mockImplementation(async (input: any) => { expect(sessionStorage.getItem('sari:byaan:resync:7:20')).toContain(input.requestId); return { ...input, actorId: 7, merchantId: 20, outcome: 'queued', createdAt: '2026-10-02T12:00:00Z', replayed: false }; });
  await render(); await click(en.byaanData.resync); expect(m.request).not.toHaveBeenCalled(); await click(en.byaanData.request); expect(container.textContent).toContain(en.byaanData.queued); expect(sessionStorage.getItem('sari:byaan:resync:7:20')).toBeNull(); expect(m.request).toHaveBeenCalledOnce();
});
it('recovers a pending request without automatically sending a POST', async () => {
  const input = { requestId: '3bc2a3e4-8589-4d5f-a0f7-68be3fe727ea', revision: 'a'.repeat(64) }; saveByaanResync(sessionStorage, 7, 20, input);
  m.lookup.mockResolvedValue({ ...input, actorId: 7, merchantId: 20, outcome: 'queued', createdAt: '2026-10-02T12:00:00Z', replayed: true }); await render(); expect(m.request).not.toHaveBeenCalled(); await click(en.byaanData.recover); expect(m.lookup).toHaveBeenCalledWith({ requestId: input.requestId }); expect(container.textContent).toContain(en.byaanData.queued); expect(m.request).not.toHaveBeenCalled();
});
it('keeps an uncertain request id and reuses it on an intentional continuation', async () => {
  m.request.mockRejectedValue(Error('PRIVATE')); await render(); await click(en.byaanData.resync); await click(en.byaanData.request); const first = m.request.mock.calls[0][0]; expect(container.textContent).toContain(en.byaanData.resyncUnknown); await click(en.byaanData.retrySame); await click(en.byaanData.request); expect(m.request.mock.calls[1][0]).toEqual(first);
});
it('allows ending local tracking after the connection changes without claiming cancellation', async () => {
  saveByaanResync(sessionStorage, 7, 20, { requestId: '3bc2a3e4-8589-4d5f-a0f7-68be3fe727ea', revision: 'c'.repeat(64) }); await render();
  expect(buttons(en.byaanData.retrySame)[0].disabled).toBe(true); expect(container.textContent).toContain(en.byaanData.stopTrackingHint);
  await click(en.byaanData.stopTracking); expect(sessionStorage.getItem('sari:byaan:resync:7:20')).toBeNull(); expect(m.request).not.toHaveBeenCalled(); expect(buttons(en.byaanData.resync)[0].disabled).toBe(false);
});
it('does not send if storing the request reference fails', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Storage disabled'); });
  try { await render(); await click(en.byaanData.resync); await click(en.byaanData.request); expect(container.textContent).toContain(en.byaanData.storage); expect(m.request).not.toHaveBeenCalled(); } finally { storage.mockRestore(); }
});
it('ignores a late FAQ save after switching tenant', async () => {
  let finish!: (value: any) => void; m.change.mockImplementation(() => new Promise(resolve => { finish = resolve; })); await render(); await click(en.byaanData.faqs); await click(en.byaanData.exclude); await click(en.byaanData.confirm);
  m.merchant = 21; m.overview.data.connection = { ...connection(), merchantId: 21, tenantDomain: 'other.example.test' }; await render();
  await act(async () => finish({ actorId: 7, merchantId: 20, faqId: 3, success: true })); expect(container.textContent).not.toContain(en.byaanData.saved); expect(m.dataRefresh).not.toHaveBeenCalled();
});
