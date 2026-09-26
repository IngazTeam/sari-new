import { z } from 'zod';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { parseStaffJson,staffPhoneKey,staffReceiptDigest } from './sales-staff-acceptance-contract';
import { databaseTimeEpoch } from '../db/time';

const id=z.number().int().positive().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
const utc=z.string().datetime({precision:3}).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v);
export const dashboardStaffBasis=z.object({
  version:z.literal('sales-staff-dashboard-basis.v1'),source:z.literal('dashboard_text'),sourceId:id,merchantId:id,
  conversationId:id,actorUserId:id,requestId:z.string().uuid(),ownershipVersion:id,
  instanceRecordId:id,provider:z.enum(['green_api','meta_cloud','mock']),accountDigest:digest,customerKey:digest,authorKey:digest,
  authorBasis:z.literal('authenticated_submitter'),compositionBasis:z.literal('unmeasured'),replyDigest:digest,reservedAt:utc,scope:z.literal('staff_reply_attempt_only'),
}).strict();
export type DashboardStaffBasis=z.infer<typeof dashboardStaffBasis>;
export const dashboardStaffAcceptance=z.object({
  version:z.literal('sales-staff-dashboard-acceptance.v1'),basis:dashboardStaffBasis,basisDigest:digest,
  outboxId:id,requestDigest:digest,providerMessageDigest:digest,acceptanceObservedAt:utc,
  observationTiming:z.enum(['ordered','clock_regression']),timeBasis:z.literal('local_receipt_verification'),scope:z.literal('provider_acceptance_only'),
}).strict().superRefine((s,c)=>{
  if(s.basisDigest!==hash(s.basis)||s.observationTiming!==(s.acceptanceObservedAt<s.basis.reservedAt?'clock_regression':'ordered'))c.addIssue({code:'custom',message:'Invalid staff acceptance'});
});
export const staffActorKey=(merchantId:number,actorUserId:number)=>hash({version:'sales-staff-authenticated-user.v1',merchantId,actorUserId});
export const staffDashboardKey=(merchant:number,id:number)=>`staff_reply:${merchant}:${id}`;
export function readDashboardStaffBasis(r:any){
  const raw=parseStaffJson(r.basis),b=dashboardStaffBasis.parse(raw);
  if(hash(raw)!==r.basis_digest||hash(b)!==r.basis_digest||b.sourceId!==Number(r.id)||b.merchantId!==Number(r.merchant_id)
    ||b.conversationId!==Number(r.conversation_id)||b.actorUserId!==Number(r.actor_user_id)||b.requestId!==r.request_id
    ||b.instanceRecordId!==Number(r.instance_id)||b.ownershipVersion!==Number(r.ownership_version)
    ||b.authorKey!==staffActorKey(b.merchantId,b.actorUserId)||b.customerKey!==staffPhoneKey(b.merchantId,r.customer_phone)||b.replyDigest!==hash(r.reply_text))throw Error('Staff reply evidence unavailable');
  return b;
}
const requestSchema=z.object({to:z.string(),kind:z.literal('text'),text:z.string(),
  staffReplyGuard:z.object({id,basisDigest:digest}).strict(),
}).strict();
export function dashboardStaffTransport(b:DashboardStaffBasis,d:any){
  const request=requestSchema.parse(parseStaffJson(d?.request_json));
  if(!id.safeParse(Number(d.id)).success||Number(d.merchant_id)!==b.merchantId||Number(d.instance_id)!==b.instanceRecordId
    ||d.provider!==b.provider||d.direction!=='outgoing'||d.idempotency_key!==staffDashboardKey(b.merchantId,b.sourceId)
    ||request.staffReplyGuard.id!==b.sourceId||request.staffReplyGuard.basisDigest!==hash(b)
    ||staffPhoneKey(b.merchantId,request.to)!==b.customerKey||hash(request.text)!==b.replyDigest)throw Error('Staff reply transport unavailable');
  return {outboxId:Number(d.id),requestDigest:hash(request),providerMessageDigest:staffReceiptDigest(b.merchantId,b.instanceRecordId,b.provider,d.provider_message_id)};
}
export function readDashboardStaffAcceptance(row:any){
  const raw=parseStaffJson(row.snapshot),s=dashboardStaffAcceptance.parse(raw),b=s.basis;
  if(!id.safeParse(Number(row.id)).success||hash(raw)!==row.acceptance_digest||hash(s)!==row.acceptance_digest||b.merchantId!==Number(row.merchant_id)
    ||b.source!==row.source_kind||b.sourceId!==Number(row.source_id)||b.customerKey!==row.customer_key||s.outboxId!==Number(row.outbox_id)
    ||s.providerMessageDigest!==row.provider_message_digest||Date.parse(s.acceptanceObservedAt)!==databaseTimeEpoch(row.acceptance_observed_at))throw Error('Staff acceptance unavailable');
  return s;
}
