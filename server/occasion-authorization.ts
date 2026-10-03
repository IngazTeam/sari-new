import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolConnection} from 'mysql2/promise';
import {occasionActionReview,type OccasionActionReview} from '../shared/occasion-actions';
import {occasionTypes} from '../shared/occasion-workspace';
import {getOccasionEndDate,getUpcomingOccasions} from '../shared/occasion-calendar';
import {databaseTimeEpoch} from './db/time';
import {assertRuntimeSchema,type SchemaRequirement} from './db/schema-readiness';

export const OCCASION_AUTHORIZATION_REQUIREMENTS:readonly SchemaRequirement[]=[{table:'occasion_authorizations',columns:['grant_key','occasion_id','merchant_id','actor_id','active','review_revision','contract_digest','reviewed_contract','prepared_campaign_id','prepared_campaign_digest','prepared_discount_id','prepared_discount_digest','created_at','revoked_at'],uniqueIndexes:[{name:'uq_occasion_grant_key',columns:['grant_key']},{name:'uq_occasion_active_grant',columns:['occasion_id','active']}],checkConstraints:['chk_occasion_grant_active','chk_occasion_grant_prepared']}];
export const ensureOccasionAuthorizationSchema=()=>assertRuntimeSchema('occasion activation authorization',OCCASION_AUTHORIZATION_REQUIREMENTS,{cacheSuccess:false});
const id=z.number().int().positive().max(2147483647),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const occasionAuthorizationContract=z.object({version:z.literal(1),actorId:id,merchantId:id,occasionId:id,reviewRevision:hash,
 occasionType:z.enum(occasionTypes),year:z.number().int().min(1900).max(9999),discountPercent:z.number().int().min(5).max(50),
 businessName:z.string().min(1).max(255).refine(v=>!!v.trim()),expiresAt:z.string().datetime(),
 terms:occasionActionReview.shape.terms,
 campaignId:id.nullable(),campaignDigest:hash.nullable(),discountId:id.nullable(),discountDigest:hash.nullable(),
}).strict().superRefine((v,c)=>{
 if(v.terms.effect!=='allow_automatic_admission'||v.terms.occasionType!==v.occasionType||v.terms.year!==v.year||v.terms.discountPercent!==v.discountPercent||!v.terms.messagePreview||v.terms.messageSource==='unavailable')c.addIssue({code:'custom',message:'Invalid authorization terms'});
 const prepared=[v.campaignId,v.campaignDigest,v.discountId,v.discountDigest];
 if(!prepared.every(x=>x===null)&&!prepared.every(x=>x!==null))c.addIssue({code:'custom',message:'Incomplete prepared authorization'});
 if(v.terms.messageSource!==(v.campaignId===null?'generated':'linked_campaign'))c.addIssue({code:'custom',message:'Invalid authorized message source'});
});
export type OccasionAuthorizationContract=z.infer<typeof occasionAuthorizationContract>;
export const occasionAuthorizationDigest=(value:OccasionAuthorizationContract)=>createHash('sha256').update(JSON.stringify(occasionAuthorizationContract.parse(value))).digest('hex');
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp=(value:any)=>value===null?null:new Date(databaseTimeEpoch(value)).toISOString();
/** Lifecycle and usage counters legitimately change; the approved content does not. */
export function occasionCampaignDigest(row:any){return digest([row.id,row.merchantId,row.name,row.message,row.imageUrl,typeof row.targetAudience==='string'?JSON.parse(row.targetAudience):row.targetAudience,stamp(row.scheduledAt)]);}
export function occasionDiscountDigest(row:any){return digest([row.id,row.code,row.type,row.value,row.minOrderAmount,row.maxUses,row.isActive,stamp(row.expiresAt),row.customer_phone]);}
export function buildOccasionAuthorization(review:OccasionActionReview,businessName:string,linked:any,discount:any,now:Date){
 if(!review.eligible||review.target.action!=='toggle'||!review.target.enabled||!review.row)throw Error('Invalid authorization review');
 const available=getUpcomingOccasions(now).find(o=>o.type===review.row!.occasionType&&o.year===review.row!.year);if(!available)throw Error('Occasion unavailable');
 return occasionAuthorizationContract.parse({version:1,actorId:review.actorId,merchantId:review.merchantId,occasionId:review.row.id,reviewRevision:review.reviewRevision,occasionType:available.type,year:available.year,discountPercent:review.terms.discountPercent,businessName,
  expiresAt:new Date(Math.floor(getOccasionEndDate(available.type,new Date(available.date+'T09:00:00Z')).getTime()/1000)*1000).toISOString(),terms:review.terms,
  campaignId:linked?.id??null,campaignDigest:linked?occasionCampaignDigest(linked):null,discountId:discount?.id??null,discountDigest:discount?occasionDiscountDigest(discount):null});
}
/** Call after the merchant and occasion are locked. History remains immutable except revocation. */
export async function revokeOccasionAuthorization(tx:PoolConnection,merchantId:number,occasionId:number){
 await tx.execute('UPDATE occasion_authorizations SET active=NULL,revoked_at=UTC_TIMESTAMP(3) WHERE occasion_id=? AND merchant_id=? AND active=1',[occasionId,merchantId]);
}
export async function writeOccasionAuthorization(tx:PoolConnection,value:OccasionAuthorizationContract){
 const c=occasionAuthorizationContract.parse(value);await revokeOccasionAuthorization(tx,c.merchantId,c.occasionId);
 const [saved]=await tx.execute<any>(`INSERT INTO occasion_authorizations (grant_key,occasion_id,merchant_id,actor_id,active,review_revision,contract_digest,reviewed_contract,prepared_campaign_id,prepared_campaign_digest,prepared_discount_id,prepared_discount_digest)
  VALUES (?,?,?,?,1,?,?,?,?,?,?,?)`,[randomUUID(),c.occasionId,c.merchantId,c.actorId,c.reviewRevision,occasionAuthorizationDigest(c),JSON.stringify(c),c.campaignId,c.campaignDigest,c.discountId,c.discountDigest]);
 if(saved.affectedRows!==1||!Number.isInteger(saved.insertId)||saved.insertId<=0)throw Error('Authorization could not be persisted');
}
/** No legacy actor is inferred; absent, tampered or cross-tenant rows fail closed. */
export function parseOccasionAuthorization(row:any,merchantId:number,occasionId:number){
 try{
  if(row?.active!==1||row.revoked_at!==null||row.merchant_id!==merchantId||row.occasion_id!==occasionId||!Number.isInteger(row.actor_id)||row.actor_id<=0)return null;
  const c=occasionAuthorizationContract.parse(typeof row.reviewed_contract==='string'?JSON.parse(row.reviewed_contract):row.reviewed_contract);
  if(c.merchantId!==merchantId||c.occasionId!==occasionId||c.actorId!==row.actor_id||c.reviewRevision!==row.review_revision||occasionAuthorizationDigest(c)!==row.contract_digest)return null;
  return c;
 }catch{return null;}
}
