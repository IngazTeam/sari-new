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
const voiceFixture=params.get('voice')==='1';
if(voiceFixture&&params.get('mic')!=='real'){
  w.__tracksStopped=0;w.__recordersStarted=0;w.__clockOffset=0;w.__objectUrls=[];w.__revokedUrls=[];
  const now=Date.now.bind(Date);Date.now=()=>now()+w.__clockOffset;
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=create(blob);w.__objectUrls.push(url);return url;};URL.revokeObjectURL=url=>{w.__revokedUrls.push(url);revoke(url);};
  const capture=()=>({getTracks:()=>[{stop:()=>{w.__tracksStopped++;}}]});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{
    if(w.__micMode==='denied')return Promise.reject(Error('private microphone detail'));
    if(w.__micMode==='deferred')return new Promise(resolve=>{w.__resolveMic=()=>resolve(capture());});return Promise.resolve(capture());
  }}});
  class Recorder {
    static isTypeSupported(type:string){return params.get('format')==='mp4'?type==='audio/mp4':type==='audio/webm;codecs=opus';}
    state='inactive';ondataavailable:any;onstop:any;onerror:any;mimeType:string;
    constructor(_stream:any,options:{mimeType:string}){if(w.__recorderFailure)throw Error('private recorder detail');this.mimeType=options.mimeType;}
    start(){this.state='recording';w.__recordersStarted++;}
    stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(w.__emptyRecording?[]:[new Uint8Array(this.mimeType==='audio/mp4'?[0,0,0,12,102,116,121,112,77,52,65,32]:[26,69,223,163,115,121,110,116,104])],{type:this.mimeType})});this.onstop?.();});}
  }
  w.MediaRecorder=Recorder;
}
const conversation={id:4,merchantId:2,customerPhone:'966500001234',customerName:'Synthetic customer',status:'active',lastMessageAt:'2026-09-27T00:00:00Z'};
const messages:any[]=[];
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
w.__refreshQueries=()=>queryClient.invalidateQueries();
const client=trpc.createClient({links:[()=>({op})=>observable(observer=>{
  let data:any;
  if(op.type==='query'){
    w.__staffQueries.push(op.path);
    if(op.path==='conversations.list')data={items:voiceFixture?[...(w.__hideSelected?[]:[conversation]),{...conversation,id:5,customerName:'Other synthetic customer'}]:[conversation],total:voiceFixture?2:1,page:1,pageSize:50,totalPages:1};
    else if(op.path==='merchants.getCurrent')data={id:2,businessName:'Synthetic merchant',timezone:'Asia/Riyadh'};
    else if(op.path==='conversations.connectionStatus')data={connected:true,state:'connected'};
    else if(op.path==='conversations.getMessages')data=messages;
    else if(op.path==='conversations.getHandoff')data=null;
    else if(op.path==='conversations.listEscalationRelays'||op.path==='conversations.listSalesOfferAttempts')data={items:[],nextCursor:null};
    else if(op.path==='aiSuggestions.getQuickSuggestions')data={suggestions:[]};
    else {observer.error(new TRPCClientError('Unexpected fixture query '+op.path));return;}
  }else{
    if(op.path!=='conversations.sendReply'&&!(voiceFixture&&op.path==='conversations.sendVoiceReply')){observer.error(new TRPCClientError('Unexpected fixture write'));return;}
    w.__staffWrites.push(structuredClone(op.input));
    if(mode==='error'){observer.error(TRPCClientError.from({error:{message:'private token <script>',code:-32603,data:{code:'CONFLICT',httpStatus:409}}}));return;}
    const status=w.__staffResult||mode;data={success:status==='accepted'||status==='projection',status:status==='projection'?'accepted':status,persisted:status==='accepted'};
    if(data.success)messages.push({id:100+messages.length,conversationId:4,direction:'outgoing',messageType:voiceFixture?'voice':'text',content:voiceFixture?'Synthetic recording':(op.input as any).message,senderType:'merchant',createdAt:'2026-09-27T00:01:00Z'});
  }
  const timer=setTimeout(()=>{observer.next({result:{data}});observer.complete();},op.type==='mutation'?200:5);return()=>clearTimeout(timer);
})]});
async function render(){const lng=params.get('lang')==='en'?'en':'ar';document.documentElement.lang=lng;document.documentElement.dir=lng==='ar'?'rtl':'ltr';
  await i18n.use(initReactI18next).init({lng,resources:{ar:{translation:{...ar,merchantUx:merchantUxAr}},en:{translation:{...en,merchantUx:merchantUxEn}}},interpolation:{escapeValue:false}});
  const root=createRoot(document.getElementById('root')!);w.__unmount=()=>root.unmount();root.render(<trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}><Conversations/><Toaster/></QueryClientProvider></trpc.Provider>);
}void render();
