import type {PoolConnection} from 'mysql2/promise';
import type {z} from 'zod';
import {wooOrderNotificationRequest,normalizeWooRecipient} from '../../shared/woocommerce-order-action';
import {privacyHashExact} from '../accounts/privacy-hash';
import {decryptSecret} from '../security/secrets';
import {wooRows} from './woocommerce-workspace';
import {readWooOrderDefinition} from './woocommerce-data-workspace';
import {reviewWooSyncConnection} from './woocommerce-sync-request';
import {WooOperationFault,reserveWooOperation,startWooOperation,guardWooOperation,completeWooOperation,stopWooOperation,wooOperationTransaction,type WooOperationLease} from './woocommerce-operation';
import {withWooCommerceMerchantLock} from './woocommerce-lock';
import {sendMerchantWhatsApp} from '../channels/whatsapp/service';
import type {SendMerchantWhatsAppInput,WhatsAppProviderConfig} from '../channels/whatsapp/types';

type Command=z.infer<typeof wooOrderNotificationRequest>;
export type WooOrderNotificationGuard={lease:WooOperationLease;requestId:string;revision:string;orderId:number;orderRevision:string};
const key=(merchantId:number,requestId:string)=>`woo-reviewed-notice:${merchantId}:${requestId}`;
function payloadDigest(input:Command){return privacyHashExact(JSON.stringify({orderId:input.orderId,orderRevision:input.orderRevision,recipient:input.recipient,message:input.message}));}
function commandFromTransport(input:SendMerchantWhatsAppInput){const g=input.wooOrderGuard;return wooOrderNotificationRequest.parse({requestId:g?.requestId,revision:g?.revision,orderId:g?.orderId,orderRevision:g?.orderRevision,recipient:input.to,message:input.text});}
export function validWooOrderNotificationTransport(input:SendMerchantWhatsAppInput){
 try{
  const command=commandFromTransport(input),g=input.wooOrderGuard;
  return !!g&&[g.lease.id,g.lease.actorId,g.lease.merchantId].every(id=>Number.isSafeInteger(id)&&id>0)&&g.lease.merchantId===input.merchantId&&g.lease.kind==='order_notify'&&/^[0-9a-f-]{36}$/.test(g.lease.token)&&input.idempotencyKey===key(input.merchantId,command.requestId)&&input.kind==='text'&&input.text===command.message&&!input.mediaUrl&&!input.fileName&&!input.template&&!input.messageId&&!input.retryFailed&&!Object.keys(input).some(k=>k.endsWith('Guard')&&k!=='wooOrderGuard'&&input[k as keyof typeof input]!=null);
 }catch{return false;}
}
async function review(tx:PoolConnection,merchantId:number,input:Command){
 await reviewWooSyncConnection(tx,merchantId,input.revision);
 const order=await readWooOrderDefinition(tx,merchantId,input.orderId,1,true);
 if(!order||!order.providerId||order.revision!==input.orderRevision||normalizeWooRecipient(order.customerPhone)!==input.recipient)throw new WooOperationFault('changed');
 return order;
}
/** Called by the channel after reserving its durable delivery, immediately around provider dispatch.
 * Authority, recipient, channel and operation evidence stay locked until both receipts commit. */
export async function withWooOrderNotificationAuthority<T extends {accepted:boolean;duplicate:boolean;providerMessageId?:string}>(input:SendMerchantWhatsAppInput,config:WhatsAppProviderConfig,instanceId:number,dispatch:(tx:PoolConnection)=>Promise<T>){
 if(!validWooOrderNotificationTransport(input))throw new WooOperationFault('changed');
 const command=commandFromTransport(input),guard=input.wooOrderGuard!;
 return wooOperationTransaction(async tx=>{
  await guardWooOperation(tx,guard.lease);await review(tx,input.merchantId,command);
  const operations=await wooRows(tx,'SELECT request_id,review_revision,payload_digest,started_at FROM woocommerce_operations WHERE id=? FOR UPDATE',[guard.lease.id]);
  const operation=operations[0];if(operations.length!==1||operation.request_id!==command.requestId||operation.review_revision!==command.revision||operation.payload_digest!==payloadDigest(command)||!operation.started_at)throw new WooOperationFault('changed');
  const instances=await wooRows(tx,'SELECT * FROM whatsapp_instances WHERE id=? AND merchant_id=? FOR SHARE',[instanceId,input.merchantId]),instance=instances[0];
  if(instances.length!==1||instance.status!=='active'||Number(instance.is_primary)!==1||instance.provider!==config.provider||String(instance.instance_id)!==config.instanceId||decryptSecret(instance.token)!==config.token||(instance.api_url??null)!==(config.apiUrl??null)||(instance.phone_number_id??null)!==(config.phoneNumberId??null)||(instance.provider_account_id??null)!==(config.providerAccountId??null))throw new WooOperationFault('changed');
  const deliveries=await wooRows(tx,'SELECT status,provider_message_id,request_json,instance_id,provider FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE',[input.merchantId,input.idempotencyKey]),delivery=deliveries[0];
  const request=typeof delivery?.request_json==='string'?JSON.parse(delivery.request_json):delivery?.request_json;
  const sameGuard=request?.wooOrderGuard&&(['requestId','revision','orderId','orderRevision'] as const).every(k=>request.wooOrderGuard[k]===guard[k])&&(['id','actorId','merchantId','token','kind'] as const).every(k=>request.wooOrderGuard.lease?.[k]===guard.lease[k]);
  if(deliveries.length!==1||delivery.status!=='queued'||delivery.provider_message_id||Number(delivery.instance_id)!==instanceId||delivery.provider!==config.provider||request?.to!==input.to||request?.text!==input.text||request?.kind!=='text'||!sameGuard)throw new WooOperationFault('changed');
  // Database reads may have waited. Renew immediately before the bounded channel call.
  await guardWooOperation(tx,guard.lease);
  const result=await dispatch(tx);
  if(result.accepted&&result.providerMessageId)await completeWooOperation(tx,guard.lease,{type:'notification',orderId:command.orderId,accepted:true,duplicate:result.duplicate});
  return result;
 });
}
const defaultLaunch=(run:()=>Promise<void>)=>{void run().catch(()=>console.error('[WooCommerce] reviewed notification outcome unavailable'));};
export async function requestReviewedWooNotification(actorId:number,merchantId:number,raw:unknown,launch=defaultLaunch){
 const input=wooOrderNotificationRequest.parse(raw);
 const admitted=await reserveWooOperation(actorId,merchantId,{requestId:input.requestId,revision:input.revision,kind:'order_notify',payloadDigest:payloadDigest(input)},tx=>review(tx,merchantId,input).then(()=>{}));
 if(!admitted.lease)return admitted.receipt;
 const lease=admitted.lease;
 const run=async()=>{
  try{
   await withWooCommerceMerchantLock(merchantId,async()=>{
    await startWooOperation(lease,tx=>review(tx,merchantId,input).then(()=>{}));
    const sent=await sendMerchantWhatsApp({merchantId,idempotencyKey:key(merchantId,input.requestId),to:input.recipient,kind:'text',text:input.message,retryFailed:false,wooOrderGuard:{lease,requestId:input.requestId,revision:input.revision,orderId:input.orderId,orderRevision:input.orderRevision}});
    if(!sent.accepted||!sent.providerMessageId)throw new WooOperationFault('changed');
   });
  }catch{
   // The durable result, rather than an untrusted channel error, is what the dashboard restores.
  }finally{
   // A successful channel transaction already committed the operation. Never downgrade it.
   await stopWooOperation(lease);
  }
 };
 try{launch(run);}catch{await stopWooOperation(lease);throw new WooOperationFault('unavailable');}
 return admitted.receipt;
}
