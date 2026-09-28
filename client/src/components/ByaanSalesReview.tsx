import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { byaanSalesReviewAccess, byaanSalesReviewPage } from '@shared/byaan-sales-review';

const button = 'h-auto min-h-11 whitespace-normal';
function Records({ merchantId }: { merchantId: number }) {
  const { t, i18n } = useTranslation(), [beforeId, setBeforeId] = useState<number>();
  const query = trpc.byaan.listSalesOperations.useQuery({ beforeId }, {
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always', trpc: { abortOnUnmount: true },
  });
  const parsed = byaanSalesReviewPage.safeParse(query.data);
  const valid = parsed.success && parsed.data.merchantId === merchantId && (!beforeId || parsed.data.items.every(i => i.id < beforeId));
  const loading = query.isFetching || query.isLoading || query.isPaused;
  const format = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  return <div className="min-w-0 space-y-4 p-4 text-sm">
    <p className="leading-relaxed">{t('merchantUx.byaanSales.scope')}</p>
    <p className="rounded-lg bg-muted p-3 leading-relaxed">{t('merchantUx.byaanSales.limits')}</p>
    {loading ? <p role="status" data-byaan-review-loading>{t('merchantUx.byaanSales.loading')}</p>
      : query.isError || !valid ? <p role="alert" data-byaan-review-error>{t('merchantUx.byaanSales.failed')}</p>
        : <div data-byaan-review-list className="grid min-w-0 gap-3 md:grid-cols-2">
          {!parsed.data.items.length && <p data-byaan-review-empty>{t('merchantUx.byaanSales.empty')}</p>}
          {parsed.data.items.map(item => <article key={item.id} data-byaan-review-row={item.id} className="min-w-0 space-y-3 rounded-lg border p-4 [overflow-wrap:anywhere]">
            <h3 className="font-semibold">{item.kind === 'enrollment' ? t('merchantUx.byaanSales.enrollment') : t('merchantUx.byaanSales.payment')}</h3>
            <p data-byaan-review-state className="font-medium">{item.evidence === 'invalid' ? t('merchantUx.byaanSales.invalid')
              : item.state === 'preparing' ? t('merchantUx.byaanSales.preparing') : item.state === 'dispatching' ? t('merchantUx.byaanSales.dispatching')
                : item.state === 'unknown' ? t('merchantUx.byaanSales.unknown') : item.state === 'not_sent' ? t('merchantUx.byaanSales.notSent') : t('merchantUx.byaanSales.reported')}</p>
            <p className="leading-relaxed">{item.evidence === 'invalid' ? t('merchantUx.byaanSales.invalidHelp')
              : item.evidence === 'pending' ? t('merchantUx.byaanSales.pendingHelp') : item.state === 'unknown' ? t('merchantUx.byaanSales.unknownHelp')
                : item.state === 'not_sent' ? t('merchantUx.byaanSales.notSentHelp') : t('merchantUx.byaanSales.reportedHelp')}</p>
            <dl className="space-y-2">
              <div><dt className="text-muted-foreground">{t('merchantUx.byaanSales.operation')}</dt><dd><bdi dir="ltr" className="break-all font-mono">{item.requestId}</bdi></dd></div>
              {item.reference && <div><dt className="text-muted-foreground">{t('merchantUx.byaanSales.reference')}</dt><dd data-byaan-review-reference><bdi dir="ltr" className="break-all font-mono">{item.reference}</bdi></dd></div>}
              <div><dt className="text-muted-foreground">{t('merchantUx.byaanSales.created')}</dt><dd><time dateTime={item.createdAt}>{format(item.createdAt)}</time></dd></div>
              <div><dt className="text-muted-foreground">{t('merchantUx.byaanSales.updated')}</dt><dd><time dateTime={item.updatedAt}>{format(item.updatedAt)}</time></dd></div>
            </dl>
          </article>)}
        </div>}
    <div className="flex flex-wrap gap-2">
      <Button data-byaan-review-refresh type="button" className={button} variant="outline" disabled={loading} onClick={() => beforeId ? setBeforeId(undefined) : void query.refetch()}>
        {beforeId ? t('merchantUx.byaanSales.latest') : t('merchantUx.byaanSales.refresh')}
      </Button>
      {!loading && !query.isError && valid && parsed.data.nextCursor && <Button data-byaan-review-older type="button" className={button} variant="outline" onClick={() => setBeforeId(parsed.data.nextCursor!)}>{t('merchantUx.byaanSales.older')}</Button>}
    </div>
  </div>;
}
function ReviewAccess() {
  const { t } = useTranslation();
  const access = trpc.byaan.salesReviewAccess.useQuery(undefined, { retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always', trpc: { abortOnUnmount: true } });
  const parsed = byaanSalesReviewAccess.safeParse(access.data);
  if (access.isFetching || access.isLoading || access.isPaused) return <p role="status" className="p-4" data-byaan-review-loading>{t('merchantUx.byaanSales.loading')}</p>;
  if (access.isError || !parsed.success) return <div className="space-y-3 p-4"><p role="alert" data-byaan-review-error>{t('merchantUx.byaanSales.failed')}</p><Button className={button} variant="outline" onClick={() => void access.refetch()}>{t('merchantUx.byaanSales.refresh')}</Button></div>;
  return <Records key={parsed.data.merchantId} merchantId={parsed.data.merchantId}/>;
}
export function ByaanSalesReview() {
  const { t, i18n } = useTranslation(), [open, setOpen] = useState(false);
  return <details dir={i18n.dir()} open={open} data-byaan-sales-review className="min-w-0 rounded-xl border bg-background" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer p-4 font-semibold">{t('merchantUx.byaanSales.title')}</summary>
    {open && <ReviewAccess/>}
  </details>;
}
