import type {PoolConnection} from 'mysql2/promise';
import {ALL_ROLES,hasPermission,type MerchantRole} from './_core/permissions';
import {parseOccasionAuthorization,occasionCampaignDigest,occasionDiscountDigest,ensureOccasionAuthorizationSchema,type OccasionAuthorizationContract} from './occasion-authorization';
import {validPreparedOccasion} from './occasion-envelope-policy';
import {detectCurrentOccasions,generateOccasionMessage} from '../shared/occasion-calendar';
import {databaseTimeEpoch} from './db/time';

export class OccasionAuthorizationDenied extends Error{constructor(){super('occasion_authorization_denied');}}
const reject=():never=>{throw new OccasionAuthorizationDenied();};
const rows=async(tx:PoolConnection,sql:string,args:any[]=[])=>{const [value]=await tx.execute(sql,args);if(!Array.isArray(value))throw Error('Occasion authority unavailable');return value as any[];};
export type LockedOccasionAuthority={record:any;contract:OccasionAuthorizationContract};
export function validOccasionAuthorityWindow(contract:OccasionAuthorizationContract,now:Date){
 return Number.isFinite(now.getTime())&&Date.parse(contract.expiresAt)>now.getTime()&&detectCurrentOccasions(now).some(o=>o.type===contract.occasionType&&o.year===contract.year);
}
/** Parent/campaign/occasion locks precede this. Hold all locks until the bounded effect finishes. */
export async function lockOccasionWorkerAuthority(tx:PoolConnection,input:{merchant:any;occasion:any;campaign:any|null;now:()=>Date;phase:'prepare'|'admission'|'dispatch'}):Promise<LockedOccasionAuthority>{
 const {merchant,occasion:oc,campaign,phase}=input;
 const merchantId=merchant?.id,occasionId=oc?.id;
 if(!Number.isInteger(merchantId)||!Number.isInteger(occasionId)||oc.merchantId!==merchantId||merchant.status!=='active'||oc.enabled!==1||oc.messageTemplate!==null||oc.status!==(phase==='dispatch'?'sending':'pending'))return reject();
 if(phase!=='dispatch'&&(oc.recipientCount!==0||oc.sentAt!==null))return reject();
 const grants=await rows(tx,'SELECT * FROM occasion_authorizations WHERE occasion_id=? AND merchant_id=? AND active=1 FOR UPDATE',[occasionId,merchantId]);
 if(grants.length!==1)return reject();
 const record=grants[0],contract=parseOccasionAuthorization(record,merchantId,occasionId);if(!contract)return reject();
 const users=await rows(tx,'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE',[contract.actorId,merchant.userId]);
 if(!users.some(u=>u.id===contract.actorId&&u.account_status==='active')||!users.some(u=>u.id===merchant.userId&&u.account_status==='active'))return reject();
 const members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,contract.actorId]);
 const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchant.userId===contract.actorId?'owner':null;
 if(!ALL_ROLES.includes(role)||!hasPermission(role as MerchantRole,'campaigns.manage'))return reject();
 const now=input.now();
 if(!validOccasionAuthorityWindow(contract,now)||!Number.isFinite(databaseTimeEpoch(record.created_at))||databaseTimeEpoch(record.created_at)>now.getTime()
  ||oc.occasionType!==contract.occasionType||oc.year!==contract.year||oc.discountPercentage!==contract.discountPercent||merchant.businessName!==contract.businessName)return reject();
 const campaignId=oc.campaignId??oc.campaign_id??null;
 const prepared=[record.prepared_campaign_id,record.prepared_campaign_digest,record.prepared_discount_id,record.prepared_discount_digest];
 if(campaignId===null){
  const current=detectCurrentOccasions(now).find(o=>o.type===oc.occasionType)!;
  if(phase!=='prepare'||campaign!==null||oc.discountCode!==null||contract.campaignId!==null||!prepared.every(v=>v===null)
    ||contract.terms.messagePreview!==generateOccasionMessage(current.name,null,'[CODE]',oc.discountPercentage,merchant.businessName))return reject();
  return {record,contract};
 }
 if(!campaign||campaign.id!==campaignId||campaign.merchantId!==merchantId||prepared.some(v=>v===null)||record.prepared_campaign_id!==campaignId
  ||occasionCampaignDigest(campaign)!==record.prepared_campaign_digest||typeof oc.discountCode!=='string'||!oc.discountCode.trim())return reject();
 if(contract.campaignId!==null&&(contract.campaignId!==campaignId||contract.campaignDigest!==record.prepared_campaign_digest||contract.discountId!==record.prepared_discount_id||contract.discountDigest!==record.prepared_discount_digest))return reject();
 const discounts=await rows(tx,'SELECT id,merchantId,code,type,value,minOrderAmount,maxUses,usedCount,isActive,expiresAt,customer_phone FROM discount_codes WHERE id=? AND merchantId=? AND code=? FOR SHARE',[record.prepared_discount_id,merchantId,oc.discountCode]);
 if(discounts.length!==1||occasionDiscountDigest(discounts[0])!==record.prepared_discount_digest
  ||!validPreparedOccasion(campaign,discounts[0],contract.discountPercent,contract.occasionType,input.now(),input.now(),phase==='dispatch'?['sending']:['draft','scheduled']))return reject();
 return {record,contract};
}
/** New envelopes are bound once while the approved definition and author remain locked. */
export async function bindOccasionPreparedEnvelope(tx:PoolConnection,authority:LockedOccasionAuthority,campaignId:number,code:string,now:Date){
 const {record,contract:c}=authority;
 if(!validOccasionAuthorityWindow(c,now)||record.prepared_campaign_id!==null)return reject();
 const campaigns=await rows(tx,'SELECT id,merchantId,name,message,imageUrl,targetAudience,scheduledAt,status FROM campaigns WHERE id=? AND merchantId=? FOR UPDATE',[campaignId,c.merchantId]);
 const discounts=await rows(tx,'SELECT id,merchantId,code,type,value,minOrderAmount,maxUses,usedCount,isActive,expiresAt,customer_phone FROM discount_codes WHERE merchantId=? AND code=? FOR SHARE',[c.merchantId,code]);
 const occasion=detectCurrentOccasions(now).find(o=>o.type===c.occasionType);
 if(campaigns.length!==1||discounts.length!==1||!occasion||!validPreparedOccasion(campaigns[0],discounts[0],c.discountPercent,c.occasionType,now,now)
  ||campaigns[0].message!==generateOccasionMessage(occasion.name,null,code,c.discountPercent,c.businessName))return reject();
 const [saved]=await tx.execute<any>('UPDATE occasion_authorizations SET prepared_campaign_id=?,prepared_campaign_digest=?,prepared_discount_id=?,prepared_discount_digest=? WHERE id=? AND merchant_id=? AND occasion_id=? AND active=1 AND prepared_campaign_id IS NULL',
  [campaignId,occasionCampaignDigest(campaigns[0]),discounts[0].id,occasionDiscountDigest(discounts[0]),record.id,c.merchantId,c.occasionId]);
 if(saved.affectedRows!==1)return reject();
}
export {ensureOccasionAuthorizationSchema};

/** Both generic campaign admission and transport must honor a linked occasion. */
export async function lockCampaignOccasionAuthority(tx:PoolConnection,merchant:any,campaign:any,phase:'admission'|'dispatch',now:()=>Date=()=>new Date()):Promise<LockedOccasionAuthority|null>{
 const found=await rows(tx,'SELECT id,merchantId,campaign_id AS campaignId,occasionType,year,enabled,discountPercentage,status,discountCode,messageTemplate,recipientCount,sentAt FROM occasion_campaigns WHERE campaign_id=? FOR UPDATE',[campaign.id]);
 if(found.length===0)return null;if(found.length!==1)return reject();
 return lockOccasionWorkerAuthority(tx,{merchant,occasion:found[0],campaign,now,phase});
}
