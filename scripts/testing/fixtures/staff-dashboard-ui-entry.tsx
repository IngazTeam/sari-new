import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {observable} from '@trpc/server/observable';
import {TRPCClientError} from '@trpc/client';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import {Toaster} from 'sonner';
import {trpc} from '../../../client/src/lib/trpc';
import Conversations from '../../../client/src/pages/merchant/Conversations';
import ar from '../../../client/src/locales/ar.json';
import en from '../../../client/src/locales/en.json';
import merchantUxAr from '../../../client/src/locales/merchant-ux.ar';
import merchantUxEn from '../../../client/src/locales/merchant-ux.en';
const w=window as any,params=new URLSearchParams(location.search),mode=params.get('case')||'accepted';w.__staffWrites=[];w.__staffQueries=[];
const conversation={id:4,merchantId:2,customerPhone:'966500001234',customerName:'Synthetic customer',status:'active',lastMessageAt:'2026-09-27T00:00:00Z'};
const messages:any[]=[];
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
const client=trpc.createClient({links:[()=>({op})=>observable(observer=>{
  let data:any;
  if(op.type==='query'){
    w.__staffQueries.push(op.path);
    if(op.path==='conversations.list')data={items:[conversation],total:1,page:1,pageSize:50,totalPages:1};
    else if(op.path==='merchants.getCurrent')data={id:2,businessName:'Synthetic merchant',timezone:'Asia/Riyadh'};
    else if(op.path==='conversations.connectionStatus')data={connected:true,state:'connected'};
    else if(op.path==='conversations.getMessages')data=messages;
    else if(op.path==='conversations.getHandoff')data=null;
    else if(op.path==='conversations.listEscalationRelays'||op.path==='conversations.listSalesOfferAttempts')data={items:[],nextCursor:null};
    else if(op.path==='aiSuggestions.getQuickSuggestions')data={suggestions:[]};
    else {observer.error(new TRPCClientError('Unexpected fixture query '+op.path));return;}
  }else{
    if(op.path!=='conversations.sendReply'){observer.error(new TRPCClientError('Unexpected fixture write'));return;}
    w.__staffWrites.push(structuredClone(op.input));
    if(mode==='error'){observer.error(TRPCClientError.from({error:{message:'private token <script>',code:-32603,data:{code:'CONFLICT',httpStatus:409}}}));return;}
    const status=w.__staffResult||mode;data={success:status==='accepted'||status==='projection',status:status==='projection'?'accepted':status,persisted:status==='accepted'};
    if(data.success)messages.push({id:100+messages.length,conversationId:4,direction:'outgoing',messageType:'text',content:(op.input as any).message,senderType:'merchant',createdAt:'2026-09-27T00:01:00Z'});
  }
  const timer=setTimeout(()=>{observer.next({result:{data}});observer.complete();},op.type==='mutation'?200:5);return()=>clearTimeout(timer);
})]});
async function render(){const lng=params.get('lang')==='en'?'en':'ar';document.documentElement.lang=lng;document.documentElement.dir=lng==='ar'?'rtl':'ltr';
  await i18n.use(initReactI18next).init({lng,resources:{ar:{translation:{...ar,merchantUx:merchantUxAr}},en:{translation:{...en,merchantUx:merchantUxEn}}},interpolation:{escapeValue:false}});
  createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}><Conversations/><Toaster/></QueryClientProvider></trpc.Provider>);
}void render();
