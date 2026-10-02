import {zidWorkspaceSchema,zidLogsInput,zidLogsWorkspaceSchema,zidLogStates,zidLogKinds,zidLogRow} from '../../../shared/zid-workspace';
import {zidSettingsInput,zidSettingsReceipt,zidReviewedSensitiveInput,zidDisconnectReceipt,zidWebhookReceipt,zidOAuthBeginInput,zidRegisterReceipt} from '../../../shared/zid-connection';
import {zidSyncRequest,zidSyncLookup,zidSyncReceipt,type ZidSyncReceipt} from '../../../shared/zid-sync-request';
import {zidNoticeReviewSchema,zidNoticeReviewInput,zidNoticeReviewReceipt} from '../../../shared/zid-notification-review';
import type {ByaanConnectionPreviewStore} from './byaan-connection-preview-model';
import type {PlatformSample} from './platform-preview-model';
import type {z} from 'zod';
export const zidPreviewQueries=['zid.workspace','zid.logsWorkspace','zid.syncRequest','zid.latestSyncRequest','zid.notificationReview'] as const;
export const zidPreviewMutations=['zid.saveWorkspaceSettings','zid.disconnectWorkspace','zid.rotateWorkspaceWebhook','zid.beginOAuth','zid.handleOAuthCallback','zid.requestSync','zid.acknowledgeReviewedNotifications'] as const;
const fault=(code='CONFLICT',message='Local Zid simulation')=>({message,data:{code}});
type Request={intent:z.infer<typeof zidSyncRequest>;receipt:ZidSyncReceipt;outcome:ZidSyncReceipt['outcome']};
/** Disposable in-memory examples. No provider requests, passwords retained, or messages sent. */
export class ZidPreviewStore{
 writes=0;private version=0;private empty=false;private endpoint:string|null=null;
 private settings={autoSync:true,syncProducts:true,syncOrders:true,syncCustomers:true,notifyMerchantOrders:false};
 private logs:Array<z.infer<typeof zidLogRow>>=[];private requests=new Map<string,Request>();
 private notices:Array<z.infer<typeof zidNoticeReviewSchema>['rows'][number]&{state:'manual_review'|'suppressed'}>=[];
 private authorization:{state:string;revision:string}|null=null;
 constructor(private actorId:number,private merchantId:number,private now:string,private mode:()=>string,private hub:ByaanConnectionPreviewStore,private sample:PlatformSample){
  this.empty=mode()==='empty';if(this.empty)return;
  for(let id=503;id>=1;id--){const state=zidLogStates[id%5],kind=zidLogKinds[id%5];this.logs.push(zidLogRow.parse({id,merchantId,kind,state,totalItems:10,processedItems:state==='completed'?10:0,successCount:state==='completed'?10:0,failedCount:0,hasErrors:state==='failed',createdAt:now,startedAt:state==='pending'?null:now,completedAt:['completed','failed'].includes(state)?now:null,invalidData:state==='unknown'||kind==='unknown'}));}
  for(let id=27;id>=1;id--)this.notices.push({id,revision:this.definition(id),orderId:String(83000+id),storeId:this.storeId(),attempts:3,createdAt:now,state:'manual_review'});
 }
 private definition(id=0){return [this.merchantId,31,this.version,id,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
 private storeId(){return String(831000000+this.merchantId);}
 private platform(){return this.hub.read('integrations.workspace') as import('../../../shared/platform-workspace').PlatformWorkspace;}
 private workspace(){const platform=this.platform(),row=platform.platforms.find(p=>p.platform==='zid')!,missing=this.sample==='zid-identity-missing'&&this.version===0,invalid=this.sample==='zid-settings-invalid'&&this.version===0,pending=this.sample==='zid-events-pending';
  return zidWorkspaceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,revision:this.definition(),present:row.present,source:row.present?row.legacy?'legacy':'canonical':null,state:row.present?['configured','disabled','unknown'].includes(row.state)?row.state:'unknown':'unlinked',storeId:row.present&&!missing?this.storeId():null,storeName:row.present?`متجر زد · Zid ${this.merchantId}`:null,storeUrl:row.storeUrl,credentialsStored:row.present&&!missing,createdAt:row.createdAt,lastSyncAt:row.lastSyncAt,webhookEndpointPath:row.present?this.endpoint:null,settingsValid:row.present&&!invalid,settings:invalid?{autoSync:false,syncProducts:false,syncOrders:false,syncCustomers:false,notifyMerchantOrders:false}:this.settings,counts:{catalog:platform.stats.products,linkedProducts:row.present&&!missing?101+(this.merchantId-269)*11:0,sourceOrders:row.present&&!missing?45:0,storedCustomers:this.empty?0:41,activeCustomers:this.empty?0:40,syncLogs:this.logs.length},syncSummary:Object.fromEntries(zidLogStates.map(key=>[key==='in_progress'?'inProgress':key,this.logs.filter(r=>r.state===key).length])),webhooks:{recentTotal:this.empty?0:24,recentProcessed:this.empty?0:pending?12:24,awaiting:pending?8:0,failed:pending?4:0},notifications:{recentTotal:this.empty?0:40,recentDelivered:this.empty?0:13,recentSuppressed:this.notices.filter(r=>r.state==='suppressed').length,awaiting:0,needsReview:this.notices.filter(r=>r.state==='manual_review').length}});
 }
 private result(request:Request){
  if(request.receipt.outcome==='pending'&&request.outcome!=='pending'){
   if(request.intent.revision!==this.definition())request.outcome='interrupted';
   const resources=request.receipt.resources.map((resource,index)=>{
    const state:ZidSyncReceipt['resources'][number]['state']=request.outcome==='success'?'completed':request.outcome==='failed'?(request.receipt.resources.length>1&&index===0?'completed':index>(request.receipt.resources.length>1?1:0)?'not_started':'failed'):index===0?'unknown':'not_started';
    if(state==='not_started')return {...resource,state,logId:null,itemsSynced:null};
    const logId=(this.logs[0]?.id??0)+1,count=state==='completed'?(resource.kind==='products'?101:resource.kind==='orders'?45:40):null;
    this.logs.unshift(zidLogRow.parse({id:logId,merchantId:this.merchantId,kind:resource.kind,state:state==='completed'?'completed':'failed',totalItems:count??0,processedItems:count??0,successCount:count??0,failedCount:0,hasErrors:state!=='completed',createdAt:this.now,startedAt:this.now,completedAt:this.now,invalidData:false}));return {...resource,state,logId,itemsSynced:count};
   });
   request.receipt=zidSyncReceipt.parse({...request.receipt,outcome:request.outcome,resources});
   if(request.outcome==='success')this.hub.updateZid({lastSyncAt:this.now});
  }
  return zidSyncReceipt.parse({...request.receipt,replayed:true});
 }
 read(name:string,input:unknown={}){
  if(name==='zid.workspace')return this.workspace();
  if(name==='zid.logsWorkspace'){const selection=zidLogsInput.parse(input),matched=this.logs.filter(row=>(selection.kind==='all'||row.kind===selection.kind)&&String(row.id).includes(selection.search)),rows=matched.filter(row=>selection.state==='all'||row.state===selection.state);return zidLogsWorkspaceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,selection,summary:{stored:this.logs.length,matched:matched.length,groups:zidLogStates.map(key=>({key,count:matched.filter(row=>row.state===key).length}))},pagination:{page:selection.page,pageSize:25,total:rows.length,pages:Math.ceil(rows.length/25)},rows:rows.slice((selection.page-1)*25,selection.page*25)});}
  if(name==='zid.notificationReview'){const rows=this.notices.filter(row=>row.state==='manual_review');return zidNoticeReviewSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,total:rows.length,rows:rows.slice(0,25).map(({state,...row})=>row)});}
  if(name==='zid.syncRequest'){const {requestId}=zidSyncLookup.parse(input),request=this.requests.get(requestId);if(!request)throw fault('NOT_FOUND');return this.result(request);}
  if(name==='zid.latestSyncRequest'){const request=Array.from(this.requests.values()).at(-1);return request?this.result(request):null;}
  throw Error('Unmapped Zid preview read');
 }
 mutate(name:string,input:unknown){const scope={actorId:this.actorId,merchantId:this.merchantId},current=this.workspace();
  if(name==='zid.beginOAuth'){
   const parsed=zidOAuthBeginInput.parse(input);if(parsed?.revision!==current.revision||current.present||this.platform().platforms.some(p=>p.platform!=='zid'&&p.occupiesSlot))throw fault();
   if(this.mode()==='oauth-disabled')throw fault('PRECONDITION_FAILED');if(this.mode()==='credentials-invalid')throw fault('UNAUTHORIZED');
   const state=(String(this.merchantId)+'-local-zid-'+this.version).padEnd(43,'x');this.authorization={state,revision:current.revision};this.writes++;return {authorizationUrl:'https://oauth.zid.sa/oauth/authorize?state='+state};
  }
  if(name==='zid.handleOAuthCallback'){
   const {code,state}=input as {code?:unknown;state?:unknown};if(code!=='local-zid-code'||!this.authorization||state!==this.authorization.state||this.authorization.revision!==current.revision||current.present)throw fault('FORBIDDEN');this.authorization=null;
   if(this.platform().platforms.some(p=>p.platform!=='zid'&&p.occupiesSlot))throw fault();this.version++;this.writes++;
   const storeUrl=`https://zid-${this.merchantId}.example.test/`;this.hub.updateZid({present:true,occupiesSlot:true,state:'configured',storeUrl,createdAt:this.now,lastSyncAt:null,hasSyncErrors:false,legacy:false},'zid');
   return zidRegisterReceipt.parse({...scope,registered:true,revision:this.definition(),storeId:this.storeId(),storeName:`متجر زد · Zid ${this.merchantId}`,storeUrl});
  }
  if(name==='zid.saveWorkspaceSettings'){
   const parsed=zidSettingsInput.parse(input);if(parsed.revision!==current.revision||!current.present||current.source!=='canonical'||!current.settingsValid)throw fault();this.settings={...parsed.settings};this.version++;this.writes++;return zidSettingsReceipt.parse({...scope,saved:true,revision:this.definition(),settings:this.settings});
  }
  if(name==='zid.disconnectWorkspace'||name==='zid.rotateWorkspaceWebhook'){
   const parsed=zidReviewedSensitiveInput.parse(input);if(parsed.revision!==current.revision||!current.present)throw fault();if(this.mode()==='credentials-invalid')throw fault('UNAUTHORIZED');
   if(name==='zid.rotateWorkspaceWebhook'&&(current.source!=='canonical'||current.state!=='configured'))throw fault();this.version++;this.writes++;
   if(name==='zid.disconnectWorkspace'){this.endpoint=null;this.authorization=null;this.hub.updateZid({present:false,occupiesSlot:false,state:'unlinked',storeUrl:null,createdAt:null,lastSyncAt:null,hasSyncErrors:false,legacy:false},this.platform().source==='zid'?'none':undefined);return zidDisconnectReceipt.parse({...scope,disconnected:true,revision:this.definition()});}
   this.endpoint='/api/webhooks/zid/'+(this.merchantId.toString(16)+this.version.toString(16)).padEnd(48,'a');return zidWebhookReceipt.parse({...scope,rotated:true,revision:this.definition(),endpointPath:this.endpoint,username:'sari',password:('LOCAL-ONLY-'+this.merchantId+'-'+this.version).padEnd(43,'x')});
  }
  if(name==='zid.acknowledgeReviewedNotifications'){
   const parsed=zidNoticeReviewInput.parse(input);if(parsed.items.some(item=>!this.notices.some(row=>row.id===item.id&&row.revision===item.revision&&row.state==='manual_review')))throw fault();
   for(const item of parsed.items)this.notices.find(row=>row.id===item.id)!.state='suppressed';this.writes++;return zidNoticeReviewReceipt.parse({...scope,acknowledged:parsed.items.length,ids:parsed.items.map(r=>r.id)});
  }
  if(name==='zid.requestSync'){
   const intent=zidSyncRequest.parse(input),prior=this.requests.get(intent.requestId);if(prior){if(prior.intent.revision!==intent.revision||prior.intent.resource!==intent.resource)throw fault();return this.result(prior);}
   if(intent.revision!==current.revision||current.state!=='configured'||current.source!=='canonical'||!current.settingsValid||!current.storeId||!current.credentialsStored)throw fault();
   const enabled=(['products','orders','customers'] as const).filter(kind=>(intent.resource==='all'||intent.resource===kind)&&current.settings[('sync'+kind[0].toUpperCase()+kind.slice(1)) as 'syncProducts'|'syncOrders'|'syncCustomers']);if(!enabled.length)throw fault();
   if(Array.from(this.requests.values()).some(r=>r.receipt.outcome==='pending'))throw fault('CONFLICT','zid_sync:busy');
   // Three requests per disposable sample; the real server uses a rolling time window.
   if(this.requests.size>=3)throw fault('TOO_MANY_REQUESTS');
   const receipt=zidSyncReceipt.parse({...scope,...intent,outcome:'pending',resources:enabled.map(kind=>({kind,state:'not_started',logId:null,itemsSynced:null})),createdAt:this.now,checkedAt:this.now,replayed:false});
   this.requests.set(intent.requestId,{intent,receipt,outcome:this.mode()==='credentials-invalid'?'failed':this.mode()==='destination-missing'?'interrupted':this.mode()==='oauth-disabled'?'pending':'success'});this.writes++;return receipt;
  }
  throw Error('Unmapped Zid preview mutation');
 }
}
