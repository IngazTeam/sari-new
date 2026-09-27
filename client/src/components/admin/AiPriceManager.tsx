import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { aiPriceCardSaveInput, aiPriceHistoryOutput, aiPriceSaveOutput, type AiPriceCurrent, type AiPriceSave } from '@shared/ai-price-contract';

function AiPriceHistory({ price }: { price: AiPriceCurrent }) {
  const { t, i18n } = useTranslation();
  const [pages, setPages] = useState<number[]>([]);
  const history = trpc.aiSettings.getPriceHistory.useQuery({ provider: price.provider, model: price.model, beforeId: pages.at(-1) }, { retry: false });
  const valid = aiPriceHistoryOutput.safeParse(history.data);
  const data = !history.isError && !history.isFetching && valid.success ? valid.data : null;
  const usd = (value: number) => value.toLocaleString(i18n.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });
  return <section className="space-y-3 rounded-lg border p-3" data-price-history aria-label={t('aiBudget.historyTitle')}>
    <h3 className="font-semibold break-words">{t('aiBudget.historyTitle')} · <bdi>{price.provider} / {price.model}</bdi></h3>
    <p className="text-sm text-muted-foreground">{t('aiBudget.historyHelp')}</p>
    {history.isFetching ? <p role="status">{t('aiBudget.loading')}</p> : !data ? <p role="alert">{t('aiBudget.historyError')}</p> : <>
      {!data.entries.length && <p>{t('aiBudget.historyEmpty')}</p>}
      <ol className="space-y-3">{data.entries.map(entry => <li key={entry.id} className="space-y-1 border-b pb-3 break-words" data-price-revision>
        <p className="font-semibold"><bdi>{entry.card.version}</bdi> · {entry.card.enabled ? t('aiBudget.enabled') : t('aiBudget.disabled')}</p>
        <p>{new Date(entry.recordedAt).toLocaleString(i18n.language)} · {entry.origin === 'legacy' ? t('aiBudget.legacyRevision') : t('aiBudget.adminRevision', { id: entry.actorId })}</p>
        {entry.reference && <p className="whitespace-pre-wrap">{entry.reference}</p>}
        <p>{t('aiBudget.priceSummary', { input: usd(entry.card.inputUsdPerMillion), output: usd(entry.card.outputUsdPerMillion), flat: usd(entry.card.flatUsd) })}</p>
        <p>{t('aiBudget.maxInput')}: {entry.card.maxInputTokens.toLocaleString(i18n.language)}</p>
      </li>)}</ol>
    </>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={history.isFetching} onClick={() => void history.refetch()}>{t('aiBudget.refreshHistory')}</Button>
      <Button type="button" variant="outline" className="min-h-11" data-price-export disabled={!data?.entries.length} onClick={() => {
        if (!data) return;
        const blob = new Blob([JSON.stringify({ format: 'sary.ai-price-history.v1', exportedAt: new Date().toISOString(), provider: price.provider, model: price.model,
          scope: 'displayed-page', beforeId: pages.at(-1) ?? null, ...data }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'sary-ai-price-history.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>{t('aiBudget.exportHistoryPage')}</Button>
      <Button type="button" variant="outline" className="min-h-11" data-price-history-previous disabled={!pages.length || !data} onClick={() => setPages(current => current.slice(0, -1))}>{t('aiBudget.newerHistory')}</Button>
      <Button type="button" variant="outline" className="min-h-11" data-price-history-next disabled={!data?.nextBeforeId} onClick={() => { if (data?.nextBeforeId) setPages(current => [...current, data.nextBeforeId!]); }}>{t('aiBudget.olderHistory')}</Button>
    </div>
  </section>;
}

const empty = { provider: 'openai' as 'openai' | 'zahypi', model: '', version: '', input: '', output: '', flat: '0', maxInput: '', enabled: true, reference: '' };
export function AiPriceManager({ prices, available, onRefresh }: { prices: AiPriceCurrent[]; available: boolean; onRefresh: () => Promise<boolean> }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState(empty), [editing, setEditing] = useState<AiPriceCurrent | null>(null);
  const [history, setHistory] = useState<AiPriceCurrent | null>(null);
  const [frozen, setFrozen] = useState<AiPriceSave | null>(null), [message, setMessage] = useState<'invalidPrice' | 'priceConflict' | 'priceSaveUnknown' | 'priceSaved' | 'priceReplayed' | 'savedRefreshError' | 'priceReloadError' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const flight = useRef(false), save = trpc.aiSettings.savePriceCard.useMutation();
  const messages = { invalidPrice: t('aiBudget.invalidPrice'), priceConflict: t('aiBudget.priceConflict'), priceSaveUnknown: t('aiBudget.priceSaveUnknown'),
    priceSaved: t('aiBudget.priceSaved'), priceReplayed: t('aiBudget.priceReplayed'), savedRefreshError: t('aiBudget.savedRefreshError'), priceReloadError: t('aiBudget.priceReloadError') };
  const busy = save.isPending || refreshing, locked = busy || !!frozen || !available || message === 'priceReloadError';
  const reset = () => { setForm(empty); setEditing(null); setFrozen(null); };
  const refresh = async () => {
    if (flight.current) return;
    flight.current = true; setRefreshing(true);
    try { if (await onRefresh()) { reset(); setMessage(null); } else setMessage('priceReloadError'); }
    catch { setMessage('priceReloadError'); }
    finally { flight.current = false; setRefreshing(false); }
  };
  const submit = async (payload: AiPriceSave) => {
    if (flight.current) return;
    flight.current = true; setFrozen(payload); setMessage(null);
    try {
      const result = aiPriceSaveOutput.parse(await save.mutateAsync(payload));
      setHistory(null);
      setMessage(result.replayed ? 'priceReplayed' : 'priceSaved'); setRefreshing(true);
      try { if (await onRefresh()) reset(); else setMessage('savedRefreshError'); }
      catch { setMessage('savedRefreshError'); }
    } catch (error) {
      const code = (error as { data?: { code?: string } }).data?.code;
      setMessage(['CONFLICT', 'PRECONDITION_FAILED', 'FORBIDDEN', 'UNAUTHORIZED', 'BAD_REQUEST'].includes(code || '') ? 'priceConflict' : 'priceSaveUnknown');
    } finally { setRefreshing(false); flight.current = false; }
  };
  const usd = (value: number) => value.toLocaleString(i18n.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });
  return <section className="space-y-4 min-w-0" data-ai-prices>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{t('aiBudget.priceTitle')}</h3>
      <Button type="button" variant="outline" className="min-h-11" data-price-reload disabled={busy} onClick={() => void refresh()}>{t('aiBudget.reloadPrices')}</Button>
    </div>
    <p className="text-sm text-muted-foreground">{t('aiBudget.priceVersionHelp')}</p>
    {available && !prices.length && <p role="status">{t('aiBudget.noPrices')}</p>}
    {available && <ul className="space-y-3">{prices.map(price => <li className="rounded-lg border p-3 space-y-2 break-words" key={`${price.provider}:${price.model}`}>
      <p className="font-semibold"><bdi>{price.provider} / {price.model}</bdi></p>
      <p><bdi>{price.version}</bdi> · {price.enabled ? t('aiBudget.enabled') : t('aiBudget.disabled')}</p>
      <p className="text-sm">{t('aiBudget.priceSummary', { input: usd(price.inputUsdPerMillion), output: usd(price.outputUsdPerMillion), flat: usd(price.flatUsd) })}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" variant="outline" data-price-edit disabled={locked} onClick={() => {
          setEditing(price); setForm({ provider: price.provider, model: price.model, version: '', input: String(price.inputUsdPerMillion), output: String(price.outputUsdPerMillion), flat: String(price.flatUsd), maxInput: String(price.maxInputTokens), enabled: price.enabled, reference: '' }); setMessage(null);
        }}>{t('aiBudget.edit')}</Button>
        <Button type="button" className="min-h-11" variant="outline" data-price-show-history disabled={busy} onClick={() => setHistory(price)}>{t('aiBudget.historyTitle')}</Button>
      </div>
    </li>)}</ul>}
    {history && <AiPriceHistory key={`${history.provider}/${history.model}`} price={history} />}
    {message && <p className="break-words" role={['priceSaved', 'priceReplayed'].includes(message) ? 'status' : 'alert'} data-price-message>{messages[message]}</p>}
    {frozen && message === 'priceSaveUnknown' && <Button type="button" className="min-h-11" data-price-retry disabled={busy} onClick={() => void submit(frozen)}>{t('aiBudget.retrySamePrice')}</Button>}
    <form onSubmit={event => {
      event.preventDefault(); if (locked || flight.current) return;
      const payload = aiPriceCardSaveInput.safeParse({ provider: form.provider, model: form.model, version: form.version,
        inputUsdPerMillion: Number(form.input), outputUsdPerMillion: Number(form.output), flatUsd: Number(form.flat), maxInputTokens: Number(form.maxInput),
        enabled: form.enabled, reference: form.reference, expectedRevision: editing?.revision ?? null, requestId: crypto.randomUUID() });
      if (!payload.success || editing?.version === payload.data.version) { setMessage('invalidPrice'); return; }
      void submit(payload.data);
    }}>
      <fieldset disabled={locked} className="space-y-3 min-w-0">
        <legend className="mb-2 font-semibold">{editing ? t('aiBudget.editingPrice', { version: editing.version }) : t('aiBudget.newPrice')}</legend>
        <p className="text-sm text-muted-foreground">{t('aiBudget.priceHelp')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0"><Label htmlFor="budget-provider">{t('aiBudget.provider')}</Label><select id="budget-provider" className="block w-full min-h-11 rounded border bg-background p-2" value={form.provider} disabled={!!editing} onChange={e => setForm({ ...form, provider: e.target.value as 'openai' | 'zahypi' })}><option value="openai">OpenAI</option><option value="zahypi">ZahyPi</option></select></div>
          <div className="min-w-0"><Label htmlFor="budget-model">{t('aiBudget.model')}</Label><Input className="min-h-11" id="budget-model" dir="ltr" value={form.model} disabled={!!editing} required maxLength={128} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
          <div className="min-w-0"><Label htmlFor="budget-version">{t('aiBudget.version')}</Label><Input className="min-h-11" id="budget-version" value={form.version} required maxLength={80} onChange={e => setForm({ ...form, version: e.target.value })} /></div>
          <div className="min-w-0"><Label htmlFor="budget-max-input">{t('aiBudget.maxInput')}</Label><Input className="min-h-11" id="budget-max-input" type="number" min="1" max="10000000" step="1" required value={form.maxInput} onChange={e => setForm({ ...form, maxInput: e.target.value })} /></div>
          <div className="min-w-0"><Label htmlFor="budget-input">{t('aiBudget.inputRate')}</Label><Input className="min-h-11" id="budget-input" type="number" min="0" max="1000000" step="0.000001" required value={form.input} onChange={e => setForm({ ...form, input: e.target.value })} /></div>
          <div className="min-w-0"><Label htmlFor="budget-output">{t('aiBudget.outputRate')}</Label><Input className="min-h-11" id="budget-output" type="number" min="0" max="1000000" step="0.000001" required value={form.output} onChange={e => setForm({ ...form, output: e.target.value })} /></div>
          <div className="min-w-0"><Label htmlFor="budget-flat">{t('aiBudget.flat')}</Label><Input className="min-h-11" id="budget-flat" type="number" min="0" max="1000000" step="0.000001" required value={form.flat} onChange={e => setForm({ ...form, flat: e.target.value })} /></div>
          <div className="min-w-0"><Label htmlFor="budget-price-reference">{t('aiBudget.priceReference')}</Label><Input className="min-h-11" id="budget-price-reference" minLength={8} maxLength={240} required value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
        </div>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /><span>{t('aiBudget.enablePrice')}</span></label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" data-price-save>{save.isPending ? t('aiBudget.saving') : t('aiBudget.savePrice')}</Button>
          {editing && <Button type="button" variant="outline" className="min-h-11" onClick={() => { reset(); setMessage(null); }}>{t('aiBudget.newPrice')}</Button>}
        </div>
      </fieldset>
    </form>
  </section>;
}
