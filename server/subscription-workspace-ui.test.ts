// @vitest-environment jsdom
import { cancellationReview } from "../shared/subscription-cancellation";
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
import en from '../client/src/locales/en.json';
const state = vi.hoisted(() => ({ language: 'en' }));
vi.mock('@/lib/trpc', () => import('../prototypes/tenant-dashboard/src/service-preview-api'));
vi.mock('wouter', () => import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: state.language }, t: (key: string) => key.split('.').reduce((o: any, k) => o?.[k], state.language === 'ar' ? ar : en) || key }) }));
import MySubscription from '../client/src/pages/merchant/MySubscription';
import { ServicePreviewContext } from '../prototypes/tenant-dashboard/src/service-preview-api';
import { ServicePreviewModel, type ServiceMode } from '../prototypes/tenant-dashboard/src/service-preview-model';
import { scopedBilling, scopedBillingHistory } from '../client/src/lib/subscription-billing-view';
let root: Root, host: HTMLDivElement, model: ServicePreviewModel;
const c = () => state.language === 'ar' ? ar.subscriptionBillingUx : en.subscriptionBillingUx;
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.language = 'en'; history.replaceState(null, '', '/?path=/merchant/subscription'); host = document.createElement('div'); document.body.append(host); root = createRoot(host); model = new ServicePreviewModel(269); });
afterEach(async () => { await act(async () => root.unmount()); model.dispose(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(React.createElement(ServicePreviewContext.Provider, { value: model }, React.createElement(MySubscription))));
const click = (text: string) => act(async () => { const el = Array.from((document.querySelector('[role="alertdialog"]') ?? document).querySelectorAll<HTMLButtonElement>('button')).find(n => n.textContent === text); expect(el).toBeTruthy(); el!.click(); });
const navigate = (tab: string) => act(async () => { history.replaceState(null, '', '/?path=/merchant/subscription&tab=' + tab); window.dispatchEvent(new PopStateEvent('popstate')); });
const mode = (value: ServiceMode) => { model.dispose(); model = new ServicePreviewModel(269, value); };
it.each(['ar','en'])('shows canonical quotas and translated navigation in %s', async lang => { state.language = lang; await render(); expect(host.textContent).toContain(c().title); expect(host.textContent).toContain(c().unlimited); expect(host.querySelectorAll('progress')).toHaveLength(1); expect(host.textContent).not.toMatch(/subscriptionBillingUx\.|usageWorkspaceUx\./); expect(model.operations).toBe(0); });
it.each(['loading','failure','stale-error','foreign','session','forbidden'] as ServiceMode[])('hides stale quotas and cancellation for %s', async value => { mode(value); await render(); expect(host.querySelector('progress')).toBeNull(); expect(host.querySelector('.sbw-management')).toBeNull(); expect(model.operations).toBe(0); });
it.each(['empty','legacy','unavailable-reference','readonly'] as ServiceMode[])('keeps %s honest and hides cancellation', async value => { mode(value); await render(); expect(host.textContent).toContain(value === 'empty' ? c().noneBody : value === 'legacy' ? c().unknownBody : value === 'unavailable-reference' ? c().ambiguousBody : c().readonly); expect(host.querySelector('.sbw-management')).toBeNull(); });
it('shows filtered paged payment history with exact zero, amounts and no sales-payment links', async () => {
 await navigate('payments'); await render(); expect(host.querySelectorAll('.sbw-record')).toHaveLength(25); expect(host.textContent).toContain(c().payment_refunded); expect(host.textContent).toContain('SAR'); expect(host.textContent).not.toContain('NaN');
 await click(c().next); expect(host.querySelectorAll('.sbw-record')).toHaveLength(6); await click(c().previous); expect(host.querySelectorAll('.sbw-record')).toHaveLength(25);
 const select = host.querySelector<HTMLSelectElement>('select')!; await act(async () => { select.value = 'refunded'; select.dispatchEvent(new Event('change', { bubbles: true })); });
 expect(host.querySelectorAll('.sbw-record')).toHaveLength(7); expect(Array.from(host.querySelectorAll('.sbw-record .sbw-status')).every(n => n.textContent === c().payment_refunded)).toBe(true);
 expect(host.querySelector('a[href*="/merchant/payments/"]')).toBeNull(); expect(model.operations).toBe(0);
});
it('keeps history independent of summary availability', async () => {
 const read = model.read.bind(model); vi.spyOn(model, 'read').mockImplementation((name,input) => name === 'merchantSubscription.workspace' ? { data: undefined, error: Error('PRIVATE'), isLoading: false, isFetching: false } as any : read(name,input));
 await navigate('payments'); await render(); expect(host.querySelectorAll('.sbw-record')).toHaveLength(25); expect(host.textContent).not.toContain('PRIVATE');
});
it('does not load owner payment history for a known read-only member', async () => { mode('readonly'); const read = vi.spyOn(model,'read'); await navigate('payments'); await render(); expect(host.textContent).toContain(c().ownerHistoryBody); expect(read.mock.calls.some(([name]) => name === 'merchantSubscription.paymentHistory')).toBe(false); });
it('keeps unavailable history distinct from empty history', async () => { mode('stale-error'); await navigate('payments'); await render(); expect(host.querySelectorAll('.sbw-record')).toHaveLength(0); expect(host.textContent).not.toContain(c().noPayments); });
it('requires a separate cancellation review and confirms the fresh local record', async () => {
 const mutate = vi.spyOn(model,'mutate'); await render(); await click(c().cancel); expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(c().cancelImpact); expect(mutate).not.toHaveBeenCalled();
 await click(c().cancelConfirm); expect(mutate).toHaveBeenCalledWith('merchantSubscription.cancelSubscription', { expected: expect.objectContaining({id: 41, planId: 10, status: "active"}) }); expect(document.body.textContent).toContain(c().cancel_done); expect(model.operations).toBe(1);
});
it('dismisses review and restores focus without changing the subscription', async () => { await render(); await click(c().cancel); await click(c().keep); expect(model.operations).toBe(0); expect(document.querySelector('[role="alertdialog"]')).toBeNull(); await vi.waitFor(() => expect(document.activeElement?.textContent).toBe(c().cancel)); });
it('prevents cancellation after the reviewed subscription or plan changed', async () => {
 await render(); await click(c().cancel); const read = model.read.bind(model); vi.spyOn(model,'read').mockImplementation((name,input) => { const r=read(name,input); return name === 'merchantSubscription.workspace' ? {...r,data:{...r.data,subscription:{...r.data.subscription,planId:99}}} : r; }); await render();
 expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(c().cancel_conflict); await click(c().cancelConfirm); expect(model.operations).toBe(0);
});
it('blocks duplicate confirmation and dismissal while the request is pending', async () => { mode('pending-save'); await render(); await click(c().cancel); await click(c().cancelConfirm); expect(document.body.textContent).toContain(c().cancel_sending); await click(c().close); expect(document.querySelector('[role="alertdialog"]')).toBeTruthy(); expect(model.pending).toBe(1); await act(async () => model.finishPending()); expect(model.operations).toBe(1); });
it('does not claim cancellation after a lost response, and rereads without sending it twice', async () => { mode('uncertain-save'); await render(); await click(c().cancel); await click(c().cancelConfirm); expect(document.body.textContent).toContain(c().cancel_unknown); expect(model.operations).toBe(1); await click(c().refresh); expect(model.operations).toBe(1); expect(document.body.textContent).toContain(c().cancel_done); });
it('shows conflict without exposing raw errors', async () => { mode('save-conflict'); await render(); await click(c().cancel); await click(c().cancelConfirm); expect(document.body.textContent).toContain(c().cancel_conflict); expect(model.operations).toBe(0); });
it('rejects cross-account, cross-tenant, extra and mismatched query snapshots', () => {
 const data = model.read('merchantSubscription.workspace').data;
 expect(scopedBilling(data,1269,269)).toBeTruthy(); expect(scopedBilling(data,1270,269)).toBeNull(); expect(scopedBilling({...data,merchantId:270},1269,269)).toBeNull(); expect(scopedBilling({...data,secret:'x'},1269,269)).toBeNull();
 const history = model.read('merchantSubscription.paymentHistory',{}).data; expect(scopedBillingHistory(history,1269,269,history.input)).toBeTruthy(); expect(scopedBillingHistory(history,1269,269,{...history.input,status:'failed'})).toBeNull();
});

it('keeps an incorrect cancellation receipt unknown even when it reports success', async () => {
 const mutate=model.mutate.bind(model);vi.spyOn(model,'mutate').mockImplementation(async (name,input) => {const result=await mutate(name,input);return name==='merchantSubscription.cancelSubscription'?{...result,subscriptionId:999}:result;});
 await render();await click(c().cancel);await click(c().cancelConfirm);expect(document.body.textContent).toContain(c().cancel_unknown);expect(document.body.textContent).not.toContain(c().cancel_done);expect(model.operations).toBe(1);
});
