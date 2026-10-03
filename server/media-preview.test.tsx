// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { mediaWorkspaceAr as ar, mediaWorkspaceEn as en } from '../client/src/locales/media-workspace';
import { mediaReceiptStorageKey, scopedMediaWorkspace } from '../client/src/lib/media-workspace';
import { mediaWorkspaceInput, mediaWorkspaceSchema } from '../shared/media-workspace';
import { mediaRequestResult } from '../shared/media-actions';
const state = vi.hoisted(() => ({ language: 'en' }));
vi.mock('@/lib/trpc', () => import('../prototypes/tenant-dashboard/src/service-preview-api'));
vi.mock('wouter', () => import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: state.language }, t: (key: string) => (state.language === 'ar' ? ar : en)[key.split('.').pop() as keyof typeof en] ?? 'Localized status' }) }));
import Page from '../client/src/pages/merchant/MediaLibrary';
import { ServicePreviewContext } from '../prototypes/tenant-dashboard/src/service-preview-api';
import { ServicePreviewModel, serviceModes } from '../prototypes/tenant-dashboard/src/service-preview-model';
let root: Root, container: HTMLDivElement, model: ServicePreviewModel;
const now = '2026-10-03T12:00:00Z';
const pdf = () => ({ requestKey: crypto.randomUUID(), originalName: 'Guide.pdf', mimeType: 'application/pdf', category: 'general', fileBase64: btoa('%PDF-1.4\n% local synthetic example') });
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true }); state.language = 'en'; sessionStorage.clear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  model = new ServicePreviewModel(269, 'normal', now); history.replaceState(null, '', '/?path=/merchant/media-library');
});
afterEach(async () => { await act(async () => root.unmount()); model.dispose(); container.remove(); vi.restoreAllMocks(); });
const render = () => act(async () => root.render(<ServicePreviewContext.Provider value={model}><Page /></ServicePreviewContext.Provider>));
const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim().startsWith(text))!;
const click = (text: string) => act(async () => { expect(button(text)).toBeTruthy(); button(text).click(); });
const read = (input: object = {}, instance = model) => { const r = instance.read('media.workspace', input); expect(r.error).toBeFalsy(); return mediaWorkspaceSchema.parse(r.data); };
it.each(['ar', 'en'])('renders actual media details and removes only the reviewed registration in %s', async language => {
  state.language = language; const c = language === 'ar' ? ar : en; await render();
  expect(container.querySelectorAll('.ml-file')).toHaveLength(24); await click(c.details);
  expect(document.activeElement?.textContent).toBe(c.details); expect(document.body.textContent).toContain(c.fullName);
  await click(c.close); await click(c.remove); expect(document.body.textContent).toContain(c.removeHint); expect(model.operations).toBe(0);
  await click(c.confirmRemove); expect(model.operations).toBe(1); expect(read().total).toBe(31); expect(container.textContent).toContain(c.removed);
});
it.each(serviceModes)('renders %s without leaking hidden rows or writing', async mode => {
  model = new ServicePreviewModel(269, mode, now); await render();
  expect(container.querySelectorAll('.ml-file').length > 0).toBe(!['empty', 'loading', 'failure', 'forbidden', 'session', 'foreign', 'stale-error'].includes(mode));
  expect(container.textContent).not.toContain('merchantUx.'); expect(model.operations).toBe(0);
});
it.each([269, 270])('keeps complete counts, search, sorts and page clamping for tenant %s', id => {
  const m = new ServicePreviewModel(id, 'normal', now);
  try {
    expect(read({}, m)).toMatchObject({ actorId: id + 1000, merchantId: id, total: 32, pages: 2 });
    expect(read({ page: 2 }, m).rows).toHaveLength(8); expect(read({ query: '%' }, m).rows.map(r => r.id)).toEqual([1]);
    expect(read({ page: 900 }, m).currentPage).toBe(2); expect(read({ sort: 'oldest' }, m).rows[0].id).toBe(1);
    expect(read({ category: 'general', kind: 'pdf' }, m).matched).toBe(8);
    expect(scopedMediaWorkspace(read({}, m), id + 1000, id, mediaWorkspaceInput.parse({}))).not.toBeNull();
    expect(scopedMediaWorkspace(read({}, m), 1999, 999, mediaWorkspaceInput.parse({}))).toBeNull();
  } finally { m.dispose(); }
});
it('paginates and switches list view through actual controls', async () => {
  await render(); await click(en.list); expect(container.querySelector('.ml-list')).not.toBeNull();
  await click(en.next); expect(container.querySelectorAll('.ml-file')).toHaveLength(8); expect(new URLSearchParams(location.search).get('page')).toBe('2');
});
it('validates empty selection and reads a PDF locally before confirmed simulated upload', async () => {
  await render(); await click(en.upload); await click(en.confirmUpload); expect(document.body.textContent).toContain(en.selectFile); expect(model.operations).toBe(0);
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['%PDF-1.4\n% fixture'], 'Guide.pdf', { type: 'application/pdf' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
  });
  expect(document.body.textContent).toContain('Guide.pdf'); expect(model.operations).toBe(0);
  await click(en.confirmUpload); expect(read().rows[0].originalName).toBe('Guide.pdf'); expect(model.operations).toBe(1); expect(container.textContent).toContain(en.uploaded);
});
it('clears an earlier valid file after an unsupported replacement', async () => {
  await render(); await click(en.upload); const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  for (const [name, type] of [['guide.pdf', 'application/pdf'], ['phone.heic', 'image/heic']]) await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['%PDF-1.4'], name, { type })] }); input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 30));
  });
  expect(document.body.textContent).toContain(en.fileTypeError); await click(en.confirmUpload); expect(document.body.textContent).toContain(en.selectFile); expect(model.operations).toBe(0);
});
it('recovers a lost removal response once without another write', async () => {
  model = new ServicePreviewModel(269, 'uncertain-save', now); await render(); await click(en.remove); await click(en.confirmRemove);
  expect(model.operations).toBe(1); expect(sessionStorage.getItem(mediaReceiptStorageKey(1269, 269))).toBeTruthy();
  expect(document.activeElement?.textContent).toBe(en.unknownResult);
  expect(document.querySelector('.ml-dialog-footer')?.textContent).toContain(en.checkResult);
  expect(document.querySelector('.ml-dialog-footer')?.textContent).not.toContain(en.confirmRemove);
  await click(en.checkResult); expect(model.operations).toBe(1); expect(container.textContent).toContain(en.removed); expect(sessionStorage.getItem(mediaReceiptStorageKey(1269, 269))).toBeNull();
});
it('closes a missing request after a failure, then blocks its delayed removal', async () => {
  model = new ServicePreviewModel(269, 'action-failure', now); const row = read().rows[0]; await render(); await click(en.remove); await click(en.confirmRemove);
  const requestKey = sessionStorage.getItem(mediaReceiptStorageKey(1269, 269))!; expect(requestKey).toBeTruthy(); await click(en.checkResult); expect(document.body.textContent).toContain(en.notFoundReceipt);
  await click(en.closeRequest); await click(en.confirmClose); expect(read().total).toBe(32);
  expect(await model.mutate('media.removeReviewed', { requestKey, id: row.id, revision: row.revision })).toMatchObject({ state: 'cancelled' }); expect(read().total).toBe(32);
});
it('replays upload receipts and rejects changed bytes, a stale row and a foreign receipt', async () => {
  const input = pdf(), saved = await model.mutate('media.uploadReviewed', input), other = new ServicePreviewModel(270, 'normal', now);
  try {
    expect(await model.mutate('media.uploadReviewed', input)).toEqual(saved); expect(model.operations).toBe(1);
    await expect(model.mutate('media.uploadReviewed', { ...input, fileBase64: btoa('%PDF-1.4 changed') })).rejects.toMatchObject({ message: 'media_workspace:reused' });
    expect(mediaRequestResult.parse(other.read('media.requestReceipt', { requestKey: input.requestKey }).data).state).toBe('missing');
    await expect(model.mutate('media.removeReviewed', { requestKey: crypto.randomUUID(), id: 32, revision: 'f'.repeat(64) })).rejects.toMatchObject({ message: 'media_workspace:stale' });
  } finally { other.dispose(); }
});
it('shows all pending reservations with permission-correct controls', async () => {
  model = new ServicePreviewModel(269, 'readonly', now); const first = read(), second = read({ requestPage: 2 });
  expect(first.pendingUploads).toHaveLength(10); expect(second.pendingUploads).toHaveLength(2); expect(first.allowedUploadCategories).toEqual([]);
  expect(second.pendingUploads.find(r => r.actorId !== model.actorId)).toMatchObject({ canRead: false, canClose: false });
  await render(); expect(button(en.upload)).toBeUndefined(); expect(button(en.remove)).toBeUndefined();
});
it('does not automatically repeat unresolved uploads or restore removed legacy rows', async () => {
  model = new ServicePreviewModel(269, 'destination-missing', now); const input = pdf();
  expect(await model.mutate('media.uploadReviewed', input)).toMatchObject({ state: 'uploading' }); await model.mutate('media.uploadReviewed', input); expect(model.operations).toBe(1);
  await model.mutate('media.closeRequest', { requestKey: input.requestKey }); expect(await model.mutate('media.uploadReviewed', input)).toMatchObject({ state: 'cancelled' });
  model.dispose(); model = new ServicePreviewModel(269, 'legacy', now); const row = read().rows[0]; expect(read().totalSizeBytes).toBeNull(); expect(row.previewUrl).toBeNull();
  await model.mutate('media.removeReviewed', { requestKey: crypto.randomUUID(), id: row.id, revision: row.revision }); expect(read().invalidSizeCount).toBe(0); expect(read().rows.some(r => r.id === row.id)).toBe(false);
});
it('discards a delayed write when the simulated tenant is replaced', async () => {
  model = new ServicePreviewModel(269, 'pending-save', now); const pending = model.mutate('media.uploadReviewed', pdf()), assertion = expect(pending).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  expect(model.pending).toBe(1); model.dispose(); await assertion; expect(model.operations).toBe(0);
});
