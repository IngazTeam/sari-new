import {promotionWorkspaceInput,promotionWorkspaceSchema,promotionWorkspaceRow,promotionTypes,type PromotionWorkspaceRow} from '../../../shared/promotion-workspace';
import {promotionActionTarget,promotionActionReview,promotionActionApply,promotionActionResult,promotionReceiptInput,promotionReceiptResult,type PromotionActionTarget} from '../../../shared/promotion-actions';
import {promotionWriteFields} from '../../../shared/promotion-write';
import {promotionTargetNamesInput,promotionTargetNamesResult} from '../../../shared/promotion-target-names';
import {promotionTargetSelection,promotionTargetChoices} from '../../../shared/promotion-targets';
import type {ServiceMode} from './service-preview-model';
export const promotionPreviewQueries=['promotions.workspace','promotions.targetNames','promotions.targetChoices','promotions.actionReceipt'] as const;
export const promotionPreviewMutations=['promotions.reviewAction','promotions.applyAction','promotions.resolveActionReceipt'] as const;
const fault=(reason:string,code='BAD_REQUEST')=>({message:'promotion_write:'+reason,data:{code}});
const editable=['title','description','bannerImageUrl','type','value','scope','productIds','categoryIds','minOrderAmount','minQuantity','startsAt','expiresAt'] as const;
/** Disposable UI simulation. Receipts exist only in memory; no database, provider or scheduler. */
export class PromotionPreviewStore{
 writes=0;private version=0;private rows:PromotionWorkspaceRow[]=[];private reviews=new Map<string,string>();
 private receipts=new Map<string,{signature:string;outcome:ReturnType<typeof promotionReceiptResult.parse>}>();
 constructor(readonly actorId:number,readonly merchantId:number,readonly now:string,private mode:()=>ServiceMode){
  if(mode()==='empty')return;
  for(let id=31;id>=1;id--){const type=promotionTypes[(31-id)%5];this.rows.push(promotionWorkspaceRow.parse({id,revision:this.marker(id),title:this.storeName+' · عرض / Offer '+id,description:'شروط محفوظة للمراجعة · Stored sample terms',bannerImageUrl:id===31?'https://example.com/local-promotion.png':null,type,value:type==='percentage'?15:type==='fixed'?250:0,scope:id===31?'products':id===30?'categories':'all',productIds:id===31?'[1,2]':null,categoryIds:id===30?'[1]':null,productIdsParsed:id===31?[1,2]:[],categoryIdsParsed:id===30?[1]:[],minOrderAmount:0,minQuantity:1,autoDiscountCodeId:id===28?28:null,linkedDiscount:id===28?{id:28,code:'DEMO-'+merchantId,type:'percentage',value:15,isActive:true}:null,startsAt:id===30?this.shift(86400000):null,expiresAt:id===29?this.shift(-86400000):null,isActive:id>=29,viewCount:id===31?999:0,clickCount:id===31?99:0,createdAt:now,updatedAt:now,state:id===31?'active':id===30?'scheduled':id===29?'expired':'inactive',issues:[]}));}
 }
 private get storeName(){return this.merchantId===269?'نواة · Nawa':'مدار · Madar';}
 private shift(ms:number){return new Date(Date.parse(this.now)+ms).toISOString();}
 private marker(id:number){return [this.actorId,this.merchantId,id,this.version,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
 private all(){return this.rows.map(value=>{const row=structuredClone(value);if(this.mode()==='legacy'&&row.id===31){row.value=null;row.productIds='[1,999]';row.productIdsParsed=[1,999];row.viewCount=null;row.description='<img src=x onerror=alert(1)> · saved legacy text';row.issues=['value','viewCount'];row.state='invalid';}return row;});}
 private choices(kind:'products'|'categories'){
  return Array.from({length:31},(_,index)=>({id:index+1,name:this.storeName+' · '+(kind==='products'?'Product':'فئة')+' '+(index+1),alternateName:(kind==='products'?'منتج':'Category')+' '+(index+1),active:index%5!==4}));
 }
 private fields(before:PromotionWorkspaceRow|null,target:PromotionActionTarget){
  if(target.action==='delete')return null;
  const value:any={title:null,description:null,bannerImageUrl:null,type:null,value:null,scope:'all',productIds:null,categoryIds:null,minOrderAmount:null,minQuantity:null,startsAt:null,expiresAt:null,...before?Object.fromEntries(editable.map(k=>[k,before[k]])):{}};
  if(target.action==='create'||target.action==='update')for(const k of editable)if(target.data[k]!==undefined)value[k]=target.data[k];
  // Pausing an invalid legacy record does not rewrite its definition.
  if(target.action==='toggle'&&!target.enabled)return null;
  promotionWriteFields.parse(value);value.title=value.title?.trim();if(!value.title||!value.type)throw fault('invalid');
  if(value.type==='percentage'&&!(value.value>=1&&value.value<=100)||value.type==='fixed'&&!(value.value>=1))throw fault('invalid');
  for(const k of ['startsAt','expiresAt'])if(value[k]){const d=new Date(value[k]);if(!Number.isFinite(d.getTime()))throw fault('invalid');value[k]=d.toISOString();}
  if(value.startsAt&&value.expiresAt&&value.startsAt>=value.expiresAt)throw fault('invalid');
  for(const [key,kind] of [['productIds','products'],['categoryIds','categories']] as const){let ids:number[];try{ids=value[key]===null?[]:JSON.parse(value[key]);if(!Array.isArray(ids)||ids.length>1000||new Set(ids).size!==ids.length||ids.some(id=>!Number.isInteger(id)||id<=0||id>2147483647))throw Error();}catch{throw fault('invalid');}if(value.scope===kind&&!ids.length)throw fault('invalid');if((target.action==='create'||target.action==='toggle'&&target.enabled||before?.isActive)&&ids.some(id=>!this.choices(kind).some(r=>r.id===id)))throw fault('invalid');}
  return value;
 }
 private review(input:unknown,checkedAt=this.now){
  if(this.mode()==='readonly')throw fault('forbidden','FORBIDDEN');const target=promotionActionTarget.parse(input),all=this.all(),id=target.action==='create'?null:target.action==='update'?target.data.id:target.id,before=id===null?null:all.find(r=>r.id===id)??null;
  if(id!==null&&!before)throw fault('missing','NOT_FOUND');if(target.action==='toggle'&&target.enabled===before!.isActive)throw fault('stale','CONFLICT');
  const proposed=this.fields(before,target),active=target.action==='create'?true:target.action==='toggle'?target.enabled:before?.isActive;
  const value=proposed??before,expired=!!value?.expiresAt&&Date.parse(value.expiresAt)<=Date.parse(this.now),scheduled=!!value?.startsAt&&Date.parse(value.startsAt)>Date.parse(this.now);
  const candidateState=target.action==='delete'?'deleted':!active?'inactive':expired?'expired':scheduled?'scheduled':'active';
  if(target.action==='toggle'&&target.enabled&&expired)throw fault('invalid');
  const slots=all.filter(r=>r.isActive&&(!r.expiresAt||Date.parse(r.expiresAt)>Date.parse(this.now)));
  if(active&&!expired&&target.action!=='delete'&&slots.filter(r=>r.id!==id).length>=5)throw fault('limit');
  let newDiscount=null;
  if(target.action==='create'&&target.data.autoGenerateCode){if(proposed.scope!=='all')throw fault('code_scope');if(scheduled)throw fault('code_start');if(proposed.minQuantity>1)throw fault('code_quantity');if(expired)throw fault('code_expired');const type=target.data.autoCodeType??'percentage',amount=target.data.autoCodeValue;if(!amount||type==='percentage'&&amount>100)throw fault('invalid');newDiscount={type,value:amount,minOrderAmount:proposed.minOrderAmount??0,expiresAt:proposed.expiresAt};}
  const terms={actorId:this.actorId,merchantId:this.merchantId,target,checkedAt,expiresAt:new Date(Date.parse(checkedAt)+300000).toISOString(),before,proposed,effect:target.action==='create'?'create_active':target.action==='toggle'?target.enabled?'enable':'disable':target.action,retainsLinkedDiscount:before?.autoDiscountCodeId!=null,activeSlots:slots.length,candidateState,newDiscount,salesVerified:false,currencyEvidence:'not_recorded'};
  const signature=JSON.stringify(terms);let revision=this.reviews.get(signature);if(!revision){this.version++;revision=this.marker(id??0);this.reviews.set(signature,revision);}return promotionActionReview.parse({...terms,reviewRevision:revision});
 }
 read(name:string,input:unknown={}){
  if(name==='promotions.actionReceipt'){if(this.mode()==='readonly')throw fault('forbidden','FORBIDDEN');return this.receipts.get(promotionReceiptInput.parse(input).requestKey)?.outcome??{state:'missing',result:null};}
  if(name==='promotions.targetNames'){
   const selected=promotionTargetNamesInput.parse(input),identity={actorId:this.actorId,merchantId:this.merchantId,input:selected,checkedAt:this.now},row=this.all().find(r=>r.id===selected.id);
   if(!row||row.revision!==selected.revision)return promotionTargetNamesResult.parse({...identity,state:row?'changed':'missing',products:null,categories:null});
   const names=(kind:'products'|'categories',ids:number[]|null)=>{const choices=this.choices(kind).filter(r=>ids?.includes(r.id));return {ids,choices,missingIds:ids?.filter(id=>!choices.some(r=>r.id===id))??[]};};
   return promotionTargetNamesResult.parse({...identity,state:'ready',products:names('products',row.productIds===null?[]:row.productIdsParsed),categories:names('categories',row.categoryIds===null?[]:row.categoryIdsParsed)});
  }
  if(name==='promotions.targetChoices'){
   if(this.mode()==='readonly')throw fault('forbidden','FORBIDDEN');const selection=promotionTargetSelection.parse(input),all=this.choices(selection.kind),q=selection.query.toLowerCase(),matches=all.filter(r=>[r.name,r.alternateName].some(v=>v.toLowerCase().includes(q))||String(r.id)===q),selected=all.filter(r=>selection.selectedIds.includes(r.id));
   return promotionTargetChoices.parse({actorId:this.actorId,merchantId:this.merchantId,selection,total:matches.length,pages:Math.ceil(matches.length/25),pageSize:25,rows:matches.slice((selection.page-1)*25,selection.page*25),selected,missingIds:selection.selectedIds.filter(id=>!selected.some(r=>r.id===id))});
  }
  if(name!=='promotions.workspace')throw fault('missing','NOT_FOUND');const selection=promotionWorkspaceInput.parse(input),all=this.all(),counts={active:0,scheduled:0,expired:0,inactive:0,invalid:0};for(const row of all)counts[row.state]++;
  const q=selection.query.toLowerCase(),matched=all.filter(r=>(selection.state==='all'||r.state===selection.state)&&(selection.type==='all'||r.type===selection.type)&&(selection.scope==='any'||r.scope===selection.scope)&&[r.title,r.description,r.linkedDiscount?.code,String(r.id)].some(v=>v?.toLowerCase().includes(q)));
  const invalidCounterRows=all.filter(r=>r.viewCount===null||r.clickCount===null).length;
  return promotionWorkspaceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,canManage:this.mode()!=='readonly',selection,pageSize:25,total:all.length,matched:matched.length,pages:Math.ceil(matched.length/25),counts,savedActiveCount:all.filter(r=>r.isActive).length,activeLimit:5,storedViewCount:invalidCounterRows?null:all.reduce((n,r)=>n+r.viewCount!,0),storedClickCount:invalidCounterRows?null:all.reduce((n,r)=>n+r.clickCount!,0),invalidCounterRows,counterEvidence:'legacy_ai_context_and_banner_queue',salesAttribution:'not_verified',currencyEvidence:'not_recorded',scopeEvidence:'saved_identifiers',rows:matched.slice((selection.page-1)*25,selection.page*25)});
 }
 mutate(name:string,input:unknown){
  if(this.mode()==='readonly')throw fault('forbidden','FORBIDDEN');
  if(name==='promotions.reviewAction')return this.review(input);
  if(name==='promotions.resolveActionReceipt'){const {requestKey}=promotionReceiptInput.parse(input),saved=this.receipts.get(requestKey);if(saved)return saved.outcome;const outcome=promotionReceiptResult.parse({state:'cancelled',result:{state:'cancelled',requestKey,actorId:this.actorId,merchantId:this.merchantId,cancelledAt:this.now}});this.receipts.set(requestKey,{signature:'cancelled',outcome});return outcome;}
  if(name!=='promotions.applyAction')throw fault('missing','NOT_FOUND');const value=promotionActionApply.parse(input),signature=JSON.stringify(value),saved=this.receipts.get(value.requestKey);
  if(saved){if(saved.outcome.state==='cancelled')throw fault('cancelled','CONFLICT');if(signature!==saved.signature)throw fault('reused','CONFLICT');return saved.outcome.result;}
  const review=this.review(value.target,value.checkedAt);if(review.reviewRevision!==value.reviewRevision||Date.parse(value.checkedAt)>Date.parse(this.now)||Date.parse(this.now)-Date.parse(value.checkedAt)>300000)throw fault('stale','CONFLICT');
  const target=value.target,id=target.action==='create'?Math.max(0,...this.rows.map(r=>r.id))+1:target.action==='update'?target.data.id:target.id;
  if(target.action==='delete')this.rows=this.rows.filter(r=>r.id!==id);
  else{
   const before=this.rows.find(r=>r.id===id),fields=review.proposed??Object.fromEntries(editable.map(k=>[k,before![k]])),discount=review.newDiscount?{id:1000+id,code:'DEMO-'+this.merchantId+'-'+id,type:review.newDiscount.type,value:review.newDiscount.value,isActive:true}:before?.linkedDiscount??null;
   this.version++;const row=promotionWorkspaceRow.parse({...fields,id,revision:this.marker(id),productIdsParsed:fields.productIds?JSON.parse(String(fields.productIds)):[],categoryIdsParsed:fields.categoryIds?JSON.parse(String(fields.categoryIds)):[],isActive:target.action==='create'?true:target.action==='toggle'?target.enabled:before!.isActive,autoDiscountCodeId:discount?.id??before?.autoDiscountCodeId??null,linkedDiscount:discount,viewCount:before?.viewCount??0,clickCount:before?.clickCount??0,createdAt:before?.createdAt??this.now,updatedAt:this.now,state:review.candidateState,issues:[]});this.rows=this.rows.filter(r=>r.id!==id);this.rows.unshift(row);
  }
  const result=promotionActionResult.parse({requestKey:value.requestKey,actorId:this.actorId,merchantId:this.merchantId,id,action:target.action,active:target.action==='delete'?null:this.rows.find(r=>r.id===id)!.isActive,retainedDiscount:review.retainsLinkedDiscount,savedAt:this.now});this.receipts.set(value.requestKey,{signature,outcome:{state:'saved',result}});this.writes++;return result;
 }
}
