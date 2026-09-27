import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { aiBudgetAlertsOutput } from '@shared/ai-budget-alert-contract';

/** Render only inside an authenticated admin surface. The API rechecks stored authority. */
export function AiBudgetAlerts({ history = false }: { history?: boolean }) {
  const { t, i18n } = useTranslation();
  const query = trpc.aiSettings.getBudgetAlerts.useQuery(undefined, { retry: false, refetchInterval: 30_000 });
  const parsed = aiBudgetAlertsOutput.safeParse(query.data);
  if (query.isLoading) return history ? <p role="status">{t('aiBudget.alertsLoading')}</p> : null;
  if (query.isError || !parsed.success || !parsed.data.configured) {
    return <p data-budget-alert-error role="status" className="text-sm text-muted-foreground">{t('aiBudget.alertsUnavailable')}</p>;
  }
  const data = parsed.data;
  const usd = (n: number) => n.toLocaleString(i18n.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  return <section data-budget-alerts className="min-w-0 space-y-3">
    {data.level > 0 && <div data-budget-alert-level={data.level} role={data.level >= 90 ? 'alert' : 'status'}
      className={`rounded-lg border p-4 text-sm space-y-2 break-words ${data.level >= 90 ? 'border-red-300 bg-red-50 text-red-950 dark:bg-red-950 dark:text-red-100' : 'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100'}`}>
      <p className="font-semibold">{data.level === 100 ? t('aiBudget.alertExhausted') : t('aiBudget.alertThreshold', { percent: data.level })}</p>
      <p>{t('aiBudget.alertUsage', { used: usd(data.spentUsd + data.reservedUsd), limit: usd(data.limitUsd), date: data.period })}</p>
      <p>{data.level === 100 ? t('aiBudget.alertExhaustedHelp') : t('aiBudget.alertThresholdHelp')}</p>
      {!history && <a className="inline-flex min-h-11 items-center underline font-medium" href="/admin/ai-settings#ai-budget">{t('aiBudget.alertOpen')}</a>}
    </div>}
    {history && <details data-budget-alert-history className="rounded-lg border p-3">
      <summary className="min-h-11 flex items-center cursor-pointer font-medium">{t('aiBudget.alertHistory')}</summary>
      <p className="text-sm text-muted-foreground mb-3">{t('aiBudget.alertHistoryHelp')}</p>
      {data.events.length === 0 ? <p>{t('aiBudget.alertHistoryEmpty')}</p> : <ol className="space-y-3">
        {data.events.map(event => <li data-budget-alert-event key={`${event.period}-${event.threshold}`} className="border-t pt-3 break-words text-sm">
          <p className="font-medium">{t('aiBudget.alertThreshold', { percent: event.threshold })}</p>
          <p>{t('aiBudget.alertUsage', { used: usd(event.spentUsd + event.reservedUsd), limit: usd(event.limitUsd), date: event.period })}</p>
          <time dateTime={event.observedAt}>{new Date(event.observedAt).toLocaleString(i18n.language)}</time>
        </li>)}
      </ol>}
    </details>}
  </section>;
}
