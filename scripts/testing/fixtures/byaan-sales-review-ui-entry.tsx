import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '@trpc/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { trpc } from '../../../client/src/lib/trpc';
import { ByaanSalesReview } from '../../../client/src/components/ByaanSalesReview';
import ByaanDashboard from '../../../client/src/pages/ByaanDashboard';
import ar from '../../../client/src/locales/merchant-ux.ar';
import en from '../../../client/src/locales/merchant-ux.en';

const w = window as any, params = new URLSearchParams(location.search), mode = params.get('case') || 'ready';
w.__reads = []; w.__writes = []; w.__revoked = false; w.__error = false; w.__scope = 20;
w.__recoveries = [];
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
w.__refresh = () => qc.invalidateQueries(); w.__online = (value: boolean) => onlineManager.setOnline(value);
const time = '2026-09-28T00:00:00.000Z';
const item = (id: number, index: number) => {
  const state = ['reported', 'unknown', 'preparing', 'dispatching', 'not_sent', 'reported'][index % 6];
  const evidence = index % 6 === 5 ? 'invalid' : ['preparing', 'dispatching'].includes(state) ? 'pending' : 'consistent';
  return { id, requestId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, kind: index % 2 ? 'payment' : 'enrollment', state, evidence,
    reference: state === 'reported' && evidence === 'consistent' ? '9'.repeat(100) : null, createdAt: time, updatedAt: time,
    paymentEvidence: 'not_verified', providerStatus: 'not_checked' };
};
const client = trpc.createClient({ links: [() => ({ op }) => observable(observer => {
  const recovery = op.path === 'byaan.recoverEnrollmentProjection';
  if (op.type !== 'query') {
    w.__writes.push({ path: op.path, input: op.input });
    if (!recovery) { observer.error(Error('Unexpected write')); return; }
  } else w.__reads.push({ path: op.path, input: op.input });
  const timer = setTimeout(() => {
    const fail = () => observer.error(TRPCClientError.from({ error: { message: 'private SQL token <img src=x onerror=window.__xss=1>', code: -32603, data: { code: 'FORBIDDEN' } } } as any));
    if (op.path === 'byaan.getStatus') {
      if (mode === 'status-error') { fail(); return; }
      observer.next({ result: { data: { connected: false } } }); observer.complete(); return;
    }
    if (w.__revoked || mode === 'denied') { fail(); return; }
    if (recovery) {
      if (mode === 'recover-error') { fail(); return; }
      const operationId = (op.input as any).operationId, prior = w.__recoveries.find((r: any) => r.operationId === operationId);
      let value: any = prior ? { ...prior, replayed: true } : { merchantId: w.__scope, operationId, quotationId: 41,
        requestId: `00000000-0000-4000-8000-${String(operationId).padStart(12, '0')}`, outcome: 'projection_present', replayed: false,
        recovery: { reviewerUserId: 7, restoredAt: time }, providerStatus: 'not_checked', paymentEvidence: 'not_verified', externalRequest: 'not_sent', customerMessage: 'not_sent' };
      if (!prior) w.__recoveries.push(value);
      if (mode === 'recover-lost' && w.__writes.length === 1) { fail(); return; }
      if (mode === 'recover-scope') value = { ...value, merchantId: 999 };
      if (mode === 'recover-operation') value = { ...value, operationId: 29 };
      if (mode === 'recover-request') value = { ...value, requestId: '00000000-0000-4000-8000-000000000999' };
      if (mode === 'recover-private') value = { ...value, token: 'private SQL' };
      if (mode === 'recover-paid') value = { ...value, paymentEvidence: 'paid' };
      observer.next({ result: { data: value } }); observer.complete(); return;
    }
    if (op.path === 'byaan.salesReviewAccess') { observer.next({ result: { data: { merchantId: w.__scope } } }); observer.complete(); return; }
    if (op.path !== 'byaan.listSalesOperations' || mode === 'error' || w.__error) { fail(); return; }
    const input = op.input as any;
    const result: any = { merchantId: mode === 'wrong-scope' ? 999 : w.__scope,
      items: mode === 'empty' ? [] : Array.from({ length: input.beforeId ? 2 : mode === 'paged' ? 20 : 6 }, (_, n) => item((input.beforeId ? input.beforeId - 1 : 30) - n, n)),
      nextCursor: mode === 'paged' && !input.beforeId ? 11 : null };
    if (mode === 'extra') result.secret = 'private';
    if (mode === 'duplicate') result.items[1].id = 30;
    if (mode === 'xss') result.items[0].reference = '<img src=x onerror=window.__xss=1>';
    if (mode === 'false-payment') result.items[0].paymentEvidence = 'paid';
    if (mode === 'old-page' && input.beforeId) result.items = [item(30, 0)];
    if (mode === 'old-page' && !input.beforeId) { result.items = Array.from({ length: 20 }, (_, n) => item(30 - n, n)); result.nextCursor = 11; }
    observer.next({ result: { data: result } }); observer.complete();
  }, mode === 'slow' || recovery && mode === 'recover-slow' ? 1500 : 60);
  return () => clearTimeout(timer);
})] });
(async () => {
  const lng = params.get('lang') === 'en' ? 'en' : 'ar'; document.documentElement.lang = lng; document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  await i18n.use(initReactI18next).init({ lng, resources: { ar: { translation: { merchantUx: ar } }, en: { translation: { merchantUx: en } } }, interpolation: { escapeValue: false } });
  createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={qc}><QueryClientProvider client={qc}>
    <main className="mx-auto max-w-5xl p-3">{['disconnected', 'status-error'].includes(mode) ? <ByaanDashboard/> : <ByaanSalesReview/>}</main>
  </QueryClientProvider></trpc.Provider>);
})();
