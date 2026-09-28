// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { knowledgeIntakeEn as copy } from '../client/src/locales/knowledge-intake';
const api = vi.hoisted(() => ({ readReceipt: vi.fn(), analyze: vi.fn(), ingest: vi.fn(), invalidate: vi.fn(), analysisCallbacks: {} as any, ingestCallbacks: {} as any, analyzing: false, saving: false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => copy[key.split('.').at(-1) as keyof typeof copy] || key }) }));
vi.mock('@/lib/trpc', () => ({ trpc: { useUtils: () => ({ knowledgeDocs: { invalidate: api.invalidate }, sariBrain: { getIntakeReceipt: { fetch: api.readReceipt }, ...Object.fromEntries(['getSources', 'getKnowledgeSections', 'getHealthScore', 'getActivityLog', 'getPendingReviews'].map(key => [key, { invalidate: api.invalidate }])) } }), sariBrain: {
  analyzeContent: { useMutation: (callbacks: any) => { api.analysisCallbacks = callbacks; return { mutate: api.analyze, isPending: api.analyzing }; } },
  ingestAnalyzedContent: { useMutation: (callbacks: any) => { api.ingestCallbacks = callbacks; return { mutate: api.ingest, isPending: api.saving }; } },
} } }));
import { KnowledgeIntake } from '../client/src/components/KnowledgeIntake';
let root: Root, container: HTMLDivElement;
const reviewRecord = { id: '00000000-0000-4000-8000-000000000003', createdAt: '2026-09-29 01:00:00', expiresAt: '2026-09-29 01:30:00' };
const report = { contentType: 'general', summary: 'Reviewed', itemCount: 1, conflicts: ['Check old price'], impact: 'Expected effect', riskLevel: 'medium', sampleQA: [], recommendation: 'review', recommendationReason: 'Confirm prices' };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); api.analyzing = false; api.saving = false; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(React.createElement(KnowledgeIntake)));
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!;
const click = (label: string) => act(async () => { expect(button(label)).toBeTruthy(); button(label).click(); });
const fill = (id: string, value: string) => act(async () => { const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(id)!; Object.getOwnPropertyDescriptor(el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
const reviewed = () => act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
const analyze = async () => { await fill('#knowledge-content', 'Complete text for review'); await click(copy.analyze); await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: report })); };
it('shows field-specific errors, focuses the first error, and never submits invalid text', async () => { await render(); await click(copy.analyze); expect(document.activeElement?.id).toBe('knowledge-content'); expect(container.textContent).toContain(copy.contentError); await fill('#knowledge-name', 'x'.repeat(256)); await fill('#knowledge-content', 'x'.repeat(30_001)); await click(copy.analyze); expect(document.activeElement?.id).toBe('knowledge-name'); expect(api.analyze).not.toHaveBeenCalled(); });
it('keeps the text and exposes a failed analysis without showing an approval action', async () => { await render(); await fill('#knowledge-content', 'Complete text for review'); await click(copy.analyze); await act(async () => api.analysisCallbacks.onError()); expect(container.textContent).toContain(copy.analysisError); expect((container.querySelector('#knowledge-content') as HTMLTextAreaElement).value).toBe('Complete text for review'); expect(button(copy.save)).toBeUndefined(); });
it('requires review, invalidates it after edits, and prevents duplicate saves after success', async () => { await render(); await analyze(); expect(button(copy.save).disabled).toBe(true); await reviewed(); await fill('#knowledge-content', 'Changed source for another review'); expect(button(copy.save)).toBeUndefined(); await click(copy.analyze); await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: report })); expect(button(copy.save).disabled).toBe(true); await reviewed(); await click(copy.save); expect(api.ingest).toHaveBeenCalledTimes(1); await act(async () => api.ingestCallbacks.onSuccess({ requestId: '5b9b36a2-79d1-4fa5-b041-000000000001', documentId: 44, state: 'completed', outcome: { success: true, embeddingsReady: false, evolveResult: { added: 1, evolved: 0, conflicts: 1, unchanged: 0 } } })); expect(button(copy.save)).toBeUndefined(); expect(container.textContent).toContain(copy.indexing); expect(container.textContent).toContain(copy.savedHint); });
it('locks editing and duplicate submission during processing', async () => { await render(); await analyze(); await reviewed(); api.saving = true; await render(); expect((container.querySelector('#knowledge-content') as HTMLTextAreaElement).disabled).toBe(true); await click(copy.saving); expect(api.ingest).not.toHaveBeenCalled(); });
it('does not encourage retrying an uncertain save or report it as confirmed', async () => { await render(); await analyze(); await reviewed(); await click(copy.save); await act(async () => api.ingestCallbacks.onError({ data: { code: 'INTERNAL_SERVER_ERROR' } })); expect(container.textContent).toContain(copy.uncertain); expect(container.textContent).not.toContain(copy.saved); expect(button(copy.save)).toBeUndefined(); expect(button(copy.analyze).disabled).toBe(true); });
it('rejects malformed analysis data and renders provider text as text', async () => { await render(); await fill('#knowledge-content', 'Complete text for review'); await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: { ...report, conflicts: 'wrong type' } })); expect(container.textContent).toContain(copy.analysisError); await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: { ...report, summary: '<img src=x onerror=alert(1)>' } })); expect(container.querySelector('img')).toBeNull(); expect(container.textContent).toContain('<img src=x'); });
it('recovers the saved result by reference after a transport failure without submitting another mutation', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save);
  const requestId = api.ingest.mock.calls[0][0].requestId; expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  await act(async () => api.ingestCallbacks.onError({ data: { code: 'INTERNAL_SERVER_ERROR' } }));
  api.readReceipt.mockResolvedValue({ requestId, documentId: 44, state: 'completed', outcome: { success: true, embeddingsReady: false, evolveResult: { added: 3, evolved: 0, conflicts: 1, unchanged: 0 } } });
  await click(copy.receiptRefresh); expect(api.readReceipt).toHaveBeenCalledWith({ requestId });
  expect(api.ingest).toHaveBeenCalledTimes(1); expect(container.textContent).toContain(copy.saved); expect(container.textContent).toContain(copy.indexing);
});
it('keeps an unavailable receipt distinct from a successful or safe-to-retry request', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save);
  await act(async () => api.ingestCallbacks.onError({ data: { code: 'INTERNAL_SERVER_ERROR' } }));
  api.readReceipt.mockResolvedValue(null); await click(copy.receiptRefresh);
  expect(container.textContent).toContain(copy.receiptError); expect(button(copy.save)).toBeUndefined(); expect(button(copy.newContent)).toBeUndefined();
});
it('permits a fresh source only after reading confirmed closure without resubmitting the interrupted content', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save);
  const requestId = api.ingest.mock.calls[0][0].requestId;
  const receipt = { requestId, documentId: 44, state: 'uncertain', outcome: null, recoveredAt: null };
  await act(async () => api.ingestCallbacks.onSuccess(receipt)); expect(button(copy.newContent)).toBeUndefined();
  api.readReceipt.mockResolvedValue({ ...receipt, recoveredAt: '2026-09-29' }); await click(copy.receiptRefresh);
  expect(container.textContent).toContain(copy.recoveryDone); await click(copy.newContent);
  expect((container.querySelector('#knowledge-content') as HTMLTextAreaElement).value).toBe('');
  expect(button(copy.analyze).disabled).toBe(false); expect(api.ingest).toHaveBeenCalledTimes(1);
});
it('preserves input after a confirmed preflight rejection and allows returning to it', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save);
  await act(async () => api.ingestCallbacks.onError({ data: { code: 'TOO_MANY_REQUESTS' } }));
  expect(container.textContent).toContain(copy.receiptRejected); await click(copy.receiptEdit);
  expect((container.querySelector('#knowledge-content') as HTMLTextAreaElement).value).toBe('Complete text for review');
  expect(button(copy.save)).toBeTruthy();
});
it('submits the saved review reference and consent with the reviewed source', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save);
  expect(api.ingest).toHaveBeenCalledWith(expect.objectContaining({ reviewId: reviewRecord.id, acknowledged: true, content: 'Complete text for review' }));
});
it('keeps text after an expired review, requires another analysis and a fresh consent, and never auto-retries intake', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save);
  await act(async () => api.ingestCallbacks.onError({ data: { code: 'PRECONDITION_FAILED' } }));
  expect(container.textContent).toContain(copy.reviewExpired); expect(container.textContent).not.toContain(copy.uncertain); expect(button(copy.save)).toBeUndefined();
  expect((container.querySelector('#knowledge-content') as HTMLTextAreaElement).value).toBe('Complete text for review');
  await click(copy.analyze); await act(async () => api.analysisCallbacks.onSuccess({ review: { ...reviewRecord, id: '00000000-0000-4000-8000-000000000004' }, analysis: report }));
  expect(button(copy.save).disabled).toBe(true); expect(api.ingest).toHaveBeenCalledTimes(1);
  await reviewed(); await click(copy.save); expect(api.ingest.mock.calls[1][0].reviewId).toBe('00000000-0000-4000-8000-000000000004');
});
it('does not offer intake for a report that lacks its saved server reference', async () => {
  await render(); await fill('#knowledge-content', 'Complete text for review'); await click(copy.analyze);
  await act(async () => api.analysisCallbacks.onSuccess({ analysis: report })); expect(container.textContent).toContain(copy.analysisError); expect(button(copy.save)).toBeUndefined();
});
