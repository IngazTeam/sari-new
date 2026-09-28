// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { knowledgeLibraryEn as copy } from '../client/src/locales/knowledge-library';
const api = vi.hoisted(() => ({ query: {} as any, input: {} as any, retry: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, vars: any = {}) => (copy[key.split('.').at(-1) as keyof typeof copy] || key).replace(/{{(\w+)}}/g, (_, k) => String(vars[k])) }) }));
vi.mock('@/lib/trpc', () => ({ trpc: { knowledgeDocs: { sections: { useQuery: (input: any) => { api.input = input; return { refetch: api.retry, ...api.query }; } } } } }));
import { KnowledgeDocumentSections } from '../client/src/components/KnowledgeDocumentSections';
let root: Root, container: HTMLDivElement;
const item = { planIndex: 0, sectionId: 33, action: 'unchanged', contentChanged: false, settingsChanged: false, saved: { title: 'Saved <img>', content: '<script>saved</script>', summary: 'Saved summary' }, current: { title: 'Current <img>', content: '<script>current</script>', summary: 'Current summary', status: 'pending_review', useInBot: false, injectAs: 'none', parentId: null, validUntil: null } };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api.query = { data: { available: true, total: 7, page: 1, totalPages: 2, items: [structuredClone(item)] } };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(React.createElement(KnowledgeDocumentSections, { documentId: 8 })));
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(el => el.textContent === label)!;
it('distinguishes a pre-existing unchanged link and escapes current and saved content', async () => {
  await render(); expect(api.input).toEqual({ id: 8, page: 1 });
  expect(container.textContent).toContain(copy.linkUnchanged); expect(container.textContent).toContain(copy.linkSame);
  expect(container.textContent).toContain('<script>current</script>'); expect(container.querySelector('script, img')).toBeNull();
  expect(container.textContent).toContain(copy.linkPending); expect(container.textContent).toContain(copy.linkDisabled);
  expect(Array.from(container.querySelectorAll('details')).every(el => !el.open)).toBe(true);
});
it('shows text changes separately from settings and preserves saved text for removed sections', async () => {
  api.query.data.items[0].settingsChanged = true; await render();
  expect(container.textContent).toContain(copy.linkSettingsChanged); expect(container.textContent).not.toContain(copy.linkContentChanged);
  api.query.data.items[0].contentChanged = true; await render(); expect(container.textContent).toContain(copy.linkContentChanged);
  api.query.data.items[0] = { ...item, current: null, contentChanged: null, settingsChanged: null }; await render();
  expect(container.textContent).toContain(copy.linkRemoved); expect(container.textContent).toContain('<script>saved</script>'); expect(container.textContent).not.toContain('<script>current</script>');
  expect(container.textContent).not.toContain(copy.linkSettings);
});
it('never confuses unavailable history, loading, read failure and an empty saved plan', async () => {
  api.query = { data: { available: false } }; await render(); expect(container.textContent).toContain(copy.linksUnavailable); expect(container.textContent).not.toContain(copy.linksEmpty);
  api.query = { isLoading: true }; await render(); expect(container.textContent).toContain(copy.linksLoading);
  api.query = { data: { available: true, total: 0, items: [], page: 1, totalPages: 1 } }; await render(); expect(container.textContent).toContain(copy.linksEmpty);
  api.query.isError = true; await render(); expect(container.textContent).toContain(copy.linksError); expect(container.textContent).not.toContain(copy.linksEmpty);
  await act(async () => button(copy.linksRefresh).click()); expect(api.retry).toHaveBeenCalledOnce();
});
it('hides stale section text on read failure or revoked access and shows a deleted document message', async () => {
  api.query.isError = true; api.query.error = { data: { code: 'FORBIDDEN' } }; await render();
  expect(container.textContent).not.toContain('<script>current</script>'); expect(container.textContent).toContain(copy.linksError);
  api.query.error.data.code = 'NOT_FOUND'; await render(); expect(container.textContent).toContain(copy.missing);
});
it('paginates without enabling concurrent requests', async () => {
  await render(); expect(button(copy.previous).disabled).toBe(true);
  await act(async () => button(copy.next).click()); expect(api.input).toEqual({ id: 8, page: 2 });
  api.query.isFetching = true; await render(); expect(button(copy.next).disabled).toBe(true); expect(button(copy.linksRefresh).disabled).toBe(true);
  api.query = { data: { ...api.query.data, page: 2 } }; await render(); expect(document.activeElement).toBe(container.querySelector('h3'));
});
