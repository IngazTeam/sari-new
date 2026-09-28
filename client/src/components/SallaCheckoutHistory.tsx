import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { sallaCheckoutAuditPage } from '@shared/salla-checkout-audit';
import type { sallaCheckoutEvidenceOutput } from '@shared/salla-checkout-evidence';

export function SallaCheckoutHistory({ merchantId, renderEvidence }: {
  merchantId: number; renderEvidence: (e: z.infer<typeof sallaCheckoutEvidenceOutput>) => ReactNode;
}) {
  const { t, i18n } = useTranslation(), [open, setOpen] = useState(false), [beforeId, setBeforeId] = useState<number>();
  const query = trpc.orders.listSallaCheckoutAudits.useQuery({ beforeId }, { enabled: open, retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always', trpc: { abortOnUnmount: true } });
  const page = sallaCheckoutAuditPage.safeParse(query.data), loading = query.isFetching || query.isLoading || query.isPaused;
  const valid = page.success && page.data.merchantId === merchantId && (!beforeId || page.data.items.every(i => i.id < beforeId));
  const format = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const button = 'h-auto min-h-11 whitespace-normal';
  return <details data-checkout-history open={open} className="min-w-0 rounded-lg border p-3" onToggle={e => { setOpen(e.currentTarget.open); }}>
    <summary className="min-h-11 cursor-pointer py-3 font-semibold">{t('merchantUx.sallaCheckout.history')}</summary>
    {open && <div className="min-w-0 space-y-4">
      <p>{t('merchantUx.sallaCheckout.historyScope')}</p>
      {loading ? <p role="status" data-checkout-history-loading>{t('merchantUx.sallaCheckout.historyLoading')}</p>
        : query.isError || !valid ? <p role="alert" data-checkout-history-error>{t('merchantUx.sallaCheckout.historyFailed')}</p>
          : <div data-checkout-history-list className="min-w-0 space-y-3">
            {!page.data.items.length && <p>{t('merchantUx.sallaCheckout.historyEmpty')}</p>}
            {page.data.items.map(item => <details data-checkout-audit={item.id} key={item.id} className="min-w-0 rounded-md border p-3 [overflow-wrap:anywhere]">
              <summary className="min-h-11 cursor-pointer py-3">{t('merchantUx.sallaCheckout.savedAt')}: {format(item.savedAt)} · #{item.id}</summary>
              <p>{t('merchantUx.sallaCheckout.reviewer')}: <bdi dir="ltr">{item.reviewerUserId}</bdi></p>
              <p>{t('merchantUx.sallaCheckout.operation')}: <bdi dir="ltr" className="break-all font-mono">{item.evidence.requestId}</bdi></p>
              <p>{t('merchantUx.sallaCheckout.cart')}: <bdi dir="ltr" className="break-all font-mono">{item.evidence.cart.cartId}</bdi></p>
              <p>{t('merchantUx.sallaCheckout.preparedTotal')}: {new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'SAR' }).format(item.evidence.cart.preparedTotalMinor / 100)}</p>
              {renderEvidence(item.evidence)}
            </details>)}
          </div>}
      <div className="flex flex-wrap gap-2">
        <Button data-checkout-history-refresh className={button} variant="outline" disabled={loading} onClick={() => { if (beforeId) setBeforeId(undefined); else void query.refetch(); }}>{beforeId ? t('merchantUx.sallaCheckout.latest') : t('merchantUx.sallaCheckout.refresh')}</Button>
        {!loading && !query.isError && valid && page.data.nextCursor && <Button data-checkout-history-older className={button} variant="outline" onClick={() => setBeforeId(page.data.nextCursor!)}>{t('merchantUx.sallaCheckout.older')}</Button>}
      </div>
    </div>}
  </details>;
}
