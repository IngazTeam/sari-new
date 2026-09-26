import { useMemo, useState } from 'react';
import { useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { RefreshCw, FileCheck2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatSalesEvidenceMoney, parseSalesEvidenceId, parseSalesReportForm, readSalesReportView,
  type SalesReportRequest, type SalesReportView } from '@/lib/sales-order-report-view';

export default function SalesEvidence() {
  const search = useSearch();
  // A different contextual merchant must also discard the previous report and draft.
  return <SalesEvidenceForm key={search} initialMerchant={new URLSearchParams(search).get('merchantId') ?? ''} />;
}

function SalesEvidenceForm({ initialMerchant }: { initialMerchant: string }) {
  const { t, i18n } = useTranslation();
  const [merchant, setMerchant] = useState(() => String(parseSalesEvidenceId(initialMerchant) ?? ''));
  const [from, setFrom] = useState('1'), [through, setThrough] = useState('');
  const [attempt, setAttempt] = useState(0), [invalid, setInvalid] = useState(false);
  const [request, setRequest] = useState<SalesReportRequest | null>(null);
  const change = (setter: (value: string) => void, value: string) => {
    setRequest(null); setInvalid(false); setter(value);
  };
  return <div data-sales-report-page className="mx-auto w-full min-w-0 max-w-6xl space-y-6" dir={i18n.dir()}>
    <header className="space-y-2">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><FileCheck2 aria-hidden className="size-6 shrink-0" />{t('salesEvidence.title')}</h1>
      <p className="max-w-3xl text-muted-foreground leading-7">{t('salesEvidence.description')}</p>
    </header>
    <Card><CardContent className="pt-6 space-y-4">
      <form noValidate className="space-y-4" onSubmit={event => {
        event.preventDefault();
        const next = parseSalesReportForm(merchant, from, through);
        setInvalid(!next); setRequest(next); setAttempt(value => value + 1);
      }}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="sales-merchant">{t('salesEvidence.merchant')}</Label>
            <Input data-sales-field="merchant" id="sales-merchant" className="min-h-11 text-base md:text-base" inputMode="numeric" autoComplete="off" maxLength={32}
              aria-describedby="sales-range-help" value={merchant} onChange={event => change(setMerchant, event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="sales-from">{t('salesEvidence.from')}</Label>
            <Input data-sales-field="from" id="sales-from" className="min-h-11 text-base md:text-base" inputMode="numeric" autoComplete="off" maxLength={32}
              aria-describedby="sales-range-help" value={from} onChange={event => change(setFrom, event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="sales-through">{t('salesEvidence.through')}</Label>
            <Input data-sales-field="through" id="sales-through" className="min-h-11 text-base md:text-base" inputMode="numeric" autoComplete="off" maxLength={32}
              aria-describedby="sales-range-help" value={through} onChange={event => change(setThrough, event.target.value)} /></div>
        </div>
        <p id="sales-range-help" className="text-sm leading-6 text-muted-foreground">{t('salesEvidence.rangeHelp')}</p>
        {invalid && <p data-sales-invalid role="alert" className="text-destructive">{t('salesEvidence.invalid')}</p>}
        <Button data-sales-read type="submit" className="min-h-11 whitespace-normal">{t('salesEvidence.read')}</Button>
      </form>
    </CardContent></Card>
    <p className="rounded-lg border bg-muted/30 p-4 text-sm leading-7" data-sales-limits>{t('salesEvidence.limitations')}</p>
    {request ? <SalesReportQuery key={attempt} request={request} /> : <p role="status" data-sales-idle className="text-muted-foreground">{t('salesEvidence.idle')}</p>}
  </div>;
}

function SalesReportQuery({ request }: { request: SalesReportRequest }) {
  const { t } = useTranslation();
  const query = trpc.inboundOperations.salesOrderReport.useQuery(request, {
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
    trpc: { abortOnUnmount: true },
  });
  const report = useMemo(() => readSalesReportView(query.data, request), [query.data, request]);
  // React Query can retain successful data after a failed refresh. Never display it as a current authorized read.
  const paused = query.fetchStatus === 'paused';
  const busy = query.isFetching || query.isPending || paused;
  const denied = query.error?.data?.code === 'FORBIDDEN' || query.error?.data?.code === 'UNAUTHORIZED';
  return <section className="space-y-4" aria-label={t('salesEvidence.result')} aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">{t('salesEvidence.result')}</h2>
      <Button data-sales-refresh type="button" variant="outline" className="min-h-11 whitespace-normal" disabled={busy} onClick={() => void query.refetch()}>
        <RefreshCw aria-hidden className={`size-4 ${busy ? 'motion-safe:animate-spin' : ''}`} />{t('salesEvidence.refresh')}
      </Button>
    </div>
    {paused ? <p role="status" data-sales-paused>{t('salesEvidence.paused')}</p>
      : busy ? <p role="status" data-sales-loading>{t('salesEvidence.loading')}</p>
      : query.error ? <p role="alert" data-sales-error className="rounded-lg border p-4 text-destructive">{denied ? t('salesEvidence.denied')
        : query.error.data?.code === 'PRECONDITION_FAILED' ? t('salesEvidence.notReady') : t('salesEvidence.failed')}</p>
      : !report ? <p role="alert" data-sales-error className="text-destructive">{t('salesEvidence.incompatible')}</p>
      : <SalesReportResult report={report} />}
  </section>;
}

function SalesReportResult({ report }: { report: SalesReportView }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-US';
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const money = (value: number | null) => value === null ? t('salesEvidence.noEvidence') : formatSalesEvidenceMoney(value, locale);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
  const states = { capture_observed: t('salesEvidence.captured'), full_refund_observed: t('salesEvidence.refunded'),
    payment_not_measured: t('salesEvidence.unmeasured'), external_link_unverified: t('salesEvidence.unlinked') };
  const identity = { merchant_and_local_order: t('salesEvidence.localIdentity'), verified_zid_store_projection: t('salesEvidence.zidIdentity'),
    external_link_unverified: t('salesEvidence.unlinked') };
  const metric = (label: string, value: string, marker: string) => <div className="min-w-0 rounded-lg border p-4 space-y-2" key={marker}>
    <dt className="text-sm text-muted-foreground">{label}</dt><dd data-sales-metric={marker} className="text-xl font-semibold [overflow-wrap:anywhere]">{value}</dd>
  </div>;
  return <div data-sales-result className="space-y-5 min-w-0">
    <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-sm leading-6">
      <p data-sales-scope>{report.scope.throughFactId < report.scope.fromFactId
        ? t('salesEvidence.scopeBeforeStart', { merchant: number(report.merchantId), from: number(report.scope.fromFactId) })
        : t('salesEvidence.scope', { merchant: number(report.merchantId), from: number(report.scope.fromFactId), through: number(report.scope.throughFactId) })}</p>
      <p>{t('salesEvidence.readAt', { time: date(report.readAt) })}</p>
      <p>{t('salesEvidence.snapshotHelp')}</p>
    </div>
    {report.orders.length === 0 ? <p data-sales-empty role="status" className="rounded-lg border p-6">{t('salesEvidence.empty')}</p> : <>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metric(t('salesEvidence.recorded'), number(report.counts.recordedOrders), 'recorded')}
        {metric(t('salesEvidence.captureCount'), number(report.counts.captureObserved), 'captures')}
        {metric(t('salesEvidence.unmeasured'), number(report.counts.paymentNotMeasured), 'unmeasured')}
        {metric(t('salesEvidence.unlinked'), number(report.counts.externalLinkUnverified), 'unlinked')}
      </dl>
      <p className="text-sm text-muted-foreground">{t('salesEvidence.countHelp', { local: number(report.counts.localOrders), zid: number(report.counts.zidOrders), refunds: number(report.counts.fullRefundObserved) })}</p>
      <dl className="grid gap-3 sm:grid-cols-3">
        {metric(t('salesEvidence.capturedAmount'), money(report.amounts.observedCapturedMinor), 'capturedAmount')}
        {metric(t('salesEvidence.refundedAmount'), money(report.amounts.observedRefundedMinor), 'refundedAmount')}
        {metric(t('salesEvidence.netAmount'), money(report.amounts.observedNetMinor), 'netAmount')}
      </dl>
      <p className="text-sm leading-6 text-muted-foreground">{t('salesEvidence.amountHelp')}</p>
      <h3 className="text-lg font-semibold">{t('salesEvidence.orders')}</h3>
      <ul className="space-y-3">
        {report.orders.map(order => <li key={order.orderFactId} className="min-w-0 rounded-lg border p-4 space-y-3" data-sales-order={order.orderFactId}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="font-semibold">{t('salesEvidence.orderFact', { id: number(order.orderFactId) })} · {order.provider === 'zid' ? t('salesEvidence.zid') : t('salesEvidence.local')}</h4>
            <p className="rounded bg-muted px-2 py-1 text-sm">{states[order.financialState]}</p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-3 text-sm">
            <div><dt className="text-muted-foreground">{t('salesEvidence.quotedAmount')}</dt><dd>{money(order.quotedAmountMinor)}</dd></div>
            <div><dt className="text-muted-foreground">{t('salesEvidence.capturedAmount')}</dt><dd>{money(order.capturedMinor)}</dd></div>
            <div><dt className="text-muted-foreground">{t('salesEvidence.netAmount')}</dt><dd>{money(order.observedNetMinor)}</dd></div>
          </dl>
          <details data-sales-details className="group">
            <summary className="min-h-11 cursor-pointer rounded py-3 font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t('salesEvidence.details')}</summary>
            <div className="space-y-3 pt-3 text-sm [overflow-wrap:anywhere]">
              <p>{identity[order.identityBasis]}</p>
              <p>{order.amountBasis === 'zid_reported_invoice' ? t('salesEvidence.zidBasis') : t('salesEvidence.catalogBasis')}</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div><dt className="text-muted-foreground">{t('salesEvidence.orderKey')}</dt><dd><bdi>{order.orderKey}</bdi></dd></div>
                <div><dt className="text-muted-foreground">{t('salesEvidence.quotation')}</dt><dd>{number(order.quotationId)}</dd></div>
                <div><dt className="text-muted-foreground">{t('salesEvidence.localOrder')}</dt><dd>{order.localOrderId === null ? t('salesEvidence.noLink') : number(order.localOrderId)}</dd></div>
                <div><dt className="text-muted-foreground">{t('salesEvidence.observedAt')}</dt><dd>{date(order.createdObservedAt)} UTC</dd></div>
                <div><dt className="text-muted-foreground">{t('salesEvidence.difference')}</dt><dd>{money(order.invoiceDifferenceMinor)}</dd></div>
                <div><dt className="text-muted-foreground">{t('salesEvidence.refundedAmount')}</dt><dd>{money(order.refundedMinor)}</dd></div>
              </dl>
              <p className="text-muted-foreground">{t('salesEvidence.differenceHelp')}</p>
              <h5 className="font-semibold">{t('salesEvidence.events')}</h5>
              {order.events.length ? <ol className="space-y-3">{order.events.map(event => <li key={event.factId} className="rounded border p-3 space-y-2">
                <p>{event.event === 'captured' ? t('salesEvidence.captured') : t('salesEvidence.refunded')} · {money(event.amountMinor)}</p>
                <p>{t('salesEvidence.paymentEvent', { fact: number(event.factId), payment: number(event.paymentId), time: date(event.verifiedAt) })}</p>
                <p>{t('salesEvidence.digest')}: <bdi className="break-all font-mono text-xs">{event.factDigest}</bdi></p>
              </li>)}</ol> : <p>{t('salesEvidence.noPaymentEvents')}</p>}
              {order.projectionLink && <p>{t('salesEvidence.projection', { id: number(order.projectionLink.linkId), time: date(order.projectionLink.linkedAt) })}<br />
                <bdi className="break-all font-mono text-xs">{order.projectionLink.linkDigest}</bdi></p>}
              <p>{t('salesEvidence.orderDigest')}: <bdi className="break-all font-mono text-xs">{order.orderFactDigest}</bdi></p>
              <p>{t('salesEvidence.settlementDigest')}: <bdi className="break-all font-mono text-xs">{order.evidenceSetDigest}</bdi></p>
            </div>
          </details>
        </li>)}
      </ul>
    </>}
    <details className="rounded-lg border p-4 text-sm">
      <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesEvidence.reportIdentity')}</summary>
      <p className="pt-2 leading-6">{t('salesEvidence.digestHelp')}</p>
      <p className="break-all pt-2 font-mono text-xs" dir="ltr">{report.evidenceSetDigest}</p>
    </details>
  </div>;
}
