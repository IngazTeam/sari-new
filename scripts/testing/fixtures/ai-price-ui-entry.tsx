import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '@trpc/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Toaster } from 'sonner';
import { trpc } from '../../../client/src/lib/trpc';
import { AiBudgetCard } from '../../../client/src/components/admin/AiBudgetCard';
import { AiCapabilityCard } from '../../../client/src/components/admin/AiCapabilityCard';
import { AiBudgetAlerts } from '../../../client/src/components/admin/AiBudgetAlerts';
import { buildAiCapabilityManifest } from '../../../shared/ai-capabilities';
import ar from '../../../client/src/locales/ar.json';
import en from '../../../client/src/locales/en.json';
import merchantUxAr from '../../../client/src/locales/merchant-ux.ar';
import merchantUxEn from '../../../client/src/locales/merchant-ux.en';

const w = window as any, params = new URLSearchParams(location.search), mode = params.get('case') || 'ready';
w.__priceWrites = []; w.__priceQueries = []; w.__priceSaved = false; w.__historyFailed = false; w.__reconcileWrites = [];
const initial = { provider: 'openai', model: mode === 'long' ? 'model-'.repeat(20) : 'synthetic-model', version: 'approved-v1', inputUsdPerMillion: 0.000001,
  outputUsdPerMillion: 2, flatUsd: 0, maxInputTokens: 32000, enabled: true, revision: 'a'.repeat(64) };
let current = initial;
const entry = (id: number) => ({ id, card: Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'revision')), origin: id === 1 ? 'legacy' : 'admin', actorId: id === 1 ? null : 77,
  reference: id === 1 ? null : mode === 'xss' ? '<img src=x onerror=window.__priceXss=1>' + 'x'.repeat(180) : 'synthetic-contract-reference', recordedAt: '2026-09-27T00:00:00.000Z' });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
w.__refreshPrices = () => queryClient.invalidateQueries();
const client = trpc.createClient({ links: [() => ({ op }) => observable(observer => {
  const reply = (data: any) => { observer.next({ result: { data } }); observer.complete(); };
  const fail = (code = 'INTERNAL_SERVER_ERROR') => observer.error(TRPCClientError.from({ error: { message: 'private SQL price password', code: -32603, data: { code } } } as any));
  if (op.type === 'query') {
    w.__priceQueries.push({ path: op.path, input: op.input });
    if (op.path === 'aiSettings.getBudgetAlerts') {
      if (mode === 'alerts-error' || w.__budgetReadFailed) { fail('FORBIDDEN'); return; }
      if (mode === 'alerts-loading') return;
      const level = w.__alertLevel ?? (mode === 'alerts-70' ? 70 : mode === 'alerts-90' ? 90 : mode === 'alerts-100' ? 100 : 0);
      const data: any = { period: '2026-09-27', configured: true, enabled: true, limitUsd: 100, spentUsd: level / 2, reservedUsd: level / 2, level,
        events: mode.startsWith('alerts-') && mode !== 'alerts-empty' ? [90, 70].map(threshold => ({ period: '2026-09-27', threshold, limitUsd: 100, spentUsd: 45, reservedUsd: 45, observedAt: '2026-09-27T06:00:00.000Z' })) : [] };
      if (mode === 'alerts-invalid') data.events[0].privateKey = 'private SQL';
      reply(data);
    } else if (op.path === 'aiSettings.getBudget') {
      if (w.__budgetReadFailed) { fail('FORBIDDEN'); return; }
      if (mode === 'loading') return;
      if (mode === 'budget-error' && !w.__budgetRecovered || mode === 'refresh-error' && w.__priceSaved) { w.__budgetRecovered = true; fail(); return; }
      reply({ configured: true, enabled: true, configuredLimitUsd: 100, effectiveLimitUsd: 100, spentUsd: 12, reservedUsd: 3, unknownCount: 0,
        pending: mode.startsWith('reconcile-') ? [{ reservationKey: 'a'.repeat(64), requestId: 'synthetic-request', provider: 'openai', model: 'synthetic-model', scope: 'platform:synthetic', reservedUsd: 1 }] : [],
        prices: mode === 'empty' && !w.__priceSaved ? [] : [current] });
    } else if (op.path === 'aiSettings.getPriceHistory') {
      if (mode === 'history-error' || w.__historyFailed) { fail(); return; }
      const before = (op.input as any).beforeId;
      const data: any = { entries: mode === 'empty-history' ? [] : mode === 'pages' ? Array.from({ length: before ? 2 : 20 }, (_, i) => entry((before || 23) - 1 - i)) : [entry(2), entry(1)], nextBeforeId: mode === 'pages' && !before ? 3 : null };
      if (mode === 'invalid-history') data.entries[0].privateToken = 'unexpected-data';
      reply(data);
    } else { fail(); }
    return;
  }
  if (op.path === 'aiSettings.reconcileBudget') {
    w.__reconcileWrites.push(structuredClone(op.input));
    const timer = setTimeout(() => mode === 'reconcile-error' ? fail('FORBIDDEN') : reply({ success: true }), 200);
    return () => clearTimeout(timer);
  }
  w.__priceWrites.push(structuredClone(op.input));
  const input = op.input as any;
  const timer = setTimeout(() => {
    if (mode === 'save-conflict') { fail('CONFLICT'); return; }
    if (mode === 'save-error') { fail(); return; }
    if (mode === 'invalid-save') { reply({ success: true, privateToken: 'invalid private field' }); return; }
    w.__priceSaved = true;
    current = { ...initial, ...Object.fromEntries(Object.entries(input).filter(([key]) => !['requestId', 'expectedRevision', 'reference'].includes(key))), revision: 'b'.repeat(64) };
    if (mode === 'lost-ack' && w.__priceWrites.length === 1) { fail(); return; }
    reply({ success: true, revisionId: 3, revision: current.revision, replayed: w.__priceWrites.length > 1 });
  }, 350);
  return () => clearTimeout(timer);
})] });
const createUrl = URL.createObjectURL.bind(URL);
URL.createObjectURL = blob => { if (blob instanceof Blob) void blob.text().then(text => { w.__priceExport = JSON.parse(text); }); return createUrl(blob); };
async function render() {
  const lng = params.get('lang') === 'en' ? 'en' : 'ar';
  document.documentElement.lang = lng; document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  await i18n.use(initReactI18next).init({ lng, resources: { ar: { translation: { ...ar, merchantUx: merchantUxAr } }, en: { translation: { ...en, merchantUx: merchantUxEn } } }, interpolation: { escapeValue: false } });
  const manifest = buildAiCapabilityManifest({ enabled: true, textProvider: 'zahypi', textModel: 'synthetic-qwen', openaiCredential: 'configured', zahypiCredential: 'configured' });
  createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}>
    <Toaster /><main className="mx-auto max-w-5xl p-3 space-y-4">{mode.startsWith('alerts-') && <aside data-alert-banner><AiBudgetAlerts /></aside>}<AiBudgetCard /><AiCapabilityCard manifest={manifest} loading={false} failed={false} refreshing={false} onRefresh={() => {}} /></main>
  </QueryClientProvider></trpc.Provider>);
}
void render();
