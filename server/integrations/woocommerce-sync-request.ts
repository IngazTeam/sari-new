import {createHash} from 'node:crypto';
import {drizzle} from 'drizzle-orm/mysql2';
import type {PoolConnection} from 'mysql2/promise';
import {wooSyncRequest} from '../../shared/woocommerce-sync-request';
import {wooReconciliationRequest} from '../../shared/woocommerce-incidents';
import type {z} from 'zod';
import {reviewWooIncidents,completeWooIncidentReview} from './woocommerce-incidents';
import {decryptSecret} from '../security/secrets';
import {WooCommerceClient} from '../woocommerce';
import {writeWooCommerceProductsSnapshot,writeWooCommerceOrdersSnapshot} from '../db';
import {wooConnectionDefinition,wooRows,wooCount} from './woocommerce-workspace';
import {WooOperationFault,reserveWooOperation,startWooOperation,guardWooOperation,completeWooOperation,stopWooOperation,wooOperationTransaction} from './woocommerce-operation';
import {withWooCommerceMerchantLock} from './woocommerce-lock';
import {fetchWooCommerceProducts,fetchWooCommerceOrders,normalizeWooCommerceProduct,normalizeWooCommerceOrder,wooSyncTimestamp} from './woocommerce-sync';

/** The revision is checked under the merchant lock, including before decrypting credentials. */
export async function reviewWooSyncConnection(tx:PoolConnection,merchantId:number,revision:string){
 const current=await wooConnectionDefinition(tx,merchantId,true);
 if(current.revision!==revision)throw new WooOperationFault('changed');
 if(!current.row||Number(current.row.active)!==1||current.row.connectionStatus!=='connected'||Number(current.row.hasConsumerKey)!==1||Number(current.row.hasConsumerSecret)!==1)throw new WooOperationFault('changed');
 return current;
}

/** A committed admission launches once. Reloading or repeating the request only reads evidence. */
const defaultLaunch=(run:()=>Promise<void>)=>{void run().catch(()=>console.error('[WooCommerce] reviewed sync outcome unavailable'));};
export function requestReviewedWooSync(actorId:number,merchantId:number,raw:unknown,launch=defaultLaunch){return requestWooSnapshot(actorId,merchantId,wooSyncRequest.parse(raw),launch);}
export function requestReviewedWooReconciliation(actorId:number,merchantId:number,raw:unknown,launch=defaultLaunch){return requestWooSnapshot(actorId,merchantId,{...wooReconciliationRequest.parse(raw),resource:'reconcile'},launch);}
async function requestWooSnapshot(actorId:number,merchantId:number,input:z.infer<typeof wooSyncRequest>|(z.infer<typeof wooReconciliationRequest>&{resource:'reconcile'}),launch:typeof defaultLaunch){
 const kind=input.resource==='reconcile'?'reconcile':input.resource==='products'?'sync_products':'sync_orders';
 const review=async(tx:PoolConnection)=>{await reviewWooSyncConnection(tx,merchantId,input.revision);if(input.resource==='reconcile')await reviewWooIncidents(tx,merchantId,input.incidents);};
 const payload={resource:input.resource,...(input.resource==='reconcile'?{incidents:input.incidents}:{})};
 const admitted=await reserveWooOperation(actorId,merchantId,{requestId:input.requestId,revision:input.revision,kind,payloadDigest:createHash('sha256').update(JSON.stringify(payload)).digest('hex')},review);
 if(!admitted.lease)return admitted.receipt;
 const lease=admitted.lease;
 const check=async(tx:PoolConnection)=>{await guardWooOperation(tx,lease);await review(tx);};
 const checkpoint=()=>wooOperationTransaction(check);
 let logId:number|undefined;
 const interrupted=()=>stopWooOperation(lease,async tx=>{
  if(logId!==undefined)await tx.execute("UPDATE woocommerce_sync_logs SET status='failed',completed_at=UTC_TIMESTAMP(3),duration=GREATEST(0,TIMESTAMPDIFF(SECOND,started_at,UTC_TIMESTAMP(3))),error_message='WOO_REVIEWED_SYNC_INTERRUPTED' WHERE id=? AND merchant_id=? AND status='running'",[logId,merchantId]);
 });
 const run=async()=>{
  try{
   await withWooCommerceMerchantLock(merchantId,async()=>{
    // Starting and the running log are one transaction; no provider call happens before its acknowledgement.
    await startWooOperation(lease,async tx=>{
     await review(tx);
     const [saved]=await tx.execute<any>("INSERT INTO woocommerce_sync_logs(merchant_id,sync_type,direction,status,started_at) VALUES (?,?,'import','running',UTC_TIMESTAMP(3))",[merchantId,input.resource==='reconcile'?'manual':input.resource]);
     logId=wooCount(saved.insertId);
    });
    const credentials=await wooOperationTransaction(async tx=>{
     await check(tx);
     const rows=await wooRows(tx,'SELECT store_url,consumer_key,consumer_secret FROM woocommerce_settings WHERE merchant_id=? FOR UPDATE',[merchantId]);
     if(rows.length!==1)throw new WooOperationFault('changed');
     return {storeUrl:rows[0].store_url,consumerKey:decryptSecret(rows[0].consumer_key),consumerSecret:decryptSecret(rows[0].consumer_secret)};
    });
    // Every page checks the lease, account, membership and connection before DNS, before dispatch and after response.
    const client=new WooCommerceClient(credentials,checkpoint),observedAt=wooSyncTimestamp();
    const products=input.resource!=='orders'?(await fetchWooCommerceProducts(client)).map(row=>normalizeWooCommerceProduct(merchantId,row,observedAt)):null;
    const orders=input.resource!=='products'?(await fetchWooCommerceOrders(client)).map(row=>normalizeWooCommerceOrder(merchantId,row,observedAt)):null;
    await wooOperationTransaction(async tx=>{
     await check(tx);
     const writer=drizzle({client:tx});
     if(products)await writeWooCommerceProductsSnapshot(writer,merchantId,products,true);
     if(orders)await writeWooCommerceOrdersSnapshot(writer,merchantId,orders,true);
     const reconciled=input.resource==='reconcile'?await completeWooIncidentReview(tx,merchantId,input.incidents):0;
     const count=(products?.length??0)+(orders?.length??0);
     const [saved]=await tx.execute<any>("UPDATE woocommerce_sync_logs SET status='success',items_processed=?,items_success=?,items_failed=0,completed_at=UTC_TIMESTAMP(3),duration=GREATEST(0,TIMESTAMPDIFF(SECOND,started_at,UTC_TIMESTAMP(3))),error_message=NULL WHERE id=? AND merchant_id=? AND status='running'",[count,count,logId!,merchantId]);
     if(saved.affectedRows!==1)throw new WooOperationFault('changed');
     await tx.execute('UPDATE woocommerce_settings SET last_sync_at=UTC_TIMESTAMP(3) WHERE merchant_id=?',[merchantId]);
     await completeWooOperation(tx,lease,{type:'sync',products:products?.length??null,orders:orders?.length??null,reconciled});
    });
   });
  }catch{await interrupted();}
 };
 try{launch(run);}catch{await interrupted();throw new WooOperationFault('unavailable');}
 return admitted.receipt;
}
