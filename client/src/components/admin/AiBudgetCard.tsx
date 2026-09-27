import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AiPriceManager } from './AiPriceManager';
import { AiBudgetAlerts } from './AiBudgetAlerts';

export function AiBudgetCard() {
  const { t, i18n } = useTranslation();
  const budget = trpc.aiSettings.getBudget.useQuery(undefined, { retry: false });
  const [reservation, setReservation] = useState('');
  const [billed, setBilled] = useState('');
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const reconcile = trpc.aiSettings.reconcileBudget.useMutation({
    onSuccess: () => { toast.success(t('aiBudget.reconciliationSaved')); setReservation(''); setConfirmed(false); void budget.refetch(); },
    onError: () => toast.error(t('aiBudget.reconciliationFailed')),
  });
  const usd = (value: number) => value.toLocaleString(i18n.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  return <Card id="ai-budget">
    <CardHeader>
      <CardTitle>{t('aiBudget.title')}</CardTitle>
      <CardDescription>{t('aiBudget.description')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <AiBudgetAlerts history />
      {budget.isLoading ? <p role="status">{t('aiBudget.loading')}</p> : budget.error ? <p role="alert">{t('aiBudget.unavailable')}</p> : budget.data && <>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt>{t('aiBudget.limit')}</dt><dd className="text-xl font-bold">{usd(budget.data.effectiveLimitUsd)}</dd></div>
          <div><dt>{t('aiBudget.spent')}</dt><dd>{usd(budget.data.spentUsd)}</dd></div>
          <div><dt>{t('aiBudget.reserved')}</dt><dd>{usd(budget.data.reservedUsd)}</dd></div>
        </dl>
        {budget.data.unknownCount > 0 && <p role="status">{t('aiBudget.unknownCount', { count: budget.data.unknownCount })}</p>}
      </>}
      {!budget.isError && !!budget.data?.pending.length && <form className="space-y-3 rounded border p-3" onSubmit={event => {
        event.preventDefault();
        if (confirmed && !budget.isFetching && !reconcile.isPending) reconcile.mutate({ reservationKey: reservation, billedUsd: Number(billed), reference, confirmedProviderEvidence: true });
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
        <Button type="submit" disabled={!confirmed || !reservation || budget.isFetching || reconcile.isPending}>{t('aiBudget.saveReconciliation')}</Button>
      </form>}
      <AiPriceManager prices={budget.data?.prices ?? []} available={!!budget.data && !budget.isError && !budget.isFetching}
        onRefresh={async () => { const result = await budget.refetch(); return !result.isError && !!result.data; }} />
    </CardContent>
  </Card>;
}
