import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient,QueryClientProvider,focusManager,onlineManager } from '@tanstack/react-query';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '@trpc/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { trpc } from '../../../client/src/lib/trpc';
import SalesExperimentEvidence from '../../../client/src/pages/admin/SalesExperimentEvidence';
import ar from '../../../client/src/locales/ar.json';
import en from '../../../client/src/locales/en.json';
import merchantUxAr from '../../../client/src/locales/merchant-ux.ar';
import merchantUxEn from '../../../client/src/locales/merchant-ux.en';

declare const __READOUT_FIXTURES__:Record<string,any>;
const w=window as any,params=new URLSearchParams(location.search),mode=params.get('case')??'mixed';
w.__readoutReads=[];w.__readoutWrites=[];w.__readoutAborted=0;
w.__readoutFocus=()=>{focusManager.setFocused(false);focusManager.setFocused(true);};
w.__readoutOnline=(value:boolean)=>onlineManager.setOnline(value);
const queryClient=new QueryClient();
const client=trpc.createClient({links:[()=>({op})=>observable(observer=>{
  if(op.type!=='query'||op.path!=='inboundOperations.salesExperimentReadout'){
    w.__readoutWrites.push(op);observer.error(new TRPCClientError('Unexpected operation'));return;
  }
  const input=op.input as any;w.__readoutReads.push(structuredClone(input));const ordinal=w.__readoutReads.length;
  const timer=setTimeout(()=>{
    const code=w.__readoutNextError||(['FORBIDDEN','UNAUTHORIZED','PRECONDITION_FAILED','INTERNAL_SERVER_ERROR'].includes(mode)?mode:null);
    if(code){w.__readoutNextError=null;observer.error(TRPCClientError.from({error:{message:'<img src=x onerror=window.__readoutXss=1> private server credentials',code:-32603,data:{code,httpStatus:403}}}));return;}
    let r=structuredClone(__READOUT_FIXTURES__[mode]??__READOUT_FIXTURES__.mixed);
    if(mode==='many-refresh')r=structuredClone(ordinal>1?__READOUT_FIXTURES__.refund:__READOUT_FIXTURES__.many);
    if(mode==='race'&&(input.protocolId===5||input.merchantId===8))r=structuredClone(__READOUT_FIXTURES__.empty);
    if(mode==='refresh-changed'&&ordinal>1)r=structuredClone(__READOUT_FIXTURES__.refund);
    r.merchantId=input.merchantId;r.protocolId=input.protocolId;
    if(mode==='foreign')r.merchantId++;
    if(mode==='wrong-protocol')r.protocolId++;
    if(mode==='unsupported')r.version='v2';
    if(mode==='inconsistent')r.paymentEvidence.groups[0].netCurrentlyObservedMinor++;
    if(mode==='outcome-inconsistent')r.outcomeEvidence.decision.blockers=[];
    if(mode==='staff-inconsistent')r.staffEvidence.completeness='complete';
    if(mode==='staff-refresh')r=structuredClone(ordinal>1?__READOUT_FIXTURES__['staff-missing']:__READOUT_FIXTURES__['staff-mixed']);
    if(mode==='outcome-refresh')r=structuredClone(ordinal>1?__READOUT_FIXTURES__.pending:__READOUT_FIXTURES__['outcome-mixed']);
    if(mode==='xss')r.sector='<img src=x onerror=window.__readoutXss=1>';
    observer.next({result:{data:r}});observer.complete();
  },mode==='slow'||mode==='race'&&input.protocolId===4&&input.merchantId===1?1300:ordinal>1?350:20);
  return ()=>{clearTimeout(timer);w.__readoutAborted++;};
})]});
async function render(){
  const lng=params.get('lang')==='en'?'en':'ar';document.documentElement.lang=lng;document.documentElement.dir=lng==='ar'?'rtl':'ltr';
  await i18n.use(initReactI18next).init({lng,resources:{ar:{translation:{...ar,merchantUx:merchantUxAr}},en:{translation:{...en,merchantUx:merchantUxEn}}},interpolation:{escapeValue:false}});
  createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}>
    <main className="mx-auto max-w-6xl p-4"><SalesExperimentEvidence/></main></QueryClientProvider></trpc.Provider>);
}
void render();
