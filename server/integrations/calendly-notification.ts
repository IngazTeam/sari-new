import type {PoolConnection} from 'mysql2/promise';
import {calendlyRows,calendlyStamp,calendlyConnectionDefinition} from './calendly-workspace';
import {calendlyOperationTransaction} from './calendly-operation';
import {assertCalendlyReceiptLease} from './calendly-worker-authority';
import {privacyHashExact} from '../accounts/privacy-hash';
import {decryptSecret} from '../security/secrets';
import {calendlyResourceUri} from '../../shared/calendly-provider';
import {CALENDLY_ENDPOINT_PATTERN} from '../webhooks/calendly-security';
import type {SendMerchantWhatsAppInput,WhatsAppProviderConfig} from '../channels/whatsapp/types';
export type CalendlyNotificationGuard={receiptId:number;processingToken:string;appointmentId:number;connectionRevision:string;appointmentRevision:string};
class CalendlyNotificationFault extends Error{constructor(){super('Calendly notification authority changed');}}
const clean=(value:string,max:number)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function message(row:any){const stamp=calendlyStamp(row.start_at);if(!stamp)throw new CalendlyNotificationFault();const date=new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(stamp));return [`مرحباً ${clean(row.customer_name,100)}،`,`تم تأكيد موعدك: ${clean(row.event_name,120)}.`,`الموعد: ${date}`].join('\n');}
function appointmentRevision(row:any){return privacyHashExact(JSON.stringify({id:row.id,integrationId:row.integration_id,eventUri:row.event_uri,inviteeUri:row.invitee_uri,name:row.customer_name,phone:row.customer_phone,event:row.event_name,startAt:calendlyStamp(row.start_at),state:row.status,providerUpdatedAt:calendlyStamp(row.provider_updated_at)}));}
async function snapshot(tx:PoolConnection,merchantId:number,receiptId:number,processingToken:string){
 const merchant=(await calendlyRows(tx,'SELECT userId,status FROM merchants WHERE id=? FOR UPDATE',[merchantId]))[0];if(!merchant||merchant.status==='suspended')throw new CalendlyNotificationFault();
 const owner=(await calendlyRows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[merchant.userId]))[0];if(owner?.account_status!=='active')throw new CalendlyNotificationFault();
 const current=await calendlyConnectionDefinition(tx,merchantId,true),r=current.row;
 if(!r||Number(r.active)!==1||Number(r.credentialsStored)!==1||Number(r.signingStored)!==1||Number(r.settingsValid)!==1||!calendlyResourceUri(r.userUri,'user')||!CALENDLY_ENDPOINT_PATTERN.test(r.endpoint??''))throw new CalendlyNotificationFault();
 const [receipt]=await calendlyRows(tx,'SELECT * FROM calendly_webhook_receipts WHERE id=? AND merchant_id=? FOR UPDATE',[receiptId,merchantId]);if(!receipt||receipt.integration_id!==r.id||receipt.processing_token!==processingToken||receipt.event_type!=='invitee.created'||Number(receipt.effect_applied)!==1)throw new CalendlyNotificationFault();
 await assertCalendlyReceiptLease(tx,receipt);
 const [appointment]=await calendlyRows(tx,'SELECT * FROM calendly_appointments WHERE merchant_id=? AND integration_id=? AND invitee_uri=? FOR UPDATE',[merchantId,r.id,receipt.invitee_uri]);
 if(!appointment||appointment.event_uri!==receipt.event_uri)throw new CalendlyNotificationFault();
 return {current,receipt,appointment,allowed:Number(r.syncToWhatsApp)===1&&Number(receipt.notification_required)===1&&appointment.status==='active'&&typeof appointment.customer_phone==='string'&&/^\+[1-9]\d{7,14}$/.test(appointment.customer_phone)};
}
export function validCalendlyNotificationTransport(input:SendMerchantWhatsAppInput){
 const g=input.calendlyGuard;if(!g)return false;
 return [input.merchantId,g.receiptId,g.appointmentId].every(n=>Number.isSafeInteger(n)&&n>0)&&/^[A-Za-z0-9_-]{16,64}$/.test(g.processingToken)&&[g.connectionRevision,g.appointmentRevision].every(v=>/^[a-f0-9]{64}$/.test(v))&&new RegExp('^calendly:'+input.merchantId+':[a-f0-9]{64}$').test(input.idempotencyKey)&&input.kind==='text'&&typeof input.text==='string'&&input.text.length>0&&!input.retryFailed&&!input.mediaUrl&&!input.fileName&&!input.template&&!input.messageId&&!Object.keys(input).some(k=>k.endsWith('Guard')&&k!=='calendlyGuard'&&input[k as keyof typeof input]!=null);
}
export function sameCalendlyNotificationRequest(input:SendMerchantWhatsAppInput,prior:any){return validCalendlyNotificationTransport(input)&&prior?.calendlyGuard?.receiptId===input.calendlyGuard!.receiptId&&prior?.calendlyGuard?.appointmentId===input.calendlyGuard!.appointmentId&&prior?.to===input.to&&prior?.text===input.text&&prior?.kind==='text';}
export async function prepareCalendlyNotification(merchantId:number,receiptId:number,processingToken:string):Promise<SendMerchantWhatsAppInput|null>{
 return calendlyOperationTransaction(async tx=>{const s=await snapshot(tx,merchantId,receiptId,processingToken);if(!s.allowed||s.appointment.notification_sent_at)return null;return {merchantId,idempotencyKey:`calendly:${merchantId}:${s.receipt.event_key}`,kind:'text',to:s.appointment.customer_phone,text:message(s.appointment),retryFailed:false,calendlyGuard:{receiptId,processingToken,appointmentId:s.appointment.id,connectionRevision:s.current.revision,appointmentRevision:appointmentRevision(s.appointment)}};});
}
/** Keep the current opt-in, appointment, claim and channel locked through provider acceptance. */
export async function withCalendlyNotificationAuthority<T extends {accepted:boolean;providerMessageId?:string}>(input:SendMerchantWhatsAppInput,config:WhatsAppProviderConfig,instanceId:number,dispatch:(tx:PoolConnection)=>Promise<T>){
 if(!validCalendlyNotificationTransport(input))throw new CalendlyNotificationFault();const g=input.calendlyGuard!;
 return calendlyOperationTransaction(async tx=>{
  const s=await snapshot(tx,input.merchantId,g.receiptId,g.processingToken),a=s.appointment;
  if(!s.allowed||a.notification_sent_at||a.id!==g.appointmentId||s.current.revision!==g.connectionRevision||appointmentRevision(a)!==g.appointmentRevision||input.to!==a.customer_phone||input.text!==message(a)||input.idempotencyKey!==`calendly:${input.merchantId}:${s.receipt.event_key}`)throw new CalendlyNotificationFault();
  const [instance]=await calendlyRows(tx,'SELECT * FROM whatsapp_instances WHERE id=? AND merchant_id=? FOR SHARE',[instanceId,input.merchantId]);
  if(!instance||instance.status!=='active'||Number(instance.is_primary)!==1||instance.provider!==config.provider||String(instance.instance_id)!==config.instanceId||decryptSecret(instance.token)!==config.token||(instance.api_url??null)!==(config.apiUrl??null)||(instance.phone_number_id??null)!==(config.phoneNumberId??null)||(instance.provider_account_id??null)!==(config.providerAccountId??null))throw new CalendlyNotificationFault();
  const [delivery]=await calendlyRows(tx,'SELECT status,provider_message_id,request_json,instance_id,provider FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE',[input.merchantId,input.idempotencyKey]);
  const prior=typeof delivery?.request_json==='string'?JSON.parse(delivery.request_json):delivery?.request_json;
  if(!delivery||delivery.status!=='queued'||delivery.provider_message_id||Number(delivery.instance_id)!==instanceId||delivery.provider!==config.provider||!sameCalendlyNotificationRequest(input,prior)||!(['processingToken','connectionRevision','appointmentRevision'] as const).every(k=>prior.calendlyGuard[k]===g[k]))throw new CalendlyNotificationFault();
  await assertCalendlyReceiptLease(tx,s.receipt);
  const result=await dispatch(tx);
  if(result.accepted&&result.providerMessageId)await tx.execute('UPDATE calendly_appointments SET notification_sent_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=?',[a.id,input.merchantId]);
  return result;
 });
}
