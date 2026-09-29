import { clearKnowledgeWorkspace } from '../client/src/lib/knowledge-workspace-cache';
import { knowledgeDraftEn as draftCopy } from '../client/src/locales/knowledge-draft';
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { knowledgeIntakeEn as copy } from '../client/src/locales/knowledge-intake';
const api = vi.hoisted(() => ({ readReceipt: vi.fn(), analyze: vi.fn(), ingest: vi.fn(), invalidate: vi.fn(), analysisCallbacks: {} as any, ingestCallbacks: {} as any, analyzing: false, saving: false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => (key.includes('.knowledgeDraft.') ? draftCopy : copy)[key.split('.').at(-1) as keyof typeof copy] || key }) }));
vi.mock('@/lib/trpc', () => ({ trpc: { auth: { me: { useQuery: () => ({ data: { id: 10 } }) } }, merchants: { getCurrent: { useQuery: () => ({ data: { id: 20 } }) } }, useUtils: () => ({ knowledgeDocs: { invalidate: api.invalidate }, sariBrain: { getIntakeReceipt: { fetch: api.readReceipt }, ...Object.fromEntries(['getSources', 'getKnowledgeSections', 'getHealthScore', 'getActivityLog', 'getPendingReviews'].map(key => [key, { invalidate: api.invalidate }])) } }), sariBrain: {
  analyzeContent: { useMutation: (callbacks: any) => { api.analysisCallbacks = callbacks; return { mutate: api.analyze, isPending: api.analyzing }; } },
  ingestAnalyzedContent: { useMutation: (callbacks: any) => { api.ingestCallbacks = callbacks; return { mutate: api.ingest, isPending: api.saving }; } },
} } }));
import { KnowledgeIntake } from '../client/src/components/KnowledgeIntake';
let root: Root, container: HTMLDivElement;
const reviewRecord = { id: '00000000-0000-4000-8000-000000000003', createdAt: '2026-09-29 01:00:00', expiresAt: '2026-09-29 01:30:00', plan: { version: 1, items: [] } };
const report = { contentType: 'general', summary: 'Reviewed', itemCount: 1, conflicts: ['Check old price'], impact: 'Expected effect', riskLevel: 'medium', sampleQA: [], recommendation: 'review', recommendationReason: 'Confirm prices' };
beforeEach(() => { clearKnowledgeWorkspace(); sessionStorage.clear(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); api.analyzing = false; api.saving = false; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(React.createElement(KnowledgeIntake)));
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!;
const click = (label: string) => act(async () => { expect(button(label)).toBeTruthy(); button(label).click(); });
const fill = (id: string, value: string) => act(async () => { const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(id)!; Object.getOwnPropertyDescriptor(el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
const reviewed = () => act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
const analyze = async () => { await fill('[id$="-content"]', 'Complete text for review'); await click(copy.analyze); await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: report })); };
it('shows field-specific errors, focuses the first error, and never submits invalid text', async () => { await render(); await click(copy.analyze); expect(document.activeElement?.id).toMatch(/-content$/); expect(container.textContent).toContain(copy.contentError); await fill('[id$="-name"]', 'x'.repeat(256)); await fill('[id$="-content"]', 'x'.repeat(30_001)); await click(copy.analyze); expect(document.activeElement?.id).toMatch(/-name$/); expect(api.analyze).not.toHaveBeenCalled(); });
it('keeps the text and exposes a failed analysis without showing an approval action', async () => { await render(); await fill('[id$="-content"]', 'Complete text for review'); await click(copy.analyze); await act(async () => api.analysisCallbacks.onError({ data: { code: 'INTERNAL_SERVER_ERROR' } })); expect(container.textContent).toContain(copy.analysisError); expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).value).toBe('Complete text for review'); expect(button(copy.save)).toBeUndefined(); });
it('requires review, invalidates it after edits, and prevents duplicate saves after success', async () => { await render(); await analyze(); expect(button(copy.save).disabled).toBe(true); await reviewed(); await fill('[id$="-content"]', 'Changed source for another review'); expect(button(copy.save)).toBeUndefined(); await click(copy.analyze); await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: report })); expect(button(copy.save).disabled).toBe(true); await reviewed(); await click(copy.save); expect(api.ingest).toHaveBeenCalledTimes(1); await act(async () => api.ingestCallbacks.onSuccess({ requestId: '5b9b36a2-79d1-4fa5-b041-000000000001', documentId: 44, state: 'completed', outcome: { success: true, embeddingsReady: false, evolveResult: { added: 1, evolved: 0, conflicts: 1, unchanged: 0 } } })); expect(button(copy.save)).toBeUndefined(); expect(container.textContent).toContain(copy.indexing); expect(container.textContent).toContain(copy.savedHint); });
it('locks editing and duplicate submission during processing', async () => { await render(); await analyze(); await reviewed(); api.saving = true; await render(); expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).disabled).toBe(true); await click(copy.saving); expect(api.ingest).not.toHaveBeenCalled(); });
it('does not encourage retrying an uncertain save or report it as confirmed', async () => { await render(); await analyze(); await reviewed(); await click(copy.save); await act(async () => api.ingestCallbacks.onError({ data: { code: 'INTERNAL_SERVER_ERROR' } })); expect(container.textContent).toContain(copy.uncertain); expect(container.textContent).not.toContain(copy.saved); expect(button(copy.save)).toBeUndefined(); expect(button(copy.analyze).disabled).toBe(true); });
it('rejects malformed analysis data and renders provider text as text', async () => { await render(); await fill('[id$="-content"]', 'Complete text for review'); await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: { ...report, conflicts: 'wrong type' } })); expect(container.textContent).toContain(copy.analysisError); await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: { ...report, summary: '<img src=x onerror=alert(1)>' } })); expect(container.querySelector('img')).toBeNull(); expect(container.textContent).toContain('<img src=x'); });
it('recovers the saved result by reference after a transport failure without submitting another mutation', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save);
  const requestId = api.ingest.mock.calls[0][0].requestId; expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  await act(async () => api.ingestCallbacks.onError({ data: { code: 'INTERNAL_SERVER_ERROR' } }));
  api.readReceipt.mockResolvedValue({ requestId, documentId: 44, state: 'completed', outcome: { success: true, embeddingsReady: false, evolveResult: { added: 3, evolved: 0, conflicts: 1, unchanged: 0 } } });
  await click(copy.receiptRefresh); expect(api.readReceipt).toHaveBeenCalledWith({ requestId }, { staleTime: 0 });
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
  expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).value).toBe('');
  expect(button(copy.analyze).disabled).toBe(false); expect(api.ingest).toHaveBeenCalledTimes(1);
});
it('preserves input after a confirmed preflight rejection and allows returning to it', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save);
  await act(async () => api.ingestCallbacks.onError({ data: { code: 'TOO_MANY_REQUESTS' } }));
  expect(container.textContent).toContain(copy.receiptRejected); await click(copy.receiptEdit);
  expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).value).toBe('Complete text for review');
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
  expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).value).toBe('Complete text for review');
  await click(copy.analyze); await act(async () => api.analysisCallbacks.onSuccess({ review: { ...reviewRecord, id: '00000000-0000-4000-8000-000000000004' }, analysis: report }));
  expect(button(copy.save).disabled).toBe(true); expect(api.ingest).toHaveBeenCalledTimes(1);
  await reviewed(); await click(copy.save); expect(api.ingest.mock.calls[1][0].reviewId).toBe('00000000-0000-4000-8000-000000000004');
});
it('does not offer intake for a report that lacks its saved server reference', async () => {
  await render(); await fill('[id$="-content"]', 'Complete text for review'); await click(copy.analyze);
  await act(async () => api.analysisCallbacks.onSuccess({ analysis: report })); expect(container.textContent).toContain(copy.analysisError); expect(button(copy.save)).toBeUndefined();
});
it('shows exact before/after text and activation states, and never accepts a legacy report without its plan', async () => {
  await render(); await fill('[id$="-content"]', 'Complete text for review'); await click(copy.analyze);
  const item = { action: 'conflict', targetId: 10, parentIndex: null, sectionType: 'policies', title: 'Reviewed policy', content: '<img src=x onerror=alert(1)>', summary: 'A proposal summary', reason: 'A conflict reason', before: { title: 'Current policy', content: 'Current full policy', summary: 'Old summary' }, status: 'pending_review', useInBot: false, injectAs: 'fact' };
  await act(async () => api.analysisCallbacks.onSuccess({ analysis: report, review: { ...reviewRecord, plan: { version: 1, items: [item] } } }));
  const plan = container.querySelector('[data-knowledge-plan]')!; expect(plan.textContent).toContain('Current full policy'); expect(plan.textContent).toContain(item.content); expect(plan.textContent).toContain(copy.planInactive); expect(plan.querySelector('img')).toBeNull();
  await fill('[id$="-name"]', 'Changed'); await click(copy.analyze);
  await act(async () => api.analysisCallbacks.onSuccess({ analysis: report, review: { ...reviewRecord, plan: undefined } }));
  expect(button(copy.save)).toBeUndefined(); expect(container.textContent).toContain(copy.analysisError);
});
it.each(['PRECONDITION_FAILED', 'PAYLOAD_TOO_LARGE'])('keeps source and shows actionable %s during preparation', async code => {
  await render(); await fill('[id$="-content"]', 'Complete text for review'); await click(copy.analyze);
  await act(async () => api.analysisCallbacks.onError({ data: { code } }));
  expect(container.textContent).toContain(code === 'PRECONDITION_FAILED' ? copy.reviewExpired : copy.planTooLarge);
  expect(button(copy.save)).toBeUndefined(); expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).value).toBe('Complete text for review');
});

it('keeps saved source identity through review and uses unique field ids for simultaneous forms', async () => {
  const initialSource = { content: 'Full saved file text for review', fileName: 'Saved.pdf', sourceDocument: { id: 31, revision: 'a'.repeat(64) } };
  await act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(KnowledgeIntake, { initialSource }), React.createElement(KnowledgeIntake))));
  const ids = Array.from(container.querySelectorAll('[id]')).map(el => el.id); expect(new Set(ids).size).toBe(ids.length);
  expect(Array.from(container.querySelectorAll('label[for]')).every(label => document.getElementById(label.getAttribute('for')!))).toBe(true);
  await click(copy.analyze); expect(api.analyze).toHaveBeenCalledWith(expect.objectContaining({ content: initialSource.content, fileName: 'Saved.pdf', sourceDocument: initialSource.sourceDocument }));
  await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: report }));
});

const remount = async (props = {}) => { await act(async () => root.unmount()); root = createRoot(container); await act(async () => root.render(React.createElement(KnowledgeIntake, props))); };
it('restores text after navigation, but never restores analysis or consent', async () => {
  await render(); await analyze(); await reviewed(); await remount();
  expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).value).toBe('Complete text for review');
  expect(container.textContent).toContain(draftCopy.restored); expect(button(copy.save)).toBeUndefined(); expect(api.ingest).not.toHaveBeenCalled();
  await click(copy.analyze); await act(async () => api.analysisCallbacks.onSuccess({ review: reviewRecord, analysis: report })); expect(button(copy.save).disabled).toBe(true);
  expect(Object.values(sessionStorage).join(' ')).not.toContain('Complete text');
});
it('restores an uncertain attempt after navigation and reads the same receipt without sending again', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save); const id = api.ingest.mock.calls[0][0].requestId;
  await remount(); expect(container.textContent).toContain(draftCopy.recovered); expect(button(copy.analyze).disabled).toBe(true);
  api.readReceipt.mockResolvedValue({ requestId: id, state: 'empty', outcome: null, documentId: 4 }); await click(copy.receiptRefresh);
  expect(api.readReceipt).toHaveBeenCalledWith({ requestId: id }, { staleTime: 0 }); expect(api.ingest).toHaveBeenCalledTimes(1);
  await click(copy.newContent); await remount(); expect(container.textContent).not.toContain(draftCopy.recovered); expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).value).toBe('');
});
it('does not strand a draft after a confirmed preflight rejection and navigation', async () => {
  await render(); await analyze(); await reviewed(); await click(copy.save);
  await act(async () => api.ingestCallbacks.onError({ data: { code: 'TOO_MANY_REQUESTS' } })); await remount();
  expect(button(copy.analyze).disabled).toBe(false); expect(container.textContent).not.toContain(draftCopy.recovered); expect(button(copy.save)).toBeUndefined();
});
it('keeps saved-file drafts separate and preserves their original revision when the source changes', async () => {
  const source = { content: 'Original complete source text', fileName: 'Original.pdf', sourceDocument: { id: 50, revision: 'a'.repeat(64) } };
  await remount({ initialSource: source }); await fill('[id$="-content"]', 'My edited source text for review');
  await remount({ initialSource: { ...source, sourceDocument: { id: 51, revision: 'b'.repeat(64) } } });
  expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).value).toBe(source.content);
  await remount({ initialSource: { ...source, sourceDocument: { id: 50, revision: 'c'.repeat(64) } } });
  await click(copy.analyze); expect(api.analyze).toHaveBeenCalledWith(expect.objectContaining({ content: 'My edited source text for review', sourceDocument: source.sourceDocument }));
});
it('discards only this text draft and does not restore it on return', async () => {
  await render(); await fill('[id$="-content"]', 'Unsaved local text'); await click(draftCopy.discard); await remount();
  expect((container.querySelector('[id$="-content"]') as HTMLTextAreaElement).value).toBe(''); expect(container.textContent).not.toContain(draftCopy.restored);
});
it('blocks sending if the request reference cannot be stored', async () => {
  await render(); await analyze(); await reviewed();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Full storage'); });
  await click(copy.save); expect(api.ingest).not.toHaveBeenCalled(); expect(container.textContent).toContain(draftCopy.storageError);
});

it('does not warn about losing text when a reload restores only a request reference', async () => {
  sessionStorage.setItem('sary:knowledge-attempt:v1:10:20:text', '00000000-0000-4000-8000-000000000099');
  await render(); expect(container.textContent).toContain(draftCopy.recovered);
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  expect(button(copy.analyze).disabled).toBe(true); expect(api.ingest).not.toHaveBeenCalled();
});
