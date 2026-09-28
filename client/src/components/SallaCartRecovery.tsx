import { useEffect,useRef,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { sallaCartProblemPage,sallaCartRecoveryOutput,type sallaCartProblemItem } from '@shared/salla-cart-recovery';
import type { z } from 'zod';

type Item=z.infer<typeof sallaCartProblemItem>;
type State=Item['state'];
function Recovery({item,merchantId}:{item:Item;merchantId:number}){
  const {t,i18n}=useTranslation(),utils=trpc.useUtils(),active=useRef(true),pending=useRef(false);
  const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[result,setResult]=useState<z.infer<typeof sallaCartRecoveryOutput>|null>(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const recover=async()=>{
    if(pending.current)return;pending.current=true;setBusy(true);setFailed(false);setResult(null);
    try{
      const value=sallaCartRecoveryOutput.parse(await utils.client.orders.recoverSallaCart.mutate({requestId:item.requestId}));
      if(value.merchantId!==merchantId||value.requestId!==item.requestId||value.cartId!==item.cartId)throw Error('Cart recovery mismatch');
      if(active.current)setResult(value);
      // The result stays visible until the user refreshes. Invalidating the
      // ready-cart list here would unmount a form whose save just completed.
    }catch{if(active.current)setFailed(true);}
    finally{pending.current=false;if(active.current)setBusy(false);}
  };
  return <div className="space-y-2">
    <Button data-cart-recover className="h-auto min-h-11 w-full whitespace-normal" disabled={busy||result!==null} onClick={()=>void recover()}>{busy?t('merchantUx.sallaCheckout.recovering'):t('merchantUx.sallaCheckout.recover')}</Button>
    {failed&&<p role="alert" data-cart-recovery-error>{t('merchantUx.sallaCheckout.recoveryFailed')}</p>}
    {result&&<p role="status" data-cart-recovered>{t('merchantUx.sallaCheckout.recovered')} <time dateTime={result.recovery.observedAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(result.recovery.observedAt))}</time> · {t('merchantUx.sallaCheckout.reviewer')}: {result.recovery.reviewerUserId}</p>}
  </div>;
}
export function SallaCartRecovery({merchantId}:{merchantId:number}){
  const {t,i18n}=useTranslation(),utils=trpc.useUtils(),[open,setOpen]=useState(false),[state,setState]=useState<State>('review'),[beforeId,setBeforeId]=useState<number>();
  const query=trpc.orders.listSallaCartProblems.useQuery({state,beforeId},{enabled:open,retry:false,staleTime:0,gcTime:0,refetchOnMount:'always',trpc:{abortOnUnmount:true}});
  const page=sallaCartProblemPage.safeParse(query.data),loading=query.isFetching||query.isLoading||query.isPaused;
  const valid=page.success&&page.data.merchantId===merchantId&&page.data.items.every(i=>i.state===state&&(!beforeId||i.id<beforeId));
  const labels={review:t('merchantUx.sallaCheckout.problemReview'),preparing:t('merchantUx.sallaCheckout.problemPreparing'),dispatching:t('merchantUx.sallaCheckout.problemDispatching'),rejected:t('merchantUx.sallaCheckout.problemRejected')};
  const diagnoses={verifiable:t('merchantUx.sallaCheckout.canRecover'),missing_reference:t('merchantUx.sallaCheckout.missingReference'),invalid_evidence:t('merchantUx.sallaCheckout.invalidCheckpoint'),in_progress:t('merchantUx.sallaCheckout.possiblyRunning'),rejected_before_send:t('merchantUx.sallaCheckout.rejectedBeforeSend')};
  return <details data-cart-problems open={open} className="min-w-0 rounded-lg border p-3" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer py-3 font-semibold">{t('merchantUx.sallaCheckout.problemsTitle')}</summary>
    {open&&<div className="min-w-0 space-y-4">
      <p>{t('merchantUx.sallaCheckout.recoveryScope')}</p>
      <label className="block space-y-2"><span>{t('merchantUx.sallaCheckout.problemState')}</span><select data-cart-problem-state value={state} onChange={e=>{setBeforeId(undefined);setState(e.target.value as State);}} className="min-h-11 w-full rounded border bg-background px-3 text-base">{(['review','preparing','dispatching','rejected']as const).map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label>
      {loading?<p role="status" data-cart-problems-loading>{t('merchantUx.sallaCheckout.loading')}</p>:query.isError||!valid?<p role="alert" data-cart-problems-error>{t('merchantUx.sallaCheckout.problemsFailed')}</p>:<div data-cart-problem-list className="grid min-w-0 gap-3 md:grid-cols-2">
        {!page.data.items.length&&<p>{t('merchantUx.sallaCheckout.problemsEmpty')}</p>}
        {page.data.items.map(item=><article data-cart-problem={item.id} key={item.requestId+':'+query.dataUpdatedAt} className="min-w-0 space-y-3 rounded border p-3 [overflow-wrap:anywhere]">
          <p>{t('merchantUx.sallaCheckout.created')}: <time dateTime={item.createdAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.createdAt))}</time></p>
          <p>{t('merchantUx.sallaCheckout.operation')}: <bdi dir="ltr" className="break-all font-mono">{item.requestId}</bdi></p>
          {item.cartId&&<p>{t('merchantUx.sallaCheckout.cart')}: <bdi dir="ltr" className="break-all font-mono">{item.cartId}</bdi></p>}
          <p>{diagnoses[item.diagnostic]}</p>
          {item.diagnostic==='verifiable'&&<Recovery item={item} merchantId={merchantId}/>}
        </article>)}
      </div>}
      <div className="flex flex-wrap gap-2"><Button data-cart-problems-refresh className="h-auto min-h-11 whitespace-normal" variant="outline" disabled={loading} onClick={()=>{void utils.orders.listSallaCheckoutCarts.invalidate();if(beforeId)setBeforeId(undefined);else void query.refetch();}}>{beforeId?t('merchantUx.sallaCheckout.latest'):t('merchantUx.sallaCheckout.refresh')}</Button>
        {!loading&&!query.isError&&valid&&page.data.nextCursor&&<Button data-cart-problems-older className="h-auto min-h-11 whitespace-normal" variant="outline" onClick={()=>setBeforeId(page.data.nextCursor!)}>{t('merchantUx.sallaCheckout.older')}</Button>}
      </div>
    </div>}
  </details>;
}
