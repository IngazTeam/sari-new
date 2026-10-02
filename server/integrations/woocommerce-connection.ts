import {randomBytes} from 'node:crypto';
import {drizzle} from 'drizzle-orm/mysql2';
import type {PoolConnection} from 'mysql2/promise';
import type {z} from 'zod';
import {wooConnectionCommand} from '../../shared/woocommerce-connection';
import {privacyHashExact} from '../accounts/privacy-hash';
import {decryptSecret} from '../security/secrets';
import {WooCommerceClient,WooCommerceApiError,canonicalWooStoreUrl} from '../woocommerce';
import {writeVerifiedWooCommerceSettings,clearWooCommerceIntegration,type WooCommerceWebhookRegistrationInput} from '../db';
import {wooConnectionDefinition,wooRows} from './woocommerce-workspace';
import {WooOperationFault,reserveWooOperation,startWooOperation,guardWooOperation,completeWooOperation,stopWooOperation,wooOperationTransaction} from './woocommerce-operation';
import {withWooCommerceMerchantLock} from './woocommerce-lock';
import {assertWooPlatformAdmission} from './woocommerce-platform-admission';
import {registerWooCommerceWebhooks,verifyWooCommerceWebhookRegistrations} from './woocommerce-webhook-registration';
import {WOOCOMMERCE_ENDPOINT_PATTERN,WOOCOMMERCE_WEBHOOK_TOPICS} from '../webhooks/woocommerce-security';
import {wooSyncTimestamp} from './woocommerce-sync';

type Command=z.infer<typeof wooConnectionCommand>;
function replacingStore(row:any,input:Command){
 if(!row||input.action!=='connect')return false;
 try{return canonicalWooStoreUrl(row.storeUrl)!==input.storeUrl;}catch{return true;}
}
async function reviewConnection(tx:PoolConnection,merchantId:number,input:Command){
 const current=await wooConnectionDefinition(tx,merchantId,true);
 if(current.revision!==input.revision)throw new WooOperationFault('changed');
 if(input.action==='connect'){
  const replacing=replacingStore(current.row,input);
  if(replacing&&(!input.replaceLocalCopies||!input.consumerKey||!input.consumerSecret)||!input.consumerKey&&Number(current.row?.hasConsumerKey)!==1||!input.consumerSecret&&Number(current.row?.hasConsumerSecret)!==1)throw new WooOperationFault('changed');
 }else if(!current.row||input.action==='verify'&&(Number(current.row.active)!==1||Number(current.row.hasConsumerKey)!==1||Number(current.row.hasConsumerSecret)!==1))throw new WooOperationFault('changed');
 if(input.action!=='disconnect'){
  try{await assertWooPlatformAdmission(drizzle({client:tx}),merchantId);}catch(error){if((error as {code?:string})?.code==='CONFLICT')throw new WooOperationFault('changed');throw error;}
 }
 return current;
}
async function savedCredentials(tx:PoolConnection,merchantId:number){
 const rows=await wooRows(tx,'SELECT store_url,consumer_key,consumer_secret FROM woocommerce_settings WHERE merchant_id=? FOR UPDATE',[merchantId]);
 if(rows.length!==1)throw new WooOperationFault('changed');
 return {storeUrl:rows[0].store_url,consumerKey:rows[0].consumer_key,consumerSecret:rows[0].consumer_secret};
}
const defaultLaunch=(run:()=>Promise<void>)=>{void run().catch(()=>console.error('[WooCommerce] reviewed connection outcome unavailable'));};

/** Credentials stay in the current invocation; durable admission stores only a keyed digest. */
export async function requestReviewedWooConnection(actorId:number,merchantId:number,raw:unknown,launch=defaultLaunch){
 const parsed=wooConnectionCommand.parse(raw),input:Command=parsed.action==='connect'?{...parsed,storeUrl:canonicalWooStoreUrl(parsed.storeUrl)}:parsed;
 const review=(tx:PoolConnection)=>reviewConnection(tx,merchantId,input);
 const {requestId,revision,...payload}=input;
 const admitted=await reserveWooOperation(actorId,merchantId,{requestId,revision,kind:input.action,payloadDigest:privacyHashExact(JSON.stringify(payload))},tx=>review(tx).then(()=>{}));
 if(!admitted.lease)return admitted.receipt;
 const lease=admitted.lease;
 const check=async(tx:PoolConnection)=>{await guardWooOperation(tx,lease);return review(tx);};
 const checkpoint=()=>wooOperationTransaction(async tx=>{await check(tx);});
 const run=async()=>{
  try{
   await withWooCommerceMerchantLock(merchantId,async()=>{
    await startWooOperation(lease,tx=>review(tx).then(()=>{}));
    const current=await wooOperationTransaction(check);
    const readStoredCredentials=async()=>{
     const saved=await wooOperationTransaction(async tx=>{await check(tx);return savedCredentials(tx,merchantId);});
     try{return {storeUrl:saved.storeUrl,consumerKey:decryptSecret(saved.consumerKey),consumerSecret:decryptSecret(saved.consumerSecret)};}catch{return null;}
    };
    const readCredentials=async()=>{const saved=await readStoredCredentials();if(!saved)throw new WooOperationFault('changed');return saved;};
    let cleanup:'not_needed'|'confirmed'|'unconfirmed'='not_needed';
    const cleanPrevious=async()=>{
     if(!current.registrations.length)return;
     cleanup='confirmed';
     try{
      const saved=await readStoredCredentials();
      if(!saved){cleanup='unconfirmed';return;}
      const client=new WooCommerceClient(saved,checkpoint);
      for(const registration of current.registrations){
       try{await client.deleteWebhook(registration.webhookId);}catch(error){
        if(error instanceof WooOperationFault)throw error;
        // An authenticated 404 confirms that this registration is already absent.
        if(!(error instanceof WooCommerceApiError&&error.code==='not_found'))cleanup='unconfirmed';
       }
      }
     }catch(error){if(error instanceof WooOperationFault)throw error;cleanup='unconfirmed';}
    };
    if(input.action==='disconnect'){
     await cleanPrevious();
     await wooOperationTransaction(async tx=>{
      await check(tx);await clearWooCommerceIntegration(drizzle({client:tx}),merchantId);
      const after=await wooConnectionDefinition(tx,merchantId,true);
      await completeWooOperation(tx,lease,{type:'connection',revision:after.revision,configured:false,remoteCleanup:cleanup,verification:'not_checked',localCopies:'cleared'});
     });
     return;
    }
    if(input.action==='verify'){
     const client=new WooCommerceClient(await readCredentials(),checkpoint),info=await client.testConnection();
     const registrations=current.registrations as WooCommerceWebhookRegistrationInput[];
     const identityReady=WOOCOMMERCE_ENDPOINT_PATTERN.test(current.row.endpoint??'')&&Number(current.row.hasWebhookSecret)===1&&registrations.length===6&&registrations.every(r=>WOOCOMMERCE_WEBHOOK_TOPICS.includes(r.topic)&&/^[1-9][0-9]{0,19}$/.test(r.webhookId))&&new Set(registrations.map(r=>r.topic)).size===6&&new Set(registrations.map(r=>r.webhookId)).size===6;
     const webhookReady=identityReady&&await verifyWooCommerceWebhookRegistrations({client,endpointId:current.row.endpoint,registrations});
     await wooOperationTransaction(async tx=>{
      await check(tx);
      await tx.execute("UPDATE woocommerce_settings SET connectionStatus='connected',last_test_at=UTC_TIMESTAMP(3),store_version=COALESCE(?,store_version) WHERE merchant_id=?",[info.version??null,merchantId]);
      const after=await wooConnectionDefinition(tx,merchantId,true);
      await completeWooOperation(tx,lease,{type:'connection',revision:after.revision,configured:true,remoteCleanup:'not_needed',verification:webhookReady?'api_and_webhooks':'api',localCopies:'retained'});
     });
     return;
    }
    const old=input.consumerKey&&input.consumerSecret?null:await readCredentials();
    const credentials={storeUrl:input.storeUrl,consumerKey:input.consumerKey??old!.consumerKey,consumerSecret:input.consumerSecret??old!.consumerSecret};
    const client=new WooCommerceClient(credentials,checkpoint),info=await client.testConnection();
    const endpointId=randomBytes(32).toString('base64url'),signingSecret=randomBytes(48).toString('base64url');
    const registrations=await registerWooCommerceWebhooks({client,endpointId,signingSecret});
    await cleanPrevious();
    const replacing=replacingStore(current.row,input);
    await wooOperationTransaction(async tx=>{
     await check(tx);
     await writeVerifiedWooCommerceSettings(drizzle({client:tx}),{
      merchantId,...credentials,webhookEndpointId:endpointId,webhookSigningSecret:signingSecret,isActive:1,connectionStatus:'connected',lastTestAt:wooSyncTimestamp(),
      autoSyncProducts:0,autoSyncOrders:0,autoSyncCustomers:0,syncInterval:60,
      lastSyncAt:replacing?null:current.row?.lastSyncAt?wooSyncTimestamp(new Date(current.row.lastSyncAt)):null,
      storeVersion:info.version??(!replacing?current.row?.storeVersion:null)??null,
      storeName:info.name??(!replacing?current.row?.storeName:null)??null,storeCurrency:info.currency??(!replacing?current.row?.storeCurrency:null)??null,
     },registrations,{replaceLocalCopies:replacing});
     const after=await wooConnectionDefinition(tx,merchantId,true);
     await completeWooOperation(tx,lease,{type:'connection',revision:after.revision,configured:true,remoteCleanup:cleanup,verification:'api_and_webhooks',localCopies:replacing?'cleared':'retained'});
    });
   });
  }catch{
   // A final commit may have succeeded. Never delete newly registered hooks or undo local data on an ambiguous acknowledgement.
   await stopWooOperation(lease);
  }
 };
 try{launch(run);}catch{await stopWooOperation(lease);throw new WooOperationFault('unavailable');}
 return admitted.receipt;
}
