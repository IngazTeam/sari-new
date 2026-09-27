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
const teamFixture=params.get('team')==='1';w.__teamQueries=[];w.__teamChecks=[];w.__teamStates={};w.__teamAudits=[];w.__teamResponses={};
const reviewFixture=params.get('review')==='1';w.__attemptChecks=[];w.__attemptQueries=[];w.__attemptStates={};
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
    if(op.path==='conversations.list')data={items:voiceFixture||reviewFixture?[...(w.__hideSelected?[]:[conversation]),{...conversation,id:5,customerName:'Other synthetic customer'}]:[conversation],total:voiceFixture||reviewFixture?2:1,page:1,pageSize:50,totalPages:1};
    else if(op.path==='conversations.staffTeamReviewAccess')data={canReview:teamFixture&&mode!=='viewer'&&!w.__teamDenied};
    else if(op.path==='merchants.getCurrent')data={id:2,businessName:'Synthetic merchant',timezone:'Asia/Riyadh'};
    else if(op.path==='conversations.connectionStatus')data={connected:true,state:'connected'};
    else if(op.path==='conversations.getMessages')data=messages;
    else if(op.path==='conversations.getHandoff')data=null;
    else if(op.path==='conversations.listEscalationRelays'||op.path==='conversations.listSalesOfferAttempts')data={items:[],nextCursor:null};
    else if(op.path==='conversations.listTeamStaffAttempts'||op.path==='conversations.listStaffTeamReviews'){
      const input=op.input as any;w.__teamQueries.push({path:op.path,input:structuredClone(input)});
      if(mode==='list-error'||w.__teamDenied){observer.error(new TRPCClientError('private team permission'));return;}
      const key=(id:number)=>input.kind+':'+id;
      if(op.path==='conversations.listTeamStaffAttempts'){
        const item=(id:number)=>({attempt:{id,createdAt:'2026-09-27T00:01:00.000Z',state:'pending',persisted:null,...w.__teamStates[key(id)]},conversationId:4,authorUserId:8});
        data=mode==='empty'||input.conversationId&&input.conversationId!==4||input.authorUserId&&input.authorUserId!==8?{items:[],nextCursor:null}:mode==='pages'
          ?{items:Array.from({length:input.beforeId?3:20},(_,n)=>item((input.beforeId||101)-1-n)),nextCursor:input.beforeId?null:81}
          :{items:[item(30)],nextCursor:null};
        if(mode==='invalid')data.items[0].token='private';
      }else data={items:w.__teamAudits.filter((a:any)=>a.kind===input.kind&&(!input.conversationId||a.conversationId===input.conversationId)&&(!input.authorUserId||a.authorUserId===input.authorUserId)&&(!input.beforeId||a.id<input.beforeId)).slice(0,20),nextCursor:null};
    }
    else if(op.path==='conversations.listStaffAttempts'){

      const input=op.input as any;w.__attemptQueries.push(structuredClone(input));
      if(mode==='list-error'||w.__reviewDenied){observer.error(new TRPCClientError('private attempt permission detail'));return;}
      const item=(id:number,state='pending',persisted:boolean|null=null)=>({id,createdAt:'2026-09-27T00:01:00.000Z',state,persisted,...w.__attemptStates[`${input.conversationId}:${input.kind}:${id}`]});
      data=mode==='empty'||input.conversationId===5?{items:[],nextCursor:null}:mode==='pages'
        ?{items:Array.from({length:20},(_,n)=>item((input.beforeId||101)-1-n)),nextCursor:input.beforeId?null:81}
        :{items:[item(30),item(29,'accepted',true),item(28,'unavailable')],nextCursor:null};
      if(mode==='invalid')data.items[0].mediaUrl='private signed URL';
    }
    else if(op.path==='aiSuggestions.getQuickSuggestions')data={suggestions:[]};
    else {observer.error(new TRPCClientError('Unexpected fixture query '+op.path));return;}
  }else{
    if(op.path==='conversations.checkTeamStaffAttempt'){
      const input=op.input as any;w.__teamChecks.push(structuredClone(input));
      if(w.__teamDenied||mode==='error'){observer.error(new TRPCClientError('private team SQL'));return;}
      const prior=w.__teamResponses[input.requestId];
      const result=w.__teamResult||mode;
      data=prior||{reviewId:100+w.__teamAudits.length,result:['accepted','lost-ack','projection'].includes(result)?{success:true,status:'accepted',persisted:result!=='projection'}
        :{success:false,status:['unavailable','failed','suppressed'].includes(result)?result:'pending',persisted:false}};
      if(result==='bad-result')data={reviewId:1,result:{success:true,status:'pending',persisted:true}};
      if(!prior&&result!=='bad-result'){
        w.__teamResponses[input.requestId]=data;
        w.__teamAudits.unshift({id:data.reviewId,kind:input.kind,sourceId:input.sourceId,conversationId:input.conversationId,authorUserId:input.authorUserId,reviewerUserId:7,reason:input.reason,createdAt:'2026-09-27T00:02:00.000Z',result:data.result});
        if(data.result.success)w.__teamStates[input.kind+':'+input.sourceId]={state:'accepted',persisted:data.result.persisted};
      }
      const timer=setTimeout(()=>{if(mode==='lost-ack'&&!prior)observer.error(new TRPCClientError('private lost ack'));else{observer.next({result:{data}});observer.complete();}},w.__teamDelay||200);return()=>clearTimeout(timer);
    }
    if(op.path==='conversations.checkStaffAttempt'){

      const input=op.input as any;w.__attemptChecks.push(structuredClone(input));
      if(mode==='error'||w.__reviewDenied){observer.error(new TRPCClientError('private attempt SQL error'));return;}
      const result=w.__reviewResult||mode;
      data=result==='bad-result'?{success:true,status:'pending',persisted:true}:['accepted','projection'].includes(result)
        ?{success:true,status:'accepted',persisted:result==='accepted'}:{success:false,status:result==='failed'?'failed':result==='suppressed'?'suppressed':'pending',persisted:false};
      if(data.success&&data.status==='accepted')w.__attemptStates[`${input.conversationId}:${input.kind}:${input.sourceId}`]={state:'accepted',persisted:data.persisted};
      const timer=setTimeout(()=>{observer.next({result:{data}});observer.complete();},w.__attemptCheckDelay||200);return()=>clearTimeout(timer);
    }
    if(op.path!=='conversations.sendReply'&&!(voiceFixture&&op.path==='conversations.sendVoiceReply')){observer.error(new TRPCClientError('Unexpected fixture write'));return;}
    w.__staffWrites.push(structuredClone(op.input));
    if(mode==='error'){observer.error(TRPCClientError.from({error:{message:'private token <script>',code:-32603,data:{code:'CONFLICT',httpStatus:409}}}));return;}
    const status=w.__staffResult||mode;data={success:status==='accepted'||status==='projection',status:status==='projection'?'accepted':status,persisted:status==='accepted'};
    if(data.success)messages.push({id:100+messages.length,conversationId:4,direction:'outgoing',messageType:voiceFixture?'voice':'text',content:voiceFixture?'Synthetic recording':(op.input as any).message,senderType:'merchant',createdAt:'2026-09-27T00:01:00Z'});
  }
  const timer=setTimeout(()=>{observer.next({result:{data}});observer.complete();},op.path==='conversations.listStaffAttempts'?(w.__attemptQueryDelay||5):op.type==='mutation'?200:5);return()=>clearTimeout(timer);
})]});
async function render(){const lng=params.get('lang')==='en'?'en':'ar';document.documentElement.lang=lng;document.documentElement.dir=lng==='ar'?'rtl':'ltr';
  await i18n.use(initReactI18next).init({lng,resources:{ar:{translation:{...ar,merchantUx:merchantUxAr}},en:{translation:{...en,merchantUx:merchantUxEn}}},interpolation:{escapeValue:false}});
  const root=createRoot(document.getElementById('root')!);w.__unmount=()=>root.unmount();root.render(<trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}><Conversations/><Toaster/></QueryClientProvider></trpc.Provider>);
}void render();
