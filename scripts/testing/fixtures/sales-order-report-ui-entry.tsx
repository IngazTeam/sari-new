import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '@trpc/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { trpc } from '../../../client/src/lib/trpc';
import SalesEvidence from '../../../client/src/pages/admin/SalesEvidence';
import ar from '../../../client/src/locales/ar.json';
import en from '../../../client/src/locales/en.json';

declare const __REPORT_FIXTURES__: Record<string, any>;
const w = window as any, params = new URLSearchParams(location.search), mode = params.get('case') ?? 'mixed';
w.__salesReads = []; w.__salesWrites = []; w.__salesAborted = 0;
w.__salesFocus = () => { focusManager.setFocused(false); focusManager.setFocused(true); };
w.__salesOnline = (value: boolean) => onlineManager.setOnline(value);
const queryClient = new QueryClient();
const client = trpc.createClient({ links: [() => ({ op }) => observable(observer => {
  if (op.type !== 'query' || op.path !== 'inboundOperations.salesOrderReport') {
    w.__salesWrites.push(op); observer.error(new TRPCClientError('Unexpected operation')); return;
  }
  w.__salesReads.push(structuredClone(op.input));
  const input = op.input as any, ordinal = w.__salesReads.length;
  const timer = setTimeout(() => {
    const code = w.__salesNextError || (['FORBIDDEN','UNAUTHORIZED','PRECONDITION_FAILED','INTERNAL_SERVER_ERROR'].includes(mode) ? mode : null);
    if (code) { w.__salesNextError = null; observer.error(TRPCClientError.from({ error: { message: '<img src=x onerror=window.__salesXss=1> private server credentials', code: -32603, data: { code, httpStatus: 403 } } })); return; }
    let report = structuredClone(__REPORT_FIXTURES__[mode] ?? __REPORT_FIXTURES__.mixed);
    if (mode === 'race' && input.merchantId === 8) report = structuredClone(__REPORT_FIXTURES__.empty);
    report.merchantId = input.merchantId; report.orders.forEach((order: any) => { order.merchantId = input.merchantId; });
    report.scope.fromFactId = input.fromFactId;
    if (input.throughFactId !== undefined) report.scope.throughFactId = input.throughFactId;
    if (mode === 'foreign') report.merchantId++;
    if (mode === 'range-mismatch') report.scope.fromFactId++;
    if (mode === 'unsupported') report.version = 'v2';
    if (mode === 'xss') report.orders[0].orderKey = '<img src=x onerror=window.__salesXss=1>';
    if (mode === 'refresh-changed' && ordinal > 1) report = { ...__REPORT_FIXTURES__.refund, merchantId: input.merchantId };
    observer.next({ result: { data: report } }); observer.complete();
  }, mode === 'race' && input.merchantId === 7 || mode === 'slow' ? 1300 : ordinal > 1 ? 400 : 20);
  return () => { clearTimeout(timer); w.__salesAborted++; };
})] });
async function render() {
  const lng = params.get('lang') === 'en' ? 'en' : 'ar';
  document.documentElement.lang = lng; document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  await i18n.use(initReactI18next).init({ lng, resources: { ar: { translation: ar }, en: { translation: en } }, interpolation: { escapeValue: false } });
  createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}><main className="mx-auto max-w-6xl p-4"><SalesEvidence /></main></QueryClientProvider>
  </trpc.Provider>);
}
void render();
