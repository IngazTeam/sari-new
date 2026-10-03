import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {PoolConnection} from 'mysql2/promise';
import type {SendMerchantWhatsAppInput,WhatsAppProviderConfig} from './channels/whatsapp/types';
import {getPool} from './db/connection';
import {assertRuntimeSchema} from './db/schema-readiness';
import {databaseTimeEpoch} from './db/time';
import {hasPermission,type MerchantRole} from './_core/permissions';
import {decryptSecret} from './security/secrets';
import {orderStatusReceipt} from '../shared/order-status-review';
import {orderNoticeAuthorizationContract,orderNoticeAuthorityDigest,readOrderNoticeOrderDigest,readOrderNoticeChannel,OrderNoticeAuthorityError,type OrderNoticeAuthorizationContract} from './order-notification-authority';
import {campaignDeliveryEvidence} from './campaign-delivery-evidence';

const id=z.number().int().positive().max(2147483647),hex=z.string().regex(/^[a-f0-9]{64}$/);
const guardSchema=z.object({notificationId:id,authorizationId:id,contractDigest:hex,claimToken:z.string().uuid()}).strict();
export type OrderNoticeTransportGuard=z.infer<typeof guardSchema>;
export const ORDER_NOTICE_MAX_ATTEMPTS=8,ORDER_NOTICE_LEASE_MS=600000;
const key=(merchantId:number,eventKey:string)=>`order-status:${merchantId}:${eventKey}`;
const fault=()=>new OrderNoticeAuthorityError('changed');
const rows=async(tx:PoolConnection,sql:string,args:any[]=[])=> (await tx.execute<any[]>(sql,args))[0];
const json=(value:any)=>typeof value==='string'?JSON.parse(value):value;
type Stored={row:any;grant:any;contract:OrderNoticeAuthorizationContract};

export async function ensureOrderNoticeDispatchSchema(){await assertRuntimeSchema('reviewed order notification transport',[
 {table:'order_notifications',columns:['event_key','delivery_status','attempts','available_at','claimed_at','claim_token','reviewed_at','reviewed_by_user_id'],uniqueIndexes:[{name:'uq_order_notification_event',columns:['merchant_id','event_key']}]},
 {table:'order_notification_authorizations',columns:['notification_id','merchant_id','order_id','actor_id','receipt_id','event_key','request_key','contract_digest','reviewed_contract'],uniqueIndexes:[{name:'uq_order_notice_authorization',columns:['notification_id']},{name:'uq_order_notice_authorization_event',columns:['merchant_id','event_key']}]},
 {table:'order_status_receipts',columns:['merchant_id','actor_id','order_id','request_id','input_hash','result']},
 {table:'whatsapp_message_deliveries',columns:['merchant_id','instance_id','provider','direction','message_id','request_json','created_at','status_updated_at','idempotency_key','status','error_code']},
]);}

/** Parent lock serializes admission, revocation and settlement; never reuse an uncertain connection. */
async function transaction<T>(merchantId:number,run:(tx:PoolConnection,merchant:any)=>Promise<T>):Promise<T>{
 id.parse(merchantId);const pool=await getPool();if(!pool)throw new OrderNoticeAuthorityError('unavailable');const tx=await pool.getConnection();let reusable=true,committing=false;
 try{await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await tx.beginTransaction();const [merchant]=await rows(tx,'SELECT id,userId,status FROM merchants WHERE id=? FOR UPDATE',[merchantId]);if(!merchant)throw fault();const result=await run(tx,merchant);committing=true;await tx.commit();return result;}
 catch(error){if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}throw error;}finally{if(reusable)tx.release();else tx.destroy();}
}
async function notice(tx:PoolConnection,merchantId:number,noticeId:number){id.parse(noticeId);const [row]=await rows(tx,'SELECT * FROM order_notifications WHERE merchant_id=? AND id=? FOR UPDATE',[merchantId,noticeId]);return row??null;}
async function clock(tx:PoolConnection){const [r]=await rows(tx,'SELECT UTC_TIMESTAMP(3) AS now');const now=databaseTimeEpoch(r?.now);if(!Number.isFinite(now))throw fault();return now;}
async function stored(tx:PoolConnection,row:any):Promise<Stored>{
 const grants=await rows(tx,'SELECT * FROM order_notification_authorizations WHERE merchant_id=? AND notification_id=? FOR SHARE',[row.merchant_id,row.id]);if(grants.length!==1)throw fault();const grant=grants[0],contract=orderNoticeAuthorizationContract.parse(json(grant.reviewed_contract));
 if(grant.contract_digest!==orderNoticeAuthorityDigest(contract)||grant.merchant_id!==contract.merchantId||grant.order_id!==contract.orderId||grant.actor_id!==contract.actorId||grant.request_key!==contract.requestKey||grant.event_key!==contract.eventKey
  ||row.merchant_id!==contract.merchantId||row.order_id!==contract.orderId||row.event_key!==contract.eventKey||row.status!==contract.status||row.customer_phone!==contract.recipient||row.message!==contract.message
  ||contract.eventKey!==createHash('sha256').update(`order-status:v1\0${contract.merchantId}\0${contract.orderId}\0${contract.status}`,'utf8').digest('hex'))throw fault();
 const [receipt]=await rows(tx,'SELECT actor_id,order_id,request_id,input_hash,result FROM order_status_receipts WHERE merchant_id=? AND id=? FOR SHARE',[contract.merchantId,grant.receipt_id]);
 const result=orderStatusReceipt.parse(json(receipt?.result));
 if(!receipt||receipt.actor_id!==contract.actorId||receipt.order_id!==contract.orderId||receipt.request_id!==contract.requestKey||receipt.input_hash!==contract.inputHash||result.merchantId!==contract.merchantId||result.actorId!==contract.actorId||result.orderId!==contract.orderId||result.requestId!==contract.requestKey||result.status!==contract.status||!result.notificationQueued)throw fault();
 const order=await rows(tx,'SELECT id FROM orders WHERE merchantId=? AND id=? FOR SHARE',[contract.merchantId,contract.orderId]);if(order.length!==1)throw fault();
 return {row,grant,contract};
}
async function currentAuthority(tx:PoolConnection,merchant:any,s:Stored){
 const c=s.contract;if(merchant.status!=='active'||merchant.userId!==c.ownerId)throw fault();
 const users=await rows(tx,'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE',[c.actorId,c.ownerId]);
 if(users.find(r=>r.id===c.actorId)?.account_status!=='active'||users.find(r=>r.id===c.ownerId)?.account_status!=='active')throw fault();
 const members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[c.merchantId,c.actorId]);
 const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchant.userId===c.actorId?'owner':null;
 if(!role||!hasPermission(role as MerchantRole,'orders.manage')||await readOrderNoticeOrderDigest(tx,c.merchantId,c.orderId)!==c.orderDigest)throw fault();
 const channel=await readOrderNoticeChannel(tx,c.merchantId);if(channel.instanceId!==c.instanceId||channel.provider!==c.provider||channel.channelDigest!==c.channelDigest)throw fault();
}
function transport(s:Stored):SendMerchantWhatsAppInput{return {merchantId:s.contract.merchantId,instanceRecordId:s.contract.instanceId,idempotencyKey:key(s.contract.merchantId,s.contract.eventKey),to:s.contract.recipient,kind:'text',text:s.contract.message,retryFailed:true,orderNoticeGuard:{notificationId:s.row.id,authorizationId:s.grant.id,contractDigest:s.grant.contract_digest,claimToken:s.row.claim_token}};}
export function validOrderNoticeTransport(input:SendMerchantWhatsAppInput){
 const guard=guardSchema.safeParse(input.orderNoticeGuard);
 return guard.success&&id.safeParse(input.merchantId).success&&id.safeParse(input.instanceRecordId).success&&new RegExp(`^order-status:${input.merchantId}:[a-f0-9]{64}$`).test(input.idempotencyKey)
  &&input.kind==='text'&&typeof input.text==='string'&&!!input.text.trim()&&input.text.length<=4096&&!input.text.includes('\0')&&/^\+?[0-9]{8,15}$/.test(input.to)
  &&input.messageId==null&&input.mediaUrl==null&&input.fileName==null&&input.template==null&&[true,false,undefined].includes(input.retryFailed)
  &&!Object.keys(input).some(k=>k.endsWith('Guard')&&k!=='orderNoticeGuard'&&input[k as keyof typeof input]!=null);
}
export function sameOrderNoticeRequest(input:SendMerchantWhatsAppInput,prior:any,lease=false){
 const g=guardSchema.safeParse(prior?.orderNoticeGuard),current=input.orderNoticeGuard;
 return validOrderNoticeTransport(input)&&g.success&&!!current&&prior?.kind==='text'&&prior.to===input.to&&prior.text===input.text&&prior.mediaUrl==null&&prior.fileName==null&&prior.template==null
  &&g.data.notificationId===current.notificationId&&g.data.authorizationId===current.authorizationId&&g.data.contractDigest===current.contractDigest&&(!lease||g.data.claimToken===current.claimToken)
  &&!Object.keys(prior).some(k=>k.endsWith('Guard')&&k!=='orderNoticeGuard'&&prior[k]!=null);
}
async function delivery(tx:PoolConnection,s:Stored){const found=await rows(tx,'SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE',[s.contract.merchantId,key(s.contract.merchantId,s.contract.eventKey)]);if(found.length>1)throw fault();return found[0]??null;}
/** Evidence is historical: current revocation prevents sends, not recognition of an already accepted message. */
function matchingDelivery(s:Stored,d:any,now:number){
 if(!d)return false;let request:any;try{request=json(d.request_json);}catch{return false;}
 const created=databaseTimeEpoch(d.created_at),updated=databaseTimeEpoch(d.status_updated_at),noticeCreated=databaseTimeEpoch(s.row.created_at);
 if(d.merchant_id!==s.contract.merchantId||d.instance_id!==s.contract.instanceId||d.provider!==s.contract.provider||d.direction!=='outgoing'||d.message_id!==null||!sameOrderNoticeRequest(transport({...s,row:{...s.row,claim_token:request?.orderNoticeGuard?.claimToken}}),request)
  ||!Number.isFinite(created)||!Number.isFinite(updated)||!Number.isFinite(noticeCreated)||created<noticeCreated||updated<created||updated>now)return false;
 return true;
}
function evidence(s:Stored,d:any,now:number):'missing'|'accepted'|'rejected'|'unknown'{
 if(!d)return 'missing';return matchingDelivery(s,d,now)?campaignDeliveryEvidence(d):'unknown';
}
function ownsLease(s:Stored,input:SendMerchantWhatsAppInput,now:number){const age=now-databaseTimeEpoch(s.row.claimed_at);return validOrderNoticeTransport(input)&&s.row.delivery_status==='processing'&&s.row.claim_token===input.orderNoticeGuard!.claimToken&&Number.isFinite(age)&&age>=0&&age<ORDER_NOTICE_LEASE_MS&&sameOrderNoticeRequest(input,transport(s),true)&&input.instanceRecordId===s.contract.instanceId&&input.idempotencyKey===key(s.contract.merchantId,s.contract.eventKey);}
async function updateState(tx:PoolConnection,row:any,state:'sent'|'manual_review'|'failed',error:string|null){
 const attempts=Number.isSafeInteger(row.attempts)&&row.attempts>=0?row.attempts:ORDER_NOTICE_MAX_ATTEMPTS,delay=Math.min(3600,30*(2**Math.max(0,attempts-1)));
 const [result]=await tx.execute<any>(`UPDATE order_notifications SET delivery_status=?,sent=IF(?='sent',1,sent),sent_at=IF(?='sent',COALESCE(sent_at,UTC_TIMESTAMP(3)),sent_at),error=?,available_at=IF(?='failed',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND),available_at)
  WHERE merchant_id=? AND id=? AND delivery_status=? AND claim_token<=>?`,[state,state,state,error,state,delay,row.merchant_id,row.id,row.delivery_status,row.claim_token]);if(result.affectedRows!==1)throw fault();
}
async function settle(tx:PoolConnection,merchant:any,s:Stored){
 const d=await delivery(tx,s),proof=evidence(s,d,await clock(tx));
 if(proof==='accepted'){await updateState(tx,s.row,'sent',null);return;}
 if((proof==='missing'||proof==='rejected')&&Number.isSafeInteger(s.row.attempts)&&s.row.attempts<ORDER_NOTICE_MAX_ATTEMPTS){
  try{await currentAuthority(tx,merchant,s);}catch{await updateState(tx,s.row,'manual_review','notification_authority_changed');return;}
  await updateState(tx,s.row,'failed',proof==='missing'?'safe_pre_dispatch_retry':'provider_rejected');return;
 }
 await updateState(tx,s.row,'manual_review',s.row.attempts>=ORDER_NOTICE_MAX_ATTEMPTS?'retry_exhausted':'ambiguous_provider_outcome');
}
export async function claimReviewedOrderNotice(merchantId:number,noticeId:number){
 await ensureOrderNoticeDispatchSchema();return transaction(merchantId,async(tx,merchant)=>{
  const row=await notice(tx,merchantId,noticeId);if(!row||!['pending','failed'].includes(row.delivery_status))return null;
  const available=databaseTimeEpoch(row.available_at);if(!Number.isFinite(available)){await updateState(tx,row,'manual_review','notification_time_invalid');return null;}if(available>await clock(tx))return null;
  if(!Number.isSafeInteger(row.attempts)||row.attempts<0||row.attempts>=ORDER_NOTICE_MAX_ATTEMPTS){await updateState(tx,row,'manual_review','retry_exhausted');return null;}
  let s:Stored;try{s=await stored(tx,row);}catch{await updateState(tx,row,'manual_review','notification_authority_changed');return null;}
  const proof=evidence(s,await delivery(tx,s),await clock(tx));if(proof==='accepted'){await updateState(tx,row,'sent',null);return null;}if(proof==='unknown'){await updateState(tx,row,'manual_review','ambiguous_provider_outcome');return null;}
  try{await currentAuthority(tx,merchant,s);}catch{await updateState(tx,row,'manual_review','notification_authority_changed');return null;}
  const token=randomUUID();const [updated]=await tx.execute<any>("UPDATE order_notifications SET delivery_status='processing',attempts=attempts+1,claim_token=?,claimed_at=UTC_TIMESTAMP(3),error=NULL WHERE merchant_id=? AND id=? AND delivery_status=? AND attempts=?",[token,merchantId,noticeId,row.delivery_status,row.attempts]);if(updated.affectedRows!==1)throw fault();
  return transport({...s,row:{...row,claim_token:token,attempts:row.attempts+1,delivery_status:'processing'}});
 });
}
export async function reconcileOrderNoticeClaim(input:SendMerchantWhatsAppInput){
 if(!validOrderNoticeTransport(input))throw fault();return transaction(input.merchantId,async(tx,merchant)=>{const row=await notice(tx,input.merchantId,input.orderNoticeGuard!.notificationId);if(!row||row.delivery_status!=='processing'||row.claim_token!==input.orderNoticeGuard!.claimToken)return;
  let s:Stored;try{s=await stored(tx,row);}catch{await updateState(tx,row,'manual_review','notification_authority_changed');return;}await settle(tx,merchant,s);
 });
}
export async function recoverReviewedOrderNoticeLeases(){
 await ensureOrderNoticeDispatchSchema();const pool=await getPool();if(!pool)throw new OrderNoticeAuthorityError('unavailable');
 const [expired]=await pool.execute<any[]>("SELECT id,merchant_id FROM order_notifications WHERE delivery_status='processing' AND (claimed_at IS NULL OR claimed_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE)) ORDER BY id LIMIT 25");
 for(const candidate of expired)await transaction(candidate.merchant_id,async(tx,merchant)=>{const row=await notice(tx,candidate.merchant_id,candidate.id);if(!row||row.delivery_status!=='processing'||databaseTimeEpoch(row.claimed_at)>await clock(tx)-ORDER_NOTICE_LEASE_MS)return;
  let s:Stored;try{s=await stored(tx,row);}catch{await updateState(tx,row,'manual_review','notification_authority_changed');return;}await settle(tx,merchant,s);
 });
}

/** A duplicate never becomes acceptance merely because an unrelated ledger row says sent. */
export async function reserveOrderNoticeDelivery(input:SendMerchantWhatsAppInput){
 if(!validOrderNoticeTransport(input))throw fault();return transaction(input.merchantId,async(tx,merchant)=>{
  const row=await notice(tx,input.merchantId,input.orderNoticeGuard!.notificationId);if(!row)throw fault();const s=await stored(tx,row),d=await delivery(tx,s),now=await clock(tx);
  if(!sameOrderNoticeRequest(input,transport(s))||input.instanceRecordId!==s.contract.instanceId||input.idempotencyKey!==key(input.merchantId,s.contract.eventKey))throw fault();
  if(!d){
   // Reserve under the same parent/claim lock. A stale worker must not occupy a newer claim's key.
   if(!ownsLease(s,input,now))throw fault();await currentAuthority(tx,merchant,s);
   const request=JSON.stringify({to:input.to,kind:input.kind,text:input.text,orderNoticeGuard:input.orderNoticeGuard});
   const [result]=await tx.execute<any>("INSERT INTO whatsapp_message_deliveries (merchant_id,instance_id,provider,idempotency_key,direction,status,request_json) VALUES (?,?,?,?,'outgoing','queued',?)",[input.merchantId,s.contract.instanceId,s.contract.provider,input.idempotencyKey,request]);
   if(result.affectedRows!==1)throw fault();return {reserved:true as const};
  }
  const proof=evidence(s,d,now);if(proof==='accepted')return {reserved:false as const,result:{accepted:true,duplicate:true,status:d.status,providerMessageId:d.provider_message_id as string}};
  if(proof==='rejected'&&input.retryFailed&&ownsLease(s,input,now)){
   await currentAuthority(tx,merchant,s);const request=JSON.stringify({to:input.to,kind:input.kind,text:input.text,orderNoticeGuard:input.orderNoticeGuard});
   const [result]=await tx.execute<any>("UPDATE whatsapp_message_deliveries SET status='queued',error_code=NULL,error_details=NULL,status_updated_at=UTC_TIMESTAMP(),request_json=? WHERE merchant_id=? AND id=? AND status='failed' AND provider_message_id IS NULL",[request,input.merchantId,d.id]);if(result.affectedRows!==1)throw fault();return {reserved:true as const};
  }
  return {reserved:false as const,result:{accepted:false,duplicate:true,status:'queued' as const,errorCode:'order_notice_outcome_unverified'}};
 });
}
export async function withOrderNoticeTransportAuthority<T extends {accepted:boolean;status:string;providerMessageId?:string;errorCode?:string}>(input:SendMerchantWhatsAppInput,config:WhatsAppProviderConfig,instanceId:number,dispatch:(tx:PoolConnection)=>Promise<T>){
 if(!validOrderNoticeTransport(input))throw fault();await ensureOrderNoticeDispatchSchema();
 return transaction(input.merchantId,async(tx,merchant)=>{
  const row=await notice(tx,input.merchantId,input.orderNoticeGuard!.notificationId);if(!row)throw fault();const s=await stored(tx,row);
  if(!ownsLease(s,input,await clock(tx)))throw fault();await currentAuthority(tx,merchant,s);
  const [instance]=await rows(tx,'SELECT * FROM whatsapp_instances WHERE merchant_id=? AND id=? FOR SHARE',[input.merchantId,instanceId]);
  if(!instance||instanceId!==s.contract.instanceId||instance.provider!==config.provider||String(instance.instance_id)!==config.instanceId||decryptSecret(instance.token)!==config.token||(instance.api_url??null)!==(config.apiUrl??null)||(instance.phone_number_id??null)!==(config.phoneNumberId??null)||(instance.provider_account_id??null)!==(config.providerAccountId??null))throw fault();
  const d=await delivery(tx,s);if(!d||d.status!=='queued'||d.provider_message_id!==null||!matchingDelivery(s,d,await clock(tx))||!sameOrderNoticeRequest(input,json(d.request_json),true))throw fault();
  // Locks may have waited; an expired claimant is stopped immediately before external I/O.
  if(!ownsLease(s,input,await clock(tx)))throw fault();const result=await dispatch(tx);
  const proof=evidence(s,await delivery(tx,s),await clock(tx));if(result.accepted&&proof!=='accepted')throw fault();await settle(tx,merchant,s);return result;
 });
}
