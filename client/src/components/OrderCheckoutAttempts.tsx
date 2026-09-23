import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { reconcileCheckoutSchema } from '../../../shared/checkout-reconciliation';

function CheckoutReview({orderId,attemptId,evidence,onReviewed,onBusy}:{orderId:number;attemptId:string;evidence:string;onReviewed:()=>Promise<unknown>;onBusy:(busy:boolean)=>void}) {
  const {t}=useTranslation();
  const [chargeId,setChargeId]=useState(''),[reviewed,setReviewed]=useState(false),[outcome,setOutcome]=useState<'verified'|'unverified'|'error'|null>(null),[submitted,setSubmitted]=useState(false);
  const mutation=trpc.orders.reconcileCheckoutAttempt.useMutation();
  const input={orderId,attemptId,evidence,chargeId,reviewed};
  const valid=reconcileCheckoutSchema.safeParse(input);
  return <div data-checkout-review className="space-y-3 border-t pt-3">
    <label className="block space-y-2" htmlFor={`checkout-charge-${attemptId}`}><span>{t('merchantUx.checkoutAttempts.chargeId')}</span>
      <input id={`checkout-charge-${attemptId}`} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3" dir="ltr" autoComplete="off" maxLength={254}
        value={chargeId} disabled={mutation.isPending||submitted} onChange={event=>{setChargeId(event.target.value);setReviewed(false);setOutcome(null);}} placeholder="chg_…" /></label>
    <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={reviewed} disabled={mutation.isPending||submitted}
      onChange={event=>setReviewed(event.target.checked)} /><span className="leading-relaxed">{t('merchantUx.checkoutAttempts.attest')}</span></label>
    <Button type="button" data-checkout-reconcile className="min-h-11 max-w-full whitespace-normal" disabled={!valid.success||mutation.isPending||submitted}
      onClick={async()=>{if(!valid.success||submitted)return;setSubmitted(true);setOutcome(null);onBusy(true);
        try {const result=await mutation.mutateAsync(valid.data);setOutcome(result.outcome);} catch {setOutcome('error');}
        setReviewed(false);await onReviewed().catch(()=>setOutcome('error'));onBusy(false);}}>{t(mutation.isPending?'merchantUx.checkoutAttempts.reconciling':'merchantUx.checkoutAttempts.reconcile')}</Button>
    {outcome&&<p role={outcome==='verified'?'status':'alert'} className="leading-relaxed">{t(outcome==='verified'?'merchantUx.checkoutAttempts.verified':outcome==='unverified'?'merchantUx.checkoutAttempts.unverified':'merchantUx.checkoutAttempts.reconcileError')}</p>}
  </div>;
}

export function OrderCheckoutAttempts({orderId}:{orderId:number}) {
  const {t,i18n}=useTranslation();
  const [refreshVersion,setRefreshVersion]=useState(0);
  const [busy,setBusy]=useState(false);
  const query=trpc.orders.getCheckoutAttempts.useQuery({orderId},{refetchOnWindowFocus:false});
  if(query.isLoading)return <p role="status">{t('merchantUx.checkoutAttempts.loading')}</p>;
  if(query.isError)return <div role="alert"><p>{t('merchantUx.checkoutAttempts.error')}</p><Button type="button" className="min-h-11" onClick={()=>query.refetch()}>{t('merchantUx.checkoutAttempts.refresh')}</Button></div>;
  if(!query.data?.length)return null;
  const labels={dispatching:t('merchantUx.checkoutAttempts.dispatching'),unknown:t('merchantUx.checkoutAttempts.unknown'),
    created:t('merchantUx.checkoutAttempts.created'),failed:t('merchantUx.checkoutAttempts.failed')};
  return <section data-checkout-attempts className="space-y-3 rounded-xl border p-4 text-sm" aria-labelledby={`checkout-attempts-${orderId}`}>
    <h3 id={`checkout-attempts-${orderId}`} className="font-semibold">{t('merchantUx.checkoutAttempts.title')}</h3>
    <p className="leading-relaxed text-muted-foreground">{t('merchantUx.checkoutAttempts.scope')}</p>
    {query.data.map(attempt=><article key={attempt.id} className="min-w-0 space-y-2 rounded-lg border p-3">
      <p className="font-semibold">{labels[attempt.state]}</p>
      <p>{new Intl.NumberFormat(i18n.language,{style:'currency',currency:attempt.currency}).format(attempt.amountMinor/100)}</p>
      <time dateTime={attempt.updatedAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(attempt.updatedAt))}</time>
      <p>{t('merchantUx.checkoutAttempts.reference')}</p><code className="block break-all" dir="ltr">{attempt.reference}</code>
      {(attempt.state==='dispatching'||attempt.state==='unknown')&&<p className="leading-relaxed text-amber-800 dark:text-amber-200">{t('merchantUx.checkoutAttempts.review')}</p>}
      {attempt.lastReview&&<p data-checkout-review-outcome role="status" className="leading-relaxed">{t(attempt.lastReview.outcome==='verified'?'merchantUx.checkoutAttempts.verified':'merchantUx.checkoutAttempts.unverified')}</p>}
      {attempt.canReview&&<CheckoutReview key={`${attempt.evidence}-${refreshVersion}`} orderId={orderId} attemptId={attempt.id} evidence={attempt.evidence} onReviewed={()=>query.refetch()} onBusy={setBusy} />}
    </article>)}
    <Button type="button" data-checkout-refresh className="min-h-11" disabled={busy} onClick={async()=>{const result=await query.refetch();if(!result.isError)setRefreshVersion(v=>v+1);}}>{t('merchantUx.checkoutAttempts.refresh')}</Button>
  </section>;
}
