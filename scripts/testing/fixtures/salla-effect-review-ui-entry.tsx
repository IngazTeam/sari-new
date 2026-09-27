import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider,onlineManager} from '@tanstack/react-query';
import {observable} from '@trpc/server/observable';
import {TRPCClientError} from '@trpc/client';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import {trpc} from '../../../client/src/lib/trpc';
import {SallaEffectReview} from '../../../client/src/components/SallaEffectReview';
import ar from '../../../client/src/locales/merchant-ux.ar';
import en from '../../../client/src/locales/merchant-ux.en';
const w=window as any,p=new URLSearchParams(location.search),mode=p.get('case')||'ready';
w.__reads=[];w.__writes=[];w.__saved={};w.__audits=[];
const qc=new QueryClient();w.__refresh=()=>qc.invalidateQueries();w.__online=(v:boolean)=>onlineManager.setOnline(v);
const time='2026-09-28T00:00:00.000Z';
function item(id:number,state='review') {return {id,orderId:4,kind:'sheets',state,attempts:1,createdAt:time,updatedAt:time,
  dispatchStartedAt:state==='pending'?null:time,acceptedAt:state==='accepted'?time:null,contextValid:id!==30,diagnostic:state==='pending'?'queued':state==='accepted'?'accepted':'outcome_unknown'};}
const client=trpc.createClient({links:[()=>({op})=>observable(observer=>{
  const input=op.input as any;
  const timer=setTimeout(()=>{
    const fail=()=>observer.error(TRPCClientError.from({error:{message:'private SQL token <img src=x onerror=window.__xss=1>',code:-32603,data:{code:'FORBIDDEN'}}}as any));
    if(op.path==='salla.effectReviewAccess'){observer.next({result:{data:{canReview:mode!=='viewer'}}});observer.complete();return;}
    if(op.type==='query'){
      w.__reads.push({path:op.path,input});if(mode==='error'||w.__error){fail();return;}
      let result:any;
      if(op.path==='salla.listEffectReviews')result={items:w.__audits.slice().reverse(),nextCursor:null};
      else if(op.path==='salla.listEffects'){
        const items=mode==='empty'?[]:Array.from({length:input.beforeId?2:mode==='paged'?20:3},(_,n)=>item((input.beforeId?input.beforeId-1:30)-n,n===1?'accepted':n===2?'pending':'review'));
        result={items,nextCursor:mode==='paged'&&!input.beforeId?11:null};
        if(mode==='extra')result.token='private';if(mode==='contradictory')items[0].acceptedAt=time;if(mode==='xss')items[0].kind='<img src=x onerror=window.__xss=1>';
      }else{fail();return;}
      observer.next({result:{data:result}});observer.complete();return;
    }
    w.__writes.push({path:op.path,input});if(op.path!=='salla.checkEffect'){fail();return;}
    let saved=w.__saved[input.requestId];if(!saved){saved={id:w.__audits.length+1,reviewerUserId:7,reason:input.reason,observedAt:time,effect:item(input.effectId)};w.__saved[input.requestId]=saved;w.__audits.push(saved);}
    if(mode==='lost'&&w.__writes.length===1){fail();return;}
    observer.next({result:{data:saved}});observer.complete();
  },mode==='slow'||op.type==='mutation'?250:50);
  return()=>clearTimeout(timer);
})]});
(async()=>{const lng=p.get('lang')==='en'?'en':'ar';document.documentElement.lang=lng;document.documentElement.dir=lng==='ar'?'rtl':'ltr';
await i18n.use(initReactI18next).init({lng,resources:{ar:{translation:{merchantUx:ar}},en:{translation:{merchantUx:en}}},interpolation:{escapeValue:false}});
createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={qc}><QueryClientProvider client={qc}><main className="mx-auto max-w-5xl p-4"><SallaEffectReview/></main></QueryClientProvider></trpc.Provider>);
})();
