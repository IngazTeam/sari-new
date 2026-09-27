import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseSalesEvidenceId } from '@/lib/sales-order-report-view';
import { sallaObservationsInput, sallaObservationsOutput, type SallaObservationsRequest } from '../../../../shared/salla-sales-observations';

export default function SallaObservations({ merchant }: { merchant: string }) {
  const { t } = useTranslation();
  const [store, setStore] = useState(''), [order, setOrder] = useState('');
  const [invalid, setInvalid] = useState(false), [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<SallaObservationsRequest | null>(null);
  return <section data-salla-observations className="rounded-xl border p-4 sm:p-6 space-y-4" aria-labelledby="salla-observation-title">
    <h2 id="salla-observation-title" className="text-xl font-semibold">{t('sallaEvidence.title')}</h2>
    <p className="text-sm leading-7 text-muted-foreground">{t('sallaEvidence.description')}</p>
    <form noValidate className="space-y-4" onSubmit={event => {
      event.preventDefault();
      const parsed = sallaObservationsInput.safeParse({ merchantId: parseSalesEvidenceId(merchant), storeId: store, orderId: order });
      setInvalid(!parsed.success); setRequest(parsed.success ? parsed.data : null); setAttempt(n => n + 1);
    }}>
      <p className="text-sm">{t('sallaEvidence.merchantScope', { merchant: merchant || '—' })}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="salla-observation-store">{t('sallaEvidence.store')}</Label>
          <Input id="salla-observation-store" data-salla-store inputMode="numeric" autoComplete="off" maxLength={20} className="min-h-11 text-base md:text-base" dir="ltr"
            value={store} onChange={e => { setStore(e.target.value); setRequest(null); setInvalid(false); }} /></div>
        <div className="space-y-2"><Label htmlFor="salla-observation-order">{t('sallaEvidence.order')}</Label>
          <Input id="salla-observation-order" data-salla-order inputMode="numeric" autoComplete="off" maxLength={20} className="min-h-11 text-base md:text-base" dir="ltr"
            value={order} onChange={e => { setOrder(e.target.value); setRequest(null); setInvalid(false); }} /></div>
      </div>
      {invalid && <p data-salla-invalid role="alert" className="text-destructive">{t('sallaEvidence.invalid')}</p>}
      <Button data-salla-read type="submit" className="min-h-11 whitespace-normal">{t('sallaEvidence.read')}</Button>
    </form>
    {request && <ObservationQuery key={attempt} request={request} />}
  </section>;
}

function ObservationQuery({ request }: { request: SallaObservationsRequest }) {
  const { t, i18n } = useTranslation();
  const query = trpc.inboundOperations.sallaObservations.useQuery(request, { retry: false, staleTime: 0, gcTime: 0,
    refetchOnMount: 'always', refetchOnWindowFocus: true, trpc: { abortOnUnmount: true } });
  const parsed = useMemo(() => sallaObservationsOutput.safeParse(query.data), [query.data]);
  const value = parsed.success && parsed.data.merchantId === request.merchantId && parsed.data.storeId === request.storeId
    && parsed.data.orderId === request.orderId ? parsed.data : null;
  const paused = query.fetchStatus === 'paused', busy = query.isFetching || query.isPending || paused;
  const labels = { pending: t('sallaEvidence.pending'), paid: t('sallaEvidence.paid'), processing: t('sallaEvidence.processing'),
    shipped: t('sallaEvidence.shipped'), delivered: t('sallaEvidence.delivered'), cancelled: t('sallaEvidence.cancelled') };
  return <div aria-busy={busy} className="space-y-4">
    <Button data-salla-refresh variant="outline" className="min-h-11" disabled={busy} onClick={() => void query.refetch()}>{t('salesEvidence.refresh')}</Button>
    {busy ? <p data-salla-loading role="status">{paused ? t('salesEvidence.paused') : t('salesEvidence.loading')}</p>
      : query.error || !value ? <p data-salla-error role="alert" className="text-destructive">{query.error?.data?.code === 'FORBIDDEN' || query.error?.data?.code === 'UNAUTHORIZED'
        ? t('salesEvidence.denied') : t('sallaEvidence.failed')}</p>
      : <div data-salla-result className="space-y-3">
        <p className="rounded-lg bg-muted/40 p-3 text-sm leading-7">{t('sallaEvidence.limitations')}</p>
        {!value.observations.length ? <p role="status">{t('sallaEvidence.empty')}</p>
          : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{value.observations.map(item => <li data-salla-state={item.state} key={item.state} className="rounded-lg border p-4 space-y-2">
            <p className="font-semibold">{labels[item.state]}</p>
            <p className="text-sm text-muted-foreground">{t('sallaEvidence.firstObserved')}</p>
            <time className="block text-sm [overflow-wrap:anywhere]" dateTime={item.firstObservedAt}>{new Intl.DateTimeFormat(i18n.language.startsWith('ar') ? 'ar-SA' : 'en-US',
              { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(item.firstObservedAt))} UTC</time>
          </li>)}</ul>}
      </div>}
  </div>;
}
