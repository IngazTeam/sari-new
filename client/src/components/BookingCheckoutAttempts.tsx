import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { reconcileBookingCheckoutSchema } from '../../../shared/booking-checkout-reconciliation';

function BookingCheckoutReview({bookingId,attemptId,evidence,busy,onBusy,onReviewed}:{bookingId:number;attemptId:string;evidence:string;busy:boolean;onBusy:(value:boolean)=>void;onReviewed:()=>Promise<unknown>}) {
  const {t}=useTranslation();
  const [chargeId,setChargeId]=useState(''),[reviewed,setReviewed]=useState(false),[submitted,setSubmitted]=useState(false);
  const [outcome,setOutcome]=useState<'verified'|'unverified'|'error'|null>(null);
  const mutation=trpc.bookings.reconcileCheckoutAttempt.useMutation();
  const valid=reconcileBookingCheckoutSchema.safeParse({bookingId,attemptId,evidence,chargeId,reviewed});
  const disabled=busy||mutation.isPending||submitted;
  return <div data-booking-checkout-review className="space-y-3 border-t pt-3">
    <label className="block space-y-2" htmlFor={`booking-charge-${attemptId}`}><span>{t('merchantUx.checkoutAttempts.chargeId')}</span>
      <input id={`booking-charge-${attemptId}`} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3" dir="ltr" autoComplete="off" maxLength={254}
        value={chargeId} disabled={disabled} onChange={event=>{setChargeId(event.target.value);setReviewed(false);setOutcome(null);}} placeholder="chg_…" /></label>
    <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={reviewed} disabled={disabled}
      onChange={event=>setReviewed(event.target.checked)} /><span className="leading-relaxed">{t('merchantUx.checkoutAttempts.attest')}</span></label>
    <Button type="button" data-booking-checkout-reconcile className="min-h-11 max-w-full whitespace-normal" disabled={!valid.success||disabled}
      onClick={async()=>{if(!valid.success||disabled)return;setSubmitted(true);setOutcome(null);onBusy(true);
        try {const result=await mutation.mutateAsync(valid.data);setOutcome(result.outcome);}
        catch {setOutcome('error');}
        finally {setReviewed(false);try{await onReviewed();}catch{setOutcome('error');}onBusy(false);}
      }}>{t(mutation.isPending?'merchantUx.checkoutAttempts.reconciling':'merchantUx.checkoutAttempts.reconcile')}</Button>
    {outcome&&<p role={outcome==='verified'?'status':'alert'} className="leading-relaxed">{t(outcome==='verified'?'merchantUx.bookingCheckout.verified':outcome==='unverified'?'merchantUx.checkoutAttempts.unverified':'merchantUx.checkoutAttempts.reconcileError')}</p>}
  </div>;
}

export function BookingCheckoutAttempts({bookingId,onReviewed}:{bookingId:number;onReviewed?:()=>Promise<unknown>}) {
  const {t,i18n}=useTranslation();const [refreshVersion,setRefreshVersion]=useState(0),[busy,setBusy]=useState(false),[refreshError,setRefreshError]=useState(false);
  const query=trpc.bookings.getCheckoutAttempts.useQuery({bookingId},{refetchOnWindowFocus:false});
  const refresh=async()=>{setRefreshError(false);try{const result=await query.refetch();if(result.isError)throw Error('Evidence refresh failed');await onReviewed?.();}
    catch(error){setRefreshError(true);throw error;}};
  if(query.isLoading)return <p role="status">{t('merchantUx.checkoutAttempts.loading')}</p>;
  if(query.isError)return <div role="alert"><p>{t('merchantUx.checkoutAttempts.error')}</p><Button type="button" className="min-h-11" onClick={()=>query.refetch()}>{t('merchantUx.checkoutAttempts.refresh')}</Button></div>;
  if(!query.data?.length)return null;
  const labels={dispatching:t('merchantUx.checkoutAttempts.dispatching'),unknown:t('merchantUx.checkoutAttempts.unknown'),created:t('merchantUx.bookingCheckout.created'),failed:t('merchantUx.checkoutAttempts.failed')};
  return <section data-booking-checkout-attempts className="min-w-0 space-y-3 rounded-xl border p-4 text-sm" aria-labelledby={`booking-attempts-${bookingId}`}>
    <h3 id={`booking-attempts-${bookingId}`} className="font-semibold">{t('merchantUx.checkoutAttempts.title')}</h3>
    <p className="leading-relaxed text-muted-foreground">{t('merchantUx.bookingCheckout.scope')}</p>
    {refreshError&&<p role="alert">{t('merchantUx.checkoutAttempts.reconcileError')}</p>}
    {query.data.map(attempt=><article key={attempt.id} className="min-w-0 space-y-2 rounded-lg border p-3">
      <p className="font-semibold">{labels[attempt.state]}</p>
      <p>{new Intl.NumberFormat(i18n.language,{style:'currency',currency:attempt.currency}).format(attempt.amountMinor/100)}</p>
      <time dateTime={attempt.updatedAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(attempt.updatedAt))}</time>
      <p>{t('merchantUx.checkoutAttempts.reference')}</p><code className="block break-all" dir="ltr">{attempt.reference}</code>
      {(attempt.state==='unknown'||attempt.state==='dispatching')&&<p className="leading-relaxed text-amber-800 dark:text-amber-200">{t('merchantUx.bookingCheckout.review')}</p>}
      {attempt.lastReview&&<p data-booking-checkout-outcome role="status" className="leading-relaxed">{t(attempt.lastReview.outcome==='verified'?'merchantUx.bookingCheckout.verified':'merchantUx.checkoutAttempts.unverified')}</p>}
      {attempt.canReview&&<BookingCheckoutReview key={`${attempt.evidence}-${refreshVersion}`} bookingId={bookingId} attemptId={attempt.id} evidence={attempt.evidence} busy={busy} onBusy={setBusy} onReviewed={refresh} />}
    </article>)}
    <Button type="button" data-booking-checkout-refresh className="min-h-11" disabled={busy} onClick={async()=>{try{await refresh();setRefreshVersion(v=>v+1);}catch{/* The query exposes a safe error and retry. */}}}>{t('merchantUx.checkoutAttempts.refresh')}</Button>
  </section>;
}
