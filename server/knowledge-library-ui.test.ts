// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { knowledgeLibraryEn as copy } from '../client/src/locales/knowledge-library';
const api = vi.hoisted(() => ({ list: {} as any, read: {} as any, listInput: {} as any, readInput: {} as any, retry: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, vars: any = {}) => (copy[key.split('.').at(-1) as keyof typeof copy] || key).replace(/{{(\w+)}}/g, (_, k) => String(vars[k])) }) }));
vi.mock('@/lib/trpc', () => ({ trpc: { knowledgeDocs: {
  sections: { useQuery: () => ({ data: { available: false } }) },
  list: { useQuery: (input: any) => { api.listInput = input; return { refetch: api.retry, ...api.list }; } },
  readText: { useQuery: (input: any) => { api.readInput = input; return { refetch: api.retry, ...api.read }; } },
} } }));
import { KnowledgeLibrary } from '../client/src/components/KnowledgeLibrary';
let root: Root, container: HTMLDivElement;
const item = { id: 9, fileName: '<img src=x> Source.txt', fileType: 'text', fileSize: 5000, characterCount: 8001, extractionStatus: 'completed', uploadedAt: '2026-09-28', updatedAt: '2026-09-28' };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); api.list = { data: { items: [item], canReadText: true, total: 14, page: 1, totalPages: 2 } }; api.read = { data: { ...item, text: '<script>unsafe</script>', page: 1, totalPages: 3, revision: 'a'.repeat(64) } }; api.readInput = {}; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(React.createElement(KnowledgeLibrary)));
const buttons = (text: string, scope: Element = container) => Array.from(scope.querySelectorAll('button')).filter(button => button.textContent === text);
const click = async (text: string, scope: Element = container) => act(async () => buttons(text, scope)[0].click());
it('shows all registered-file count, extraction status and escaped file names', async () => {
  await render(); expect(container.textContent).toContain('14 matching files'); expect(container.textContent).toContain(copy.completed); expect(container.querySelector('img')).toBeNull();
  await click(copy.next); expect(api.listInput.page).toBe(2);
});
it('submits a literal search and resets to the first page', async () => {
  await render(); await click(copy.next);
  await act(async () => { const el = container.querySelector('input')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '%_'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(copy.searchAction); expect(api.listInput).toMatchObject({ page: 1, search: '%_' });
});
it('keeps error and loading separate from a truly empty library, even with cached data', async () => {
  api.list.isError = true; await render(); expect(container.textContent).toContain(copy.error); expect(container.textContent).not.toContain(item.fileName); expect(container.textContent).not.toContain(copy.empty); await click(copy.retry); expect(api.retry).toHaveBeenCalled();
  api.list = { isLoading: true }; await render(); expect(container.textContent).toContain(copy.loading); expect(container.textContent).not.toContain(copy.empty);
  api.list = { data: { items: [], total: 0, page: 1, totalPages: 1, canReadText: true } }; await render(); expect(container.textContent).toContain(copy.empty);
});
it('does not request source text for a metadata-only role', async () => {
  api.list.data.canReadText = false; await render(); expect(buttons(copy.read)).toHaveLength(0); expect(api.readInput).toEqual({}); expect(container.textContent).toContain(copy.restricted);
});
it('reads escaped text, carries revision across text pages, and restores focus to opener', async () => {
  await render(); const opener = buttons(copy.read)[0]; await click(copy.read);
  const panel = container.querySelector('[data-knowledge-text]')!; expect(document.activeElement).toBe(panel); expect(panel.querySelector('script')).toBeNull(); expect(panel.textContent).toContain('<script>unsafe</script>');
  await click(copy.next, panel); expect(api.readInput).toMatchObject({ id: 9, page: 2, revision: 'a'.repeat(64) });
  await click(copy.close, panel); expect(document.activeElement).toBe(opener);
});
it('hides stale text after conflict and restarts from the current first page', async () => {
  await render(); await click(copy.read); await click(copy.next, container.querySelector('[data-knowledge-text]')!);
  api.read.isError = true; api.read.error = { data: { code: 'CONFLICT' } }; await render(); expect(container.textContent).toContain(copy.changed); expect(container.querySelector('pre')).toBeNull();
  await click(copy.reopen); expect(api.readInput).toEqual({ id: 9, page: 1 });
});
