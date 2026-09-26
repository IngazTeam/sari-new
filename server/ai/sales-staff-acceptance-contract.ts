import { z } from 'zod';
import { normalizeCampaignPhone } from '../automation/campaign-guard';
import { databaseTimeEpoch } from '../db/time';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import type { WhatsAppProviderConfig } from '../channels/whatsapp/types';

const id=z.number().int().positive().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
const utc=z.string().datetime({precision:3}).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v);
export const staffRelayBasis=z.object({
  version:z.literal('sales-staff-relay-basis.v1'),source:z.literal('escalation_relay'),sourceId:id,merchantId:id,
  escalationId:id,conversationId:id,incomingMessageId:id,ownershipVersion:z.number().int().positive().safe(),
  instanceRecordId:id,provider:z.enum(['green_api','meta_cloud','mock']),accountDigest:digest,customerKey:digest,authorKey:digest,
  authorBasis:z.literal('sourced_escalation_chain_phone'),replyDigest:digest,quotedMessageDigest:digest,
  alertOutboxId:id,alertRequestDigest:digest,reservedAt:utc,scope:z.literal('staff_reply_attempt_only'),
}).strict();
export const staffAcceptanceSnapshot=z.object({
  version:z.literal('sales-staff-transport-acceptance.v1'),basis:staffRelayBasis,basisDigest:digest,
  outboxId:id,requestDigest:digest,providerMessageDigest:digest,acceptanceObservedAt:utc,
  observationTiming:z.enum(['ordered','clock_regression']),timeBasis:z.literal('local_receipt_verification'),
  scope:z.literal('provider_acceptance_only'),
}).strict().superRefine((s,ctx)=>{
  if(s.basisDigest!==hash(s.basis)||s.observationTiming!==(s.acceptanceObservedAt<s.basis.reservedAt?'clock_regression':'ordered'))
    ctx.addIssue({code:'custom',message:'Invalid staff acceptance evidence'});
});
export type StaffRelayBasis=z.infer<typeof staffRelayBasis>;
const unavailable=():never=>{throw Error('Staff transport evidence unavailable');};
export function staffAccountDigest(config:WhatsAppProviderConfig){
  if(!config.instanceId||!config.token||!['green_api','meta_cloud','mock'].includes(config.provider)
    ||config.provider==='meta_cloud'&&!config.phoneNumberId)return unavailable();
  return hash({version:'sales-staff-account.v1',provider:config.provider,instanceId:config.instanceId,token:config.token,
    apiUrl:config.apiUrl??null,phoneNumberId:config.phoneNumberId??null,providerAccountId:config.providerAccountId??null});
}
export const staffPhoneKey=(merchantId:number,phone:unknown,author=false)=>{
  if(typeof phone!=='string'||!/^\+?[\d ()-]+(?:@c\.us)?$/.test(phone))return unavailable();
  const normalized=normalizeCampaignPhone(phone);
  if(!normalized||!/^[1-9][0-9]{7,14}$/.test(normalized))return unavailable();
  return hash({version:author?'sales-staff-author-phone.v1':'sales-experiment-customer.v1',merchantId,phone:normalized});
};
export const staffReceiptDigest=(merchantId:number,instanceRecordId:number,provider:string,value:unknown)=>{
  if(typeof value!=='string'||!/^[^\s<>\x00-\x1f]{1,255}$/.test(value))return unavailable();
  return hash({merchantId,instanceRecordId,provider,providerMessageId:value});
};
export const parseStaffJson=(value:unknown)=>typeof value==='string'?JSON.parse(value):value;
export function readStaffRelayBasis(r:any):StaffRelayBasis|null{
  if(r.staff_basis==null&&r.staff_basis_digest==null)return null; // Explicit legacy gap; never backfill from current state.
  const raw=parseStaffJson(r.staff_basis),b=staffRelayBasis.parse(raw);
  if(hash(raw)!==r.staff_basis_digest||hash(b)!==r.staff_basis_digest||b.sourceId!==Number(r.id)||b.merchantId!==Number(r.merchant_id)
    ||b.escalationId!==Number(r.escalation_id)||b.conversationId!==Number(r.conversation_id)||b.incomingMessageId!==Number(r.source_message_id)
    ||b.ownershipVersion!==Number(r.ownership_version)||b.instanceRecordId!==Number(r.instance_id)
    ||b.authorKey!==staffPhoneKey(b.merchantId,r.author_phone,true)||b.customerKey!==staffPhoneKey(b.merchantId,r.customer_phone)
    ||b.replyDigest!==hash(r.reply_text)||b.quotedMessageDigest!==staffReceiptDigest(b.merchantId,b.instanceRecordId,b.provider,r.quoted_message_id))return unavailable();
  return b;
}
const relayRequest=z.object({to:z.string(),kind:z.literal('text'),text:z.string(),inboundJobId:id.optional(),
  escalationGuard:z.object({id,mode:z.literal('relay'),sourceMessageId:id,relayId:id,version:id}).strict(),
}).strict();
export function staffRelayTransport(b:StaffRelayBasis,d:any){
  const request=relayRequest.parse(parseStaffJson(d?.request_json)),g=request.escalationGuard;
  if(!id.safeParse(Number(d?.id)).success||Number(d.merchant_id)!==b.merchantId||Number(d.instance_id)!==b.instanceRecordId
    ||d.direction!=='outgoing'||d.provider!==b.provider||d.idempotency_key!==`escalation_relay:${b.merchantId}:${b.escalationId}`
    ||g.id!==b.escalationId||g.relayId!==b.sourceId||g.version!==b.ownershipVersion||g.sourceMessageId!==b.incomingMessageId
    ||staffPhoneKey(b.merchantId,request.to)!==b.customerKey||hash(request.text)!==b.replyDigest)return unavailable();
  return {outboxId:Number(d.id),requestDigest:hash(request),providerMessageDigest:staffReceiptDigest(b.merchantId,b.instanceRecordId,b.provider,d.provider_message_id)};
}
export function readStaffAcceptance(row:any){
  const raw=parseStaffJson(row.snapshot),s=staffAcceptanceSnapshot.parse(raw),b=s.basis;
  if(!id.safeParse(Number(row.id)).success||hash(raw)!==row.acceptance_digest||hash(s)!==row.acceptance_digest
    ||b.merchantId!==Number(row.merchant_id)||b.source!==row.source_kind||b.sourceId!==Number(row.source_id)
    ||b.customerKey!==row.customer_key||s.outboxId!==Number(row.outbox_id)||s.providerMessageDigest!==row.provider_message_digest
    ||Date.parse(s.acceptanceObservedAt)!==databaseTimeEpoch(row.acceptance_observed_at))return unavailable();
  return s;
}
