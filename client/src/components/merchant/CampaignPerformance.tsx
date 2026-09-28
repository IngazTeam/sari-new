import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryStateCard } from '@/components/QueryStateCard';

export function CampaignPerformance({ onRefresh }: { onRefresh?: () => void } = {}) {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const id = useId();
  const stats = trpc.campaigns.getStats.useQuery();
  const timeline = trpc.campaigns.getTimelineData.useQuery({ days });
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-US';
  const number = (value: number) => value.toLocaleString(locale);
  const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(locale, {
    calendar: 'gregory', timeZone: 'UTC', month: 'short', day: 'numeric',
  });
  const error = (retry: () => void) => <QueryStateCard kind="error"
    title={t('merchantUx.campaignPerformance.loadFailed')} description={t('merchantUx.campaignPerformance.loadHint')}
    retryLabel={t('merchantUx.campaignPerformance.retry')} onRetry={retry} />;
  const loading = <p role="status" className="py-8 text-muted-foreground">{t('merchantUx.campaignPerformance.loading')}</p>;
  const rows = timeline.data ?? [];
  const total = rows.reduce((sum, row) => sum + row.acceptedByProvider, 0);
  const max = Math.max(1, ...rows.map(row => row.acceptedByProvider));
  const points = rows.map((row, index) => `${12 + index * 616 / Math.max(1, rows.length - 1)},${148 - row.acceptedByProvider / max * 132}`).join(' ');
  const sample = stats.data ? stats.data.totalAcceptedByProvider + stats.data.totalUnconfirmed : 0;

  return <section className="min-w-0 space-y-5" aria-labelledby={`${id}-title`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 id={`${id}-title`} className="text-xl font-semibold">{t('merchantUx.campaignPerformance.title')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{t('merchantUx.campaignPerformance.scope')}</p>
      </div>
      <Button type="button" variant="outline" disabled={stats.isFetching || timeline.isFetching}
        onClick={() => { void stats.refetch(); void timeline.refetch(); onRefresh?.(); }}>{t('merchantUx.campaignPerformance.refresh')}</Button>
    </div>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('merchantUx.campaignPerformance.allTime')}</CardTitle>
        {!stats.isError && stats.data && <CardDescription>{t('merchantUx.campaignPerformance.completed', { count: stats.data.completedCampaigns })}</CardDescription>}
      </CardHeader>
      <CardContent>
        {stats.isError ? error(() => { void stats.refetch(); }) : !stats.data ? loading : <>
          <dl className="grid gap-5 sm:grid-cols-3">
            <div><dt className="text-sm text-muted-foreground">{t('merchantUx.campaignPerformance.accepted')}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{number(stats.data.totalAcceptedByProvider)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">{t('merchantUx.campaignPerformance.rate')}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{sample > 0 ? `${number(stats.data.providerAcceptanceRate)}%` : '—'}</dd><p className="mt-2 text-sm text-muted-foreground">{sample > 0 ? t('merchantUx.campaignPerformance.sample', { count: sample }) : t('merchantUx.campaignPerformance.noSample')}</p></div>
            <div><dt className="text-sm text-muted-foreground">{t('merchantUx.campaignPerformance.unconfirmed')}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{number(stats.data.totalUnconfirmed)}</dd><p className="mt-2 text-sm text-muted-foreground">{t('merchantUx.campaignPerformance.unconfirmedHint')}</p></div>
          </dl>
        </>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('merchantUx.campaignPerformance.timeline')}</CardTitle>
        <CardDescription className="leading-7">{t('merchantUx.campaignPerformance.timelineScope')}</CardDescription>
        <div className="flex flex-wrap gap-2 pt-3" role="group" aria-label={t('merchantUx.campaignPerformance.period')}>
          {([7, 30, 90] as const).map(period => <Button type="button" key={period} variant={days === period ? 'default' : 'outline'} aria-pressed={days === period} className="min-h-11 flex-1 sm:flex-none" onClick={() => setDays(period)}>
            {period === 7 ? t('merchantUx.campaignPerformance.days7') : period === 30 ? t('merchantUx.campaignPerformance.days30') : t('merchantUx.campaignPerformance.days90')}
          </Button>)}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {timeline.isError ? error(() => { void timeline.refetch(); }) : !timeline.data ? loading : <>
          <p role="status" className="font-medium">{t('merchantUx.campaignPerformance.periodTotal', { count: total })}</p>
          {total === 0 ? <div className="rounded-xl border border-dashed p-5">
            <h3 className="font-medium">{t('merchantUx.campaignPerformance.empty')}</h3>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{t('merchantUx.campaignPerformance.emptyHint')}</p>
          </div> : <figure dir="ltr">
            <svg viewBox="0 0 640 164" className="block w-full text-primary" role="img" aria-labelledby={`${id}-chart`}>
              <title id={`${id}-chart`}>{t('merchantUx.campaignPerformance.chart', { start: date(rows[0].date), end: date(rows.at(-1)!.date), max: number(max) })}</title>
              <path d="M12 148H628" stroke="currentColor" opacity="0.2" />
              <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <figcaption className="flex justify-between gap-3 text-sm text-muted-foreground"><time dateTime={rows[0].date}>{date(rows[0].date)}</time><time dateTime={rows.at(-1)!.date}>{date(rows.at(-1)!.date)}</time></figcaption>
          </figure>}
          {rows.length > 0 && <details key={days} className="rounded-xl border p-3">
            <summary className="cursor-pointer py-2 font-medium">{t('merchantUx.campaignPerformance.dailyTable')}</summary>
            <table className="mt-3 w-full table-fixed text-start text-sm">
              <caption className="sr-only">{t('merchantUx.campaignPerformance.timeline')}</caption>
              <thead><tr className="border-b"><th scope="col" className="p-2 text-start">{t('merchantUx.campaignPerformance.date')}</th><th scope="col" className="p-2 text-start">{t('merchantUx.campaignPerformance.accepted')}</th></tr></thead>
              <tbody>{[...rows].reverse().map(row => <tr key={row.date} className="border-b last:border-0"><th scope="row" className="p-2 text-start font-normal"><time dateTime={row.date}>{date(row.date)}</time></th><td className="p-2 tabular-nums">{number(row.acceptedByProvider)}</td></tr>)}</tbody>
            </table>
          </details>}
        </>}
      </CardContent>
    </Card>
  </section>;
}
