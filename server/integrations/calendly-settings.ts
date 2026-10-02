import type {PoolConnection} from 'mysql2/promise';
import {calendlySettingsCommand} from '../../shared/calendly-settings';
import {privacyHashExact} from '../accounts/privacy-hash';
import {calendlyConnectionDefinition} from './calendly-workspace';
import {calendlyResourceUri} from '../../shared/calendly-provider';
import {CALENDLY_ENDPOINT_PATTERN} from '../webhooks/calendly-security';
import {CalendlyOperationFault,reserveCalendlyOperation,startCalendlyOperation,guardCalendlyOperation,completeCalendlyOperation,stopCalendlyOperation,readCalendlyOperation,calendlyOperationTransaction} from './calendly-operation';

/** Only the reviewed switch changes; credentials and unrelated JSON remain in storage. */
export async function saveReviewedCalendlySettings(actorId:number,merchantId:number,raw:unknown){
 const input=calendlySettingsCommand.parse(raw);
 const review=async(tx:PoolConnection)=>{
  const current=await calendlyConnectionDefinition(tx,merchantId,true);
  if(current.revision!==input.revision||!current.row||Number(current.row.settingsValid)!==1)throw new CalendlyOperationFault('changed');
  if(input.syncToWhatsApp&&(Number(current.row.active)!==1||Number(current.row.credentialsStored)!==1||Number(current.row.signingStored)!==1||!CALENDLY_ENDPOINT_PATTERN.test(current.row.endpoint??'')||!calendlyResourceUri(current.row.userUri,'user')||!calendlyResourceUri(current.row.subscription,'subscription')))throw new CalendlyOperationFault('changed');
  return current;
 };
 const admitted=await reserveCalendlyOperation(actorId,merchantId,{requestId:input.requestId,revision:input.revision,kind:'settings',payloadDigest:privacyHashExact(JSON.stringify({syncToWhatsApp:input.syncToWhatsApp}))},tx=>review(tx).then(()=>{}));
 if(!admitted.lease)return admitted.receipt;
 const lease=admitted.lease;
 try{
  await startCalendlyOperation(lease,tx=>review(tx).then(()=>{}));
  await calendlyOperationTransaction(async tx=>{
   await guardCalendlyOperation(tx,lease);const current=await review(tx);
   const [saved]=await tx.execute<any>("UPDATE platform_integrations SET settings=JSON_SET(IF(settings IS NULL OR settings='',JSON_OBJECT(),settings),'$.syncToWhatsApp',CAST(? AS JSON)),updated_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=? AND platform_type='calendly'",[JSON.stringify(input.syncToWhatsApp),current.row.id,merchantId]);
   if(saved.affectedRows!==1)throw new CalendlyOperationFault('changed');
   const after=await calendlyConnectionDefinition(tx,merchantId,true);
   await completeCalendlyOperation(tx,lease,{type:'settings',revision:after.revision,syncToWhatsApp:input.syncToWhatsApp});
  });
 }catch{await stopCalendlyOperation(lease);}
 return readCalendlyOperation(actorId,merchantId,{requestId:input.requestId});
}
