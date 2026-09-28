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
w.__saved=[];
w.__recoveries=[];
const qc=new QueryClient();w.__refresh=()=>qc.invalidateQueries();w.__online=(v:boolean)=>onlineManager.setOnline(v);
const time='2026-09-28T00:00:00.000Z',uuid=(id:number)=>`00000000-0000-4000-8000-${String(id).padStart(12,'0')}`;
const cart=(id:number)=>({cartId:id===30?'9'.repeat(100):'cart-'+id,preparedTotalMinor:230,currency:'SAR'});
const item=(id:number)=>({id,requestId:uuid(id),createdAt:time,cart:mode==='unavailable'?null:cart(id)});
const client=trpc.createClient({links:[()=>({op})=>observable(observer=>{
  const raw=op.input as any,isSave=op.path==='orders.saveSallaCheckoutAudit',isRecovery=op.path==='orders.recoverSallaCart',input=isSave?raw.evidence:raw;
  if(op.type!=='query'){w.__writes.push({path:op.path,input:raw});if(!isSave&&!isRecovery){observer.error(Error('Unexpected write'));return;}}
  else if(op.path!=='orders.checkoutEvidenceAccess')w.__reads.push({path:op.path,input});
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
    }else if(op.path==='orders.listSallaCartProblems'){
      const problem=(id:number)=>({id,requestId:uuid(id),createdAt:time,state:mode==='problems-state'?'dispatching':input.state,
        diagnostic:mode==='problem-missing'?'missing_reference':mode==='problem-invalid'?'invalid_evidence':mode==='problems-state'||['preparing','dispatching'].includes(input.state)?'in_progress':input.state==='rejected'?'rejected_before_send':'verifiable',
        cartId:['problem-missing','problem-invalid'].includes(mode)?null:cart(id).cartId});
      result={merchantId:mode==='problems-scope'?999:20,items:Array.from({length:input.beforeId?2:mode==='problems-paged'?20:1},(_,n)=>problem((input.beforeId?input.beforeId-1:30)-n)),nextCursor:mode==='problems-paged'&&!input.beforeId?11:null};
    }else if(isRecovery){
      if(mode==='recover-failed'){fail();return;}
      const prior=w.__recoveries.find((v:any)=>v.requestId===input.requestId),id=Number(input.requestId.slice(-12));
      result=prior?{...prior,replayed:true}:{merchantId:20,requestId:input.requestId,cartId:cart(id).cartId,recovery:{reviewerUserId:7,observedAt:time},replayed:false,outcome:'contents_verified',paymentFact:'not_recorded',attribution:'not_recorded',customerMessage:'not_sent'};
      if(!prior)w.__recoveries.push(result);
      if(mode==='recover-lost'&&w.__writes.length===1){fail();return;}
      if(mode==='recover-scope')result={...result,merchantId:999};
    }else if(op.path==='orders.listSallaCheckoutAudits'){
      if(mode==='history-error'){fail();return;}
      const rows=w.__saved.filter((a:any)=>!input.beforeId||a.id<input.beforeId).sort((a:any,b:any)=>b.id-a.id);
      result={merchantId:mode==='history-scope'?999:w.__scope,items:rows.slice(0,20),nextCursor:rows.length>20?rows[19].id:null};
    }else if(op.path==='orders.inspectSallaCheckoutEvidence'||isSave){
      if(mode==='inspect-error'){fail();return;}
      const id=Number(input.requestId.slice(-12));
      result={requestId:input.requestId,observedAt:time,cart:cart(id),order:{orderId:input.orderId,checkoutId:mode==='different'?'different':cart(id).cartId,status:'paid',draft:mode==='draft',totalMinor:330,currency:'SAR'},
        transaction:input.transactionId?{transactionId:input.transactionId,orderId:input.orderId,cartId:null,status:'paid',totalMinor:330,currency:'SAR'}:null,
        comparison:{checkoutReference:mode==='different'?'different':'equal',transactionOrderReference:input.transactionId?'equal':'not_checked',transactionCartReference:input.transactionId?'absent':'not_checked'},providerLinkContract:'not_verified',attribution:'not_recorded',paymentFact:'not_recorded'};
      if(mode==='wrong-order')result.order.orderId='999';if(mode==='wrong-cart')result.cart={...result.cart,preparedTotalMinor:999};
      if(mode==='xss')result.order.status='<img src=x onerror=window.__xss=1>';if(mode==='false-sale')result.attribution='won';if(mode==='private-result')result.customerPhone='private';
      if(isSave){
        result.order.totalMinor=440;
        const prior=w.__saved.find((a:any)=>a.reviewId===raw.reviewId);
        result=prior??{id:w.__saved.length+1,merchantId:20,reviewerUserId:7,reviewId:raw.reviewId,savedAt:time,evidence:result};
        if(!prior)w.__saved.push(result);
        if(mode==='save-lost'&&w.__writes.length===1){fail();return;}
        if(mode==='save-scope')result={...result,merchantId:999};
      }
    }else {fail();return;}
    observer.next({result:{data:result}});observer.complete();
  },isRecovery&&mode==='recover-slow'||isSave&&mode==='save-slow'?1000:op.path==='orders.inspectSallaCheckoutEvidence'?mode==='slow'?1000:150:100);
  return()=>{op.signal?.removeEventListener('abort',aborted);clearTimeout(timer);};
})]});
(async()=>{const lng=p.get('lang')==='en'?'en':'ar';document.documentElement.lang=lng;document.documentElement.dir=lng==='ar'?'rtl':'ltr';
await i18n.use(initReactI18next).init({lng,resources:{ar:{translation:{merchantUx:ar}},en:{translation:{merchantUx:en}}},interpolation:{escapeValue:false}});
createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={qc}><QueryClientProvider client={qc}><main className="mx-auto max-w-5xl p-3"><SallaCheckoutReview/></main></QueryClientProvider></trpc.Provider>);
})();
