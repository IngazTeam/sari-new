import {createHash} from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {promotionActionTarget,promotionActionReview,promotionActionApply,promotionActionResult,promotionReceiptInput,promotionCancelledReceipt,type PromotionActionTarget} from '../shared/promotion-actions';
import {promotionMutationInput} from '../shared/promotion-write';
import {promotionWorkspaceInput} from '../shared/promotion-workspace';
import {projectPromotionWorkspace,PROMOTION_FIELDS} from './promotion-workspace-source';
import {withPromotionWriteTransaction,lockedPromotionSource,inspectPromotionMutation,applyPromotionMutation,promotionEditable,promotionWriteRows as rows,PromotionWriteError} from './promotion-writes';
import {databaseTimeEpoch} from './db/time';
import {assertRuntimeSchema,type SchemaRequirement} from './db/schema-readiness';

export const PROMOTION_RECEIPT_REQUIREMENTS:readonly SchemaRequirement[]=[{table:'promotion_action_receipts',columns:['merchant_id','actor_id','request_key','request_digest','result_json','created_at'],uniqueIndexes:[{name:'uq_promotion_request',columns:['merchant_id','request_key']}]}];
export const ensurePromotionReceiptSchema=()=>assertRuntimeSchema('promotion action receipts',PROMOTION_RECEIPT_REQUIREMENTS,{cacheSuccess:false});
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const lifespan=5*60*1000;
export function assertPromotionReviewTime(checkedAt:string,now=Date.now()){
 const age=now-Date.parse(checkedAt);if(!Number.isFinite(age)||age<0||age>lifespan)throw new PromotionWriteError('stale');
}
const currentState=(v:any,active:number,now:number)=>active!==1?'inactive':v.expiresAt&&databaseTimeEpoch(v.expiresAt)<=now?'expired':v.startsAt&&databaseTimeEpoch(v.startsAt)>now?'scheduled':'active';
async function snapshot(tx:PoolConnection,actorId:number,merchantId:number,target:PromotionActionTarget,checkedAt:string){
 assertPromotionReviewTime(checkedAt);
 const source=await lockedPromotionSource(tx,merchantId);
 const mutation=promotionMutationInput.parse(target.action==='toggle'?{action:'toggle',id:target.id}:target);
 const plan=await inspectPromotionMutation(tx,merchantId,mutation,source),now=Date.now();
 if(target.action==='toggle'&&plan.before.isActive===(target.enabled?1:0))throw new PromotionWriteError('stale');
 const candidateState=target.action==='delete'?'deleted':currentState(plan.value,plan.active,now);
 if(target.action==='toggle'&&target.enabled&&candidateState==='expired')throw new PromotionWriteError('invalid');
 const linked=plan.before?.autoDiscountCodeId==null?null:(await rows(tx,'SELECT id,merchantId,code,type,value,minOrderAmount,maxUses,usedCount,isActive,expiresAt,customer_phone FROM discount_codes WHERE id=? AND merchantId=? FOR SHARE',[plan.before.autoDiscountCodeId,merchantId]))[0]??null;
 const before=plan.before?projectPromotionWorkspace(actorId,merchantId,true,promotionWorkspaceInput.parse({}),[{...plan.before,linkedId:linked?.id,linkedMerchantId:linked?.merchantId,linkedCode:linked?.code,linkedType:linked?.type,linkedValue:linked?.value,linkedActive:linked?.isActive}],new Date(now)).rows[0]:null;
 const proposed=target.action==='delete'||target.action==='toggle'&&!target.enabled?null:Object.fromEntries(promotionEditable.map(k=>[k,plan.value[k]]));
 const newDiscount=target.action==='create'&&target.data.autoGenerateCode?{type:target.data.autoCodeType??'percentage',value:target.data.autoCodeValue!,minOrderAmount:plan.value.minOrderAmount??0,expiresAt:plan.value.expiresAt}:null;
 const activeSlots=source.filter(r=>r.isActive===1&&(!r.expiresAt||!Number.isFinite(databaseTimeEpoch(r.expiresAt))||databaseTimeEpoch(r.expiresAt)>now)).length;
 // Activity counters can change while the dialog is open; only definitions and relevant conditions invalidate it.
 const definition=plan.before?Object.fromEntries(Object.keys(PROMOTION_FIELDS).filter(k=>!['viewCount','clickCount','updatedAt'].includes(k)).map(k=>[k,plan.before[k]])):null;
 const terms={actorId,merchantId,target,checkedAt,expiresAt:new Date(Date.parse(checkedAt)+lifespan).toISOString(),proposed,effect:target.action==='create'?'create_active':target.action==='toggle'?target.enabled?'enable':'disable':target.action,retainsLinkedDiscount:plan.before?.autoDiscountCodeId!=null,activeSlots,candidateState,newDiscount,salesVerified:false,currencyEvidence:'not_recorded'};
 const reviewRevision=digest({version:1,...terms,definition,linked});
 return {review:promotionActionReview.parse({...terms,before,reviewRevision}),source,mutation};
}
async function transaction<T>(actorId:number,merchantId:number,operation:(tx:PoolConnection)=>Promise<T>){
 try{await ensurePromotionReceiptSchema();}catch{throw new PromotionWriteError('unavailable');}
 return withPromotionWriteTransaction(actorId,merchantId,operation);
}
export function reviewPromotionAction(actorId:number,merchantId:number,input:unknown){
 const target=promotionActionTarget.parse(input);return transaction(actorId,merchantId,async tx=>(await snapshot(tx,actorId,merchantId,target,new Date().toISOString())).review);
}
function savedReceipt(row:any,actorId:number,merchantId:number,requestKey:string){
 if(row.actor_id!==actorId)throw new PromotionWriteError('reused');
 const value=promotionActionResult.parse(typeof row.result_json==='string'?JSON.parse(row.result_json):row.result_json);
 if(value.actorId!==actorId||value.merchantId!==merchantId||value.requestKey!==requestKey)throw new PromotionWriteError('unavailable');return value;
}
function receiptOutcome(row:any,actorId:number,merchantId:number,requestKey:string){
 if(row.actor_id!==actorId)throw new PromotionWriteError('reused');
 const raw=typeof row.result_json==='string'?JSON.parse(row.result_json):row.result_json;
 if(raw?.state==='cancelled'){
  const result=promotionCancelledReceipt.parse(raw);
  if(result.actorId!==actorId||result.merchantId!==merchantId||result.requestKey!==requestKey||row.request_digest!=='0'.repeat(64))throw new PromotionWriteError('unavailable');
  return {state:'cancelled' as const,result};
 }
 return {state:'saved' as const,result:savedReceipt(row,actorId,merchantId,requestKey)};
}
export function readPromotionActionReceipt(actorId:number,merchantId:number,input:unknown){
 const value=promotionReceiptInput.parse(input);return transaction(actorId,merchantId,async tx=>{
  const saved=(await rows(tx,'SELECT actor_id,request_digest,result_json FROM promotion_action_receipts WHERE merchant_id=? AND request_key=? FOR SHARE',[merchantId,value.requestKey]))[0];
  return saved?receiptOutcome(saved,actorId,merchantId,value.requestKey):{state:'missing' as const,result:null};
 });
}
/** A durable tombstone fences delayed writes; absence alone is never permission to retry under a new key. */
export function resolvePromotionActionReceipt(actorId:number,merchantId:number,input:unknown){
 const value=promotionReceiptInput.parse(input);return transaction(actorId,merchantId,async tx=>{
  const saved=(await rows(tx,'SELECT actor_id,request_digest,result_json FROM promotion_action_receipts WHERE merchant_id=? AND request_key=? FOR UPDATE',[merchantId,value.requestKey]))[0];
  if(saved)return receiptOutcome(saved,actorId,merchantId,value.requestKey);
  const result=promotionCancelledReceipt.parse({state:'cancelled',requestKey:value.requestKey,actorId,merchantId,cancelledAt:new Date().toISOString()});
  const [inserted]=await tx.execute<any>('INSERT INTO promotion_action_receipts (merchant_id,actor_id,request_key,request_digest,result_json) VALUES (?,?,?,?,?)',[merchantId,actorId,value.requestKey,'0'.repeat(64),JSON.stringify(result)]);
  if(inserted.affectedRows!==1)throw new PromotionWriteError('unavailable');return {state:'cancelled' as const,result};
 });
}
export function applyPromotionAction(actorId:number,merchantId:number,input:unknown){
 const value=promotionActionApply.parse(input),requestDigest=digest(value);
 return transaction(actorId,merchantId,async tx=>{
  const saved=(await rows(tx,'SELECT actor_id,request_digest,result_json FROM promotion_action_receipts WHERE merchant_id=? AND request_key=? FOR UPDATE',[merchantId,value.requestKey]))[0];
  if(saved){const outcome=receiptOutcome(saved,actorId,merchantId,value.requestKey);if(outcome.state==='cancelled')throw new PromotionWriteError('cancelled');if(saved.request_digest!==requestDigest)throw new PromotionWriteError('reused');return outcome.result;}
  const current=await snapshot(tx,actorId,merchantId,value.target,value.checkedAt);
  if(current.review.reviewRevision!==value.reviewRevision)throw new PromotionWriteError('stale');
  const row=await applyPromotionMutation(tx,merchantId,current.mutation,current.source);
  const result=promotionActionResult.parse({requestKey:value.requestKey,actorId,merchantId,id:row.id,action:value.target.action,active:value.target.action==='delete'?null:row.isActive===1,retainedDiscount:current.review.retainsLinkedDiscount,savedAt:new Date().toISOString()});
  assertPromotionReviewTime(value.checkedAt);
  const [inserted]=await tx.execute<any>('INSERT INTO promotion_action_receipts (merchant_id,actor_id,request_key,request_digest,result_json) VALUES (?,?,?,?,?)',[merchantId,actorId,value.requestKey,requestDigest,JSON.stringify(result)]);
  if(inserted.affectedRows!==1)throw new PromotionWriteError('unavailable');assertPromotionReviewTime(value.checkedAt);return result;
 });
}
