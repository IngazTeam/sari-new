import type {PoolConnection} from 'mysql2/promise';
import type {PlatformIntegration} from '../../drizzle/schema';
import {bookingReadId} from '../../shared/booking-read';
import {calendlyRows} from './calendly-workspace';
import {decryptSecret} from '../security/secrets';
import {privacyHashExact} from '../accounts/privacy-hash';
import {calendlyResourceUri} from '../../shared/calendly-provider';
import {CALENDLY_ENDPOINT_PATTERN} from '../webhooks/calendly-security';
export class CalendlyWorkerAuthorityError extends Error{constructor(){super('Calendly worker authority changed');}}
type Expected=Pick<PlatformIntegration,'id'|'merchantId'|'webhookEndpointId'|'webhookSigningSecret'>&Partial<Pick<PlatformIntegration,'storeUrl'|'accessToken'>>;
/** Serializes old webhook reads with connection changes without inheriting a dashboard actor. */
export async function assertCalendlyWorkerConnection(tx:PoolConnection,expected:Expected){
 bookingReadId.parse(expected.id);bookingReadId.parse(expected.merchantId);
 const merchant=(await calendlyRows(tx,'SELECT userId,status FROM merchants WHERE id=? FOR UPDATE',[expected.merchantId]))[0];
 if(!merchant||merchant.status==='suspended')throw new CalendlyWorkerAuthorityError();
 const owner=(await calendlyRows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[merchant.userId]))[0];if(owner?.account_status!=='active')throw new CalendlyWorkerAuthorityError();
 const rows=await calendlyRows(tx,"SELECT id,is_active,store_url,access_token,webhook_endpoint_id,webhook_signing_secret,settings FROM platform_integrations WHERE merchant_id=? AND platform_type='calendly' FOR UPDATE",[expected.merchantId]),row=rows[0];
 if(rows.length!==1||row.id!==expected.id||row.is_active!==1||row.webhook_endpoint_id!==expected.webhookEndpointId||!CALENDLY_ENDPOINT_PATTERN.test(row.webhook_endpoint_id??'')||!calendlyResourceUri(row.store_url,'user')||!expected.webhookSigningSecret||privacyHashExact(decryptSecret(row.webhook_signing_secret)??'')!==privacyHashExact(expected.webhookSigningSecret)||expected.storeUrl!==undefined&&row.store_url!==expected.storeUrl||expected.accessToken!==undefined&&privacyHashExact(decryptSecret(row.access_token)??'')!==privacyHashExact(expected.accessToken??''))throw new CalendlyWorkerAuthorityError();
 let syncToWhatsApp=false;try{syncToWhatsApp=JSON.parse(row.settings??'{}')?.syncToWhatsApp===true;}catch{}
 return {syncToWhatsApp};
}
export async function assertCalendlyReceiptLease(tx:PoolConnection,row:{id:number;merchant_id:number;integration_id:number;processing_token:string;event_uri:string;invitee_uri:string}){
 const rows=await calendlyRows(tx,"SELECT integration_id,processing_token,event_uri,invitee_uri,status,claimed_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) AS live FROM calendly_webhook_receipts WHERE id=? AND merchant_id=? FOR UPDATE",[row.id,row.merchant_id]),saved=rows[0];
 if(rows.length!==1||saved.integration_id!==row.integration_id||saved.processing_token!==row.processing_token||saved.event_uri!==row.event_uri||saved.invitee_uri!==row.invitee_uri||saved.status!=='processing'||Number(saved.live)!==1)throw new CalendlyWorkerAuthorityError();
}
