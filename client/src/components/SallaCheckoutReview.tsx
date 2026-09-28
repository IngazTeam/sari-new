import { useEffect,useRef,useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { checkoutReviewInput,checkoutReviewResult } from '@/lib/salla-checkout-review';
import { sallaCheckoutEvidenceAccess,sallaCheckoutCartListOutput,type sallaCheckoutCartListItem,type sallaCheckoutEvidenceOutput } from '@shared/salla-checkout-evidence';

type Item=z.infer<typeof sallaCheckoutCartListItem>;
type Evidence=z.infer<typeof sallaCheckoutEvidenceOutput>;
const button='h-auto min-h-11 whitespace-normal';
const identifier=(value:string)=><bdi dir="ltr" className="break-all font-mono text-sm">{value}</bdi>;
function useFormat(){const {i18n}=useTranslation();return {
  money:(minor:number)=>new Intl.NumberFormat(i18n.language,{style:'currency',currency:'SAR'}).format(minor/100),
  time:(value:string)=>new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)),
};}
function Result({value}:{value:Evidence}) {
  const {t}=useTranslation(),format=useFormat();
  const states={equal:t('merchantUx.sallaCheckout.equal'),different:t('merchantUx.sallaCheckout.different'),absent:t('merchantUx.sallaCheckout.absent'),not_checked:t('merchantUx.sallaCheckout.notChecked')};
  const comparison=[
    {title:t('merchantUx.sallaCheckout.checkout'),reference:value.order.checkoutId,state:value.comparison.checkoutReference},
    {title:t('merchantUx.sallaCheckout.transactionOrder'),reference:value.transaction?.orderId,state:value.comparison.transactionOrderReference},
    {title:t('merchantUx.sallaCheckout.transactionCart'),reference:value.transaction?.cartId,state:value.comparison.transactionCartReference},
  ];
  return <section data-checkout-evidence className="min-w-0 space-y-4 rounded-lg border p-4" aria-label={t('merchantUx.sallaCheckout.evidence')}>
    <h4 className="font-semibold" role="status">{t('merchantUx.sallaCheckout.evidence')}</h4>
    <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 leading-relaxed" data-checkout-limit>{t('merchantUx.sallaCheckout.limits')}</p>
    <p className="text-muted-foreground">{t('merchantUx.sallaCheckout.observed')}: <time dateTime={value.observedAt}>{format.time(value.observedAt)}</time></p>
    <div className="grid min-w-0 gap-3 md:grid-cols-2">
      <div className="min-w-0 space-y-2 rounded-md border p-3"><h5 className="font-semibold">{t('merchantUx.sallaCheckout.order')}</h5>
        <p>{t('merchantUx.sallaCheckout.orderId')}: {identifier(value.order.orderId)}</p>
        <p>{t('merchantUx.sallaCheckout.orderTotal')}: {format.money(value.order.totalMinor)}</p>
        <p>{t('merchantUx.sallaCheckout.providerStatus')}: {identifier(value.order.status)}</p>
        <p>{value.order.draft?t('merchantUx.sallaCheckout.draft'):t('merchantUx.sallaCheckout.notDraft')}</p>
      </div>
      <div className="min-w-0 space-y-2 rounded-md border p-3"><h5 className="font-semibold">{t('merchantUx.sallaCheckout.transaction')}</h5>
        {value.transaction?<><p>{identifier(value.transaction.transactionId)}</p><p>{t('merchantUx.sallaCheckout.transactionTotal')}: {format.money(value.transaction.totalMinor)}</p>
          <p>{t('merchantUx.sallaCheckout.providerStatus')}: {identifier(value.transaction.status)}</p></>:<p data-checkout-not-checked>{t('merchantUx.sallaCheckout.transactionNotChecked')}</p>}
      </div>
    </div>
    <dl className="space-y-3">{comparison.map((row,n)=><div key={n} data-checkout-comparison={row.state} className="grid min-w-0 gap-1 border-b pb-3 sm:grid-cols-2">
      <dt>{row.title}</dt><dd className="min-w-0 space-y-1"><p>{states[row.state]}</p>{row.reference&&identifier(row.reference)}</dd>
    </div>)}</dl>
    <p className="text-muted-foreground">{t('merchantUx.sallaCheckout.amountScope')}</p>
  </section>;
}
function Inspection({item,onClose}:{item:Item;onClose:()=>void}) {
  const {t}=useTranslation(),client=trpc.useUtils().client;
  const [order,setOrder]=useState(''),[transaction,setTransaction]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<'invalid'|'failed'|null>(null),[result,setResult]=useState<Evidence|null>(null);
  const request=useRef<{version:number;controller?:AbortController}>({version:0});
  const heading=useRef<HTMLHeadingElement>(null);
  const clear=()=>{request.current.version++;request.current.controller?.abort();request.current.controller=undefined;setBusy(false);setResult(null);setError(null);};
  useEffect(()=>{heading.current?.focus();return()=>{request.current.version++;request.current.controller?.abort();};},[]);
  const submit=async()=>{
    if(request.current.controller)return;
    setResult(null);setError(null);
    const parsed=checkoutReviewInput(item.requestId,order,transaction);
    if(!parsed.success){setError('invalid');return;}
    const controller=new AbortController(),version=++request.current.version;request.current.controller=controller;setBusy(true);
    try {
      const raw=await client.orders.inspectSallaCheckoutEvidence.query(parsed.data,{signal:controller.signal});
      const value=checkoutReviewResult(raw,parsed.data,item);
      if(version===request.current.version)setResult(value);
    }catch{if(version===request.current.version)setError('failed');}
    finally{if(version===request.current.version){request.current.controller=undefined;setBusy(false);}}
  };
  const prefix=`salla-cart-${item.id}`,control='min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
  return <div data-checkout-inspection className="min-w-0 space-y-4 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 ref={heading} tabIndex={-1} className="font-semibold">{t('merchantUx.sallaCheckout.selected')}</h3><Button data-checkout-close variant="outline" className={button} onClick={onClose}>{t('merchantUx.sallaCheckout.close')}</Button></div>
    <p>{t('merchantUx.sallaCheckout.cart')}: {identifier(item.cart!.cartId)}</p>
    <form noValidate onSubmit={e=>{e.preventDefault();void submit();}} className="grid min-w-0 gap-4 md:grid-cols-2">
      <div className="min-w-0 space-y-2"><label htmlFor={prefix+'-order'}>{t('merchantUx.sallaCheckout.orderId')}</label>
        <input id={prefix+'-order'} data-checkout-order value={order} onChange={e=>{clear();setOrder(e.target.value);}} autoComplete="off" inputMode="numeric" maxLength={40} dir="ltr" className={control} aria-invalid={error==='invalid'} aria-describedby={prefix+'-order-help'}/>
        <p id={prefix+'-order-help'} className="text-muted-foreground">{t('merchantUx.sallaCheckout.orderHelp')}</p></div>
      <div className="min-w-0 space-y-2"><label htmlFor={prefix+'-transaction'}>{t('merchantUx.sallaCheckout.transactionId')}</label>
        <input id={prefix+'-transaction'} data-checkout-transaction value={transaction} onChange={e=>{clear();setTransaction(e.target.value);}} autoComplete="off" inputMode="numeric" maxLength={40} dir="ltr" className={control} aria-invalid={error==='invalid'} aria-describedby={prefix+'-transaction-help'}/>
        <p id={prefix+'-transaction-help'} className="text-muted-foreground">{t('merchantUx.sallaCheckout.transactionHelp')}</p></div>
      <Button data-checkout-submit type="submit" className={button+' md:col-span-2'} disabled={busy}>{busy?t('merchantUx.sallaCheckout.checking'):t('merchantUx.sallaCheckout.check')}</Button>
    </form>
    {busy&&<p role="status" data-checkout-busy>{t('merchantUx.sallaCheckout.checking')}</p>}
    {error&&<p role="alert" data-checkout-error>{error==='invalid'?t('merchantUx.sallaCheckout.invalid'):t('merchantUx.sallaCheckout.checkFailed')}</p>}
    {result&&<Result value={result}/>}
  </div>;
}
function CartBrowser({merchantId}:{merchantId:number}) {
  const {t}=useTranslation(),format=useFormat(),[beforeId,setBeforeId]=useState<number>(),[selected,setSelected]=useState<string>();
  const triggers=useRef(new Map<number,HTMLButtonElement>());
  const query=trpc.orders.listSallaCheckoutCarts.useQuery({beforeId},{retry:false,staleTime:0,gcTime:0,refetchOnMount:'always',trpc:{abortOnUnmount:true}});
  const page=sallaCheckoutCartListOutput.safeParse(query.data),loading=query.isFetching||query.isLoading||query.isPaused;
  const valid=page.success&&page.data.merchantId===merchantId&&(!beforeId||page.data.items.every(i=>i.id<beforeId));
  const active=valid?page.data.items.find(i=>i.requestId===selected&&i.cart):undefined;
  const refresh=()=>{setSelected(undefined);if(beforeId)setBeforeId(undefined);else void query.refetch();};
  return <div data-checkout-browser className="min-w-0 space-y-4 p-4 text-sm">
    <p className="leading-relaxed">{t('merchantUx.sallaCheckout.scope')}</p>
    {loading?<p role="status" data-checkout-loading>{t('merchantUx.sallaCheckout.loading')}</p>:query.isError||!valid?<p role="alert" data-checkout-list-error>{t('merchantUx.sallaCheckout.failed')}</p>:<>
      <div data-checkout-list className="grid min-w-0 gap-3 md:grid-cols-2">
        {!page.data.items.length&&<p data-checkout-empty>{t('merchantUx.sallaCheckout.empty')}</p>}
        {page.data.items.map(item=><article data-checkout-row={item.id} key={item.id} className="min-w-0 space-y-3 rounded-lg border p-4 [overflow-wrap:anywhere]">
          <p>{t('merchantUx.sallaCheckout.created')}: <time dateTime={item.createdAt}>{format.time(item.createdAt)}</time></p>
          <p>{t('merchantUx.sallaCheckout.operation')}: {identifier(item.requestId)}</p>
          {item.cart?<><p>{t('merchantUx.sallaCheckout.cart')}: {identifier(item.cart.cartId)}</p><p>{t('merchantUx.sallaCheckout.preparedTotal')}: {format.money(item.cart.preparedTotalMinor)}</p>
            <Button ref={el=>{if(el)triggers.current.set(item.id,el);else triggers.current.delete(item.id);}} data-checkout-select aria-pressed={selected===item.requestId} variant={selected===item.requestId?'default':'outline'} className={button+' w-full'} onClick={()=>setSelected(item.requestId)}>{t('merchantUx.sallaCheckout.select')}</Button></>:<p data-checkout-unavailable>{t('merchantUx.sallaCheckout.unavailable')}</p>}
        </article>)}
      </div>
      {active&&<Inspection key={active.requestId+':'+query.dataUpdatedAt} item={active} onClose={()=>{setSelected(undefined);triggers.current.get(active.id)?.focus();}}/>}
    </>}
    <div className="flex flex-wrap gap-2">
      <Button data-checkout-refresh className={button} variant="outline" disabled={loading} onClick={refresh}>{beforeId?t('merchantUx.sallaCheckout.latest'):t('merchantUx.sallaCheckout.refresh')}</Button>
      {!loading&&!query.isError&&valid&&page.data.nextCursor&&<Button data-checkout-older className={button} variant="outline" onClick={()=>{setSelected(undefined);setBeforeId(page.data.nextCursor!);}}>{t('merchantUx.sallaCheckout.older')}</Button>}
    </div>
    <p className="text-muted-foreground">{t('merchantUx.sallaCheckout.listScope')}</p>
  </div>;
}
export function SallaCheckoutReview() {
  const {t}=useTranslation(),[open,setOpen]=useState(false);
  const access=trpc.orders.checkoutEvidenceAccess.useQuery(undefined,{retry:false,staleTime:0,gcTime:0,refetchOnMount:'always'}),parsed=sallaCheckoutEvidenceAccess.safeParse(access.data);
  if(access.isFetching||access.isPaused||access.isError||!parsed.success||!parsed.data.canInspect)return null;
  return <details open={open} data-salla-checkout-review className="min-w-0 rounded-xl border bg-background" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer p-4 font-semibold">{t('merchantUx.sallaCheckout.title')}</summary>
    {open&&<CartBrowser key={parsed.data.merchantId} merchantId={parsed.data.merchantId}/>}
  </details>;
}
