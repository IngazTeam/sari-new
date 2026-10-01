import { campaignListInput, campaignWorkspaceSchema, campaignStatuses } from '../../../shared/campaign-workspace';
import { campaignDetailsSchema } from '../../../shared/campaign-details';
import { campaignEditorSchema, campaignAudiencePreviewSchema } from '../../../shared/campaign-editor';
import { campaignAudienceSchema } from '../../../shared/campaign-audience';
import { campaignPerformanceInput, campaignPerformanceSchema } from '../../../shared/campaign-performance';
import { campaignReportInput, campaignReportExportInput, campaignReportSchema, campaignReportExportSchema } from '../../../shared/campaign-report';
import { campaignMessageIssue } from '../../../shared/campaign-message';

export const campaignModes = ['normal','empty','loading','failure','forbidden','session','foreign','stale-error','readonly','invalid-audience','invalid-timezone','invalid-image','audience-empty','audience-limit','audience-error','action-failure','save-conflict','pending-save','legacy','excluded-links'] as const;
export type CampaignMode = typeof campaignModes[number];
export const campaignQueries = ['auth.me','merchants.getCurrent','campaigns.workspace','campaigns.performanceSnapshot','campaigns.detailsWorkspace','campaigns.reportWorkspace','campaigns.editorWorkspace','campaigns.audiencePreview'] as const;
export const campaignMutations = ['campaigns.create','campaigns.update','campaigns.send','campaigns.delete','campaigns.acknowledgeManualReview'] as const;
const fault = (code='INTERNAL_SERVER_ERROR') => ({message:'Local campaign simulation',data:{code}});
type Campaign = {id:number; name:string; message:string; imageUrl:string|null; status:typeof campaignStatuses[number]; createdAt:string; scheduledAt:string|null; recipients:number; accepted:number; filters:Record<string,number>; version:number; acknowledged:boolean};
const rate=(accepted:number,total:number)=>total?Math.round(accepted/total*1000)/10:0;
/** In-memory sample data only. No server transport, provider or real customer data. */
export class CampaignPreviewModel {
  readonly actorId:number; readonly now:string; language:'ar'|'en'='ar'; operations=0; retries=0; pending=0;
  private revision=0; private recovered=false; private disposed=false; private nextId=32;
  private listeners=new Set<()=>void>(); private cache=new Map<string,any>();
  private waiting:Array<{resolve:()=>void;reject:(error:any)=>void}>=[];
  private campaigns=new Map<number,Campaign>();
  constructor(readonly merchantId:number, readonly mode:CampaignMode='normal', now=new Date().toISOString()) {
    if(![258,259].includes(merchantId))throw Error('Unknown simulated tenant');
    this.actorId=merchantId+1000; this.now=now;
    if(mode!=='empty')for(let id=1;id<=31;id++){
      const status=campaignStatuses[(id-1)%5],sent=['sending','completed','failed'].includes(status);
      this.campaigns.set(id,{id,name:`${merchantId===258?'نواة · Nawa':'مدار · Madar'} ${id}`,message:'رسالة عرض توضيحية محلية. Sample offer with no actual delivery.',imageUrl:null,status,createdAt:now,
        scheduledAt:status==='scheduled'?new Date(Date.parse(now)+86400000).toISOString():null,recipients:sent?31:0,accepted:sent?10:0,filters:{lastActivityDays:45,purchaseCountMin:0,purchaseCountMax:10},version:0,acknowledged:false});
    }
  }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  snapshot=()=>this.revision;
  private emit(){this.cache.clear();this.revision++;for(const listener of this.listeners)listener();}
  invalidate=async()=>{this.emit();};
  get activeMode(){return this.recovered?'normal':this.mode;}
  complete=()=>{this.recovered=true;this.emit();};
  finishPending=()=>{for(const item of this.waiting.splice(0))item.resolve();};
  dispose=()=>{this.disposed=true;for(const item of this.waiting.splice(0))item.reject(fault('CONFLICT'));};
  async refetch(name:string,input?:any){this.retries++;this.complete();return this.read(name,input);}
  private owned(id:number){const row=Number.isSafeInteger(id)&&id>0?this.campaigns.get(id):undefined;if(!row)throw fault('NOT_FOUND');return row;}
  private scope(){return {actorId:this.actorId,merchantId:this.merchantId,canManage:this.activeMode!=='readonly',checkedAt:this.now,timezone:this.activeMode==='invalid-timezone'?null:this.merchantId===258?'Asia/Riyadh':'America/New_York'};}
  // Local version marker for UI review comparisons; not the server's cryptographic definition digest.
  private definition(row:Campaign){return [this.merchantId,row.id,row.version,0,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
  private audience(row:Campaign){return this.activeMode==='invalid-audience'?{status:'invalid' as const}:{status:'valid' as const,filters:row.filters};}
  private content(row:Campaign){const {id,name,message,imageUrl,status,createdAt,scheduledAt,recipients,accepted}=row;return {id,name,message,imageUrl:this.activeMode==='invalid-image'?'javascript:invalid':imageUrl,status,createdAt,scheduledAt,recipients,accepted,basis:'stored_campaign_counters' as const};}
  private recipients(row:Campaign){
    if(!row.recipients||this.activeMode==='legacy')return [];
    return Array.from({length:31},(_,i)=>{
      const status=row.accepted===0?'pending':i<10?'sent':i<15?'pending':i<18?'processing':i<23?'failed':i<27||row.acknowledged?'suppressed':'manual_review';
      return {id:row.id*100+i+1,kind:'recipient' as const,phone:`sample-${this.merchantId}-${i+1}`,name:`عميل تجريبي · Sample ${i+1}`,reason:status==='manual_review'?'uncertain':status==='suppressed'?(i>=27?'acknowledged':'consent'):status==='failed'?'provider_rejected':'none',recordedAt:this.now,status,attempts:status==='sent'?1:0,quotaHeld:status==='processing',acceptedAt:status==='sent'?this.now:null};
    });
  }
  private results(row:Campaign){return row.accepted?Array.from({length:31},(_,i)=>({id:row.id*100+i+1,kind:'result' as const,phone:`sample-${this.merchantId}-${i+1}`,name:`عميل تجريبي · Sample ${i+1}`,reason:i<10?'none':'provider_rejected',recordedAt:this.now,status:i<10?'success':i<25?'failed':'pending'})):[];}
  private queue(row:Campaign){const rows=this.recipients(row);return rows.length?{total:rows.length,accepted:rows.filter(r=>r.status==='sent').length,awaiting:rows.filter(r=>['pending','processing','failed'].includes(r.status)).length,suppressed:rows.filter(r=>r.status==='suppressed').length,needsReview:rows.filter(r=>r.status==='manual_review').length}:null;}
  private report(input:any,exporting=false){
    const selection=campaignReportInput.parse(exporting?{...campaignReportExportInput.parse(input),page:1}:input),row=this.owned(selection.id),recipients=this.recipients(row),results=this.results(row);
    const all=selection.view==='results'?results:recipients,filtered=all.filter(r=>(selection.status==='all'||r.status===selection.status)&&(`${r.phone} ${r.name}`.toLowerCase().includes(selection.search.toLowerCase()))),pageSize=exporting?10000:25;
    const count=(rows:any[],status:string)=>rows.filter(r=>r.status===status).length;
    const data={...this.scope(),selection,campaign:this.content(row),summary:{results:{total:results.length,success:count(results,'success'),failed:count(results,'failed'),pending:count(results,'pending'),successRate:rate(count(results,'success'),results.length),excludedLinks:this.activeMode==='excluded-links'?2:0},recipients:{total:recipients.length,pending:count(recipients,'pending'),processing:count(recipients,'processing'),sent:count(recipients,'sent'),failed:count(recipients,'failed'),suppressed:count(recipients,'suppressed'),manualReview:count(recipients,'manual_review')}},pagination:{page:selection.page,pageSize,total:filtered.length,pages:Math.ceil(filtered.length/pageSize)},rows:filtered.slice((selection.page-1)*pageSize,selection.page*pageSize)};
    return (exporting?campaignReportExportSchema:campaignReportSchema).parse(data);
  }
  private fixture(name:string,input:any={}):any{
    const mode=this.activeMode,scope=this.scope(),all=Array.from(this.campaigns.values());
    if(name==='auth.me')return mode==='session'?null:{id:this.actorId,name:'Local sample account'};
    if(name==='merchants.getCurrent')return {id:this.merchantId,timezone:scope.timezone};
    if(name==='campaigns.workspace'){
      const selection=campaignListInput.parse(input),rows=all.filter(r=>(!selection.needsReview||!!this.queue(r)?.needsReview)&&(selection.status==='all'||r.status===selection.status)&&r.name.toLowerCase().includes(selection.search.toLowerCase()));
      const accepted=all.reduce((s,r)=>s+r.accepted,0),recipients=all.reduce((s,r)=>s+r.recipients,0);
      return campaignWorkspaceSchema.parse({...scope,selection,summary:{total:all.length,...Object.fromEntries(campaignStatuses.map(s=>[s,all.filter(r=>r.status===s).length])),accepted,recipients,unconfirmed:recipients-accepted,acceptanceRate:rate(accepted,recipients),acceptanceBasis:'stored_campaign_counters'},needsReview:all.reduce((s,r)=>s+(this.queue(r)?.needsReview??0),0),pagination:{page:selection.page,pageSize:25,total:rows.length,pages:Math.ceil(rows.length/25)},rows:rows.slice((selection.page-1)*25,selection.page*25).map(r=>({id:r.id,name:r.name,status:r.status,createdAt:r.createdAt,scheduledAt:r.scheduledAt,accepted:r.accepted,recipients:r.recipients,queue:this.queue(r)}))});
    }
    if(name==='campaigns.performanceSnapshot'){
      const {days}=campaignPerformanceInput.parse(input),end=this.now.slice(0,10),completed=all.filter(r=>r.status==='completed'),accepted=completed.reduce((s,r)=>s+r.accepted,0),recipients=completed.reduce((s,r)=>s+r.recipients,0);
      const rows=Array.from({length:days},(_,i)=>({date:new Date(Date.parse(end+'T00:00:00Z')-(days-i-1)*86400000).toISOString().slice(0,10),acceptedByProvider:i===days-1?all.reduce((s,r)=>s+r.accepted,0):0}));
      return campaignPerformanceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,timezone:'UTC',days,stats:{completed:completed.length,accepted,recipients,unconfirmed:recipients-accepted,acceptanceRate:rate(accepted,recipients),basis:'stored_campaign_counters'},timeline:{start:rows[0].date,end,total:rows.reduce((s,r)=>s+r.acceptedByProvider,0),basis:'campaign_success_logs',rows}});
    }
    if(name==='campaigns.audiencePreview'){
      const filters=campaignAudienceSchema.parse(input),recipientCount=mode==='audience-empty'?0:mode==='audience-limit'?2001:filters.purchaseCountMin===0&&filters.purchaseCountMax===0?8:filters.purchaseCountMin?12:65;
      return campaignAudiencePreviewSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,filters,count:recipientCount+5,recipientCount,invalidPhoneCount:3,duplicateCount:2,recipientLimit:2000,exceedsLimit:recipientCount>2000,basis:'matched_conversations_before_consent'});
    }
    if(name==='campaigns.editorWorkspace'){
      const row=input.id===undefined?null:this.owned(input.id),c=row?this.content(row):null;
      return campaignEditorSchema.parse({...scope,merchantStatus:'active',campaign:row&&c?{id:row.id,name:c.name,message:c.message,imageUrl:c.imageUrl,status:c.status,scheduledAt:c.scheduledAt,definitionKey:this.definition(row),audience:this.audience(row)}:null});
    }
    if(name==='campaigns.detailsWorkspace'){const row=this.owned(input.id);return campaignDetailsSchema.parse({...scope,campaign:{...this.content(row),definitionKey:this.definition(row)},audience:this.audience(row),queue:this.queue(row),excludedRecipients:mode==='excluded-links'?2:0});}
    if(name==='campaigns.reportWorkspace')return this.report(input);
    throw Error('Unmapped fixture: '+name);
  }
  read(name:string,input?:any){
    if(!campaignQueries.includes(name as any))throw Error('Unmapped read: '+name);
    const key=JSON.stringify([name,input]);if(this.cache.has(key))return this.cache.get(key);
    const mode=this.activeMode,workspace=name.startsWith('campaigns.'),loading=mode==='loading'&&workspace;
    let error:any=mode==='forbidden'&&name==='merchants.getCurrent'?fault('FORBIDDEN'):workspace&&['failure','stale-error'].includes(mode)||mode==='audience-error'&&name==='campaigns.audiencePreview'?fault():null,data:any;
    try{data=this.fixture(name,input);}catch(e){error=e;}
    if(mode==='foreign'&&workspace&&data)data={...data,merchantId:999};
    const result={data:loading||error&&mode!=='stale-error'?undefined:data,error,isLoading:loading,isFetching:loading,isError:!!error,isFetchedAfterMount:!loading,dataUpdatedAt:loading?0:Date.parse(this.now)};
    this.cache.set(key,result);return result;
  }
  async exportReport(input:any){if(['failure','action-failure','readonly','forbidden','session'].includes(this.activeMode))throw fault('FORBIDDEN');const report=this.report(input,true);return this.activeMode==='foreign'?{...report,merchantId:999}:report;}
  async mutate(name:string,input:any){
    if(!campaignMutations.includes(name as any))throw Error('Unmapped mutation: '+name);
    if(this.disposed||['readonly','forbidden','session','foreign','failure','stale-error'].includes(this.activeMode))throw fault('FORBIDDEN');
    if(this.activeMode==='action-failure')throw fault();
    if(this.activeMode==='save-conflict'){this.complete();throw fault('CONFLICT');}
    if(this.activeMode==='pending-save'&&['campaigns.create','campaigns.update'].includes(name)){
      this.pending++;this.emit();try{await new Promise<void>((resolve,reject)=>this.waiting.push({resolve,reject}));}finally{this.pending--;this.emit();}
    }
    if(this.disposed)throw fault('CONFLICT');
    const row=name==='campaigns.create'?null:this.owned(input.id);
    if(row&&['campaigns.update','campaigns.send'].includes(name)&&(!['draft','scheduled'].includes(row.status)||input.expectedDefinition!==this.definition(row)))throw fault('CONFLICT');
    let response:any={success:true};
    if(name==='campaigns.create'||name==='campaigns.update'){
      if(!input.name?.trim()||campaignMessageIssue(input.message,input.imageUrl))throw fault('BAD_REQUEST');
      const filters=campaignAudienceSchema.parse(JSON.parse(input.targetAudience)),scheduledAt=input.scheduledAt?new Date(input.scheduledAt).toISOString():null;
      if(scheduledAt&&(Date.parse(scheduledAt)<=Date.now()||['audience-empty','audience-limit','audience-error','invalid-timezone'].includes(this.activeMode)))throw fault('BAD_REQUEST');
      const id=row?.id??this.nextId++,next:Campaign={id,name:input.name.trim(),message:input.message,imageUrl:input.imageUrl??null,status:scheduledAt?'scheduled':'draft',createdAt:row?.createdAt??this.now,scheduledAt,recipients:0,accepted:0,filters,version:(row?.version??0)+1,acknowledged:false};
      this.campaigns.set(id,next);response=name==='campaigns.create'?{id,merchantId:this.merchantId}:{success:true};
    }else if(name==='campaigns.send'){
      if(campaignMessageIssue(row!.message,row!.imageUrl)||this.activeMode==='invalid-audience')throw fault('BAD_REQUEST');
      row!.status='sending';row!.recipients=31;row!.accepted=0;row!.version++;response={success:true,totalRecipients:31};
    }else if(name==='campaigns.delete'){
      if(!['draft','scheduled','failed'].includes(row!.status)||this.queue(row!)?.needsReview)throw fault('CONFLICT');this.campaigns.delete(row!.id);
    }else if(name==='campaigns.acknowledgeManualReview'){row!.acknowledged=true;row!.version++;}
    this.operations++;this.emit();return response;
  }
}
