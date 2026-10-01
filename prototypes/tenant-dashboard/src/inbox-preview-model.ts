import { conversationConnectionStatus, conversationConnectionDiagnosis } from '../../../shared/conversation-connection';
import { handoffSnapshot, handoffSourceSnapshot } from '../../../shared/conversation-handoff';
import { escalationReviewSnapshot } from '../../../shared/escalation-review';
import { salesOfferReviewSnapshot } from '../../../shared/sales-offer-review';
import { staffAttemptSnapshot } from '../../../shared/staff-attempt-review';
import { staffTeamContext, staffTeamSnapshot } from '../../../shared/staff-team-review';
import { generatedSuggestions } from '../../../shared/reply-suggestions';
import { VALID_DEAL_STAGES } from '../../../shared/const';
export const inboxModes = ['normal','empty','empty-history','loading','list-error','history-error','tools-error','forbidden','session','foreign','stale-error','readonly','disconnected','partial-import','uncertain-send','pending-send','mutation-error','attachment-errors'] as const;
export type InboxMode = typeof inboxModes[number];
export const inboxQueries = ['auth.me','merchants.getCurrent','conversations.list','conversations.messageHistory','conversations.handoffSnapshot','conversations.handoffSourceSnapshot','conversations.escalationReviewSnapshot','conversations.salesOfferReviewSnapshot','conversations.staffAttemptSnapshot','conversations.connectionStatus','conversations.staffTeamSnapshot','conversations.staffTeamContext','aiSuggestions.getQuickSuggestions'] as const;
export const inboxMutations = ['conversations.sendReply','conversations.sendVoiceReply','conversations.setOwnership','conversations.reviewEscalationRelay','conversations.reviewSalesOffer','conversations.checkStaffAttempt','conversations.diagnoseWebhook','conversations.syncFromWhatsApp','conversations.checkTeamStaffAttempt','aiSuggestions.generateSuggestions'] as const;
const at = '2026-10-01T10:30:00.000Z';
const fault = (code='INTERNAL_SERVER_ERROR') => ({ message: 'Local simulation', data: { code } });
type Message = {id:number;conversationId:number;direction:string;senderType:string;messageType:string;content:string;createdAt:string;imageUrl:string|null;voiceUrl:string|null;mediaUrl:string|null};
/** Local fixtures only. This class has no transport, credentials or provider dependency. */
export class InboxPreviewModel {
  readonly actorUserId:number;
  language:'ar'|'en'='ar';
  retries=0; operations=0; pending=0;
  private revision=0; private recovered=false;
  private listeners=new Set<()=>void>(); private cache=new Map<string,any>();
  private messages=new Map<number,Message[]>(); private ownership=new Map<number,{human:boolean;version:number}>();
  private reviews=new Map<string,any>(); private receipts=new Map<string,any>(); private audits:any[]=[];
  private waiting:Array<()=>void>=[];
  constructor(readonly merchantId:number,readonly mode:InboxMode='normal') { if(![235,236].includes(merchantId))throw Error('Unknown simulated tenant');this.actorUserId=merchantId+1000; }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  snapshot=()=>this.revision;
  private emit(clear=false){if(clear)this.cache.clear();this.revision++;for(const listener of this.listeners)listener();}
  invalidate=async()=>{this.emit(true);};
  get activeMode(){return this.recovered?'normal':this.mode;}
  complete=()=>{this.recovered=true;for(const release of this.waiting.splice(0))release();this.emit(true);};
  finishPending=()=>{for(const release of this.waiting.splice(0))release();};
  async refetch(name:string,input:any){this.retries++;this.recovered=true;this.emit(true);return this.read(name,input);}
  private owned(id:number){if(!Number.isInteger(id)||id<1||id>65)throw Error('Unknown local conversation');return id;}
  private scope(){return {merchantId:this.merchantId,actorUserId:this.actorUserId};}
  private owner(id:number){return this.ownership.get(id)??{human:false,version:0};}
  private stage(id:number){return [...VALID_DEAL_STAGES,'stalled'][(id+2)%10];}
  private conversation(id:number){return {id,merchantId:this.merchantId,customerName:`${this.merchantId===235?'نواة · Nawa':'مدار · Madar'} ${id}`,customerPhone:`ux-customer-${String(id).padStart(3,'0')}`,status:id%5===0?'closed':'active',lastMessageAt:at,handoffVersion:this.owner(id).version};}
  private history(id:number):Message[]{
    this.owned(id);let rows=this.messages.get(id);if(rows)return rows;
    rows=Array.from({length:65},(_,index)=>({id:id*1000+index+1,conversationId:id,direction:index%3===0?'outgoing':'incoming',senderType:index%3===0?(index%2?'merchant':'assistant'):'customer',messageType:'text',content:`${this.merchantId} · رسالة توضيحية ${index+1} · Sample message ${index+1}`,createdAt:new Date(Date.parse(at)+index*1000).toISOString(),imageUrl:null,voiceUrl:null,mediaUrl:null}));
    Object.assign(rows[60],{messageType:'image',content:'صورة منتج توضيحية · Sample image',imageUrl:'/uploads/inbox-preview.png'});
    Object.assign(rows[61],{messageType:'voice',direction:'outgoing',senderType:'merchant',content:'صوت صامت تجريبي · Silent sample audio',voiceUrl:'/uploads/inbox-preview.wav'});
    Object.assign(rows[62],{messageType:'document',direction:'outgoing',senderType:'unknown',content:'ملف تجريبي · Sample file',mediaUrl:'/uploads/inbox-preview.txt'});
    Object.assign(rows[63],{content:'تفاصيل المنتج · Product details: '+ 'LongUnbrokenExample'.repeat(18)});
    if(this.mode==='attachment-errors'){rows[60].imageUrl='/uploads/inbox-preview-missing.png';rows[61].voiceUrl='/uploads/inbox-preview-missing.wav';rows[62].mediaUrl='javascript:invalid';}
    this.messages.set(id,rows);return rows;
  }
  private page<T>(rows:T[],before:number|undefined,size:number,id:(row:T)=>number){const eligible=rows.filter(row=>before===undefined||id(row)<before);const items=eligible.slice(0,size);return {items,nextCursor:eligible.length>size?id(items.at(-1)!):null};}
  private attempt(id:number,kind:string,conversationId:number){return this.reviews.get(`attempt:${conversationId}:${kind}:${id}`)??{id,createdAt:at,state:'pending',persisted:null,diagnostic:'transport_pending'};}
  private relay(conversationId:number,id:number){return this.reviews.get(`relay:${conversationId}:${id}`)??{id,revision:0,evidence:'a'.repeat(64),state:'pending',outcome:'unresolved',projected:false,sourceMessageId:conversationId*1000+id,question:'سؤال توضيحي · Sample customer question',reply:'رد موظف توضيحي · Sample staff reply',authorPhone:'test-only-0042',createdAt:at,receipt:null,lastReview:null};}
  private offer(conversationId:number,index:number){const id=`00000000-0000-4000-8000-${String(conversationId*100+index).padStart(12,'0')}`;return this.reviews.get(`offer:${id}`)??{id,revision:0,evidence:'b'.repeat(64),state:'pending',accepted:false,projected:false,projectionConflict:false,attemptState:'unknown',sourceMessageId:conversationId*1000+65-index,sourceText:'طلب عرض توضيحي · Sample offer request',text:'عرض تجريبي بلا دفع أو خصم فعلي · Sample offer only',createdAt:at,receipt:null,lastReview:null};}
  private fixture(name:string,input:any={}) : any {
    const scope=this.scope(),mode=this.activeMode,canManage=mode!=='readonly';
    if(name==='auth.me')return mode==='session'?null:{id:this.actorUserId,name:'Prototype account'};
    if(name==='merchants.getCurrent')return {id:this.merchantId,timezone:this.merchantId===235?'Asia/Riyadh':'America/New_York'};
    if(name==='conversations.list'){
      const all=mode==='empty'?[]:Array.from({length:65},(_,i)=>this.conversation(65-i));
      const rows=all.filter(row=>(!input.search||`${row.customerName} ${row.customerPhone}`.toLowerCase().includes(String(input.search).toLowerCase()))&&(!input.stage||input.stage===this.stage(row.id))&&(!input.needsHuman||row.id%3===0));
      const size=input.pageSize??50,page=input.page??1;return {merchantId:this.merchantId,items:rows.slice((page-1)*size,page*size),total:rows.length,page,pageSize:size,totalPages:Math.ceil(rows.length/size)};
    }
    if(name==='conversations.messageHistory'){
      const id=this.owned(input.conversationId),all=mode==='empty-history'?[]:this.history(id);const older=all.filter(row=>!input.beforeId||row.id<input.beforeId);const items=older.slice(-(input.limit??50));
      return {merchantId:this.merchantId,conversationId:id,conversation:this.conversation(id),items,hasMore:older.length>items.length,nextBeforeId:older.length>items.length?items[0].id:null};
    }
    if(name==='conversations.connectionStatus')return conversationConnectionStatus.parse({...scope,instanceId:2350,provider:'green_api',checkedAt:at,canManage,connected:mode!=='disconnected',state:mode==='disconnected'?'disconnected':'authorized',phoneNumber:'Local simulation · 2350',message:'Local fixture'});
    if(name==='conversations.staffTeamContext')return staffTeamContext.parse({...scope,canReview:canManage});
    if(name==='conversations.staffTeamSnapshot'){
      const rows=input.mode==='history'?this.audits.filter(row=>row.kind===input.kind):Array.from({length:25},(_,i)=>({attempt:this.attempt(225-i,input.kind,i%2?51:52),conversationId:i%2?51:52,authorUserId:this.actorUserId+1}));
      const filtered=rows.filter(row=>(!input.conversationId||row.conversationId===input.conversationId)&&(!input.authorUserId||row.authorUserId===input.authorUserId));
      return staffTeamSnapshot.parse({...scope,kind:input.kind,mode:input.mode,conversationId:input.conversationId??null,authorUserId:input.authorUserId??null,beforeId:input.beforeId??null,page:this.page(filtered,input.beforeId,20,(row:any)=>input.mode==='history'?row.id:row.attempt.id)});
    }
    if(name==='aiSuggestions.getQuickSuggestions')return {suggestions:[{emoji:'✦',text:'مثال محلي · Local example'}]};
    const conversationId=this.owned(input.conversationId),history=this.history(conversationId),owner=this.owner(conversationId);
    if(name==='conversations.handoffSnapshot')return handoffSnapshot.parse({...scope,canManage,summary:{conversationId,version:owner.version,lastMessageId:history.at(-1)!.id,humanOwned:owner.human,expiresAt:null,dealStage:'interested',lossReason:null,facts:[{field:'budget',value:{amountMinor:25000,currency:'SAR'},kind:'explicit',sourceMessageId:history[10].id,conversationId,observedAt:at,expiresAt:'2027-01-01T00:00:00.000Z',revision:0}],messages:history.slice(-3).map(row=>({id:row.id,role:row.senderType,text:row.content.slice(0,600),at:row.createdAt})),offers:[]}});
    if(name==='conversations.handoffSourceSnapshot'){const row=history.find(row=>row.id===input.messageId);if(!row)throw Error('Unknown source');return handoffSourceSnapshot.parse({...scope,conversationId,message:{id:row.id,role:row.senderType,text:row.content,at:row.createdAt}});}
    if(name==='conversations.staffAttemptSnapshot')return staffAttemptSnapshot.parse({...scope,conversationId,kind:input.kind,beforeId:input.beforeId??null,page:this.page(Array.from({length:25},(_,i)=>this.attempt(125-i,input.kind,conversationId)),input.beforeId,20,(row:any)=>row.id)});
    if(name==='conversations.escalationReviewSnapshot')return escalationReviewSnapshot.parse({...scope,conversationId,canManage,beforeId:input.beforeId??null,page:this.page(Array.from({length:12},(_,i)=>this.relay(conversationId,12-i)),input.beforeId,10,(row:any)=>row.id)});
    if(name==='conversations.salesOfferReviewSnapshot')return salesOfferReviewSnapshot.parse({...scope,conversationId,canManage,beforeSourceId:input.beforeSourceId??null,page:this.page(Array.from({length:12},(_,i)=>this.offer(conversationId,i)),input.beforeSourceId,10,(row:any)=>row.sourceMessageId)});
    throw Error('Unknown preview read: '+name);
  }
  read(name:string,input?:any){
    if(!inboxQueries.includes(name as any))throw Error('Unmapped read: '+name);
    const key=JSON.stringify([name,input]);if(this.cache.has(key))return this.cache.get(key);
    const mode=this.activeMode;
    const tool=!['auth.me','merchants.getCurrent','conversations.list','conversations.messageHistory'].includes(name);
    const loading=mode==='loading'&&name==='conversations.list';
    const error=mode==='forbidden'&&name==='merchants.getCurrent'?fault('FORBIDDEN'):(mode==='list-error'||mode==='stale-error')&&name==='conversations.list'||mode==='history-error'&&name==='conversations.messageHistory'||mode==='tools-error'&&tool?fault():null;
    let data;try{data=this.fixture(name,input);}catch{const result={data:undefined,error:fault('NOT_FOUND'),isLoading:false,isFetching:false,isError:true,isFetchedAfterMount:true,dataUpdatedAt:0};this.cache.set(key,result);return result;}
    if(mode==='foreign'&&name.startsWith('conversations.')&&data?.merchantId)data={...data,merchantId:999};
    const result={data:loading||error&&mode!=='stale-error'?undefined:data,error,isLoading:loading,isFetching:loading,isError:!!error,isFetchedAfterMount:!loading,dataUpdatedAt:Date.parse(at)+this.revision};this.cache.set(key,result);return result;
  }
  async mutate(name:string,input:any){
    if(!inboxMutations.includes(name as any))throw Error('Unmapped mutation: '+name);
    const mode=this.activeMode;this.operations++;this.emit();
    if(mode==='mutation-error')throw fault();if(mode==='readonly'&&!['conversations.sendReply','conversations.sendVoiceReply','aiSuggestions.generateSuggestions'].includes(name))throw fault('FORBIDDEN');
    if(name==='conversations.syncFromWhatsApp')return mode==='partial-import'?{success:true,chatsImported:2,messagesImported:8,totalChats:2,errors:['Local partial fixture']}:{success:true,chatsImported:3,messagesImported:12,totalChats:3};
    if(name==='conversations.diagnoseWebhook')return conversationConnectionDiagnosis.parse({...this.scope(),instanceId:2350,provider:'green_api',checkedAt:at,status:'fixed',fixed:true,instanceState:'authorized',issues:['webhook_events'],details:{webhookConfigured:true,webhookAuthenticated:true,webhookEventsEnabled:true},message:'Local simulated repair'});
    const conversationId=this.owned(input.conversationId),rows=this.history(conversationId),owner=this.owner(conversationId);
    if(name==='aiSuggestions.generateSuggestions')return generatedSuggestions.parse({context:{...this.scope(),conversationId,lastMessageId:rows.at(-1)!.id,version:owner.version,evidenceHash:'c'.repeat(64)},suggestions:['friendly','professional','brief','detailed'].map((type,i)=>({id:i+1,type,label:type,text:this.language==='ar'?['يسعدني مساعدتك. أي تفاصيل تود معرفتها؟','سأراجع التفاصيل المتاحة ثم أوضح لك الخيارات.','ما المنتج الذي تقصده؟','لنراجع احتياجك أولًا. أخبرني بالمنتج والكمية المطلوبة.'][i]:['Happy to help. Which details would you like?','I will review the available details and explain your options.','Which product do you mean?','Let us review your needs first. Which product and quantity are you considering?'][i]}))});
    if(name==='conversations.sendReply'||name==='conversations.sendVoiceReply'){
      const key=`${name}:${conversationId}:${input.requestId}`;if(this.receipts.has(key))return this.receipts.get(key);
      if(mode==='pending-send'){this.pending++;this.emit();await new Promise<void>(resolve=>this.waiting.push(resolve));this.pending--;}
      if(mode==='uncertain-send'){const result={success:false,status:'pending',persisted:false};this.receipts.set(key,result);return result;}
      rows.push({id:rows.at(-1)!.id+1,conversationId,direction:'outgoing',senderType:'merchant',messageType:name.endsWith('VoiceReply')?'voice':'text',content:input.message??'صوت محلي تجريبي · Simulated audio',createdAt:new Date().toISOString(),imageUrl:null,mediaUrl:null,voiceUrl:name.endsWith('VoiceReply')?'/uploads/inbox-preview.wav':null});
      const result={success:true,persisted:true};this.receipts.set(key,result);return result;
    }
    if(name==='conversations.setOwnership'){
      if(input.expectedVersion!==owner.version||input.expectedLastMessageId!==rows.at(-1)!.id)throw fault('CONFLICT');
      this.ownership.set(conversationId,{human:input.action==='takeover',version:owner.version+1});return {changed:true,merchantId:this.merchantId,version:owner.version+1};
    }
    if(name==='conversations.reviewEscalationRelay'){
      const old=this.relay(conversationId,input.relayId);if(input.expectedRevision!==old.revision||input.evidence!==old.evidence)throw fault('CONFLICT');
      this.reviews.set(`relay:${conversationId}:${input.relayId}`,{...old,revision:old.revision+1,state:'accepted',outcome:'accepted',projected:true,receipt:'local-fixture-receipt',lastReview:{actorUserId:this.actorUserId,note:input.note,outcome:'accepted',at}});return {outcome:'accepted',customerPhone:this.conversation(conversationId).customerPhone};
    }
    if(name==='conversations.reviewSalesOffer'){
      const old=Array.from({length:12},(_,i)=>this.offer(conversationId,i)).find(row=>row.id===input.attemptId);if(!old||input.expectedRevision!==old.revision||input.evidence!==old.evidence)throw fault('CONFLICT');
      this.reviews.set(`offer:${old.id}`,{...old,revision:old.revision+1,state:'sent',accepted:true,projected:true,attemptState:'accepted',receipt:'local-fixture-receipt',lastReview:{actorUserId:this.actorUserId,note:input.note,outcome:'recorded',deliveryState:'sent',at}});return {accepted:true,projected:true,deliveryState:'sent',outcome:'recorded'};
    }
    if(name==='conversations.checkStaffAttempt'||name==='conversations.checkTeamStaffAttempt'){
      const result={success:true,status:'accepted',persisted:true};this.reviews.set(`attempt:${conversationId}:${input.kind}:${input.sourceId}`,{id:input.sourceId,createdAt:at,state:'accepted',persisted:true});
      if(name==='conversations.checkStaffAttempt')return result;
      if(this.receipts.has(input.requestId))return this.receipts.get(input.requestId);
      const id=this.audits.length+1;this.audits.unshift({id,kind:input.kind,sourceId:input.sourceId,conversationId,authorUserId:input.authorUserId,reviewerUserId:this.actorUserId,reason:input.reason,createdAt:at,result});this.receipts.set(input.requestId,{reviewId:id,result});return this.receipts.get(input.requestId);
    }
    throw Error('Unmapped operation');
  }
}
