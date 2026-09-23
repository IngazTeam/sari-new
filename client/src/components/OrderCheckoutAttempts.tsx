import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

export function OrderCheckoutAttempts({orderId}:{orderId:number}) {
  const {t,i18n}=useTranslation();
  const query=trpc.orders.getCheckoutAttempts.useQuery({orderId},{refetchOnWindowFocus:false});
  if(query.isLoading)return <p role="status">{t('merchantUx.checkoutAttempts.loading')}</p>;
  if(query.isError)return <div role="alert"><p>{t('merchantUx.checkoutAttempts.error')}</p><Button type="button" className="min-h-11" onClick={()=>query.refetch()}>{t('merchantUx.checkoutAttempts.refresh')}</Button></div>;
  if(!query.data?.length)return null;
  const labels={dispatching:t('merchantUx.checkoutAttempts.dispatching'),unknown:t('merchantUx.checkoutAttempts.unknown'),
    created:t('merchantUx.checkoutAttempts.created'),failed:t('merchantUx.checkoutAttempts.failed')};
  return <section data-checkout-attempts className="space-y-3 rounded-xl border p-4 text-sm" aria-labelledby={`checkout-attempts-${orderId}`}>
    <h3 id={`checkout-attempts-${orderId}`} className="font-semibold">{t('merchantUx.checkoutAttempts.title')}</h3>
    <p className="leading-relaxed text-muted-foreground">{t('merchantUx.checkoutAttempts.scope')}</p>
    {query.data.map(attempt=><article key={attempt.id} className="space-y-2 rounded-lg border p-3">
      <p className="font-semibold">{labels[attempt.state]}</p>
      <p>{new Intl.NumberFormat(i18n.language,{style:'currency',currency:attempt.currency}).format(attempt.amountMinor/100)}</p>
      <time dateTime={attempt.updatedAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(attempt.updatedAt))}</time>
      <p>{t('merchantUx.checkoutAttempts.reference')}</p><code className="block break-all" dir="ltr">{attempt.reference}</code>
      {(attempt.state==='dispatching'||attempt.state==='unknown')&&<p className="leading-relaxed text-amber-800 dark:text-amber-200">{t('merchantUx.checkoutAttempts.review')}</p>}
    </article>)}
    <Button type="button" className="min-h-11" onClick={()=>query.refetch()}>{t('merchantUx.checkoutAttempts.refresh')}</Button>
  </section>;
}
