import {buildOccasionAuthorization,ensureOccasionAuthorizationSchema,writeOccasionAuthorization,revokeOccasionAuthorization} from './occasion-authorization';
import {validPreparedOccasion} from './occasion-envelope-policy';
import {createHash} from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {getPool} from './db/connection';
import {ALL_ROLES,hasPermission,type MerchantRole} from './_core/permissions';
import {occasionActionTarget,occasionActionApply,occasionActionReview,type OccasionActionTarget} from '../shared/occasion-actions';
import {occasionWorkspaceInput} from '../shared/occasion-workspace';
import {OCCASION_COLUMNS,projectOccasionWorkspace} from './occasion-workspace-source';
import {generateOccasionMessage,getUpcomingOccasions,getOccasionDiscountPercentage} from './automation/occasion-campaigns';

export class OccasionActionError extends Error {
  constructor(readonly reason:'forbidden'|'missing'|'stale'|'invalid'|'duplicate'|'unavailable'|'unknown'){super(`occasion_action:${reason}`);}
}
async function rows(tx:PoolConnection,sql:string,args:any[]=[]){
  const [data]=await tx.execute(sql,args);
  if(!Array.isArray(data))throw new OccasionActionError('unavailable');
  return data as any[];
}
async function transaction<T>(actorId:number,merchantId:number,operation:(tx:PoolConnection,businessName:string)=>Promise<T>){
  let tx:PoolConnection|undefined,committing=false,reusable=true;
  try{
    if(![actorId,merchantId].every(n=>Number.isInteger(n)&&n>0&&n<=2147483647))throw new OccasionActionError('forbidden');
    await ensureOccasionAuthorizationSchema();
    const pool=await getPool();if(!pool)throw new OccasionActionError('unavailable');
    tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.beginTransaction();
    // Parent lock serializes definition creation and permission changes using the same authority order.
    const merchants=await rows(tx,'SELECT userId,status,businessName FROM merchants WHERE id=? FOR UPDATE',[merchantId]);
    const users=await rows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[actorId]);
    const members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
    const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchants[0]?.userId===actorId?'owner':null;
    if(merchants.length!==1||merchants[0].status!=='active'||users.length!==1||users[0].account_status!=='active'||!ALL_ROLES.includes(role)||!hasPermission(role as MerchantRole,'campaigns.manage'))throw new OccasionActionError('forbidden');
    const name=merchants[0].businessName;
    if(typeof name!=='string'||!name.trim()||name.length>255)throw new OccasionActionError('invalid');
    const result=await operation(tx,name);committing=true;await tx.commit();return result;
  }catch(error){
    if(committing)reusable=false;else if(tx)try{await tx.rollback();}catch{reusable=false;}
    if(committing)throw new OccasionActionError('unknown');
    if(error instanceof OccasionActionError)throw error;
    if((error as any)?.code==='ER_DUP_ENTRY')throw new OccasionActionError('duplicate');
    throw new OccasionActionError('unavailable');
  }finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
async function snapshot(tx:PoolConnection,actorId:number,merchantId:number,businessName:string,target:OccasionActionTarget){
  const now=new Date(),upcoming=getUpcomingOccasions(now);
  let raw:any=null,linked:any=null;
  if(target.action==='toggle'){
    // Acquire an existing canonical campaign before its occasion, matching admission/reconciliation.
    const hint=(await rows(tx,'SELECT campaign_id FROM occasion_campaigns WHERE merchantId=? AND id=?',[merchantId,target.id]))[0];
    if(!hint)throw new OccasionActionError('missing');
    if(hint.campaign_id!==null)linked=(await rows(tx,'SELECT id,merchantId,name,status,message,targetAudience,imageUrl,scheduledAt FROM campaigns WHERE id=? AND merchantId=? FOR UPDATE',[hint.campaign_id,merchantId]))[0]??null;
    raw=(await rows(tx,`SELECT ${OCCASION_COLUMNS} FROM occasion_campaigns WHERE merchantId=? AND id=? FOR UPDATE`,[merchantId,target.id]))[0];
    if(!raw)throw new OccasionActionError('missing');
    if(raw.campaign_id!==hint.campaign_id)throw new OccasionActionError('stale');
  }else{
    raw=(await rows(tx,`SELECT ${OCCASION_COLUMNS} FROM occasion_campaigns WHERE merchantId=? AND occasionType=? AND year=? FOR UPDATE`,[merchantId,target.occasionType,target.year]))[0]??null;
    // A duplicate is informational only; never exposes a linked campaign outside this merchant.
    if(raw?.campaign_id!=null)linked=(await rows(tx,'SELECT id,merchantId,name,status,message,targetAudience,imageUrl,scheduledAt FROM campaigns WHERE id=? AND merchantId=?',[raw.campaign_id,merchantId]))[0]??null;
  }
  const source=raw?[{...raw,linkedId:linked?.id??null,linkedMerchantId:linked?.merchantId??null,linkedName:linked?.name??null,linkedStatus:linked?.status??null}]:[];
  const groups=linked?await rows(tx,'SELECT campaign_id AS campaignId,merchant_id AS merchantId,status,COUNT(*) AS count FROM campaign_delivery_outbox WHERE campaign_id=? GROUP BY campaign_id,merchant_id,status',[linked.id]):[];
  const row=source.length?projectOccasionWorkspace(actorId,merchantId,true,occasionWorkspaceInput.parse({}),source,groups,[],now).rows[0]:null;
  const type=target.action==='create'?target.occasionType:row!.occasionType,year=target.action==='create'?target.year:row!.year;
  const available=upcoming.find(o=>o.type===type&&o.year===year);
  const discountPercent=target.action==='create'?getOccasionDiscountPercentage(target.occasionType):row!.discountPercentage;
  const discounts=target.action==='toggle'&&target.enabled&&linked&&row?.discountCode
    ?await rows(tx,'SELECT id,type,value,minOrderAmount,maxUses,usedCount,isActive,expiresAt,customer_phone FROM discount_codes WHERE merchantId=? AND code=? FOR SHARE',[merchantId,row.discountCode]):[];
  const discount=discounts.length===1?discounts[0]:null;
  let preparedValid=true;
  if(target.action==='toggle'&&target.enabled&&linked){
    preparedValid=!!available&&validPreparedOccasion(linked,discount,discountPercent!,type as any,new Date(available.date+'T09:00:00Z'),now);
  }
  let reason:'ready'|'duplicate'|'not_available'|'in_progress'|'invalid'|'no_change'='ready';
  if(target.action==='create')reason=row?'duplicate':!available?'not_available':'ready';
  else if(row!.storedStatus!=='pending'||row!.delivery&&row!.delivery.total>0||linked&&!['draft','scheduled'].includes(linked.status))reason='in_progress';
  else if(row!.enabled===target.enabled)reason='no_change';
  else if(target.enabled&&(row!.state==='invalid'||row!.messageTemplate!==null||row!.recipientCount!==0||row!.sentAt!==null||!preparedValid))reason='invalid';
  else if(target.enabled&&!available)reason='not_available';
  else if(row!.enabled===null)reason='invalid';
  const message=linked&&typeof linked.message==='string'&&linked.message.trim()&&linked.message.length<=100000?linked.message
    :!linked&&available&&discountPercent!==null?generateOccasionMessage(available.name,null,'[CODE]',discountPercent,businessName):null;
  if(target.action==='toggle'&&target.enabled&&message===null&&reason==='ready')reason='invalid';
  const terms={effect:target.action==='create'?'save_disabled':target.enabled?'allow_automatic_admission':'disable_future_admission',
    occasionType:type,year,discountPercent,discountMaxUses:2000,discountMinOrder:0,discountExpiry:'occasion_end',audience:'eligible_conversations',audienceLimit:2000,
    timezone:'Asia/Riyadh',calendar:'gregory_and_islamic_umalqura',sendsImmediately:false,deliveryGuaranteed:false,salesVerified:false,
    messagePreview:message,messageSource:message===null?'unavailable':linked?'linked_campaign':'generated',savedTemplateUsed:false} as const;
  // Bind the reviewed effect to this actor, tenant, row, actual envelope and today's available calendar.
  const reviewRevision=createHash('sha256').update(JSON.stringify({version:1,actorId,merchantId,target,rowRevision:row?.revision??null,reason,terms,discount,linked,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(now),available:available?{type:available.type,year:available.year,date:available.date}:null})).digest('hex');
  const review=occasionActionReview.parse({actorId,merchantId,target,reviewRevision,checkedAt:now.toISOString(),eligible:reason==='ready',reason,row,terms});
  return {review,authorization:review.eligible&&target.action==='toggle'&&target.enabled?buildOccasionAuthorization(review,businessName,linked,discount,now):null};
}
export function reviewOccasionAction(actorId:number,merchantId:number,input:unknown){
  const target=occasionActionTarget.parse(input);
  return transaction(actorId,merchantId,(tx,name)=>snapshot(tx,actorId,merchantId,name,target)).then(value=>value.review);
}
export function applyOccasionAction(actorId:number,merchantId:number,input:unknown){
  const value=occasionActionApply.parse(input);
  return transaction(actorId,merchantId,async(tx,name)=>{
    const {review,authorization}=await snapshot(tx,actorId,merchantId,name,value.target);
    if(review.reviewRevision!==value.reviewRevision)throw new OccasionActionError('stale');
    if(!review.eligible)throw new OccasionActionError(review.reason==='duplicate'?'duplicate':'invalid');
    let id:number;
    if(value.target.action==='create'){
      const [saved]=await tx.execute<any>("INSERT INTO occasion_campaigns (merchantId,occasionType,year,enabled,discountPercentage,status) VALUES (?,?,?,0,?,'pending')",[merchantId,value.target.occasionType,value.target.year,review.terms.discountPercent]);
      id=Number(saved.insertId);if(saved.affectedRows!==1||!Number.isInteger(id)||id<=0||id>2147483647)throw new OccasionActionError('unavailable');
    }else{
      id=value.target.id;
      const [saved]=await tx.execute<any>("UPDATE occasion_campaigns SET enabled=?,updatedAt=UTC_TIMESTAMP() WHERE merchantId=? AND id=? AND status='pending' AND enabled=?",[value.target.enabled?1:0,merchantId,id,review.row!.enabled?1:0]);
      if(saved.affectedRows!==1)throw new OccasionActionError('stale');
      if(value.target.enabled){if(!authorization)throw new OccasionActionError('invalid');await writeOccasionAuthorization(tx,authorization);}
      else await revokeOccasionAuthorization(tx,merchantId,id);
    }
    return {actorId,merchantId,id,enabled:value.target.action==='toggle'?value.target.enabled:false,effect:review.terms.effect,sentImmediately:false as const};
  });
}
