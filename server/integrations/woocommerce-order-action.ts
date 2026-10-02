import {drizzle} from 'drizzle-orm/mysql2';
import type {PoolConnection} from 'mysql2/promise';
import {wooOrderActionLookup,wooOrderActionWorkspace,wooOrderStatusRequest,normalizeWooRecipient} from '../../shared/woocommerce-order-action';
import {wooSnapshot,wooConnectionDefinition,wooRows,wooStamp} from './woocommerce-workspace';
import {readWooOrderDefinition} from './woocommerce-data-workspace';
import {reviewWooSyncConnection} from './woocommerce-sync-request';
import {WooOperationFault,reserveWooOperation,startWooOperation,guardWooOperation,completeWooOperation,stopWooOperation,wooOperationTransaction} from './woocommerce-operation';
import {withWooCommerceMerchantLock} from './woocommerce-lock';
import {privacyHashExact} from '../accounts/privacy-hash';
import {decryptSecret} from '../security/secrets';
import {WooCommerceClient} from '../woocommerce';
import {normalizeWooCommerceOrder,wooSyncTimestamp} from './woocommerce-sync';
import {writeWooCommerceOrdersSnapshot} from '../db';

export async function readWooOrderActionWorkspace(actorId:number,merchantId:number,raw:unknown){
 const {orderId}=wooOrderActionLookup.parse(raw);
 return wooSnapshot(actorId,merchantId,async tx=>{
  const current=await wooConnectionDefinition(tx,merchantId),order=await readWooOrderDefinition(tx,merchantId,orderId);
  const configured=!!current.row&&Number(current.row.active)===1&&current.row.connectionStatus==='connected'&&Number(current.row.hasConsumerKey)===1&&Number(current.row.hasConsumerSecret)===1;
  const channels=await wooRows(tx,"SELECT id FROM whatsapp_instances WHERE merchant_id=? AND status='active' AND is_primary=1",[merchantId]),recipient=normalizeWooRecipient(order?.customerPhone),notificationChannelReady=channels.length===1;
  return wooOrderActionWorkspace.parse({actorId,merchantId,checkedAt:new Date().toISOString(),revision:current.revision,configured,order,canChangeStatus:Boolean(configured&&order?.providerId&&order.providerUpdatedAt&&order.state!=='unknown'),recipient,notificationChannelReady,canNotify:Boolean(configured&&order?.providerId&&recipient&&notificationChannelReady)});
 });
}
const defaultLaunch=(run:()=>Promise<void>)=>{void run().catch(()=>console.error('[WooCommerce] reviewed order outcome unavailable'));};
export async function requestReviewedWooOrderStatus(actorId:number,merchantId:number,raw:unknown,launch=defaultLaunch){
 const input=wooOrderStatusRequest.parse(raw);
 const review=async(tx:PoolConnection)=>{
  await reviewWooSyncConnection(tx,merchantId,input.revision);
  const order=await readWooOrderDefinition(tx,merchantId,input.orderId,1,true);
  if(!order||order.revision!==input.orderRevision||!order.providerId||!order.providerUpdatedAt||order.state==='unknown')throw new WooOperationFault('changed');
  return order;
 };
 const {requestId,revision,...payload}=input;
 const admitted=await reserveWooOperation(actorId,merchantId,{requestId,revision,kind:'order_status',payloadDigest:privacyHashExact(JSON.stringify(payload))},tx=>review(tx).then(()=>{}));
 if(!admitted.lease)return admitted.receipt;
 const lease=admitted.lease;
 const check=async(tx:PoolConnection)=>{await guardWooOperation(tx,lease);return review(tx);};
 const checkpoint=()=>wooOperationTransaction(async tx=>{await check(tx);});
 const run=async()=>{
  try{
   await withWooCommerceMerchantLock(merchantId,async()=>{
    await startWooOperation(lease,tx=>review(tx).then(()=>{}));
    const {order,credentials}=await wooOperationTransaction(async tx=>{
     const order=await check(tx),rows=await wooRows(tx,'SELECT store_url,consumer_key,consumer_secret FROM woocommerce_settings WHERE merchant_id=? FOR UPDATE',[merchantId]);
     if(rows.length!==1)throw new WooOperationFault('changed');
     return {order,credentials:{storeUrl:rows[0].store_url,consumerKey:decryptSecret(rows[0].consumer_key),consumerSecret:decryptSecret(rows[0].consumer_secret)}};
    });
    const client=new WooCommerceClient(credentials,checkpoint);
    // Refuse an already changed provider version before asking it to change status.
    const before=normalizeWooCommerceOrder(merchantId,await client.getOrder(order.providerId!),wooSyncTimestamp());
    if(before.status!==order.rawStatus||wooStamp(before.providerUpdatedAt)!==order.providerUpdatedAt||before.customerNote!==order.customerNote)throw new WooOperationFault('changed');
    const response=await client.updateOrder(order.providerId!,{status:input.status,...(input.note!==undefined?{customer_note:input.note}:{})});
    const normalized=normalizeWooCommerceOrder(merchantId,response,wooSyncTimestamp());
    const returnedAt=wooStamp(normalized.providerUpdatedAt);
    if(normalized.wooOrderId!==order.providerId||normalized.status!==input.status||!returnedAt||returnedAt<order.providerUpdatedAt!)throw new WooOperationFault('changed');
    await wooOperationTransaction(async tx=>{
     await check(tx);await writeWooCommerceOrdersSnapshot(drizzle({client:tx}),merchantId,[normalized],false);
     const saved=await readWooOrderDefinition(tx,merchantId,input.orderId,1,true);
     if(!saved||saved.providerId!==order.providerId||saved.rawStatus!==input.status||saved.providerUpdatedAt!==returnedAt)throw new WooOperationFault('changed');
     await completeWooOperation(tx,lease,{type:'order',orderId:saved.id,status:saved.rawStatus});
    });
   });
  }catch{await stopWooOperation(lease);}
 };
 try{launch(run);}catch{await stopWooOperation(lease);throw new WooOperationFault('unavailable');}
 return admitted.receipt;
}
