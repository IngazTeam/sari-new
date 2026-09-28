// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { knowledgeIntakeEn as copy } from '../client/src/locales/knowledge-intake';
import type { KnowledgeReceipt } from '../shared/knowledge-intake';
const api = vi.hoisted(() => ({ recover: vi.fn(), invalidate: vi.fn(), refresh: vi.fn(), callbacks: {} as any, pending: false, error: false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => copy[key.split('.').at(-1) as keyof typeof copy] || key }) }));
vi.mock('@/lib/trpc', () => ({ trpc: { useUtils: () => ({ knowledgeDocs: { invalidate: api.invalidate }, sariBrain: { getActivityLog: { invalidate: api.invalidate } } }), sariBrain: {
  recoverIntakeReceipt: { useMutation: (callbacks: any) => { api.callbacks = callbacks; return { mutate: api.recover, isPending: api.pending, isError: api.error }; } },
} } }));
import { KnowledgeReceiptView } from '../client/src/components/KnowledgeReceiptView';
let root: Root, container: HTMLDivElement, receipt: KnowledgeReceipt;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); api.pending = false; api.error = false; receipt = { requestId: '00000000-0000-4000-8000-000000000001', documentId: 44, state: 'processing', outcome: null, recovery: 'available', recoveredAt: null, updatedAt: '2026-09-29' }; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(React.createElement(KnowledgeReceiptView, { receipt, onRefresh: api.refresh })));
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!;
const acknowledge = () => act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
it.each(['waiting', 'legacy'] as const)('shows %s guidance without offering recovery', async recovery => {
  receipt.recovery = recovery; await render(); expect(container.textContent).toContain(recovery === 'waiting' ? copy.recoveryWaiting : copy.recoveryLegacy);
  expect(button(copy.recoveryAction)).toBeUndefined(); expect(container.querySelector('input')).toBeNull(); expect(api.recover).not.toHaveBeenCalled();
});
it('requires acknowledgement, sends the reference only, and blocks duplicate clicks while pending', async () => {
  await render(); expect(button(copy.recoveryAction).disabled).toBe(true);
  await act(async () => button(copy.recoveryAction).click()); expect(api.recover).not.toHaveBeenCalled();
  await acknowledge(); await act(async () => button(copy.recoveryAction).click());
  expect(api.recover).toHaveBeenCalledWith({ requestId: receipt.requestId, acknowledged: true });
  api.pending = true; await render(); expect(button(copy.recoverySaving).disabled).toBe(true); expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(true);
});
it('keeps failed recovery unconfirmed and supports a read-only result check', async () => {
  api.error = true; await render(); expect(container.querySelector('[role="alert"]')?.textContent).toBe(copy.recoveryError);
  expect(container.textContent).not.toContain(copy.recoveryDone); await act(async () => button(copy.receiptRefresh).click());
  expect(api.refresh).toHaveBeenCalledTimes(1); expect(api.recover).not.toHaveBeenCalled();
});
it('shows confirmed closure without claiming successful processing or offering another closure', async () => {
  await render(); await act(async () => api.callbacks.onSuccess({ ...receipt, state: 'uncertain', recovery: null, recoveredAt: '2026-09-29' }));
  expect(container.textContent).toContain(copy.recoveryDone); expect(container.textContent).toContain(copy.receiptRecovered);
  expect(container.textContent).not.toContain(copy.saved); expect(button(copy.recoveryAction)).toBeUndefined(); expect(api.refresh).toHaveBeenCalledTimes(1); expect(api.invalidate).toHaveBeenCalledTimes(2);
  receipt = { ...receipt, requestId: '00000000-0000-4000-8000-000000000002' }; await render();
  expect(container.textContent).not.toContain(copy.recoveryDone); expect(button(copy.recoveryAction).disabled).toBe(true);
});
it('shows the stored report separately from the execution result and escapes its untrusted text', async () => {
  receipt = { ...receipt, state: 'uncertain', recovery: null, review: { id: '00000000-0000-4000-8000-000000000003', analyzedAt: '2026-09-29 01:00:00', acceptedAt: '2026-09-29 01:01:00', analysis: { contentType: 'general', summary: '<img src=x onerror=alert(1)>', itemCount: 1, conflicts: ['A saved conflict'], impact: 'A saved impact', riskLevel: 'high', sampleQA: [{ question: 'Saved question?', answer: 'Saved answer' }], recommendation: 'review', recommendationReason: 'Review the exact source' } } };
  await render(); const report = container.querySelector('[data-knowledge-saved-review]')!;
  expect(report.textContent).toContain(copy.savedReview); expect(report.textContent).toContain(copy.reviewScope);
  expect(report.textContent).toContain('A saved conflict'); expect(report.textContent).toContain('Saved answer'); expect(report.querySelector('img')).toBeNull();
  receipt = { ...receipt, review: null }; await render(); expect(container.textContent).toContain(copy.reviewUnavailable); expect(container.querySelector('[data-knowledge-saved-review]')).toBeNull();
});
