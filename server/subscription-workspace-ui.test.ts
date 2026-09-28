// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { subscriptionWorkspaceEn } from '../client/src/locales/subscription-workspace';
const api = vi.hoisted(() => ({ current: {} as any, payments: {} as any, plans: {} as any, callbacks: {} as any, pending: false, cancel: vi.fn(), subscribe: vi.fn(), refresh: vi.fn(), refreshPayments: vi.fn(), invalidate: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, values: Record<string, unknown> = {}) => {
  const text = key.startsWith('merchantUx.subscriptionWorkspace.') ? subscriptionWorkspaceEn[key.split('.').at(-1) as keyof typeof subscriptionWorkspaceEn] : key;
  return text.replace(/{{(\w+)}}/g, (_, name) => String(values[name] ?? ''));
} }) }));
vi.mock('@/lib/trpc', () => ({ trpc: {
  useUtils: () => ({ merchantSubscription: { invalidate: api.invalidate } }),
  merchantSubscription: { getCurrentSubscription: { useQuery: () => ({ ...api.current, refetch: api.refresh }) }, cancelSubscription: { useMutation: (callbacks: any) => { api.callbacks = callbacks; return { mutate: api.cancel, isPending: api.pending }; } }, subscribe: { useMutation: () => ({ mutateAsync: api.subscribe }) } },
  payment: { listTransactions: { useQuery: () => ({ ...api.payments, refetch: api.refreshPayments }) } },
  subscriptionPlans: { listPlans: { useQuery: () => ({ ...api.plans, refetch: api.refresh }) } },
} }));
import MySubscription from '../client/src/pages/merchant/MySubscription';
import SubscriptionPlans from '../client/src/pages/merchant/SubscriptionPlans';
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); api.pending = false;
  api.current = { data: { id: 91, status: 'active', planId: 2, billingCycle: 'monthly', daysRemaining: 20, startDate: '2026-09-01', endDate: '2026-10-01', lastResetAt: '2026-09-01', conversationsUsed: 720, messagesUsed: 1300, voiceMessagesUsed: 25, plan: { id: 2, name: 'النمو', nameEn: 'Growth', maxCustomers: 2000, maxWhatsAppNumbers: 3, conversationLimit: 2000, messageLimit: -1, voiceMessageLimit: 100, monthlyPrice: '249', yearlyPrice: '2490', currency: 'SAR', features: '[]' } } };
  api.payments = { data: [{ id: 17, type: 'renewal', status: 'refunded', amount: '249.00', currency: 'SAR', createdAt: '2026-09-01' }] };
  api.plans = { data: [api.current.data.plan] };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(React.createElement(MySubscription)));
const click = (label: string) => act(async () => {
  const element = Array.from(document.querySelectorAll('button')).find(el => el.textContent === label); expect(element).toBeTruthy(); element!.click();
});
it('shows canonical conversation, message and voice quotas and refunded transactions', async () => {
  await render();
  expect(container.querySelector('[aria-label="Conversations"]')?.textContent).toContain('720');
  expect(container.querySelector('[aria-label="Messages"]')?.textContent).toContain('Unlimited');
  expect(container.querySelector('[aria-label="Voice messages"]')?.textContent).toContain('Remaining: 75');
  expect(container.textContent).toContain('Refunded'); expect(container.textContent).toContain('Renewal');
  expect(container.textContent).not.toContain('@ts-ignore');
});
it('supports trials without a plan and hides cancellation for them', async () => {
  api.current.data = { ...api.current.data, status: 'trial', planId: null, plan: null, conversationsUsed: 12, voiceMessagesUsed: 3 };
  await render();
  expect(container.querySelector('[aria-label="Conversations"]')?.textContent).toContain('Remaining: 88');
  expect(container.querySelector('[aria-label="Voice messages"]')?.textContent).toContain('Remaining: 17');
  expect(container.textContent).not.toContain('Cancel subscription');
});
it('keeps payment history visible without an active subscription', async () => {
  api.current.data = null; await render();
  expect(container.textContent).toContain('No current subscription'); expect(container.textContent).toContain('Refunded');
});
it('does not replace failed or loading data with empty history or stale quotas', async () => {
  api.current.isError = true; api.payments.isError = true; await render();
  expect(container.textContent).toContain('Could not load your subscription'); expect(container.textContent).toContain('Could not load payments');
  expect(container.querySelector('progress')).toBeNull(); expect(container.textContent).not.toContain('No recorded transactions');
  api.current = { isLoading: true }; api.payments = { isLoading: true }; await render();
  expect(container.textContent).toContain('Loading payments'); expect(container.textContent).not.toContain('No current subscription');
});
it('opens an explicit immediate-cancellation review and sends only the reviewed subscription id', async () => {
  await render(); await click('Cancel subscription');
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('ends access immediately');
  expect(api.cancel).not.toHaveBeenCalled();
  await click('Yes, cancel now'); expect(api.cancel).toHaveBeenCalledWith({ expectedSubscriptionId: 91 });
});
it('keeps the subscription when confirmation is dismissed', async () => {
  await render(); await click('Cancel subscription'); await click('Keep subscription');
  expect(api.cancel).not.toHaveBeenCalled(); expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.activeElement?.textContent).toBe('Cancel subscription');
});
it('prevents cancellation when the subscription changed after opening the review', async () => {
  await render(); await click('Cancel subscription'); api.current.data = { ...api.current.data, id: 92 }; await render();
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('changed during review');
  await click('Yes, cancel now'); expect(api.cancel).not.toHaveBeenCalled();
});
it('keeps failed cancellation review open and invalidates billing after success', async () => {
  await render(); await click('Cancel subscription');
  await act(async () => api.callbacks.onError({ data: { code: 'CONFLICT' }, message: 'private SQL' }));
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('changed during review');
  expect(document.body.textContent).not.toContain('private SQL');
  await act(async () => api.callbacks.onSuccess()); expect(api.invalidate).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});
it('blocks duplicate confirmation and dismissal during a pending request', async () => {
  await render(); await click('Cancel subscription'); api.pending = true; await render();
  await click('Cancelling…'); await click('Keep subscription');
  expect(api.cancel).not.toHaveBeenCalled(); expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();
});
it('keeps malformed plan features from crashing the plan picker', async () => {
  api.plans.data[0].features = '{"not":"an array"}';
  await act(async () => root.render(React.createElement(SubscriptionPlans)));
  expect(container.textContent).toContain('249'); expect(api.subscribe).not.toHaveBeenCalled();
});
it('does not offer checkout when subscription state failed to load', async () => {
  api.current.isError = true;
  await act(async () => root.render(React.createElement(SubscriptionPlans)));
  expect(container.textContent).toContain('Could not load plans'); expect(container.textContent).not.toContain('249');
});
