import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { reviewedCostFromText } from '../../../shared/checkout-margin';
import type { InvoiceMarginProof } from '../../../shared/checkout-margin';

export type MarginReviewState={ready:boolean;key:string;proof?:InvoiceMarginProof};
const parse=(text:string)=>{try{return reviewedCostFromText(text);}catch{return NaN;}};
export function CheckoutMarginReview({orderId,totalAmount,onReady,disabled=false}:{orderId:number;totalAmount:number;onReady:(state:MarginReviewState)=>void;disabled?:boolean}) {
  const {t,i18n}=useTranslation();
  const policy=trpc.botSettings.getMarginPolicy.useQuery(undefined,{refetchOnWindowFocus:false});
  const [tax,setTax]=useState(''),[shipping,setShipping]=useState(''),[other,setOther]=useState('');
  const change=(set:(text:string)=>void,text:string)=>{onReady({ready:false,key:'editing'});set(text);};
  const costs={taxMinor:parse(tax),shippingCostMinor:parse(shipping),otherCostMinor:parse(other)};
  const valid=Object.values(costs).every(Number.isSafeInteger);
  const preview=trpc.orders.previewCheckoutMargin.useQuery({orderId,costs},{enabled:false,refetchOnWindowFocus:false});
  const data=preview.data;
  const matches=valid&&data?.totalMinor===totalAmount&&data.policyRevision===policy.data?.revision
    &&data.policy.enabled===policy.data?.policy.enabled&&data.policy.minPercent===policy.data?.policy.minPercent
    &&JSON.stringify(data.costs)===JSON.stringify(costs);
  const usable=!!matches&&data?.status==='pass'&&!preview.isFetching&&!preview.isError;
  const key=JSON.stringify({orderId,totalAmount,costs,policy:policy.data?.evidence,evidence:usable?data?.evidence:null,fetching:preview.isFetching,error:policy.isError||preview.isError});
  useEffect(()=>{
    const loaded=!!policy.data&&!policy.isLoading&&!policy.isError&&!policy.isFetching;
    if(loaded&&!policy.data!.policy.enabled)onReady({ready:true,key});
    else onReady({ready:loaded&&usable,key,...(loaded&&usable&&data?{proof:{costs:data.costs,evidence:data.evidence,reviewedCosts:true as const}}:{})});
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
      </div>}
    </>:<p className="text-sm text-muted-foreground">{t('merchantUx.invoiceMargin.disabled')}</p>}
  </div>;
}
