import {createHash} from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {getPool} from './db/connection';
import {databaseTimeEpoch} from './db/time';
import {decryptSecret} from './security/secrets';
import {PROMOTION_SELECT} from './promotion-workspace-source';
import {selectSalesPromotions,promotionBannerCaption,promotionBannerUrl,type SalesPromotionEvidence} from './ai/promotion-evidence';
import {canSendConversationReply} from './ai/conversation-handoff';
import {lockReplySource,ordinaryReplyDigest,ordinaryReplyText} from './ai/reply-reservation';
import {policyArtifactDigest} from './ai/learning-policy-evaluation-bundle';
import {currentInboundExecution} from './messaging/inbound-context';
import type {SendMerchantWhatsAppInput,WhatsAppProviderConfig} from './channels/whatsapp/types';
export type PromotionBannerGuard={id:number;revision:string};
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>0&&v<=2147483647;
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const parsed=(v:any)=>typeof v==='string'?JSON.parse(v):v;
const fail=():never=>{throw Error('Promotion banner authority unavailable');};
/** Stable definition: counters and the time of observation are never authorization. */
export function promotionBannerGuard(offer:SalesPromotionEvidence):PromotionBannerGuard{
 const {id,merchantId,title,description,type,value,scope,productIds,categoryIds,minOrderAmount,minQuantity,startsAt,expiresAt,bannerImageUrl}=offer;
 return {id,revision:createHash('sha256').update(JSON.stringify({id,merchantId,title,description,type,value,scope,productIds,categoryIds,minOrderAmount,minQuantity,startsAt,expiresAt,bannerImageUrl})).digest('hex')};
}
export function validPromotionBannerTransport(input:SendMerchantWhatsAppInput){
 const g=input.promotionGuard,r=input.replyGuard;
 return !!g&&!!r&&[input.merchantId,input.instanceRecordId,g.id,r.conversationId,r.incomingMessageId].every(id)&&digest(g.revision)&&digest(r.reservationDigest)&&Number.isSafeInteger(r.version)&&r.version>=0&&/^promotion:v1:[a-f0-9]{64}$/.test(input.idempotencyKey)&&input.kind==='image'&&!!promotionBannerUrl(input.mediaUrl)&&typeof input.text==='string'&&input.text.length>0&&input.text.length<=1024&&!input.retryFailed&&!input.fileName&&!input.template&&!input.messageId&&!Object.keys(input).some(k=>k.endsWith('Guard')&&!['replyGuard','promotionGuard'].includes(k)&&input[k as keyof typeof input]!=null);
}
export function samePromotionBannerRequest(input:SendMerchantWhatsAppInput,prior:any){
 return validPromotionBannerTransport(input)&&prior?.kind==='image'&&prior.to===input.to&&prior.mediaUrl===input.mediaUrl&&prior.text===input.text&&!prior.fileName&&!prior.template&&policyArtifactDigest(prior.promotionGuard??null)===policyArtifactDigest(input.promotionGuard)&&policyArtifactDigest(prior.replyGuard??null)===policyArtifactDigest(input.replyGuard);
}
const rows=async(tx:PoolConnection,sql:string,args:any[]=[])=>{const [r]=await tx.execute(sql,args);if(!Array.isArray(r))return fail();return r as any[];};
/** The ordinary reply reserves its quota first. Hold current source and offer through provider I/O and receipt persistence. */
export async function withPromotionBannerAuthority<T>(input:SendMerchantWhatsAppInput,config:WhatsAppProviderConfig,instanceId:number,dispatch:(tx:PoolConnection)=>Promise<T>):Promise<T>{
 if(!validPromotionBannerTransport(input)||instanceId!==input.instanceRecordId)return fail();let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{
  const pool=await getPool();if(!pool)return fail();tx=await pool.getConnection();await tx.beginTransaction();
  const guard=input.replyGuard!;await lockReplySource(tx,input.merchantId,guard.conversationId,guard.incomingMessageId!);
  const [merchant]=await rows(tx,'SELECT userId,status,current_subscription_id FROM merchants WHERE id=? FOR SHARE',[input.merchantId]);if(!merchant||merchant.status!=='active')return fail();
  const [owner]=await rows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[merchant.userId]);if(owner?.account_status!=='active')return fail();
  if(!await canSendConversationReply(tx,input.merchantId,guard,input.to))return fail();
  const [latest]=await rows(tx,"SELECT id FROM messages WHERE conversationId=? AND direction='incoming' ORDER BY id DESC LIMIT 1 FOR SHARE",[guard.conversationId]);if(latest?.id!==guard.incomingMessageId)return fail();
  const [interaction]=await rows(tx,'SELECT * FROM ai_interaction_jobs WHERE merchant_id=? AND incoming_message_id=? FOR UPDATE',[input.merchantId,guard.incomingMessageId]);
  const plan=parsed(interaction?.reply_plan),{replyGuard:_,...effect}=input;
  if(!interaction||interaction.reply_origin!=='ordinary'||interaction.state!=='waiting_delivery'||!['held','charged'].includes(interaction.usage_state)||interaction.reply_digest!==guard.reservationDigest||!plan||ordinaryReplyDigest(plan)!==guard.reservationDigest||ordinaryReplyText(plan)!==interaction.reply_text||plan.conversationId!==guard.conversationId||plan.incomingMessageId!==guard.incomingMessageId||plan.ownershipVersion!==guard.version||!plan.effects.some((e:any)=>policyArtifactDigest(e)===policyArtifactDigest(effect)))return fail();
  if(input.to.endsWith('@g.us')){const {canDispatchGroupReply}=await import('./messaging/group-handler');if(!await canDispatchGroupReply(tx,input,instanceId))return fail();}
  const [subscription]=await rows(tx,"SELECT * FROM merchant_subscriptions WHERE id=? AND merchant_id=? AND id=? AND last_reset_at=? AND status IN ('active','trial') FOR SHARE",[interaction.usage_subscription_id,input.merchantId,merchant.current_subscription_id,interaction.usage_period_start]);if(!subscription)return fail();
  const [instance]=await rows(tx,'SELECT * FROM whatsapp_instances WHERE id=? AND merchant_id=? FOR SHARE',[instanceId,input.merchantId]);
  if(!instance||instance.status!=='active'||instance.provider!==config.provider||String(instance.instance_id)!==config.instanceId||decryptSecret(instance.token)!==config.token||(instance.api_url??null)!==(config.apiUrl??null)||(instance.phone_number_id??null)!==(config.phoneNumberId??null)||(instance.provider_account_id??null)!==(config.providerAccountId??null))return fail();
  const source=await rows(tx,`SELECT ${PROMOTION_SELECT} FROM promotions p WHERE p.merchant_id=? AND p.id=? FOR SHARE`,[input.merchantId,input.promotionGuard!.id]);
  const [delivery]=await rows(tx,'SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE',[input.merchantId,input.idempotencyKey]);
  if(!delivery||delivery.status!=='queued'||delivery.provider_message_id||delivery.error_code||delivery.instance_id!==instanceId||delivery.provider!==config.provider||!samePromotionBannerRequest(input,parsed(delivery.request_json)))return fail();
  const execution=currentInboundExecution();if(execution){if(execution.merchantId!==input.merchantId)return fail();await execution.assertOwned();}
  const [clock]=await rows(tx,'SELECT UTC_TIMESTAMP(3) AS now'),now=databaseTimeEpoch(clock.now),offer=selectSalesPromotions(source,{merchantId:input.merchantId,now})[0];
  const start=databaseTimeEpoch(subscription.start_date),end=databaseTimeEpoch(subscription.end_date),trial=databaseTimeEpoch(subscription.trial_ends_at),channelExpiry=instance.expires_at==null?null:databaseTimeEpoch(instance.expires_at);
  if(!offer||offer.scope!=='all'||!offer.bannerImageUrl||promotionBannerGuard(offer).revision!==input.promotionGuard!.revision||offer.bannerImageUrl!==input.mediaUrl||promotionBannerCaption(offer)!==input.text||![start,end].every(Number.isFinite)||start>now||end<=now||subscription.status==='trial'&&(!Number.isFinite(trial)||trial<=now)||channelExpiry!==null&&(!Number.isFinite(channelExpiry)||channelExpiry<=now))return fail();
  const result=await dispatch(tx);committing=true;await tx.commit();return result;
 }catch(error){if(committing)reusable=false;else if(tx)try{await tx.rollback();}catch{reusable=false;}throw error;}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
