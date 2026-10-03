// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { scheduledWorkspaceAr as ar, scheduledWorkspaceEn as en } from '../client/src/locales/scheduled-workspace';
import { scheduledStorageKey, scopedScheduledWorkspace } from '../client/src/lib/scheduled-workspace';
import { scheduledMessageSelection } from '../shared/scheduled-message-workspace';
import { scheduledMessageWorkspace, scheduledHistory } from '../shared/scheduled-message-evidence';
import { scheduledActionReview, scheduledActionResult, scheduledReceiptResult } from '../shared/scheduled-message-actions';
const state = vi.hoisted(() => ({ language: 'en' }));
vi.mock('@/lib/trpc', () => import('../prototypes/tenant-dashboard/src/service-preview-api'));
vi.mock('wouter', () => import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: state.language }, t: (key: string) => (state.language === 'ar' ? ar : en)[key.split('.').pop() as keyof typeof en] ?? 'Localized status' }) }));
import Page from '../client/src/pages/merchant/ScheduledMessages';
import { ServicePreviewContext } from '../prototypes/tenant-dashboard/src/service-preview-api';
import { ServicePreviewModel, serviceModes } from '../prototypes/tenant-dashboard/src/service-preview-model';
let root: Root, container: HTMLDivElement, model: ServicePreviewModel;
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true }); state.language = 'en'; sessionStorage.clear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  model = new ServicePreviewModel(269); history.replaceState(null, '', '/?path=/merchant/scheduled-messages');
});
afterEach(async () => { await act(async () => root.unmount()); model.dispose(); container.remove(); vi.restoreAllMocks(); });
const render = () => act(async () => root.render(<ServicePreviewContext.Provider value={model}><Page /></ServicePreviewContext.Provider>));
const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim().startsWith(text))!;
const click = (text: string) => act(async () => { expect(button(text)).toBeTruthy(); button(text).click(); });
const read = (input: object = {}, instance = model) => { const r = instance.read('scheduledMessages.workspace', input); expect(r.error).toBeFalsy(); return scheduledMessageWorkspace.parse(r.data); };
const review = async (target: any, instance = model) => scheduledActionReview.parse(await instance.mutate('scheduledMessages.reviewAction', target));
const applyInput = (r: ReturnType<typeof scheduledActionReview.parse>) => ({ target: r.target, checkedAt: r.checkedAt, reviewRevision: r.reviewRevision, requestKey: crypto.randomUUID() });
const write = async (target: any) => scheduledActionResult.parse(await model.mutate('scheduledMessages.applyAction', applyInput(await review(target))));
const fields = { title: 'Updated sample', message: 'Reviewed literal text', dayOfWeek: 0, time: '13:00', timezone: 'Asia/Riyadh' };

it.each(['ar', 'en'])('renders actual details, result boundaries, and reviewed activation in %s', async language => {
  state.language = language; const c = language === 'ar' ? ar : en; await render();
  expect(container.querySelectorAll('.sm-card')).toHaveLength(25); await click(c.details);
  expect(document.activeElement?.textContent).toBe(c.details); expect(document.querySelectorAll('.sm-occurrence')).toHaveLength(25);
  expect(document.body.textContent).toContain(c.proofHelp); expect(document.body.textContent).toContain(c.unconfirmed);
  const next = document.querySelector<HTMLButtonElement>('.sm-history nav button:last-child')!;
  await act(async () => next.click()); expect(document.querySelectorAll('.sm-occurrence')).toHaveLength(6);
  await click(c.close); await click(c.enable); expect(document.body.textContent).toContain(c.audience); expect(document.body.textContent).toContain(c.window);
  expect(model.operations).toBe(0); await click(c.confirm); expect(model.operations).toBe(1); expect(read().rows[0]).toMatchObject({ enabled: true, authorization: { state: 'recorded' } });
});
it.each(serviceModes)('renders %s without leaking hidden rows or writing', async mode => {
  model = new ServicePreviewModel(269, mode); await render();
  expect(container.querySelectorAll('.sm-card').length > 0).toBe(!['empty', 'loading', 'failure', 'forbidden', 'session', 'foreign', 'stale-error'].includes(mode));
  expect(container.textContent).not.toContain('merchantUx.'); expect(model.operations).toBe(0);
});
it.each([269, 270])('keeps complete selection, counts and history in tenant %s', id => {
  const other = new ServicePreviewModel(id);
  try {
    expect(read({}, other)).toMatchObject({ actorId: id + 1000, merchantId: id, total: 32, pages: 2, timezone: id === 269 ? 'Asia/Riyadh' : 'Asia/Dubai' });
    expect(read({ page: 2 }, other).rows).toHaveLength(7); expect(read({ page: 900 }, other).currentPage).toBe(2);
    expect(read({ sort: 'oldest' }, other).rows[0].id).toBe(1); expect(read({ query: '32' }, other).rows.map(r => r.id)).toEqual([32]);
    expect(read({ day: 0 }, other).rows.every(r => r.dayOfWeek === 0)).toBe(true);
    expect(scopedScheduledWorkspace(read({}, other), id + 1000, id, scheduledMessageSelection.parse({}))).not.toBeNull();
    expect(scopedScheduledWorkspace(read({}, other), 999, id, scheduledMessageSelection.parse({}))).toBeNull();
    const history = scheduledHistory.parse(other.read('scheduledMessages.history', { id: 32, page: 2 }).data);
    expect(history.rows).toHaveLength(6); expect(history.total).toBe(31); expect(history.rows.every(r => r.salesVerified === false)).toBe(true);
    expect(history.rows.filter(r => r.linkState !== 'verified').every(r => r.acceptedByProvider === null && r.campaignId === null)).toBe(true);
  } finally { other.dispose(); }
});
it('creates paused, preserves chronological ordering on edit and retains history on delete', async () => {
  const created = await write({ action: 'create', data: fields }); expect(created.enabled).toBe(false); expect(read().rows[0].id).toBe(created.id);
  await write({ action: 'update', id: 1, data: { ...fields, title: 'Changed oldest' } });
  expect(read().rows[0].id).toBe(created.id); expect(read({ sort: 'oldest' }).rows[0].id).toBe(1);
  await write({ action: 'delete', id: 32 }); expect(read().rows.some(r => r.id === 32)).toBe(false);
  expect(scheduledHistory.parse(model.read('scheduledMessages.history', { id: 32 }).data).total).toBe(31);
  const next = await write({ action: 'create', data: fields }); expect(next.id).toBeGreaterThan(created.id);
});
it('repairs a legacy definition once without reapplying the invalid sample', async () => {
  model = new ServicePreviewModel(269, 'legacy'); expect(read().rows[0].issues).toContain('day');
  await expect(review({ action: 'toggle', id: 32, enabled: true })).rejects.toMatchObject({ message: 'scheduled_action:invalid' });
  await write({ action: 'update', id: 32, data: fields }); expect(read().rows[0]).toMatchObject({ title: fields.title, dayOfWeek: 0, time: '13:00', issues: [], enabled: false });
  await write({ action: 'toggle', id: 32, enabled: true }); expect(read().rows[0].authorization.state).toBe('recorded');
  await write({ action: 'toggle', id: 32, enabled: false }); expect(read().rows[0].authorization.state).toBe('revoked');
});
it('rejects old reviews, changed request content and foreign replay while retaining its receipt', async () => {
  const stale = applyInput(await review({ action: 'toggle', id: 32, enabled: true }));
  await write({ action: 'update', id: 32, data: fields });
  await expect(model.mutate('scheduledMessages.applyAction', stale)).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  const input = applyInput(await review({ action: 'toggle', id: 32, enabled: true })), saved = await model.mutate('scheduledMessages.applyAction', input);
  expect(await model.mutate('scheduledMessages.applyAction', input)).toEqual(saved); expect(model.operations).toBe(2);
  await expect(model.mutate('scheduledMessages.applyAction', { ...input, reviewRevision: 'f'.repeat(64) })).rejects.toMatchObject({ message: 'scheduled_action:reused' });
  const foreign = new ServicePreviewModel(270);
  try { expect(foreign.read('scheduledMessages.actionReceipt', { requestKey: input.requestKey }).data.state).toBe('missing'); await expect(foreign.mutate('scheduledMessages.applyAction', input)).rejects.toMatchObject({ data: { code: 'CONFLICT' } }); } finally { foreign.dispose(); }
});
it('recovers a lost save response without another write through actual controls', async () => {
  model = new ServicePreviewModel(269, 'uncertain-save'); await render(); await click(en.enable); await click(en.confirm);
  expect(document.body.textContent).toContain(en.pending); expect(sessionStorage.getItem(scheduledStorageKey(1269, 269))).toBeTruthy(); expect(model.operations).toBe(1);
  await click(en.recover); expect(model.operations).toBe(1); expect(container.textContent).toContain(en.saved); expect(sessionStorage.length).toBe(0);
});
it('closes a missing receipt and rejects a delayed application', async () => {
  model = new ServicePreviewModel(269, 'action-failure'); const input = applyInput(await review({ action: 'toggle', id: 32, enabled: true }));
  await expect(model.mutate('scheduledMessages.applyAction', input)).rejects.toBeTruthy(); expect(model.read('scheduledMessages.actionReceipt', { requestKey: input.requestKey }).data.state).toBe('missing');
  expect(scheduledReceiptResult.parse(await model.mutate('scheduledMessages.resolveActionReceipt', { requestKey: input.requestKey })).state).toBe('cancelled');
  model.complete(); await expect(model.mutate('scheduledMessages.applyAction', input)).rejects.toMatchObject({ message: 'scheduled_action:cancelled' }); expect(read().rows[0].enabled).toBe(false);
});
it('permits read-only own receipt recovery and missing-request closure without editable controls', async () => {
  model = new ServicePreviewModel(269, 'readonly'); await render(); expect(button(en.create)).toBeUndefined(); expect(button(en.edit)).toBeUndefined(); await click(en.details); expect(button(en.remove)).toBeUndefined();
  const requestKey = crypto.randomUUID(); expect((await model.mutate('scheduledMessages.resolveActionReceipt', { requestKey }) as any).state).toBe('cancelled');
  expect(model.read('scheduledMessages.actionReceipt', { requestKey }).data.state).toBe('cancelled'); await expect(review({ action: 'toggle', id: 32, enabled: true })).rejects.toBeTruthy();
});
it.each(['unlinked', 'destination-missing'] as const)('blocks activation with %s while keeping pause and delete available', async mode => {
  model = new ServicePreviewModel(269, mode); await expect(review({ action: 'toggle', id: 32, enabled: true })).rejects.toBeTruthy();
  await write({ action: 'toggle', id: 31, enabled: false }); expect(read().rows.find(r => r.id === 31)?.enabled).toBe(false);
  await write({ action: 'delete', id: 31 }); expect(read().rows.some(r => r.id === 31)).toBe(false);
});
it('surfaces history failure without inventing an empty or successful history', async () => {
  model = new ServicePreviewModel(269, 'choices-error'); await render(); await click(en.details);
  expect(document.querySelector('.sm-history [data-state=error]')).not.toBeNull(); expect(document.body.textContent).not.toContain(en.noHistory);
});
it('discards delayed simulated writes after the model is disposed', async () => {
  model = new ServicePreviewModel(269, 'pending-save'); const input = applyInput(await review({ action: 'toggle', id: 32, enabled: true }));
  const pending = model.mutate('scheduledMessages.applyAction', input), assertion = expect(pending).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  expect(model.pending).toBe(1); model.dispose(); await assertion; expect(model.operations).toBe(0);
});
it('expires a five-minute review and issues a fresh usable review after the clock advances', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z')); model = new ServicePreviewModel(269);
    const target = { action: 'toggle', id: 32, enabled: true }, old = applyInput(await review(target));
    vi.setSystemTime(new Date('2026-10-03T12:05:01Z'));
    await expect(model.mutate('scheduledMessages.applyAction', old)).rejects.toMatchObject({ message: 'scheduled_action:stale' });
    const fresh = applyInput(await review(target)); expect(fresh.checkedAt).not.toBe(old.checkedAt);
    expect(await model.mutate('scheduledMessages.applyAction', fresh)).toMatchObject({ enabled: true });
  } finally { vi.useRealTimers(); }
});
