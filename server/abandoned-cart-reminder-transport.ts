import type {PoolConnection} from 'mysql2/promise';
import type {SendMerchantWhatsAppInput,WhatsAppProviderConfig} from './channels/whatsapp/types';
import {getPool} from './db/connection';
import {databaseTimeEpoch} from './db/time';
import {decryptSecret} from './security/secrets';
import {withCartAuthority,CartWorkspaceError} from './abandoned-cart-workspace-store';
import {cartReminderRows,cartReminderReceipt,cartReminderSnapshot,cartReminderQuietAt,cartReminderChannelRevision,reserveCartReminder,readCartReminderReceipt} from './abandoned-cart-reminder';
import {cartReminderSendInput} from '../shared/abandoned-cart-reminder';

export type CartReminderGuard={operationId:number;actorId:number;reviewRevision:string};
const fault=()=>new CartWorkspaceError('invalid');
const key=(merchantId:number,id:number)=>`cart-reminder:${merchantId}:${id}`;
export function validCartReminderTransport(input:SendMerchantWhatsAppInput){
 const g=input.cartReminderGuard;
 return !!g&&[input.merchantId,g.operationId,g.actorId,input.instanceRecordId].every(n=>Number.isInteger(n)&&Number(n)>0&&Number(n)<=2147483647)&&/^[a-f0-9]{64}$/.test(g.reviewRevision)&&input.idempotencyKey===key(input.merchantId,g.operationId)&&input.kind==='text'&&typeof input.text==='string'&&input.text.length>0&&input.text.length<=4096&&/^\+[1-9]\d{7,14}$/.test(input.to)&&!input.retryFailed&&!input.messageId&&!input.mediaUrl&&!input.fileName&&!input.template&&!Object.keys(input).some(k=>k.endsWith('Guard')&&k!=='cartReminderGuard'&&input[k as keyof typeof input]!=null);
}
export function sameCartReminderRequest(input:SendMerchantWhatsAppInput,prior:any){return validCartReminderTransport(input)&&prior?.kind==='text'&&prior.to===input.to&&prior.text===input.text&&prior.cartReminderGuard?.operationId===input.cartReminderGuard!.operationId&&prior.cartReminderGuard?.actorId===input.cartReminderGuard!.actorId&&prior.cartReminderGuard?.reviewRevision===input.cartReminderGuard!.reviewRevision;}
function transport(row:any):SendMerchantWhatsAppInput{return {merchantId:row.merchant_id,instanceRecordId:row.channel_id,idempotencyKey:key(row.merchant_id,row.id),kind:'text',to:row.to_phone,text:row.message_text,retryFailed:false,cartReminderGuard:{operationId:row.id,actorId:row.actor_id,reviewRevision:row.review_revision}};}
async function refund(tx:PoolConnection,row:any){
 if(row.quota_reserved===0){if(row.quota_subscription_id!==null||row.quota_period_start!==null)throw fault();return;}
 const period=databaseTimeEpoch(row.quota_period_start);if(row.quota_reserved!==1||!Number.isInteger(row.quota_subscription_id)||!Number.isFinite(period))throw fault();
 const [subscription]=await cartReminderRows(tx,'SELECT merchant_id,last_reset_at,messages_used FROM merchant_subscriptions WHERE id=? FOR UPDATE',[row.quota_subscription_id]);
 if(subscription){const current=databaseTimeEpoch(subscription.last_reset_at),used=Number(subscription.messages_used);if(subscription.merchant_id!==row.merchant_id||!Number.isFinite(current)||current<period||!Number.isSafeInteger(used)||used<0)throw fault();if(current===period){if(used<1)throw fault();const [saved]=await tx.execute<any>('UPDATE merchant_subscriptions SET messages_used=messages_used-1 WHERE id=? AND merchant_id=? AND messages_used=?',[row.quota_subscription_id,row.merchant_id,used]);if(saved.affectedRows!==1)throw fault();}}
 const [saved]=await tx.execute<any>('UPDATE abandoned_cart_reminders SET quota_reserved=0,quota_subscription_id=NULL,quota_period_start=NULL WHERE id=? AND merchant_id=? AND quota_reserved=1',[row.id,row.merchant_id]);if(saved.affectedRows!==1)throw fault();
}
/** Internal settlement may run after account revocation, but always locks the exact tenant. */
async function settlement<T>(merchantId:number,operationId:number,operation:(tx:PoolConnection,row:any)=>Promise<T>){
 let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{if(![merchantId,operationId].every(n=>Number.isInteger(n)&&n>0))throw fault();const pool=await getPool();if(!pool)throw fault();tx=await pool.getConnection();await tx.beginTransaction();const merchant=await cartReminderRows(tx,'SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchantId]);if(merchant.length!==1)throw fault();const [row]=await cartReminderRows(tx,'SELECT * FROM abandoned_cart_reminders WHERE merchant_id=? AND id=? FOR UPDATE',[merchantId,operationId]);if(!row)throw fault();const result=await operation(tx,row);committing=true;await tx.commit();return result;}
 catch{if(committing)reusable=false;else if(tx)try{await tx.rollback();}catch{reusable=false;}throw new CartWorkspaceError('unavailable');}finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
async function unfinished(merchantId:number,operationId:number,unknown:boolean){return settlement(merchantId,operationId,async(tx,row)=>{
 if(row.state!=='dispatching')return;
 if(!unknown){const [delivery]=await cartReminderRows(tx,'SELECT status,provider_message_id FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE',[merchantId,key(merchantId,operationId)]);if(delivery&&(delivery.status!=='failed'||delivery.provider_message_id))throw fault();await refund(tx,row);}
 await tx.execute('UPDATE abandoned_cart_reminders SET state=? WHERE merchant_id=? AND id=? AND state=\'dispatching\'',[unknown?'unknown':'suppressed',merchantId,operationId]);
 });}
export function claimCartReminder(actorId:number,merchantId:number,operationId:number){return withCartAuthority(actorId,merchantId,true,async tx=>{
 const [row]=await cartReminderRows(tx,'SELECT * FROM abandoned_cart_reminders WHERE merchant_id=? AND id=? FOR UPDATE',[merchantId,operationId]);if(!row||row.actor_id!==actorId)throw fault();
 if(row.state!=='reserved')return null;
 const [clock]=await cartReminderRows(tx,'SELECT UTC_TIMESTAMP(3) AS now');
 if(databaseTimeEpoch(row.expires_at)<=databaseTimeEpoch(clock.now)){await refund(tx,row);await tx.execute("UPDATE abandoned_cart_reminders SET state='suppressed' WHERE id=? AND merchant_id=?",[row.id,merchantId]);return null;}
 const [saved]=await tx.execute<any>("UPDATE abandoned_cart_reminders SET state='dispatching' WHERE id=? AND merchant_id=? AND state='reserved'",[row.id,merchantId]);if(saved.affectedRows!==1)throw fault();return transport(row);
 });}
/** Reservation already consumed one period-bound unit. Lock evidence through provider I/O. */
export function withCartReminderAuthority<T extends {accepted:boolean;status:string;providerMessageId?:string;errorCode?:string}>(input:SendMerchantWhatsAppInput,config:WhatsAppProviderConfig,instanceId:number,dispatch:(tx:PoolConnection)=>Promise<T>){
 if(!validCartReminderTransport(input))throw fault();const guard=input.cartReminderGuard!;
 return withCartAuthority(guard.actorId,input.merchantId,true,async tx=>{
  const [row]=await cartReminderRows(tx,'SELECT * FROM abandoned_cart_reminders WHERE merchant_id=? AND id=? FOR UPDATE',[input.merchantId,guard.operationId]);
  if(!row||row.state!=='dispatching'||row.actor_id!==guard.actorId||row.review_revision!==guard.reviewRevision||row.quota_reserved!==1||row.channel_id!==instanceId||input.instanceRecordId!==instanceId||!sameCartReminderRequest(input,transport(row)))throw fault();
  const s=await cartReminderSnapshot(tx,guard.actorId,input.merchantId,{cartId:row.cart_id,discountId:row.discount_id,locale:row.locale},{ignoreOperationId:row.id,reservedCapacity:{subscriptionId:row.quota_subscription_id,periodStart:new Date(databaseTimeEpoch(row.quota_period_start)).toISOString()}});
  if(!s.review.eligible||s.review.expectedRevision!==row.review_revision||s.review.row.revision!==row.cart_revision||s.review.text!==row.message_text||s.review.recipient!==row.to_phone||!s.instance||s.instance.id!==instanceId||cartReminderChannelRevision(s.instance)!==row.channel_revision||s.instance.provider!==config.provider||String(s.instance.instance_id)!==config.instanceId||decryptSecret(s.instance.token)!==config.token||(s.instance.api_url??null)!==(config.apiUrl??null)||(s.instance.phone_number_id??null)!==(config.phoneNumberId??null)||(s.instance.provider_account_id??null)!==(config.providerAccountId??null))throw fault();
  const [delivery]=await cartReminderRows(tx,'SELECT status,provider_message_id,request_json,instance_id,provider FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE',[input.merchantId,input.idempotencyKey]);
  const prior=typeof delivery?.request_json==='string'?JSON.parse(delivery.request_json):delivery?.request_json;
  if(!delivery||delivery.status!=='queued'||delivery.provider_message_id||delivery.instance_id!==instanceId||delivery.provider!==config.provider||!sameCartReminderRequest(input,prior))throw fault();
  await tx.execute('INSERT INTO campaign_dispatch_rate_limits (merchant_id,window_started_at,reserved_count) VALUES (?,UTC_TIMESTAMP(3),0) ON DUPLICATE KEY UPDATE merchant_id=VALUES(merchant_id)',[input.merchantId]);
  const [window]=await cartReminderRows(tx,'SELECT reserved_count AS count,TIMESTAMPDIFF(MICROSECOND,window_started_at,UTC_TIMESTAMP(3)) AS age FROM campaign_dispatch_rate_limits WHERE merchant_id=? FOR UPDATE',[input.merchantId]);
  const count=Number(window?.count),age=Number(window?.age);if(!Number.isInteger(count)||count<0||count>10||!Number.isFinite(age)||age<0||age<1000000&&count>=10)throw fault();
  await tx.execute('UPDATE campaign_dispatch_rate_limits SET window_started_at=IF(?=1,UTC_TIMESTAMP(3),window_started_at),reserved_count=IF(?=1,1,reserved_count+1) WHERE merchant_id=?',[age>=1000000?1:0,age>=1000000?1:0,input.merchantId]);
  // Locks can wait. Check clock-sensitive evidence again immediately before the bounded call.
  const [clock]=await cartReminderRows(tx,'SELECT UTC_TIMESTAMP(3) AS now'),now=new Date(databaseTimeEpoch(clock.now));
  const [merchant]=await cartReminderRows(tx,'SELECT timezone FROM merchants WHERE id=? FOR SHARE',[input.merchantId]);
  const fresh=await cartReminderRows(tx,"SELECT id FROM merchant_subscriptions WHERE id=? AND merchant_id=? AND status IN ('active','trial') AND start_date<=UTC_TIMESTAMP(3) AND end_date>UTC_TIMESTAMP(3) AND (status<>'trial' OR trial_ends_at>UTC_TIMESTAMP(3)) FOR SHARE",[row.quota_subscription_id,input.merchantId]);
  if(fresh.length!==1||databaseTimeEpoch(row.expires_at)<=now.getTime()||cartReminderQuietAt(now,merchant.timezone||'Asia/Riyadh')||s.review.discount?.expiresAt&&Date.parse(s.review.discount.expiresAt)<=now.getTime()||s.instance.expires_at&&databaseTimeEpoch(s.instance.expires_at)<=now.getTime())throw fault();
  const result=await dispatch(tx),accepted=result.accepted&&!!result.providerMessageId,unknown=!accepted&&(result.status==='queued'||result.errorCode==='provider_unreachable'||result.accepted);
  if(accepted){const [saved]=await tx.execute<any>('UPDATE abandoned_carts SET reminderSent=1,reminderSentAt=UTC_TIMESTAMP(),updatedAt=UTC_TIMESTAMP() WHERE merchantId=? AND id=? AND reminderSent=0 AND recovered=0',[input.merchantId,row.cart_id]);if(saved.affectedRows!==1)throw fault();}
  else if(!unknown)await refund(tx,row);
  const [saved]=await tx.execute<any>('UPDATE abandoned_cart_reminders SET state=? WHERE merchant_id=? AND id=? AND state=\'dispatching\'',[accepted?'accepted':unknown?'unknown':'rejected',input.merchantId,row.id]);if(saved.affectedRows!==1)throw fault();return result;
 });
}
export async function sendReviewedCartReminder(actorId:number,merchantId:number,input:unknown){
 const value=cartReminderSendInput.parse(input),accepted=await reserveCartReminder(actorId,merchantId,value),outgoing=await claimCartReminder(actorId,merchantId,accepted.receipt.id);
 if(outgoing){try{const {sendMerchantWhatsApp}=await import('./channels/whatsapp/service');const result=await sendMerchantWhatsApp(outgoing);if(!result.accepted)await unfinished(merchantId,accepted.receipt.id,result.duplicate||result.status==='queued');}
  catch{await unfinished(merchantId,accepted.receipt.id,true);}}
 return readCartReminderReceipt(actorId,merchantId,{operationKey:value.operationKey});
}
