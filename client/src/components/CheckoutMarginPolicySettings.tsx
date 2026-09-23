import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { defaultMarginPolicy, marginPolicySchema, type MarginPolicy } from '../../../shared/checkout-margin';

export function CheckoutMarginPolicySettings() {
  const {t,i18n}=useTranslation();
  const query=trpc.botSettings.getMarginPolicy.useQuery(undefined,{refetchOnWindowFocus:false});
  const [base,setBase]=useState<{policy:MarginPolicy;revision:number;evidence:string}|null>(null);
  const [enabled,setEnabled]=useState(false),[percent,setPercent]=useState(String(defaultMarginPolicy.minPercent)),[reviewed,setReviewed]=useState(false);
  const accept=(data:NonNullable<typeof base>)=>{setBase(data);setEnabled(data.policy.enabled);setPercent(String(data.policy.minPercent));setReviewed(false);};
  useEffect(()=>{if(query.data&&!base)accept(query.data);},[query.data,base]);
  useEffect(()=>{setReviewed(false);},[query.data?.evidence]);
  const save=trpc.botSettings.updateMarginPolicy.useMutation({onSuccess:data=>{accept(data);void query.refetch();}});
  const policy={enabled,minPercent:percent.trim()===''?NaN:Number(percent)},valid=marginPolicySchema.safeParse(policy).success;
  const changed=base&&JSON.stringify(base.policy)!==JSON.stringify(policy),stale=base&&query.data?.evidence!==base.evidence;
  const disabled=!query.data?.canManage||save.isPending||query.isFetching;
  const refresh=async()=>{setReviewed(false);const result=await query.refetch();if(result.data&&!result.isError){accept(result.data);save.reset();}};
  const terms=(p:MarginPolicy)=>t('merchantUx.marginPolicy.terms',{state:p.enabled?t('merchantUx.marginPolicy.on'):t('merchantUx.marginPolicy.off'),percent:p.minPercent});
  return <section aria-labelledby="margin-policy-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
    <div><h2 id="margin-policy-title" className="text-lg font-semibold">{t('merchantUx.marginPolicy.title')}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('merchantUx.marginPolicy.description')}</p></div>
    {query.isLoading?<p role="status">{t('merchantUx.marginPolicy.loading')}</p>:query.isError?<div role="alert"><p>{t('merchantUx.marginPolicy.loadFailed')}</p><Button type="button" className="mt-2 h-auto min-h-11 whitespace-normal" onClick={refresh}>{t('merchantUx.marginPolicy.refresh')}</Button></div>:query.data&&base&&<>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input id="margin-policy-enabled" type="checkbox" className="h-5 w-5" checked={enabled} disabled={disabled}
        onChange={e=>{setEnabled(e.target.checked);setReviewed(false);}} />{t('merchantUx.marginPolicy.enabled')}</label>
      <label className="block space-y-2 text-sm"><span>{t('merchantUx.marginPolicy.minimum')}</span><input id="margin-policy-percent" dir="ltr" inputMode="numeric" type="number" min={0} max={100} step={1}
        className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 sm:max-w-xs" value={percent} disabled={disabled} onChange={e=>{setPercent(e.target.value);setReviewed(false);}} /></label>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.marginPolicy.scope')}</p>
      <p className="text-sm">{t('merchantUx.marginPolicy.current',{revision:query.data.revision})} {terms(query.data.policy)}</p>
      {!valid&&<p role="alert" className="text-sm text-destructive">{t('merchantUx.marginPolicy.invalid')}</p>}
      {query.data.canManage?<><label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"><input id="margin-policy-reviewed" type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={reviewed}
        disabled={disabled||!valid||!changed||!!stale||save.isError} onChange={e=>setReviewed(e.target.checked)} />{t('merchantUx.marginPolicy.reviewed')}</label>
        <Button id="margin-policy-save" type="button" className="h-auto min-h-11 whitespace-normal" disabled={disabled||!valid||!changed||!reviewed||!!stale||save.isError}
          onClick={()=>save.mutate({policy,expectedRevision:base.revision,evidence:base.evidence,reviewed:true})}>{save.isPending?t('merchantUx.marginPolicy.saving'):t('merchantUx.marginPolicy.save')}</Button></>:<p className="text-sm">{t('merchantUx.marginPolicy.readOnly')}</p>}
      {(save.isError||stale)&&<div role="alert"><p className="text-sm text-destructive">{t('merchantUx.marginPolicy.failed')}</p><Button type="button" className="mt-2 h-auto min-h-11 whitespace-normal" onClick={refresh}>{t('merchantUx.marginPolicy.refresh')}</Button></div>}
      {save.isSuccess&&!changed&&!stale&&<p role="status">{t('merchantUx.marginPolicy.saved')}</p>}
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t('merchantUx.marginPolicy.history')}</summary>
        {!query.data.history.length?<p className="text-sm">{t('merchantUx.marginPolicy.empty')}</p>:<ol className="space-y-3">{query.data.history.map(row=><li key={row.revision} className="space-y-1 rounded-lg border p-3 text-sm">
          <p>{t('merchantUx.marginPolicy.change',{revision:row.revision,actor:row.actorUserId})}</p><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString(i18n.language)}</time>
          <p>{t('merchantUx.marginPolicy.before')} {terms(row.beforePolicy)}</p><p>{t('merchantUx.marginPolicy.after')} {terms(row.afterPolicy)}</p>
        </li>)}</ol>}
      </details>
    </>}
  </section>;
}
