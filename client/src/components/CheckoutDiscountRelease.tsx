import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { checkoutDiscountReleaseSchema } from '../../../shared/checkout-discount-release';

function ReleaseReview({orderId,evidence,onSaved,onBusy}:{orderId:number;evidence:string;onSaved:()=>Promise<unknown>;onBusy:(busy:boolean)=>void}) {
  const {t}=useTranslation();const [reason,setReason]=useState(''),[reviewed,setReviewed]=useState(false),[submitted,setSubmitted]=useState(false),[outcome,setOutcome]=useState<'success'|'error'|null>(null);
  const mutation=trpc.orders.releaseCheckoutDiscount.useMutation(),valid=checkoutDiscountReleaseSchema.safeParse({orderId,evidence,reason,reviewed});
  return <div data-coupon-release-review className="space-y-3">
    <label className="block space-y-2" htmlFor={`coupon-release-reason-${orderId}`}><span>{t('merchantUx.discountRelease.reason')}</span>
      <textarea id={`coupon-release-reason-${orderId}`} className="min-h-24 w-full rounded-md border bg-background p-3" maxLength={500} value={reason} disabled={mutation.isPending||submitted}
        onChange={event=>{setReason(event.target.value);setReviewed(false);setOutcome(null);}} /></label>
    <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={reviewed} disabled={mutation.isPending||submitted}
      onChange={event=>setReviewed(event.target.checked)} /><span className="leading-relaxed">{t('merchantUx.discountRelease.attest')}</span></label>
    <Button type="button" data-coupon-release-save className="min-h-11 max-w-full whitespace-normal" disabled={!valid.success||mutation.isPending||submitted}
      onClick={async()=>{if(!valid.success||submitted)return;setSubmitted(true);onBusy(true);setOutcome(null);
        try{await mutation.mutateAsync(valid.data);setOutcome('success');}catch{setOutcome('error');}
        setReviewed(false);await onSaved().catch(()=>setOutcome('error'));onBusy(false);}}>
      {t(mutation.isPending?'merchantUx.discountRelease.saving':'merchantUx.discountRelease.save')}</Button>
    {outcome&&<p role={outcome==='success'?'status':'alert'} className="leading-relaxed">{t(outcome==='success'?'merchantUx.discountRelease.success':'merchantUx.discountRelease.error')}</p>}
  </div>;
}

export function CheckoutDiscountRelease({orderId}:{orderId:number}) {
  const {t,i18n}=useTranslation();const [refreshVersion,setRefreshVersion]=useState(0),[busy,setBusy]=useState(false);
  const query=trpc.orders.getCheckoutDiscountRelease.useQuery({orderId},{refetchOnWindowFocus:false});
  const refresh=async()=>{const result=await query.refetch();if(!result.isError)setRefreshVersion(n=>n+1);};
  if(query.isLoading)return <p role="status">{t('merchantUx.discountRelease.loading')}</p>;
  if(query.isError)return <div role="alert"><p>{t('merchantUx.discountRelease.loadError')}</p><Button type="button" className="min-h-11" onClick={refresh}>{t('merchantUx.discountRelease.refresh')}</Button></div>;
  const data=query.data;if(!data)return null;
  const blockers={legacy:t('merchantUx.discountRelease.legacy'),order:t('merchantUx.discountRelease.order'),identity:t('merchantUx.discountRelease.identity'),
    payment:t('merchantUx.discountRelease.payment'),coupon:t('merchantUx.discountRelease.coupon'),counter:t('merchantUx.discountRelease.counter')};
  return <section data-coupon-release className="min-w-0 space-y-3 rounded-xl border p-4 text-sm" aria-labelledby={`coupon-release-${orderId}`}>
    <h3 className="font-semibold" id={`coupon-release-${orderId}`}>{t('merchantUx.discountRelease.title')}</h3>
    <p className="leading-relaxed text-muted-foreground">{t('merchantUx.discountRelease.scope')}</p>
    <p className="break-all"><bdi>{data.code}</bdi></p>
    {data.state==='blocked'&&data.blocker&&<p data-coupon-release-blocker role="status" className="leading-relaxed">{blockers[data.blocker]}</p>}
    {data.state==='released'&&data.audit&&<div data-coupon-release-audit role="status" className="space-y-2">
      <p>{t('merchantUx.discountRelease.success')}</p><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{data.audit.reason}</p>
      <time dateTime={data.audit.at}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(data.audit.at))}</time>
      <p>{t('merchantUx.discountRelease.counterChange',{before:data.audit.usedBefore,after:data.audit.usedAfter})}</p>
    </div>}
    {data.state==='eligible'&&<ReleaseReview key={`${data.evidence}-${refreshVersion}`} orderId={orderId} evidence={data.evidence} onSaved={()=>query.refetch()} onBusy={setBusy} />}
    <Button type="button" data-coupon-release-refresh className="min-h-11" disabled={busy} onClick={refresh}>{t('merchantUx.discountRelease.refresh')}</Button>
  </section>;
}
