import {calendlyWorkspaceSchema,calendlyAppointmentsInput,calendlyAppointmentsSchema,calendlyReceiptsInput,calendlyReceiptsSchema,calendlyAppointmentStates,calendlyReceiptStates,type CalendlyAppointments,type CalendlyReceipts} from '../../../shared/calendly-workspace';
import {calendlyConnectionPreviewInput,calendlyConnectionPreviewSchema,calendlyConnectionCommand} from '../../../shared/calendly-connection';
import {calendlyBookingLinksSchema} from '../../../shared/calendly-booking-links';
import {calendlySyncCommand} from '../../../shared/calendly-sync';
import {calendlySettingsCommand} from '../../../shared/calendly-settings';
import {calendlyOperationReceipt,calendlyOperationReviewWorkspace,calendlyOperationLookup,type CalendlyOperationReceipt,type CalendlyOperationKind} from '../../../shared/calendly-operation';
export const calendlyPreviewQueries=['calendly.getWorkspace','calendly.getAppointmentsWorkspace','calendly.getReceiptsWorkspace','calendly.getBookingLinksWorkspace','calendly.getOperation','calendly.getBlockingOperation'] as const;
export const calendlyPreviewMutations=['calendly.previewConnection','calendly.requestConnection','calendly.requestSync','calendly.saveWorkspaceSettings','calendly.acknowledgeOperation'] as const;
const fault=(code='CONFLICT',reason='changed')=>({message:'calendly_operation:'+reason,data:{code}});
// Deterministic sample identity, not a production credential digest.
const identity=(text:string)=>{let n=2166136261;for(const char of text)n=Math.imul(n^char.charCodeAt(0),16777619);return (n>>>0).toString(16).padStart(8,'0').repeat(8);};
type Operation={payload:any;fingerprint:string;receipt:CalendlyOperationReceipt;outcome:CalendlyOperationReceipt['outcome']};
/** Disposable data for the actual components. No provider, channel or database calls. */
export class CalendlyPreviewStore{
 writes=0;private version=0;private present=true;private hooked=true;private account:string;private lastSync:string|null=null;private syncToWhatsApp=false;
 private appointments:CalendlyAppointments['rows']=[];private receipts:CalendlyReceipts['rows']=[];private operations=new Map<string,Operation>();
 constructor(private actorId:number,private merchantId:number,private now:string,private mode:()=>string){
  this.account=`https://api.calendly.com/users/LOCAL_${merchantId}`;this.present=mode()!=='unlinked';this.hooked=mode()!=='unavailable-reference';
  if(mode()==='empty'||!this.present)return;
  for(let id=31;id>=1;id--){const legacy=mode()==='legacy'&&id===31,startAt=new Date(Date.parse(now)+(id-15)*86400000).toISOString(),state=legacy?'unknown':id%4===0?'cancelled':'active';
   this.appointments.push({id,merchantId,eventName:`${merchantId===269?'نواة · Nawa':'مدار · Madar'} · استشارة ${id}`,customerName:`عميل تجريبي · Sample ${id}`,customerEmail:`sample-${id}@example.test`,customerPhone:id%3===0?null:'+966500000001',location:id%2?'عبر الإنترنت · Online':null,state,startAt:legacy?null:startAt,endAt:legacy?null:new Date(Date.parse(startAt)+1800000).toISOString(),cancelledAt:state==='cancelled'?now:null,confirmationAcceptedAt:id%5===0?now:null,providerUpdatedAt:now,invalidData:legacy});
   const receiptState=legacy?'unknown':calendlyReceiptStates[id%5];this.receipts.push({id,merchantId,state:receiptState,event:id%4===0?'cancelled':'created',attempts:id%5,effectApplied:receiptState==='completed',notificationRequired:id%3===0,hasError:receiptState==='failed'||receiptState==='manual_review',createdAt:now,availableAt:now,claimedAt:receiptState==='processing'?now:null,processedAt:receiptState==='completed'?now:null,invalidData:legacy});
  }
 }
 private scope(){return {actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now};}
 private revision(){return identity(this.merchantId+':'+this.version);}
 private workspace(){const pending=this.receipts.filter(r=>r.state==='pending'||r.state==='processing');return calendlyWorkspaceSchema.parse({...this.scope(),revision:this.revision(),present:this.present,state:this.present?'configured':'unlinked',userName:this.present?'حساب تجريبي · Account '+this.merchantId:null,userUri:this.present?this.account:null,identityValid:this.present,credentialsStored:this.present,settings:{syncToWhatsApp:this.syncToWhatsApp},settingsValid:true,createdAt:this.present?this.now:null,lastSyncAt:this.present?this.lastSync:null,counts:{appointments:this.appointments.length,active:this.appointments.filter(r=>r.state==='active').length,cancelled:this.appointments.filter(r=>r.state==='cancelled').length,unknown:this.appointments.filter(r=>r.state==='unknown').length,upcoming:this.appointments.filter(r=>r.state==='active'&&r.startAt&&r.startAt>=this.now).length,confirmationsAccepted:this.appointments.filter(r=>r.confirmationAcceptedAt).length},webhooks:{registered:this.present&&this.hooked,stored:this.receipts.length,recentTotal:this.receipts.length,recentCompleted:this.receipts.filter(r=>r.state==='completed').length,awaiting:pending.length,needsReview:this.receipts.filter(r=>r.state==='failed'||r.state==='manual_review').length,unknown:this.receipts.filter(r=>r.state==='unknown').length,oldestPendingAt:pending.length?this.now:null}});}
 private page(selection:any,stored:any[],matched:any[],states:readonly string[]){const rows=matched.filter(r=>selection.state==='all'||r.state===selection.state);return {...this.scope(),selection,summary:{stored:stored.length,matched:matched.length,groups:states.map(key=>({key,count:matched.filter(r=>r.state===key).length}))},pagination:{page:selection.page,pageSize:25,pages:Math.ceil(rows.length/25),total:rows.length},rows:rows.slice((selection.page-1)*25,selection.page*25)};}
 private inRange(r:CalendlyAppointments['rows'][number],period:{startDate?:string;endDate?:string}){return !period.startDate||!!r.startAt&&r.startAt.slice(0,10)>=period.startDate&&r.startAt.slice(0,10)<=period.endDate!;}
 read(name:string,input:any={}){
  if(this.mode()==='readonly')throw fault('FORBIDDEN','forbidden');
  switch(name){
   case 'calendly.getWorkspace':return this.workspace();
   case 'calendly.getAppointmentsWorkspace':{const selection=calendlyAppointmentsInput.parse(input),matched=this.appointments.filter(r=>this.inRange(r,selection)&&(selection.period==='all'||!!r.startAt&&(selection.period==='upcoming'?r.startAt>=this.now:r.startAt<this.now))&&[r.eventName,r.customerName,r.customerEmail,r.customerPhone].some(v=>v?.toLowerCase().includes(selection.search.toLowerCase())));return calendlyAppointmentsSchema.parse({...this.page(selection,this.appointments,matched,calendlyAppointmentStates),timezone:'UTC'});}
   case 'calendly.getReceiptsWorkspace':{const selection=calendlyReceiptsInput.parse(input),matched=this.receipts.filter(r=>(selection.event==='all'||r.event===selection.event)&&String(r.id).includes(selection.search));return calendlyReceiptsSchema.parse(this.page(selection,this.receipts,matched,calendlyReceiptStates));}
   case 'calendly.getBookingLinksWorkspace':if(!this.present)throw fault();return calendlyBookingLinksSchema.parse({...this.scope(),revision:this.revision(),rows:this.mode()==='empty'?[]:[{name:'استشارة قصيرة · Short consultation',duration:30,schedulingUrl:'https://calendly.com/local-sari-preview/consultation'},{name:'رابط غير متاح · Unavailable link',duration:null,schedulingUrl:null}]});
   case 'calendly.getOperation':{const {requestId}=calendlyOperationLookup.parse(input),operation=this.operations.get(requestId);if(!operation)throw fault('NOT_FOUND','missing');return this.result(operation);}
   case 'calendly.getBlockingOperation':{const operation=Array.from(this.operations.values()).find(r=>r.receipt.outcome==='pending'||r.receipt.reviewRequired);return calendlyOperationReviewWorkspace.parse({actorId:this.actorId,merchantId:this.merchantId,operation:operation?this.result(operation):null});}
  }
  throw Error('Unmapped Calendly preview read');
 }
 private result(operation:Operation){
  if(operation.receipt.outcome!=='pending'||operation.outcome==='pending')return {...operation.receipt,replayed:true};
  const input=operation.payload,kind=operation.receipt.kind;let result:CalendlyOperationReceipt['result']=null;
  if(operation.outcome==='success'){
   if(kind==='settings'){this.syncToWhatsApp=input.syncToWhatsApp;this.version++;result={type:'settings',revision:this.revision(),syncToWhatsApp:this.syncToWhatsApp};}
   else if(kind==='sync'){const rows=this.appointments.filter(r=>this.inRange(r,input.period)&&r.state!=='unknown');this.lastSync=this.now;result={type:'sync',period:input.period,appointments:rows.length,active:rows.filter(r=>r.state==='active').length,cancelled:rows.filter(r=>r.state==='cancelled').length};}
   else{const cleared=kind==='disconnect'||kind==='connect'&&this.present&&input.userUri!==this.account;if(cleared){this.appointments=[];this.receipts=[];this.lastSync=null;}if(kind!=='verify'){this.present=kind==='connect';this.syncToWhatsApp=false;this.version++;if(kind==='connect'){this.account=input.userUri;this.hooked=true;}}result={type:'connection',revision:this.revision(),configured:kind!=='disconnect',remoteCleanup:'not_needed',verification:kind==='disconnect'?'not_checked':kind==='verify'?'api':'api_and_webhooks',localCopies:cleared?'cleared':'retained'};}
  }
  operation.receipt=calendlyOperationReceipt.parse({...operation.receipt,outcome:operation.outcome,started:operation.outcome!=='rejected',reviewRequired:operation.outcome==='unknown',result});return {...operation.receipt,replayed:true};
 }
 mutate(name:string,raw:unknown){
  if(this.mode()==='readonly')throw fault('FORBIDDEN','forbidden');
  if(name==='calendly.previewConnection'){const {apiKey}=calendlyConnectionPreviewInput.parse(raw);if(this.mode()==='credentials-invalid')throw fault('BAD_REQUEST');const userUri=apiKey==='local-calendly-new-account'?`https://api.calendly.com/users/NEW_LOCAL_${this.merchantId}`:this.account;return calendlyConnectionPreviewSchema.parse({...this.scope(),revision:this.revision(),userUri,userName:'حساب المعاينة · Preview account',replacing:this.present&&userUri!==this.account,localAppointments:this.appointments.length,localReceipts:this.receipts.length});}
  if(name==='calendly.acknowledgeOperation'){const {requestId}=calendlyOperationLookup.parse(raw),operation=this.operations.get(requestId);if(!operation||operation.receipt.outcome!=='unknown')throw fault();operation.receipt.reviewRequired=false;this.writes++;return calendlyOperationReviewWorkspace.parse({actorId:this.actorId,merchantId:this.merchantId,operation:operation.receipt});}
  const input:any=name==='calendly.requestConnection'?calendlyConnectionCommand.parse(raw):name==='calendly.requestSync'?calendlySyncCommand.parse(raw):name==='calendly.saveWorkspaceSettings'?calendlySettingsCommand.parse(raw):null;if(!input)throw Error('Unmapped Calendly preview mutation');
  const kind:CalendlyOperationKind=name==='calendly.requestConnection'?input.action:name==='calendly.requestSync'?'sync':'settings',fingerprint=identity(JSON.stringify(input)),prior=this.operations.get(input.requestId);if(prior){if(prior.fingerprint!==fingerprint||prior.receipt.kind!==kind)throw fault();return this.result(prior);}
  if(input.revision!==this.revision())throw fault();if(Array.from(this.operations.values()).some(o=>o.receipt.outcome==='pending'||o.receipt.reviewRequired))throw fault('CONFLICT','busy');if(this.operations.size>=6)throw fault('TOO_MANY_REQUESTS','rate_limited');
  if(kind==='connect'){const reviewed=this.mutate('calendly.previewConnection',{apiKey:input.apiKey}) as {userUri:string;replacing:boolean};if(input.userUri!==reviewed.userUri||reviewed.replacing&&!input.replaceLocalCopies)throw fault();}
  else if(!this.present||kind==='settings'&&input.syncToWhatsApp&&!this.hooked)throw fault();
  const {apiKey:discard,...payload}=input,receipt=calendlyOperationReceipt.parse({...this.scope(),requestId:input.requestId,revision:input.revision,kind,outcome:'pending',started:false,reviewRequired:false,result:null,createdAt:this.now,replayed:false});
  const operation:Operation={payload,fingerprint,receipt,outcome:this.mode()==='oauth-disabled'?'pending':this.mode()==='destination-missing'?'unknown':this.mode()==='credentials-invalid'?'rejected':'success'};
  this.operations.set(input.requestId,operation);this.writes++;return kind==='settings'?this.result(operation):receipt;
 }
}
