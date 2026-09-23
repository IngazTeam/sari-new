import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

export function CheckoutMarginExceptionAudit({orderId}:{orderId:number}) {
  const {t,i18n}=useTranslation();
  const query=trpc.orders.getCheckoutMarginException.useQuery({orderId},{refetchOnWindowFocus:false});
  if(query.isLoading)return <p role="status">{t('merchantUx.invoiceMargin.auditLoading')}</p>;
  if(query.isError)return <div role="alert"><p>{t('merchantUx.invoiceMargin.auditFailed')}</p><Button type="button" className="min-h-11" onClick={()=>query.refetch()}>{t('merchantUx.invoiceMargin.refresh')}</Button></div>;
  const audit=query.data;if(!audit)return null;
  const money=(n:number)=>new Intl.NumberFormat(i18n.language,{style:'currency',currency:'SAR'}).format(n/100);
  return <section data-margin-exception-audit className="space-y-3 rounded-xl border p-4 text-sm" aria-labelledby={`margin-audit-${orderId}`}>
    <h3 id={`margin-audit-${orderId}`} className="font-semibold">{t('merchantUx.invoiceMargin.auditTitle')}</h3>
    <p>{t('merchantUx.invoiceMargin.auditActor',{actor:audit.actorUserId,revision:audit.policyRevision})}</p>
    <time dateTime={audit.createdAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(audit.createdAt))}</time>
    <p className="whitespace-pre-wrap break-words">{audit.reason}</p>
    <dl className="grid gap-2 sm:grid-cols-2">
      <div><dt>{t('merchantUx.invoiceMargin.revenue')}</dt><dd>{money(audit.calculation.netRevenueMinor)}</dd></div>
      <div><dt>{t('merchantUx.invoiceMargin.totalCosts')}</dt><dd>{money(audit.calculation.totalCostMinor)}</dd></div>
      <div><dt>{t('merchantUx.invoiceMargin.profit')}</dt><dd>{money(audit.calculation.profitMinor)}</dd></div>
      <div><dt>{t('merchantUx.invoiceMargin.auditRatio',{minimum:audit.policy.minPercent})}</dt><dd dir="ltr">{audit.calculation.marginBps/100}%</dd></div>
    </dl>
    <p className="text-muted-foreground">{t('merchantUx.invoiceMargin.auditScope')}</p>
  </section>;
}
