import { createHash, randomUUID } from 'node:crypto';
import { clearKnowledgeWorkspace } from '../client/src/lib/knowledge-workspace-cache';
import { knowledgeDraftEn as draftCopy } from '../client/src/locales/knowledge-draft';
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { knowledgeDocumentEn as copy } from '../client/src/locales/knowledge-document';
import { knowledgeIntakeEn as intake } from '../client/src/locales/knowledge-intake';
const api = vi.hoisted(() => ({ fetch: vi.fn(), receipt: vi.fn(), invalidate: vi.fn(), reprocess: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => (key.includes('.knowledgeDraft.') ? draftCopy : key.includes('.knowledgeDocument.') ? copy : intake)[key.split('.').at(-1) as keyof typeof copy] || key }) }));
vi.mock('@/lib/merchant-selection', () => ({ selectedMerchantId: () => '20' }));
vi.mock('@/lib/trpc', () => ({ trpc: { auth: { me: { useQuery: () => ({ data: { id: 10 } }) } }, merchants: { getCurrent: { useQuery: () => ({ data: { id: 20 } }) } },
  useUtils: () => ({ knowledgeDocs: { invalidate: api.invalidate }, sariBrain: { getSources: { invalidate: api.invalidate }, getActivityLog: { invalidate: api.invalidate }, getIntakeReceipt: { fetch: api.receipt } } }),
  knowledgeDocs: { reprocess: { useMutation: () => ({ mutateAsync: api.reprocess }) }, reviewSource: { useQuery: () => ({}) } },
} }));
import { KnowledgeDocumentUpload } from '../client/src/components/KnowledgeDocumentUpload';
let root: Root, container: HTMLDivElement;
beforeEach(() => { clearKnowledgeWorkspace(); sessionStorage.clear(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', api.fetch); vi.stubGlobal('crypto', { randomUUID, subtle: { digest: async (_algorithm: string, bytes: Uint8Array) => Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer } }); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = (props = {}) => act(async () => root.render(React.createElement(KnowledgeDocumentUpload, props)));
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!;
const click = (label: string) => act(async () => { expect(button(label)).toBeTruthy(); button(label).click(); });
const select = (name = 'Example.pdf', bytes = '%PDF-1.7\nexample') => act(async () => {
  const chosen = new File([bytes], name, { type: 'application/pdf' }); Object.defineProperty(chosen, 'arrayBuffer', { value: async () => new TextEncoder().encode(bytes).buffer });
  const el = container.querySelector('input[type="file"]')!; Object.defineProperty(el, 'files', { configurable: true, value: [chosen] }); el.dispatchEvent(new Event('change', { bubbles: true }));
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
  expect(api.receipt).toHaveBeenCalledWith({ requestId }, { staleTime: 0 }); expect(api.fetch).toHaveBeenCalledTimes(2); expect(container.textContent).toContain(copy.ready);
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

const remount = async (props = {}) => { await act(async () => root.unmount()); root = createRoot(container); await render(props); };
it('recovers an interrupted upload reference after remount without requiring or re-uploading its file', async () => {
  api.fetch.mockRejectedValueOnce(Error('Lost response')); await render(); await select(); await click(copy.start);
  const requestId = api.fetch.mock.calls[0][1].headers['x-knowledge-request-id']; await remount();
  expect(container.textContent).toContain(draftCopy.restoreOriginal); expect(button(copy.retrySame)).toBeUndefined(); expect(button(draftCopy.chooseOriginal).disabled).toBe(false);
  api.receipt.mockResolvedValue(null); await click(intake.receiptRefresh); expect(container.textContent).toContain(draftCopy.missingUpload); expect(button(copy.another)).toBeUndefined();
  api.receipt.mockResolvedValue(saved(requestId)); await click(intake.receiptRefresh); expect(api.fetch).toHaveBeenCalledTimes(1); expect(api.receipt).toHaveBeenLastCalledWith({ requestId }, { staleTime: 0 });
  await click(copy.another); expect(button(copy.start).disabled).toBe(true); expect(button(copy.choose).disabled).toBe(false); expect(container.textContent).not.toContain(draftCopy.recoveredUpload);
  await remount(); expect(container.textContent).not.toContain(draftCopy.recoveredUpload);
});
it('never uploads when session storage refuses the request identity', async () => {
  await render(); await select(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Full storage'); });
  await click(copy.start); expect(api.fetch).not.toHaveBeenCalled(); expect(container.textContent).toContain(draftCopy.storageError);
});
it('does not expose one source re-extraction reference on another source', async () => {
  api.reprocess.mockRejectedValue(Error('Lost response')); await render({ sourceDocumentId: 30 }); await click(copy.start);
  const { requestId } = api.reprocess.mock.calls[0][0]; await remount({ sourceDocumentId: 31 }); expect(container.textContent).not.toContain(requestId); expect(button(copy.start)).toBeTruthy();
  await remount({ sourceDocumentId: 30 }); expect(container.textContent).toContain(requestId); expect(api.reprocess).toHaveBeenCalledTimes(1);
});
it('clears a first rejected upload before allowing a new file after navigation', async () => {
  api.fetch.mockResolvedValueOnce({ ok: false, status: 429 }); await render(); await select(); await click(copy.start); await remount();
  expect(button(copy.choose).disabled).toBe(false); expect(container.textContent).not.toContain(draftCopy.recoveredUpload);
});

it('verifies the original bytes and filename before explicitly retrying a recovered upload with the same request', async () => {
  api.fetch.mockRejectedValueOnce(Error('Lost response')).mockResolvedValueOnce({ ok: false, status: 429 });
  await render(); await select(); await click(copy.start); const requestId = api.fetch.mock.calls[0][1].headers['x-knowledge-request-id']; await remount();
  await select('Different.pdf'); expect(container.textContent).toContain(draftCopy.differentFile); expect(api.fetch).toHaveBeenCalledTimes(1);
  await select('Example.pdf', 'Changed file bytes'); expect(container.textContent).toContain(draftCopy.differentFile); expect(button(copy.retrySame)).toBeUndefined();
  await select(); expect(api.fetch).toHaveBeenCalledTimes(1); expect(button(copy.retrySame).disabled).toBe(false);
  await click(copy.retrySame); expect(api.fetch.mock.calls[1][1].headers['x-knowledge-request-id']).toBe(requestId); expect(container.textContent).toContain(copy.unknown);
});
