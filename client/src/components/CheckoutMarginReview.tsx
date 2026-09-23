import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { reviewedCostFromText, marginExceptionSchema } from '../../../shared/checkout-margin';
import type { InvoiceMarginProof } from '../../../shared/checkout-margin';

export type MarginReviewState={ready:boolean;key:string;proof?:InvoiceMarginProof};
const parse=(text:string)=>{try{return reviewedCostFromText(text);}catch{return NaN;}};
export function CheckoutMarginReview({orderId,totalAmount,onReady,disabled=false}:{orderId:number;totalAmount:number;onReady:(state:MarginReviewState)=>void;disabled?:boolean}) {
  const {t,i18n}=useTranslation();
  const policy=trpc.botSettings.getMarginPolicy.useQuery(undefined,{refetchOnWindowFocus:false});
  const [tax,setTax]=useState(''),[shipping,setShipping]=useState(''),[other,setOther]=useState('');
  const [exceptionReason,setExceptionReason]=useState(''),[exceptionReviewed,setExceptionReviewed]=useState(false);
  const change=(set:(text:string)=>void,text:string)=>{onReady({ready:false,key:'editing'});setExceptionReviewed(false);set(text);};
  const costs={taxMinor:parse(tax),shippingCostMinor:parse(shipping),otherCostMinor:parse(other)};
  const valid=Object.values(costs).every(Number.isSafeInteger);
  const preview=trpc.orders.previewCheckoutMargin.useQuery({orderId,costs},{enabled:false,refetchOnWindowFocus:false});
  const data=preview.data;
  const matches=valid&&data?.totalMinor===totalAmount&&data.policyRevision===policy.data?.revision
    &&data.policy.enabled===policy.data?.policy.enabled&&data.policy.minPercent===policy.data?.policy.minPercent
    &&JSON.stringify(data.costs)===JSON.stringify(costs);
  const fresh=!!matches&&!preview.isFetching&&!preview.isError;
  const eligible=fresh&&data?.status==='below_floor'&&policy.data?.canManage===true;
  const exception=marginExceptionSchema.safeParse({reason:exceptionReason,reviewed:exceptionReviewed});
  const usingException=eligible&&exception.success;
  const usable=fresh&&(data?.status==='pass'||usingException);
  const factsKey=JSON.stringify({orderId,totalAmount,costs,policy:policy.data?.evidence,evidence:fresh?data?.evidence:null,fetching:preview.isFetching,error:policy.isError||preview.isError});
  useEffect(()=>{setExceptionReviewed(false);},[factsKey]);
  const key=JSON.stringify({factsKey,exceptionReason,exceptionReviewed,canManage:policy.data?.canManage});
  useEffect(()=>{
    const loaded=!!policy.data&&!policy.isLoading&&!policy.isError&&!policy.isFetching;
    if(loaded&&!policy.data!.policy.enabled)onReady({ready:true,key});
    else onReady({ready:loaded&&usable,key,...(loaded&&usable&&data?{proof:{costs:data.costs,evidence:data.evidence,reviewedCosts:true as const,
      ...(usingException&&exception.success?{exception:exception.data}:{})}}:{})});
  },[key,usable,policy.isLoading,policy.isFetching,policy.isError,onReady]);
  const money=(value:number)=>new Intl.NumberFormat(i18n.language,{style:'currency',currency:'SAR'}).format(value/100);
  return <div id={`invoice-margin-${orderId}`} className="space-y-3">
    {policy.isLoading?<p role="status">{t('merchantUx.invoiceMargin.loading')}</p>:policy.isError?<div role="alert"><p>{t('merchantUx.invoiceMargin.policyFailed')}</p><Button type="button" className="min-h-11" onClick={()=>policy.refetch()}>{t('merchantUx.invoiceMargin.refresh')}</Button></div>:policy.data?.policy.enabled?<>
      <h4 className="font-medium">{t('merchantUx.invoiceMargin.title',{percent:policy.data.policy.minPercent})}</h4>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.invoiceMargin.description')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-2 text-sm"><span className="block">{t('merchantUx.invoiceMargin.tax')}</span><input id={`invoice-tax-${orderId}`} dir="ltr" inputMode="decimal" type="text" className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3" value={tax} disabled={disabled||preview.isFetching} onChange={e=>change(setTax,e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span className="block">{t('merchantUx.invoiceMargin.shipping')}</span><input id={`invoice-shipping-${orderId}`} dir="ltr" inputMode="decimal" type="text" className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3" value={shipping} disabled={disabled||preview.isFetching} onChange={e=>change(setShipping,e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span className="block">{t('merchantUx.invoiceMargin.other')}</span><input id={`invoice-other-${orderId}`} dir="ltr" inputMode="decimal" type="text" className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3" value={other} disabled={disabled||preview.isFetching} onChange={e=>change(setOther,e.target.value)} /></label>
      </div>
      <Button id={`invoice-margin-preview-${orderId}`} type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={disabled||!valid||preview.isFetching||policy.isFetching} onClick={()=>preview.refetch()}>{preview.isFetching?t('merchantUx.invoiceMargin.checking'):t('merchantUx.invoiceMargin.preview')}</Button>
      {!valid&&(tax||shipping||other)&&<p role="alert" className="text-sm text-destructive">{t('merchantUx.invoiceMargin.invalid')}</p>}
      {preview.isError&&<p role="alert" className="text-sm text-destructive">{t('merchantUx.invoiceMargin.failed')}</p>}
      {matches&&data&&<div className="space-y-2 rounded-lg border p-3 text-sm" aria-live="polite">
        <p className={data.status==='pass'?'font-medium':'font-medium text-destructive'}>{data.status==='pass'?t('merchantUx.invoiceMargin.pass'):data.status==='below_floor'?t('merchantUx.invoiceMargin.below'):data.status==='missing_cost'?t('merchantUx.invoiceMargin.missing'):t('merchantUx.invoiceMargin.invalidTotals')}</p>
        {data.calculation&&<dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div><dt>{t('merchantUx.invoiceMargin.revenue')}</dt><dd>{money(data.calculation.netRevenueMinor)}</dd></div>
          <div><dt>{t('merchantUx.invoiceMargin.totalCosts')}</dt><dd>{money(data.calculation.totalCostMinor)}</dd></div>
          <div><dt>{t('merchantUx.invoiceMargin.profit')}</dt><dd>{money(data.calculation.profitMinor)}</dd></div>
          <div><dt>{t('merchantUx.invoiceMargin.ratio')}</dt><dd dir="ltr">{data.calculation.marginBps/100}%</dd></div>
        </dl>}
        <details><summary className="min-h-11 cursor-pointer py-3">{t('merchantUx.invoiceMargin.products')}</summary><ul className="space-y-2">{data.lines.map(line=><li className="break-words" key={`${line.productId}:${line.variantId}`}>
          {line.name} × {line.quantity} — {line.unitCostMinor===null?t('merchantUx.invoiceMargin.unknown'):money(line.unitCostMinor*line.quantity)}</li>)}</ul></details>
        {fresh&&data.status==='below_floor'&&(policy.data.canManage?<div className="space-y-3 border-t pt-3" data-margin-exception>
          <h5 className="font-semibold">{t('merchantUx.invoiceMargin.exceptionTitle')}</h5>
          <p className="leading-relaxed">{t('merchantUx.invoiceMargin.exceptionScope')}</p>
          <label className="block space-y-2"><span className="block">{t('merchantUx.invoiceMargin.exceptionReason')}</span>
            <textarea id={`invoice-exception-reason-${orderId}`} className="min-h-24 w-full rounded-md border bg-background p-3" maxLength={1000}
              value={exceptionReason} disabled={disabled} onChange={e=>change(setExceptionReason,e.target.value)} />
          </label>
          {exceptionReason&&!marginExceptionSchema.safeParse({reason:exceptionReason,reviewed:true}).success&&<p role="alert">{t('merchantUx.invoiceMargin.exceptionInvalid')}</p>}
          <label className="flex min-h-11 cursor-pointer items-start gap-3 leading-relaxed">
            <input id={`invoice-exception-reviewed-${orderId}`} type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={exceptionReviewed} disabled={disabled}
              onChange={e=>{onReady({ready:false,key:'exception-reviewing'});setExceptionReviewed(e.target.checked);}} /><span>{t('merchantUx.invoiceMargin.exceptionReviewed')}</span>
          </label>
        </div>:<p>{t('merchantUx.invoiceMargin.exceptionPermission')}</p>)}
      </div>}
    </>:<p className="text-sm text-muted-foreground">{t('merchantUx.invoiceMargin.disabled')}</p>}
  </div>;
}
