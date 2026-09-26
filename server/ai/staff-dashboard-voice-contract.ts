import { z } from 'zod';
import { dashboardStaffBasis,staffActorKey } from './staff-dashboard-reply-contract';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { parseStaffJson,staffPhoneKey,staffReceiptDigest } from './sales-staff-acceptance-contract';
import { databaseTimeEpoch } from '../db/time';
import { staffVoiceMime,staffVoiceExtension } from '../../shared/staff-dashboard-voice';

const digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.number().int().positive().safe();
const utc=z.string().datetime({precision:3}).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v);
export const staffVoiceIntent=dashboardStaffBasis.omit({version:true,source:true,replyDigest:true}).extend({
  version:z.literal('sales-staff-voice-intent.v1'),source:z.literal('dashboard_voice'),
  audioDigest:digest,byteLength:z.number().int().positive().max(16*1024*1024),mimeType:staffVoiceMime,
  duration:z.number().finite().positive().max(3600),durationBasis:z.literal('client_reported'),contentBasis:z.literal('uploaded_bytes_signature_checked'),
}).strict();
export const staffVoiceBasis=z.object({version:z.literal('sales-staff-voice-basis.v1'),intent:staffVoiceIntent,intentDigest:digest,mediaUrlDigest:digest,fileName:z.string()}).strict()
  .superRefine((b,c)=>{if(b.intentDigest!==hash(b.intent)||b.fileName!==`voice-message.${staffVoiceExtension[b.intent.mimeType]}`)c.addIssue({code:'custom',message:'Invalid voice basis'});});
export const staffVoiceAcceptance=z.object({version:z.literal('sales-staff-voice-acceptance.v1'),basis:staffVoiceBasis,basisDigest:digest,
  outboxId:id,requestDigest:digest,providerMessageDigest:digest,acceptanceObservedAt:utc,
  observationTiming:z.enum(['ordered','clock_regression']),timeBasis:z.literal('local_receipt_verification'),scope:z.literal('provider_acceptance_only'),
}).strict().superRefine((s,c)=>{if(s.basisDigest!==hash(s.basis)||s.observationTiming!==(s.acceptanceObservedAt<s.basis.intent.reservedAt?'clock_regression':'ordered'))c.addIssue({code:'custom',message:'Invalid voice acceptance'});});
export const staffVoiceKey=(merchant:number,source:number)=>`staff_voice:${merchant}:${source}`;
export function staffVoiceStorageKey(i:z.infer<typeof staffVoiceIntent>){return `audio/staff-reply/${i.merchantId}/${i.actorUserId}/${i.requestId}.${staffVoiceExtension[i.mimeType]}`;}
export function readStaffVoiceIntent(r:any){
  const raw=parseStaffJson(r.intent),i=staffVoiceIntent.parse(raw);
  if(hash(raw)!==r.intent_digest||hash(i)!==r.intent_digest||i.sourceId!==Number(r.id)||i.merchantId!==Number(r.merchant_id)
    ||i.actorUserId!==Number(r.actor_user_id)||i.conversationId!==Number(r.conversation_id)||i.requestId!==r.request_id
    ||i.instanceRecordId!==Number(r.instance_id)||i.ownershipVersion!==Number(r.ownership_version)||i.customerKey!==staffPhoneKey(i.merchantId,r.customer_phone)
    ||i.authorKey!==staffActorKey(i.merchantId,i.actorUserId))throw Error('Voice intent unavailable');return i;
}
export function validateStaffVoiceUrl(value:unknown):string{
  const url=z.string().url().max(4096).parse(value),u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.hash||!u.hostname)throw Error('Voice object unavailable');return url;
}
export function readStaffVoiceBasis(r:any){
  const i=readStaffVoiceIntent(r),raw=parseStaffJson(r.basis),b=staffVoiceBasis.parse(raw);
  if(hash(raw)!==r.basis_digest||hash(b)!==r.basis_digest||b.intentDigest!==hash(i)||b.mediaUrlDigest!==hash(validateStaffVoiceUrl(r.media_url)))throw Error('Voice basis unavailable');return b;
}
const request=z.object({to:z.string(),kind:z.literal('audio'),mediaUrl:z.string(),fileName:z.string(),staffVoiceGuard:z.object({id,basisDigest:digest}).strict()}).strict();
export function staffVoiceTransport(b:z.infer<typeof staffVoiceBasis>,d:any){
  const i=b.intent,r=request.parse(parseStaffJson(d.request_json));
  if(!id.safeParse(Number(d.id)).success||Number(d.merchant_id)!==i.merchantId||Number(d.instance_id)!==i.instanceRecordId||d.provider!==i.provider
    ||d.direction!=='outgoing'||d.idempotency_key!==staffVoiceKey(i.merchantId,i.sourceId)||r.staffVoiceGuard.id!==i.sourceId||r.staffVoiceGuard.basisDigest!==hash(b)
    ||staffPhoneKey(i.merchantId,r.to)!==i.customerKey||hash(validateStaffVoiceUrl(r.mediaUrl))!==b.mediaUrlDigest||r.fileName!==b.fileName)throw Error('Voice transport unavailable');
  return {outboxId:Number(d.id),requestDigest:hash(r),providerMessageDigest:staffReceiptDigest(i.merchantId,i.instanceRecordId,i.provider,d.provider_message_id)};
}
export function readStaffVoiceAcceptance(row:any){
  const raw=parseStaffJson(row.snapshot),s=staffVoiceAcceptance.parse(raw),i=s.basis.intent;
  if(!id.safeParse(Number(row.id)).success||hash(raw)!==row.acceptance_digest||hash(s)!==row.acceptance_digest||i.merchantId!==Number(row.merchant_id)
    ||i.source!==row.source_kind||i.sourceId!==Number(row.source_id)||i.customerKey!==row.customer_key||s.outboxId!==Number(row.outbox_id)
    ||s.providerMessageDigest!==row.provider_message_digest||Date.parse(s.acceptanceObservedAt)!==databaseTimeEpoch(row.acceptance_observed_at))throw Error('Voice acceptance unavailable');return s;
}
