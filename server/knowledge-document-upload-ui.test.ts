// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { knowledgeDocumentEn as copy } from '../client/src/locales/knowledge-document';
import { knowledgeIntakeEn as intake } from '../client/src/locales/knowledge-intake';
const api = vi.hoisted(() => ({ fetch: vi.fn(), receipt: vi.fn(), invalidate: vi.fn(), reprocess: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => (key.includes('.knowledgeDocument.') ? copy : intake)[key.split('.').at(-1) as keyof typeof copy] || key }) }));
vi.mock('@/lib/merchant-selection', () => ({ selectedMerchantId: () => '20' }));
vi.mock('@/lib/trpc', () => ({ trpc: {
  useUtils: () => ({ knowledgeDocs: { invalidate: api.invalidate }, sariBrain: { getSources: { invalidate: api.invalidate }, getActivityLog: { invalidate: api.invalidate }, getIntakeReceipt: { fetch: api.receipt } } }),
  knowledgeDocs: { reprocess: { useMutation: () => ({ mutateAsync: api.reprocess }) }, reviewSource: { useQuery: () => ({}) } },
} }));
import { KnowledgeDocumentUpload } from '../client/src/components/KnowledgeDocumentUpload';
let root: Root, container: HTMLDivElement;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', api.fetch); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = (props = {}) => act(async () => root.render(React.createElement(KnowledgeDocumentUpload, props)));
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!;
const click = (label: string) => act(async () => { expect(button(label)).toBeTruthy(); button(label).click(); });
const select = (name = 'Example.pdf', bytes = '%PDF-1.7\nexample') => act(async () => {
  const el = container.querySelector('input[type="file"]')!; Object.defineProperty(el, 'files', { configurable: true, value: [new File([bytes], name, { type: 'application/pdf' })] }); el.dispatchEvent(new Event('change', { bubbles: true }));
});
const saved = (requestId: string, issue?: string) => ({ requestId, documentId: 8, state: 'empty', outcome: null, createdAt: '2026-09-29 01:00:00', updatedAt: '2026-09-29 01:00:00', review: null,
  document: { fileName: 'Example.pdf', fileType: 'pdf', sourceDocumentId: null, extraction: issue ? 'failed' : 'extracted', characters: issue ? null : 25, issue: issue || null, originalStored: !issue } });
it('validates empty/unsupported files without uploading and waits for an explicit extraction action', async () => {
  await render(); await select('bad.exe'); expect(container.textContent).toContain(copy.fileError); expect(button(copy.start).disabled).toBe(true);
  await select('Empty.pdf', ''); expect(button(copy.start).disabled).toBe(true);
  await select(); expect(api.fetch).not.toHaveBeenCalled(); expect(button(copy.start).disabled).toBe(false);
});
it('sends the selected store and request reference, then offers review without claiming activated knowledge', async () => {
  api.fetch.mockImplementation(async (_url, options) => ({ ok: true, json: async () => ({ receipt: saved(options.headers['x-knowledge-request-id']) }) }));
  await render(); await select(); await click(copy.start);
  expect(api.fetch).toHaveBeenCalledTimes(1); expect(api.fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include', headers: { 'x-merchant-id': '20', 'x-knowledge-request-id': expect.stringMatching(/^[a-f0-9-]{36}$/) } });
  expect(api.fetch.mock.calls[0][1].body.get('fileName')).toBe('Example.pdf');
  expect(container.textContent).toContain(copy.ready); expect(container.textContent).toContain(copy.extractionOnly); expect(button(copy.review)).toBeTruthy(); expect(button(copy.start)).toBeUndefined();
});
it('keeps the same reference after a lost response and a throttled retry, and recovers by reading', async () => {
  api.fetch.mockRejectedValueOnce(Error('connection lost')).mockResolvedValueOnce({ ok: false, status: 429 });
  await render(); await select(); await click(copy.start);
  const requestId = api.fetch.mock.calls[0][1].headers['x-knowledge-request-id']; expect(container.textContent).toContain(copy.unknown);
  await click(copy.retrySame); expect(api.fetch.mock.calls[1][1].headers['x-knowledge-request-id']).toBe(requestId); expect(button(copy.choose).disabled).toBe(true);
  api.receipt.mockResolvedValue(saved(requestId)); await click(intake.receiptRefresh);
  expect(api.receipt).toHaveBeenCalledWith({ requestId }); expect(api.fetch).toHaveBeenCalledTimes(2); expect(container.textContent).toContain(copy.ready);
});
it('distinguishes a confirmed extraction failure from a saved text and never offers its review', async () => {
  api.fetch.mockImplementation(async (_url, options) => ({ ok: true, json: async () => ({ receipt: saved(options.headers['x-knowledge-request-id'], 'too_large') }) }));
  await render(); await select(); await click(copy.start);
  expect(container.textContent).toContain(copy.failed); expect(container.textContent).toContain(copy.tooLarge); expect(button(copy.review)).toBeUndefined(); expect(container.textContent).not.toContain(copy.ready);
});
it('re-extracts the selected original using a new request and blocks duplicate clicks while pending', async () => {
  let resolve!: (result: unknown) => void; api.reprocess.mockImplementation(() => new Promise(r => { resolve = r; }));
  await render({ sourceDocumentId: 30 }); await click(copy.start); expect(button(copy.working).disabled).toBe(true); await click(copy.working);
  const input = api.reprocess.mock.calls[0][0]; expect(input).toMatchObject({ id: 30, requestId: expect.any(String) }); expect(api.reprocess).toHaveBeenCalledTimes(1);
  await act(async () => resolve(saved(input.requestId))); expect(button(copy.review)).toBeTruthy(); expect(api.fetch).not.toHaveBeenCalled();
});
