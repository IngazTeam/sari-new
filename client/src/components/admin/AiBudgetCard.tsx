import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function AiBudgetCard() {
  const { t } = useTranslation();
  const budget = trpc.aiSettings.getBudget.useQuery();
  const [provider, setProvider] = useState<'openai' | 'zahypi'>('openai');
  const [model, setModel] = useState('');
  const [version, setVersion] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [flat, setFlat] = useState('0');
  const [maxInput, setMaxInput] = useState('');
  const [priceEnabled, setPriceEnabled] = useState(true);
  const [reservation, setReservation] = useState('');
  const [billed, setBilled] = useState('');
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const reconcile = trpc.aiSettings.reconcileBudget.useMutation({
    onSuccess: () => { toast.success(t('aiBudget.reconciliationSaved')); setReservation(''); setConfirmed(false); void budget.refetch(); },
    onError: error => toast.error(error.message),
  });
  const save = trpc.aiSettings.savePriceCard.useMutation({
    onSuccess: () => { toast.success(t('aiBudget.priceSaved')); void budget.refetch(); },
    onError: error => toast.error(error.message),
  });
  const usd = (value: number) => value.toLocaleString('ar-SA', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  return <Card>
    <CardHeader>
      <CardTitle>{t('aiBudget.title')}</CardTitle>
      <CardDescription>{t('aiBudget.description')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {budget.isLoading ? <p role="status">{t('aiBudget.loading')}</p> : budget.error ? <p role="alert">{t('aiBudget.unavailable')}</p> : budget.data && <>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt>{t('aiBudget.limit')}</dt><dd className="text-xl font-bold">{usd(budget.data.effectiveLimitUsd)}</dd></div>
          <div><dt>{t('aiBudget.spent')}</dt><dd>{usd(budget.data.spentUsd)}</dd></div>
          <div><dt>{t('aiBudget.reserved')}</dt><dd>{usd(budget.data.reservedUsd)}</dd></div>
        </dl>
        {budget.data.unknownCount > 0 && <p role="status">{t('aiBudget.unknownCount', { count: budget.data.unknownCount })}</p>}
        {!budget.data.prices.length && <p role="alert">{t('aiBudget.noPrices')}</p>}
        <ul className="space-y-1">{budget.data.prices.map(price => <li key={`${price.provider}:${price.model}`}>
          <span dir="ltr">{price.provider} / {price.model}</span>: {t('aiBudget.priceSummary', { input: usd(price.inputUsdPerMillion), output: usd(price.outputUsdPerMillion), flat: usd(price.flatUsd) })} — {price.enabled ? t('aiBudget.enabled') : t('aiBudget.disabled')}
          <Button variant="link" onClick={() => { setProvider(price.provider); setModel(price.model); setVersion(price.version); setInput(String(price.inputUsdPerMillion)); setOutput(String(price.outputUsdPerMillion)); setFlat(String(price.flatUsd)); setMaxInput(String(price.maxInputTokens)); setPriceEnabled(price.enabled); }}>{t('aiBudget.edit')}</Button>
        </li>)}</ul>
      </>}
      {!!budget.data?.pending.length && <form className="space-y-3 rounded border p-3" onSubmit={event => {
        event.preventDefault();
        if (confirmed) reconcile.mutate({ reservationKey: reservation, billedUsd: Number(billed), reference, confirmedProviderEvidence: true });
      }}>
        <h3 className="font-semibold">{t('aiBudget.reconcileTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('aiBudget.reconcileHelp')}</p>
        <Label htmlFor="budget-reservation">{t('aiBudget.reservationLabel')}</Label>
        <select id="budget-reservation" required className="block w-full min-w-0 rounded border bg-background p-2" value={reservation} onChange={event => { setReservation(event.target.value); setConfirmed(false); }}>
          <option value="">{t('aiBudget.chooseReservation')}</option>
          {budget.data.pending.map(item => <option key={item.reservationKey} value={item.reservationKey}>{item.provider} / {item.requestId} / {usd(item.reservedUsd)}</option>)}
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="budget-billed">{t('aiBudget.billedLabel')}</Label><Input id="budget-billed" type="number" min="0" step="0.000001" required value={billed} onChange={event => { setBilled(event.target.value); setConfirmed(false); }} /></div>
          <div><Label htmlFor="budget-reference">{t('aiBudget.referenceLabel')}</Label><Input id="budget-reference" minLength={8} maxLength={160} required value={reference} onChange={event => { setReference(event.target.value); setConfirmed(false); }} /></div>
        </div>
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>{t('aiBudget.evidenceConfirmation')}</span></label>
        <Button type="submit" disabled={!confirmed || !reservation || reconcile.isPending}>{t('aiBudget.saveReconciliation')}</Button>
      </form>}
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        save.mutate({ provider, model, version, inputUsdPerMillion: Number(input), outputUsdPerMillion: Number(output), flatUsd: Number(flat), maxInputTokens: Number(maxInput), enabled: priceEnabled });
      }}>
        <p className="text-sm text-muted-foreground">{t('aiBudget.priceHelp')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="budget-provider">{t('aiBudget.provider')}</Label><select id="budget-provider" className="block w-full rounded border bg-background p-2" value={provider} onChange={event => setProvider(event.target.value as 'openai' | 'zahypi')}><option value="openai">OpenAI</option><option value="zahypi">ZahyPi</option></select></div>
          <div><Label htmlFor="budget-model">{t('aiBudget.model')}</Label><Input id="budget-model" dir="ltr" value={model} required maxLength={128} onChange={event => setModel(event.target.value)} /></div>
          <div><Label htmlFor="budget-version">{t('aiBudget.version')}</Label><Input id="budget-version" value={version} required maxLength={80} onChange={event => setVersion(event.target.value)} /></div>
          <div><Label htmlFor="budget-max-input">{t('aiBudget.maxInput')}</Label><Input id="budget-max-input" type="number" min="1" max="10000000" step="1" required value={maxInput} onChange={event => setMaxInput(event.target.value)} /></div>
          <div><Label htmlFor="budget-input">{t('aiBudget.inputRate')}</Label><Input id="budget-input" type="number" min="0" step="0.000001" required value={input} onChange={event => setInput(event.target.value)} /></div>
          <div><Label htmlFor="budget-output">{t('aiBudget.outputRate')}</Label><Input id="budget-output" type="number" min="0" step="0.000001" required value={output} onChange={event => setOutput(event.target.value)} /></div>
          <div><Label htmlFor="budget-flat">{t('aiBudget.flat')}</Label><Input id="budget-flat" type="number" min="0" step="0.000001" required value={flat} onChange={event => setFlat(event.target.value)} /></div>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={priceEnabled} onChange={event => setPriceEnabled(event.target.checked)} /><span>{t('aiBudget.enablePrice')}</span></label>
        <Button type="submit" disabled={save.isPending || budget.isError}>{save.isPending ? t('aiBudget.saving') : t('aiBudget.savePrice')}</Button>
      </form>
    </CardContent>
  </Card>;
}
