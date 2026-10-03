import {missingOccasionAuthorization,occasionWorkspaceInput,occasionWorkspaceSchema,occasionWorkspaceRow,type OccasionWorkspaceRow} from '../../../shared/occasion-workspace';
import {occasionActionTarget,occasionActionReview,occasionActionApply,type OccasionActionTarget} from '../../../shared/occasion-actions';
import {getUpcomingOccasions,getOccasionEndDate,generateOccasionMessage} from '../../../shared/occasion-calendar';
import type {ServiceMode} from './service-preview-model';
export const occasionPreviewQueries=['occasionCampaigns.workspace','occasionCampaigns.reviewAction'] as const;
export const occasionPreviewMutations=['occasionCampaigns.applyAction'] as const;
const fault=(code:string)=>({message:'Local occasion simulation',data:{code}});
const emptyDelivery=()=>({total:0,pending:0,processing:0,accepted:0,retryable:0,suppressed:0,manualReview:0,unknown:0});
/** Disposable local examples only. No scheduler, discount creation, provider or database. */
export class OccasionPreviewStore{
 writes=0;private rows:OccasionWorkspaceRow[]=[];private version=0;private reviews=new Map<string,string>();
 private upcoming:ReturnType<typeof getUpcomingOccasions>;
 constructor(readonly actorId:number,readonly merchantId:number,readonly now:string,private mode:()=>ServiceMode){
  this.upcoming=getUpcomingOccasions(new Date(now));if(mode()==='empty')return;
  for(let id=31;id>=1;id--){const occasion=this.upcoming[0],state=id===31&&mode()==='legacy'?'enabled':id===29?'sending':id===28?'completed':id===27?'failed':'disabled';
   this.rows.push(occasionWorkspaceRow.parse({id,authorization:missingOccasionAuthorization(),revision:this.marker(id,0),occasionType:id===31?occasion.type:'national_day',year:id===31?occasion.year:1980+id,enabled:state==='enabled'||id<30&&id>26,discountCode:id<30&&id>26?'DEMO-'+merchantId+'-'+id:null,discountPercentage:id===31?occasion.discountPercent:23,messageTemplate:null,sentAt:state==='completed'?now:null,recipientCount:id===28?999:0,storedStatus:['disabled','enabled'].includes(state)?'pending':state,createdAt:now,updatedAt:now,campaignId:id<30&&id>26?merchantId*1000+id:null,linkedCampaign:id<30&&id>26?{id:merchantId*1000+id,name:(merchantId===269?'نواة · Nawa':'مدار · Madar')+' '+id,status:state}:null,delivery:id<30&&id>26?{...emptyDelivery(),total:4,accepted:id===28?3:0,pending:id===29?4:0,suppressed:id===28?1:0,manualReview:id===27?4:0}:null,state,issues:[]}));
  }
 }
 private marker(id:number,version:number){return [this.actorId,this.merchantId,id,version,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
 private all(){return this.rows.map(value=>{const row=structuredClone(value);if(this.mode()==='legacy'&&row.id!==31&&row.id%3===1){row.discountPercentage=null;row.messageTemplate='<img src=x onerror=alert(1)> · saved legacy text';row.issues=['discount'];row.state='invalid';row.revision=this.marker(row.id,999);}return row;});}
 private review(input:unknown){
  if(this.mode()==='readonly')throw fault('FORBIDDEN');const target=occasionActionTarget.parse(input),all=this.all();
  const row=target.action==='create'?all.find(r=>r.occasionType===target.occasionType&&r.year===target.year)??null:all.find(r=>r.id===target.id)??null;
  if(target.action==='toggle'&&!row)throw fault('NOT_FOUND');
  const type=target.action==='create'?target.occasionType:row!.occasionType,year=target.action==='create'?target.year:row!.year,available=this.upcoming.find(o=>o.type===type&&o.year===year);
  let reason:'ready'|'duplicate'|'not_available'|'in_progress'|'invalid'|'no_change'='ready';
  if(target.action==='create')reason=row?'duplicate':!available?'not_available':'ready';
  else if(row!.storedStatus!=='pending'||row!.delivery&&row!.delivery.total>0)reason='in_progress';
  else if(target.renew&&row!.enabled!==true)reason='invalid';
  else if(row!.enabled===target.enabled&&!target.renew)reason='no_change';
  else if(target.enabled&&(row!.state==='invalid'||row!.messageTemplate!==null||row!.recipientCount!==0||row!.sentAt!==null))reason='invalid';
  else if(target.enabled&&!available)reason='not_available';
  const discountPercent=target.action==='create'?available?.discountPercent??null:row!.discountPercentage;
  const message=available&&discountPercent!==null?generateOccasionMessage(available.name,null,'[CODE]',discountPercent,this.merchantId===269?'نواة · Nawa':'مدار · Madar'):null;
  const terms={effect:target.action==='create'?'save_disabled':target.enabled?'allow_automatic_admission':'disable_future_admission',occasionType:type,year,discountPercent,discountMaxUses:2000,discountMinOrder:0,discountExpiry:'occasion_end',audience:'eligible_conversations',audienceLimit:2000,timezone:'Asia/Riyadh',calendar:'gregory_and_islamic_umalqura',sendsImmediately:false,deliveryGuaranteed:false,salesVerified:false,messagePreview:message,messageSource:message?'generated':'unavailable',savedTemplateUsed:false};
  const signature=JSON.stringify([target,row?.revision,reason,terms]);let revision=this.reviews.get(signature);if(!revision){revision=this.marker(row?.id??0,++this.version);this.reviews.set(signature,revision);}
  return occasionActionReview.parse({actorId:this.actorId,merchantId:this.merchantId,target,reviewRevision:revision,checkedAt:this.now,eligible:reason==='ready',reason,row,terms});
 }
 read(name:string,input:unknown={}){
  if(name==='occasionCampaigns.reviewAction')return this.review(input);if(name!=='occasionCampaigns.workspace')throw fault('NOT_FOUND');
  const selection=occasionWorkspaceInput.parse(input),all=this.all(),counts={enabled:0,disabled:0,sending:0,completed:0,failed:0,invalid:0},delivery=emptyDelivery();let storedRecipients=0;
  for(const row of all){counts[row.state]++;storedRecipients+=row.recipientCount??0;if(row.delivery)for(const k of Object.keys(delivery) as Array<keyof typeof delivery>)delivery[k]+=row.delivery[k];}
  const q=selection.query.toLowerCase(),matches=all.filter(r=>(selection.state==='all'||r.state===selection.state)&&(selection.year===null||r.year===selection.year)&&(!q||[String(r.id),r.occasionType,r.discountCode,r.linkedCampaign?.name,r.messageTemplate].some(v=>v?.toLowerCase().includes(q))));
  return occasionWorkspaceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,canManage:this.mode()!=='readonly',selection,pageSize:25,total:all.length,matched:matches.length,pages:Math.ceil(matches.length/25),years:Array.from(new Set(all.flatMap(r=>r.year===null?[]:[r.year]))).sort((a,b)=>b-a),counts,storedRecipients,invalidRecipientRows:0,delivery,deliveryEvidence:'outbox_states',salesAttribution:'not_verified',timezone:'Asia/Riyadh',calendar:'gregory_and_islamic_umalqura',upcoming:this.upcoming.map(o=>{const existing=all.find(r=>r.occasionType===o.type&&r.year===o.year);return {...o,existing:existing?{id:existing.id,state:existing.state,enabled:existing.enabled}:null};}),rows:matches.slice((selection.page-1)*25,selection.page*25)});
 }
 mutate(name:string,input:unknown){
  if(name!=='occasionCampaigns.applyAction')throw fault('NOT_FOUND');if(this.mode()==='readonly')throw fault('FORBIDDEN');
  const value=occasionActionApply.parse(input),review=this.review(value.target);if(value.reviewRevision!==review.reviewRevision)throw fault('CONFLICT');if(!review.eligible)throw fault('PRECONDITION_FAILED');
  const target=value.target;let id:number;
  if(target.action==='create'){
   id=Math.max(0,...this.rows.map(r=>r.id))+1;
   this.rows.unshift({id,authorization:missingOccasionAuthorization(),revision:this.marker(id,++this.version),occasionType:target.occasionType,year:target.year,enabled:false,discountCode:null,discountPercentage:review.terms.discountPercent,messageTemplate:null,sentAt:null,recipientCount:0,storedStatus:'pending',createdAt:this.now,updatedAt:this.now,campaignId:null,linkedCampaign:null,delivery:null,state:'disabled',issues:[]});
  }else{id=target.id;const row=this.rows.find(r=>r.id===id)!;row.enabled=target.enabled;row.authorization={state:target.enabled?'recorded':'revoked',actorId:this.actorId,reviewedAt:this.now,expiresAt:target.enabled?new Date(Math.floor(getOccasionEndDate(row.occasionType as any,new Date(this.upcoming.find(o=>o.type===row.occasionType&&o.year===row.year)!.date+'T09:00:00Z')).getTime()/1000)*1000).toISOString():row.authorization.expiresAt,revision:this.marker(id,++this.version)};row.state=target.enabled?'enabled':'disabled';row.revision=this.marker(id,++this.version);row.updatedAt=this.now;}
  this.writes++;return {actorId:this.actorId,merchantId:this.merchantId,id,enabled:target.action==='toggle'?target.enabled:false,effect:review.terms.effect,sentImmediately:false};
 }
}
