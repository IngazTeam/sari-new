import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

function ReconciliationRow({ item, canManage, onVerified }: {
  item: { id: number; number: string; customerName: string | null; phone: string | null; reference: string | null;
    orderId: number | null; canReview: boolean; projectionPending: boolean; state: 'unknown' | 'processing' | 'succeeded' };
  canManage: boolean; onVerified: () => void;
}) {
  const { t } = useTranslation();
  const [orderId, setOrderId] = useState(item.orderId ? String(item.orderId) : '');
  const [reviewed, setReviewed] = useState(false);
  const mutation = trpc.orders.reconcileZidCheckout.useMutation({ onSuccess: result => { if (!result.projectionPending) onVerified(); } });
  const valid = /^\d+$/.test(orderId) && Number.isSafeInteger(Number(orderId)) && Number(orderId) > 0;
  return <div className="min-w-0 space-y-3 rounded-lg border p-4">
    <h4 className="break-words font-semibold">{item.number} · {item.customerName || item.phone}</h4>
    <p className="text-sm text-muted-foreground">{item.projectionPending ? t('merchantUx.zidReconciliation.projection') : t('merchantUx.zidReconciliation.unknown')}</p>
    {item.reference && <p className="break-all text-sm" dir="ltr">{item.reference}</p>}
    {!item.reference ? <p className="text-sm">{t('merchantUx.zidReconciliation.legacy')}</p> : !item.canReview ?
      <p className="text-sm">{t('merchantUx.zidReconciliation.waiting')}</p> : !canManage ?
        <p className="text-sm">{t('merchantUx.zidReconciliation.readOnly')}</p> : <>
          <label className="block space-y-2 text-sm" htmlFor={`zid-order-${item.id}`}>
            <span>{t('merchantUx.zidReconciliation.orderId')}</span>
            <input id={`zid-order-${item.id}`} inputMode="numeric" value={orderId} maxLength={16} dir="ltr"
              disabled={mutation.isPending || item.orderId !== null} onChange={e => { setOrderId(e.target.value); setReviewed(false); mutation.reset(); }}
              className="min-h-11 w-full rounded-md border bg-background px-3" />
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={reviewed} disabled={mutation.isPending}
              onChange={e => setReviewed(e.target.checked)} /><span>{t('merchantUx.zidReconciliation.attestation')}</span>
          </label>
          <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={!valid || !reviewed || mutation.isPending}
            onClick={() => mutation.mutate({ quotationId: item.id, orderId: Number(orderId), reviewed: true })}>
            {mutation.isPending ? t('merchantUx.zidReconciliation.checking') : t('merchantUx.zidReconciliation.verify')}
          </Button>
        </>}
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{t('merchantUx.zidReconciliation.failed')}</p>}
    {mutation.isSuccess && <p role="status" className="text-sm">{mutation.data.projectionPending ? t('merchantUx.zidReconciliation.projectionRetry') : t('merchantUx.zidReconciliation.verified')}</p>}
  </div>;
}

export function ZidCheckoutReconciliation() {
  const { t } = useTranslation();
  const [beforeId, setBeforeId] = useState<number>();
  const query = trpc.orders.listZidReconciliations.useQuery({ beforeId });
  const [verified, setVerified] = useState(false);
  return <section className="min-w-0 space-y-4 rounded-xl border p-4" aria-labelledby="zid-reconciliation-title">
    <h3 id="zid-reconciliation-title" className="font-semibold">{t('merchantUx.zidReconciliation.title')}</h3>
    <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.zidReconciliation.description')}</p>
    {verified && <p role="status" className="text-sm">{t('merchantUx.zidReconciliation.verified')}</p>}
    {query.isLoading ? <p role="status">{t('merchantUx.zidReconciliation.loading')}</p> : query.isError ?
      <div role="alert"><p>{t('merchantUx.zidReconciliation.loadFailed')}</p><Button className="mt-2 min-h-11" onClick={() => query.refetch()}>{t('merchantUx.zidReconciliation.refresh')}</Button></div> :
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {!query.data?.items.length && <p className="text-sm">{t('merchantUx.zidReconciliation.empty')}</p>}
        {query.data?.items.map(item => <ReconciliationRow key={item.id} item={item} canManage={query.data.canManage}
          onVerified={() => { setVerified(true); void query.refetch(); }} />)}
      </div>}
    <div className="flex flex-wrap gap-2">
      {!query.isError && <Button variant="outline" className="min-h-11" onClick={() => { setBeforeId(undefined); void query.refetch(); }}>{t('merchantUx.zidReconciliation.refresh')}</Button>}
      {query.data?.nextCursor && <Button className="min-h-11" variant="outline" onClick={() => setBeforeId(query.data.nextCursor!)}>{t('merchantUx.zidReconciliation.older')}</Button>}
    </div>
  </section>;
}
