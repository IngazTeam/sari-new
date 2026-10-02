import {sallaWorkspaceSchema,sallaLogsInput,sallaLogsWorkspaceSchema,sallaLogStates,sallaLogKinds,sallaLogRow} from '../../../shared/salla-workspace';
import {sallaRegisterInput,sallaRegisterReceipt,sallaDisconnectInput,sallaDisconnectReceipt} from '../../../shared/salla-connection';
import {sallaSyncRequest,sallaSyncLookup,sallaSyncReceipt,type SallaSyncReceipt} from '../../../shared/salla-sync-request';
import {sallaEffectItem,sallaEffectPage,sallaEffectListInput,sallaEffectAuditItem,sallaEffectAuditPage,sallaEffectAuditListInput,sallaEffectCheckInput} from '../../../shared/salla-effect-review';
import type {ByaanConnectionPreviewStore} from './byaan-connection-preview-model';
import type {PlatformSample} from './platform-preview-model';
import type {z} from 'zod';
export const sallaPreviewQueries=['salla.workspace','salla.logsWorkspace','salla.syncRequest','salla.latestSyncRequest','salla.effectReviewAccess','salla.listEffects','salla.listEffectReviews'] as const;
export const sallaPreviewMutations=['salla.registerConnection','salla.disconnect','salla.requestSync','salla.checkEffect'] as const;
const fault=(code='CONFLICT',message='Local Salla simulation')=>({message,data:{code}});
type Request={intent:z.infer<typeof sallaSyncRequest>;receipt:SallaSyncReceipt;outcome:SallaSyncReceipt['outcome']};
/** Disposable samples only: no provider calls, tokens retained, notifications or database writes. */
export class SallaPreviewStore {
  writes=0;private version=0;private empty=false;private logs:Array<z.infer<typeof sallaLogRow>>=[];
  private requests=new Map<string,Request>();private effects:Array<z.infer<typeof sallaEffectItem>>=[];
  private audits:Array<z.infer<typeof sallaEffectAuditItem>>=[];private reviews=new Map<string,{input:z.infer<typeof sallaEffectCheckInput>;audit:z.infer<typeof sallaEffectAuditItem>}>();
  constructor(private actorId:number,private merchantId:number,private now:string,private mode:()=>string,private hub:ByaanConnectionPreviewStore,private sample:PlatformSample){
    this.empty=mode()==='empty';if(this.empty)return;
    for(let id=503;id>=1;id--){const state=sallaLogStates[id%4];this.logs.push(sallaLogRow.parse({id,merchantId,kind:sallaLogKinds[id%4],state,itemsSynced:state==='success'?10:state==='failed'?2:null,hasErrors:state==='failed',startedAt:now,completedAt:['failed','success'].includes(state)?now:null,invalidData:state==='unknown'}));}
    for(let id=24;id>=1;id--){const state=(['pending','processing','dispatching','accepted','review'] as const)[id%5],kind=(['owner_notice','merchant_notice','sheets'] as const)[id%3],sent=['dispatching','accepted','review'].includes(state);
      this.effects.push(sallaEffectItem.parse({id,orderId:100+Math.ceil(id/3),kind,state,attempts:state==='pending'?0:1,createdAt:now,updatedAt:now,dispatchStartedAt:sent?now:null,acceptedAt:state==='accepted'?now:null,contextValid:id!==24,diagnostic:state==='pending'?'queued':state==='processing'?'preparing':state==='accepted'?'accepted':'outcome_unknown',...(kind==='sheets'||!sent?{}:{notice:{result:state==='accepted'?'accepted':'unknown',targets:[{channel:kind==='owner_notice'?'owner':'email',state:state==='accepted'?'accepted':'unknown'}]}})}));}
  }
  private revision(){return [this.merchantId,23,this.version,0,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
  private platform(){return this.hub.read('integrations.workspace') as import('../../../shared/platform-workspace').PlatformWorkspace;}
  private workspace(){const platform=this.platform(),row=platform.platforms.find(p=>p.platform==='salla')!,identityMissing=this.sample==='salla-identity-missing'&&this.version===0,pending=this.sample==='salla-events-pending';
    return sallaWorkspaceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,revision:this.revision(),present:row.present,state:row.state,storeId:row.present&&!identityMissing?String(830000000+this.merchantId):null,storeUrl:row.storeUrl,credentialsStored:row.present&&!identityMissing,createdAt:row.createdAt,lastSyncAt:row.lastSyncAt,hasSyncErrors:row.hasSyncErrors,counts:{catalog:platform.stats.products,linkedProducts:row.present?Math.min(platform.stats.products,101+(this.merchantId-269)*11):0,syncLogs:this.logs.length},webhooks:{recentTotal:this.empty?0:24,recentCompleted:this.empty?0:pending?12:24,awaiting:pending?8:0,manualReview:pending?4:0,oldestPendingSeconds:pending?540:null}});
  }
  private result(request:Request){
    if(request.receipt.outcome==='pending'&&request.outcome!=='pending'){
      if(request.intent.revision!==this.revision())request.outcome='interrupted';
      request.receipt=sallaSyncReceipt.parse({...request.receipt,outcome:request.outcome,itemsSynced:request.outcome==='success'?this.workspace().counts.linkedProducts:request.outcome==='failed'?2:null});
      const log=this.logs.find(row=>row.id===request.receipt.logId)!;Object.assign(log,{state:request.outcome==='success'?'success':'failed',itemsSynced:request.receipt.itemsSynced,hasErrors:request.outcome!=='success',completedAt:this.now});
      if(request.outcome==='success'&&this.workspace().revision===request.intent.revision&&this.workspace().present)this.hub.updateSalla({lastSyncAt:this.now,hasSyncErrors:false});
    }
    return sallaSyncReceipt.parse({...request.receipt,replayed:true});
  }
  read(name:string,input:unknown={}){
    if(name==='salla.workspace')return this.workspace();
    if(name==='salla.logsWorkspace'){
      const selection=sallaLogsInput.parse(input),matched=this.logs.filter(row=>(selection.kind==='all'||row.kind===selection.kind)&&String(row.id).includes(selection.search)),rows=matched.filter(row=>selection.state==='all'||row.state===selection.state);
      return sallaLogsWorkspaceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,selection,summary:{stored:this.logs.length,matched:matched.length,groups:sallaLogStates.map(key=>({key,count:matched.filter(row=>row.state===key).length}))},pagination:{page:selection.page,pageSize:25,total:rows.length,pages:Math.ceil(rows.length/25)},rows:rows.slice((selection.page-1)*25,selection.page*25)});
    }
    if(name==='salla.syncRequest'){const {requestId}=sallaSyncLookup.parse(input),request=this.requests.get(requestId);return request?this.result(request):null;}
    if(name==='salla.latestSyncRequest'){const request=Array.from(this.requests.values()).at(-1);return request?this.result(request):null;}
    if(name==='salla.effectReviewAccess')return {canReview:this.mode()!=='readonly'};
    if(name==='salla.listEffects'){const selection=sallaEffectListInput.parse(input),rows=this.effects.filter(row=>(!selection.orderId||selection.orderId===row.orderId)&&(!selection.state||selection.state===row.state)&&(!selection.kind||selection.kind===row.kind)&&(!selection.beforeId||row.id<selection.beforeId)),items=rows.slice(0,20);return sallaEffectPage.parse({items,nextCursor:rows.length>20?items.at(-1)!.id:null});}
    if(name==='salla.listEffectReviews'){const selection=sallaEffectAuditListInput.parse(input),rows=this.audits.filter(row=>(!selection.orderId||selection.orderId===row.effect.orderId)&&(!selection.beforeId||row.id<selection.beforeId)),items=rows.slice(0,20);return sallaEffectAuditPage.parse({items,nextCursor:rows.length>20?items.at(-1)!.id:null});}
    throw Error('Unmapped Salla preview read');
  }
  mutate(name:string,input:unknown){
    const scope={actorId:this.actorId,merchantId:this.merchantId},current=this.workspace();
    if(name==='salla.registerConnection'){
      const parsed=sallaRegisterInput.parse(input);if(parsed.revision!==current.revision||current.present||this.platform().platforms.some(p=>p.platform!=='salla'&&p.occupiesSlot))throw fault();
      if(this.mode()==='credentials-invalid')throw fault('BAD_REQUEST','salla_connection:credentials');
      this.version++;this.writes++;const storeUrl=`https://salla-${this.merchantId}.example.test/`;
      this.hub.updateSalla({present:true,occupiesSlot:true,state:'configured',storeUrl,createdAt:this.now,lastSyncAt:null,hasSyncErrors:false},'salla');
      return sallaRegisterReceipt.parse({...scope,registered:true,revision:this.revision(),storeId:String(830000000+this.merchantId),storeUrl});
    }
    if(name==='salla.disconnect'){
      const parsed=sallaDisconnectInput.parse(input);if(parsed.revision!==current.revision||!current.present)throw fault();this.version++;this.writes++;
      this.hub.updateSalla({present:false,occupiesSlot:false,state:'unlinked',storeUrl:null,createdAt:null,lastSyncAt:null,hasSyncErrors:false},this.platform().source==='salla'?'none':undefined);
      return sallaDisconnectReceipt.parse({...scope,disconnected:true});
    }
    if(name==='salla.requestSync'){
      const intent=sallaSyncRequest.parse(input),prior=this.requests.get(intent.requestId);
      if(prior){if(prior.intent.revision!==intent.revision||prior.intent.syncType!==intent.syncType)throw fault();return this.result(prior);}
      if(intent.revision!==current.revision||current.state!=='configured'||!current.storeId||!current.credentialsStored)throw fault();
      if(Array.from(this.requests.values()).some(r=>r.receipt.outcome==='pending'))throw fault('CONFLICT','salla_sync:busy');
      // Three requests per disposable sample, not a production rolling-time rate limiter.
      if(this.requests.size>=3)throw fault('TOO_MANY_REQUESTS');
      const logId=(this.logs[0]?.id??0)+1,receipt=sallaSyncReceipt.parse({...scope,...intent,outcome:'pending',logId,itemsSynced:null,createdAt:this.now,checkedAt:this.now,replayed:false});
      this.logs.unshift(sallaLogRow.parse({id:logId,merchantId:this.merchantId,kind:intent.syncType==='full'?'full_sync':'stock_sync',state:'in_progress',itemsSynced:null,hasErrors:false,startedAt:this.now,completedAt:null,invalidData:false}));
      this.requests.set(intent.requestId,{intent,receipt,outcome:this.mode()==='credentials-invalid'?'failed':this.mode()==='destination-missing'?'interrupted':this.mode()==='oauth-disabled'?'pending':'success'});this.writes++;return receipt;
    }
    if(name==='salla.checkEffect'){
      const parsed=sallaEffectCheckInput.parse(input),prior=this.reviews.get(parsed.requestId);
      if(prior){if(prior.input.effectId!==parsed.effectId||prior.input.reason!==parsed.reason)throw fault();return sallaEffectAuditItem.parse(prior.audit);}
      const effect=this.effects.find(row=>row.id===parsed.effectId);if(!effect)throw fault('NOT_FOUND');
      const audit=sallaEffectAuditItem.parse({id:this.audits.length+1,reviewerUserId:this.actorId,reason:parsed.reason,observedAt:this.now,effect});this.reviews.set(parsed.requestId,{input:parsed,audit});this.audits.unshift(audit);this.writes++;return sallaEffectAuditItem.parse(audit);
    }
    throw Error('Unmapped Salla preview mutation');
  }
}
