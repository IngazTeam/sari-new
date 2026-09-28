import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider,onlineManager} from '@tanstack/react-query';
import {observable} from '@trpc/server/observable';
import {TRPCClientError} from '@trpc/client';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import {trpc} from '../../../client/src/lib/trpc';
import {SallaCheckoutReview} from '../../../client/src/components/SallaCheckoutReview';
import ar from '../../../client/src/locales/merchant-ux.ar';
import en from '../../../client/src/locales/merchant-ux.en';
const w=window as any,p=new URLSearchParams(location.search),mode=p.get('case')||'ready';
w.__reads=[];w.__writes=[];w.__aborted=0;w.__late=0;w.__scope=20;
const qc=new QueryClient();w.__refresh=()=>qc.invalidateQueries();w.__online=(v:boolean)=>onlineManager.setOnline(v);
const time='2026-09-28T00:00:00.000Z',uuid=(id:number)=>`00000000-0000-4000-8000-${String(id).padStart(12,'0')}`;
const cart=(id:number)=>({cartId:id===30?'9'.repeat(100):'cart-'+id,preparedTotalMinor:230,currency:'SAR'});
const item=(id:number)=>({id,requestId:uuid(id),createdAt:time,cart:mode==='unavailable'?null:cart(id)});
const client=trpc.createClient({links:[()=>({op})=>observable(observer=>{
  const input=op.input as any;
  if(op.type!=='query'){w.__writes.push({path:op.path,input});observer.error(Error('Unexpected write'));return;}
  if(op.path!=='orders.checkoutEvidenceAccess')w.__reads.push({path:op.path,input});
  let completed=false;
  const aborted=()=>{w.__aborted++;};op.signal?.addEventListener('abort',aborted,{once:true});
  const timer=setTimeout(()=>{
    completed=true;
    // Deliberately return a late response despite cancellation, to exercise the
    // component version guard as well as its AbortSignal.
    if(op.signal?.aborted)w.__late++;
    const fail=()=>observer.error(TRPCClientError.from({error:{message:'private SQL token <img src=x onerror=window.__xss=1>',code:-32603,data:{code:'FORBIDDEN'}}}as any));
    if(op.path==='orders.checkoutEvidenceAccess'){observer.next({result:{data:{canInspect:mode!=='viewer'&&!w.__revoked,merchantId:w.__scope}}});observer.complete();return;}
    if(mode==='error'||w.__error){fail();return;}
    let result:any;
    if(op.path==='orders.listSallaCheckoutCarts'){
      result={merchantId:mode==='wrong-scope'?999:w.__scope,items:mode==='empty'?[]:Array.from({length:input.beforeId?2:mode==='paged'?20:2},(_,n)=>item((input.beforeId?input.beforeId-1:30)-n)),nextCursor:mode==='paged'&&!input.beforeId?11:null};
      if(mode==='extra')result.token='private';if(mode==='bad-page')result.items[1].id=30;
    }else if(op.path==='orders.inspectSallaCheckoutEvidence'){
      if(mode==='inspect-error'){fail();return;}
      const id=Number(input.requestId.slice(-12));
      result={requestId:input.requestId,observedAt:time,cart:cart(id),order:{orderId:input.orderId,checkoutId:mode==='different'?'different':cart(id).cartId,status:'paid',draft:mode==='draft',totalMinor:330,currency:'SAR'},
        transaction:input.transactionId?{transactionId:input.transactionId,orderId:input.orderId,cartId:null,status:'paid',totalMinor:330,currency:'SAR'}:null,
        comparison:{checkoutReference:mode==='different'?'different':'equal',transactionOrderReference:input.transactionId?'equal':'not_checked',transactionCartReference:input.transactionId?'absent':'not_checked'},providerLinkContract:'not_verified',attribution:'not_recorded',paymentFact:'not_recorded'};
      if(mode==='wrong-order')result.order.orderId='999';if(mode==='wrong-cart')result.cart={...result.cart,preparedTotalMinor:999};
      if(mode==='xss')result.order.status='<img src=x onerror=window.__xss=1>';if(mode==='false-sale')result.attribution='won';if(mode==='private-result')result.customerPhone='private';
    }else {fail();return;}
    observer.next({result:{data:result}});observer.complete();
  },op.path==='orders.inspectSallaCheckoutEvidence'?mode==='slow'?1000:150:100);
  return()=>{op.signal?.removeEventListener('abort',aborted);clearTimeout(timer);};
})]});
(async()=>{const lng=p.get('lang')==='en'?'en':'ar';document.documentElement.lang=lng;document.documentElement.dir=lng==='ar'?'rtl':'ltr';
await i18n.use(initReactI18next).init({lng,resources:{ar:{translation:{merchantUx:ar}},en:{translation:{merchantUx:en}}},interpolation:{escapeValue:false}});
createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={qc}><QueryClientProvider client={qc}><main className="mx-auto max-w-5xl p-3"><SallaCheckoutReview/></main></QueryClientProvider></trpc.Provider>);
})();
