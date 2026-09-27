import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '@trpc/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { trpc } from '../../../client/src/lib/trpc';
import SalesEvidence from '../../../client/src/pages/admin/SalesEvidence';
import ar from '../../../client/src/locales/ar.json';
import en from '../../../client/src/locales/en.json';
const w=window as any,params=new URLSearchParams(location.search),mode=params.get('case')||'ready';
w.__reads=[];w.__writes=[];w.__aborted=0;
const qc=new QueryClient();w.__refresh=()=>qc.invalidateQueries();
w.__focus=()=>{focusManager.setFocused(false);focusManager.setFocused(true);};w.__online=(value:boolean)=>onlineManager.setOnline(value);
const client=trpc.createClient({links:[()=>({op})=>observable(observer=>{
  if(op.type!=='query'||op.path!=='inboundOperations.sallaObservations'){w.__writes.push(op);observer.error(new TRPCClientError('Unexpected request'));return;}
  w.__reads.push(structuredClone(op.input));const input=op.input as any;
  const timer=setTimeout(()=>{
    const code=w.__error||(['FORBIDDEN','UNAUTHORIZED','INTERNAL_SERVER_ERROR'].includes(mode)?mode:null);
    if(code){observer.error(TRPCClientError.from({error:{message:'private SQL password <img src=x onerror=window.__xss=1>',code:-32603,data:{code}}}as any));return;}
    const result:any={...input,source:'salla_authenticated_order_read',paymentEvidence:'not_measured',observations:mode==='empty'?[]:
      ['pending','paid','processing','shipped','delivered','cancelled'].map(state=>({state,providerStatus:state,firstObservedAt:'2026-09-27T08:15:00.000Z'}))};
    if(mode==='foreign-merchant')result.merchantId++;if(mode==='foreign-store')result.storeId='999';if(mode==='foreign-order')result.orderId='999';
    if(mode==='xss')result.observations[0].state='<img src=x onerror=window.__xss=1>';
    if(mode==='financial')result.paymentEvidence='captured';if(mode==='extra')result.accessToken='private';
    if(mode==='duplicate')result.observations[1]=result.observations[0];
    observer.next({result:{data:result}});observer.complete();
  },mode==='slow'?1200:w.__reads.length>1?350:20);
  return()=>{clearTimeout(timer);w.__aborted++;};
})]});
(async()=>{const lng=params.get('lang')==='en'?'en':'ar';document.documentElement.lang=lng;document.documentElement.dir=lng==='ar'?'rtl':'ltr';
  await i18n.use(initReactI18next).init({lng,resources:{ar:{translation:ar},en:{translation:en}},interpolation:{escapeValue:false}});
  createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={qc}><QueryClientProvider client={qc}><main className="p-4 mx-auto max-w-6xl"><SalesEvidence /></main></QueryClientProvider></trpc.Provider>);
})();
