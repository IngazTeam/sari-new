import {randomBytes} from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import type {z} from 'zod';
import {calendlyConnectionCommand,calendlyConnectionPreviewInput,calendlyConnectionPreviewSchema} from '../../shared/calendly-connection';
import {privacyHashExact} from '../accounts/privacy-hash';
import {encryptSecret,decryptSecret} from '../security/secrets';
import {calendlyConnectionDefinition,calendlyRows,calendlyCount} from './calendly-workspace';
import {calendlyOperationTransaction,calendlyOperationWriter,CalendlyOperationFault,reserveCalendlyOperation,startCalendlyOperation,guardCalendlyOperation,completeCalendlyOperation,stopCalendlyOperation} from './calendly-operation';
import {withCalendlyDashboardAuthority,CalendlyAuthorityError} from './calendly-dashboard-authority';
import {withCalendlyProviderCheckpoint,CalendlyProviderCheckpointError} from './calendly-provider-checkpoint';
import {withCalendlyConnectionLock} from './calendly-lock';
import {calendlyWebhookOrigin} from './calendly-origin';
import {calendlyResourceUri} from '../../shared/calendly-provider';
import {getCalendlyCurrentUser,createCalendlyWebhookSubscription,deleteCalendlyWebhookSubscription,CalendlyApiError} from './calendly-api';
type Command=z.infer<typeof calendlyConnectionCommand>;
const userName=(value:unknown)=>typeof value==='string'?value.slice(0,255):'Calendly';
/** Read-only provider check. The submitted command must name this reviewed account. */
export async function previewCalendlyConnection(actorId:number,merchantId:number,raw:unknown){
 const input=calendlyConnectionPreviewInput.parse(raw);
 const baseline=await calendlyOperationTransaction(async tx=>{await calendlyOperationWriter(tx,actorId,merchantId,'connect');return calendlyConnectionDefinition(tx,merchantId,true);});
 const check=()=>calendlyOperationTransaction(async tx=>{await calendlyOperationWriter(tx,actorId,merchantId,'connect');if((await calendlyConnectionDefinition(tx,merchantId,true)).revision!==baseline.revision)throw new CalendlyOperationFault('changed');});
 const user=await withCalendlyDashboardAuthority({actorId,merchantId},()=>withCalendlyProviderCheckpoint(check,()=>getCalendlyCurrentUser(input.apiKey)));
 return calendlyOperationTransaction(async tx=>{
  await calendlyOperationWriter(tx,actorId,merchantId,'connect');const current=await calendlyConnectionDefinition(tx,merchantId,true);if(current.revision!==baseline.revision)throw new CalendlyOperationFault('changed');
  const [counts]=await calendlyRows(tx,'SELECT (SELECT COUNT(*) FROM calendly_appointments WHERE merchant_id=?) AS appointments,(SELECT COUNT(*) FROM calendly_webhook_receipts WHERE merchant_id=?) AS receipts',[merchantId,merchantId]);
  return calendlyConnectionPreviewSchema.parse({actorId,merchantId,revision:current.revision,checkedAt:new Date().toISOString(),userUri:user.uri,userName:userName(user.name),replacing:!!current.row&&current.row.userUri!==user.uri,localAppointments:calendlyCount(counts?.appointments),localReceipts:calendlyCount(counts?.receipts)});
 });
}
async function review(tx:PoolConnection,merchantId:number,input:Command){
 const current=await calendlyConnectionDefinition(tx,merchantId,true);if(current.revision!==input.revision)throw new CalendlyOperationFault('changed');
 if(input.action==='connect'){if(current.row&&current.row.userUri!==input.userUri&&!input.replaceLocalCopies)throw new CalendlyOperationFault('changed');}
 else if(!current.row||input.action==='verify'&&(Number(current.row.active)!==1||Number(current.row.credentialsStored)!==1||!calendlyResourceUri(current.row.userUri,'user')))throw new CalendlyOperationFault('changed');
 return current;
}
const defaultLaunch=(work:()=>Promise<void>)=>{void work().catch(()=>console.error('[Calendly] reviewed connection outcome unavailable'));};
/** Secrets live in this invocation; the operation stores only a keyed payload digest. */
export async function requestReviewedCalendlyConnection(actorId:number,merchantId:number,raw:unknown,launch=defaultLaunch){
 const input=calendlyConnectionCommand.parse(raw),{requestId,revision,...payload}=input;
 const admitted=await reserveCalendlyOperation(actorId,merchantId,{requestId,revision,kind:input.action,payloadDigest:privacyHashExact(JSON.stringify(payload))},tx=>review(tx,merchantId,input).then(()=>{}));
 if(!admitted.lease)return admitted.receipt;const lease=admitted.lease;
 const check=async(tx:PoolConnection)=>{await guardCalendlyOperation(tx,lease);return review(tx,merchantId,input);};
 const checkpoint=()=>calendlyOperationTransaction(async tx=>{await check(tx);});
 const work=async()=>{
  try{await withCalendlyDashboardAuthority({actorId,merchantId},()=>withCalendlyProviderCheckpoint(checkpoint,()=>withCalendlyConnectionLock(merchantId,async()=>{
   await startCalendlyOperation(lease,tx=>review(tx,merchantId,input).then(()=>{}));
   const current=await calendlyOperationTransaction(check);
   const credentials=async()=>calendlyOperationTransaction(async tx=>{await check(tx);const rows=await calendlyRows(tx,"SELECT access_token AS token FROM platform_integrations WHERE merchant_id=? AND platform_type='calendly' FOR UPDATE",[merchantId]);if(rows.length!==1)throw new CalendlyOperationFault('changed');return rows[0].token as string|null;}).then(token=>{try{return decryptSecret(token);}catch{return null;}});
   let cleanup:'not_needed'|'confirmed'|'unconfirmed'='not_needed';
   const cleanPrevious=async()=>{
    if(!current.row?.subscription)return;
    cleanup='unconfirmed';
    try{const token=await credentials();if(!token||!calendlyResourceUri(current.row.subscription,'subscription'))return;await deleteCalendlyWebhookSubscription(token,current.row.subscription);cleanup='confirmed';}
    catch(error){if(error instanceof CalendlyOperationFault||error instanceof CalendlyProviderCheckpointError||error instanceof CalendlyAuthorityError)throw error;if(error instanceof CalendlyApiError&&error.status===404)cleanup='confirmed';}
   };
   if(input.action==='disconnect'){
    await cleanPrevious();await calendlyOperationTransaction(async tx=>{await check(tx);await tx.execute("DELETE FROM platform_integrations WHERE merchant_id=? AND platform_type='calendly'",[merchantId]);const after=await calendlyConnectionDefinition(tx,merchantId,true);await completeCalendlyOperation(tx,lease,{type:'connection',revision:after.revision,configured:false,remoteCleanup:cleanup,verification:'not_checked',localCopies:'cleared'});});return;
   }
   if(input.action==='verify'){
    const token=await credentials();if(!token)throw new CalendlyOperationFault('changed');const user=await getCalendlyCurrentUser(token);if(user.uri!==current.row.userUri)throw new CalendlyOperationFault('changed');
    await calendlyOperationTransaction(async tx=>{const after=await check(tx);await completeCalendlyOperation(tx,lease,{type:'connection',revision:after.revision,configured:true,remoteCleanup:'not_needed',verification:'api',localCopies:'retained'});});return;
   }
   const user=await getCalendlyCurrentUser(input.apiKey);if(user.uri!==input.userUri)throw new CalendlyOperationFault('changed');
   const endpoint=randomBytes(32).toString('base64url'),signing=randomBytes(48).toString('base64url');
   const subscription=await createCalendlyWebhookSubscription({accessToken:input.apiKey,callbackUrl:calendlyWebhookOrigin()+'/api/webhooks/calendly/'+endpoint,signingKey:signing,organizationUri:user.current_organization,userUri:user.uri});
   if(subscription===current.row?.subscription)throw new CalendlyOperationFault('changed');
   await cleanPrevious();const replacing=!!current.row&&current.row.userUri!==user.uri;
   await calendlyOperationTransaction(async tx=>{
    await check(tx);
    if(replacing){await tx.execute('DELETE FROM calendly_webhook_receipts WHERE merchant_id=?',[merchantId]);await tx.execute('DELETE FROM calendly_appointments WHERE merchant_id=?',[merchantId]);}
    const values=[userName(user.name),user.uri,encryptSecret(input.apiKey),endpoint,encryptSecret(signing),subscription];
    if(current.row)await tx.execute("UPDATE platform_integrations SET store_name=?,store_url=?,access_token=?,webhook_endpoint_id=?,webhook_signing_secret=?,webhook_subscription_uri=?,is_active=1,settings=IF(?,'{\"syncToWhatsApp\":false}',JSON_SET(IF(JSON_VALID(settings) AND JSON_TYPE(IF(JSON_VALID(settings),settings,'{}'))='OBJECT',settings,JSON_OBJECT()),'$.syncToWhatsApp',CAST('false' AS JSON))),last_sync_at=IF(?,NULL,last_sync_at),updated_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=? AND platform_type='calendly'",[...values,replacing?1:0,replacing?1:0,current.row.id,merchantId]);
    else await tx.execute("INSERT INTO platform_integrations(store_name,store_url,access_token,webhook_endpoint_id,webhook_signing_secret,webhook_subscription_uri,is_active,settings,merchant_id,platform_type) VALUES (?,?,?,?,?,?,1,'{\"syncToWhatsApp\":false}',?,'calendly')",[...values,merchantId]);
    const after=await calendlyConnectionDefinition(tx,merchantId,true);await completeCalendlyOperation(tx,lease,{type:'connection',revision:after.revision,configured:true,remoteCleanup:cleanup,verification:'api',localCopies:replacing?'cleared':'retained'});
   });
  })));}catch{
   // An ambiguous final commit may already have installed the new subscription. Do not delete it.
   await stopCalendlyOperation(lease);
  }
 };
 try{launch(work);}catch{await stopCalendlyOperation(lease);throw new CalendlyOperationFault('unavailable');}return admitted.receipt;
}
