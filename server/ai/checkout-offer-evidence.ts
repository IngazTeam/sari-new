import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import type { CheckoutIdentity } from './checkout-agreements';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { normalizeCampaignPhone } from '../automation/campaign-guard';

const id = z.number().int().positive().safe();
const effect = z.object({ merchantId:id, instanceRecordId:id, to:z.string().min(1).max(100),
  idempotencyKey:z.string().regex(/^[a-zA-Z0-9:_-]{16,100}$/), kind:z.literal('text'), text:z.string().min(1).max(4096) }).strict();
const planSchema = z.object({version:z.union([z.literal(1),z.literal(2)]),conversationId:id,incomingMessageId:id,
  ownershipVersion:z.number().int().nonnegative().safe(),effects:z.array(effect).min(1).max(16)}).strict();
const guardSchema = z.object({conversationId:id,incomingMessageId:id,version:z.number().int().nonnegative().safe(),
  reservationDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const requestSchema = z.object({to:z.string(),kind:z.literal('text'),text:z.string(),replyGuard:guardSchema,
  inboundJobId:id.optional()}).strict();
const decode = (v:unknown) => typeof v === 'string' ? JSON.parse(v) : v;

/** A marker alone cannot authorize a price or quantity. Only the complete,
 * unchanged ordinary text plan and all its channel acceptances qualify. */
export function checkoutOfferPlan(row:any,input:CheckoutIdentity,sourceMessageId:number,expectedText:string) {
  if (!expectedText || expectedText.length>16000 || sourceMessageId>=input.incomingMessageId
    || row?.merchant_id!==input.merchantId || row?.conversation_id!==input.conversationId
    || row?.incoming_message_id!==sourceMessageId || row?.reply_origin!=='ordinary'
    || !['pending','processing','completed','failed'].includes(row?.state)) throw Error('Offer evidence unavailable');
  const raw=decode(row.reply_plan),plan=planSchema.parse(raw);
  if(hash(raw)!==hash(plan)||hash({version:'ordinary-reply.v1',plan})!==row.reply_digest
    || plan.conversationId!==input.conversationId || plan.incomingMessageId!==sourceMessageId
    // A separate welcome may precede the offer. The final complete text effects
    // must be exactly the offer, with no changed prose or later question.
    || !plan.effects.some((_,index)=>plan.effects.slice(index).map(e=>e.text).join('')===expectedText)
    || plan.effects.map(e=>e.text).join('\n').slice(0,16000)!==row.reply_text
    || new Set(plan.effects.map(e=>e.idempotencyKey)).size!==plan.effects.length
    || new Set(plan.effects.map(e=>e.instanceRecordId)).size!==1) throw Error('Offer plan mismatch');
  const phone=normalizeCampaignPhone(input.customerPhone);
  if(!phone||plan.effects.some(e=>e.merchantId!==input.merchantId||normalizeCampaignPhone(e.to)!==phone))throw Error('Offer recipient mismatch');
  return plan;
}

export function checkoutOfferReceipt(row:any,e:z.infer<typeof effect>,plan:z.infer<typeof planSchema>,digest:string) {
  const raw=decode(row?.request_json),request=requestSchema.parse(raw);
  if(hash(raw)!==hash(request)||row.merchant_id!==e.merchantId||row.instance_id!==e.instanceRecordId
    || row.idempotency_key!==e.idempotencyKey||row.direction!=='outgoing'||!['green_api','meta_cloud','mock'].includes(row.provider)
    || !['sent','delivered','read'].includes(row.status)||row.error_code!=null
    || typeof row.provider_message_id!=='string'||!row.provider_message_id.trim()
    || request.to!==e.to||request.kind!==e.kind||request.text!==e.text
    || request.replyGuard.conversationId!==plan.conversationId||request.replyGuard.incomingMessageId!==plan.incomingMessageId
    || request.replyGuard.version!==plan.ownershipVersion||request.replyGuard.reservationDigest!==digest)
    throw Error('Offer receipt mismatch');
}

/** Read inside the caller's agreement transaction. No send, manual override or
 * historical backfill. Provider acceptance is not a claim of customer reading. */
export async function hasCheckoutOfferEvidence(c:PoolConnection,input:CheckoutIdentity,sourceMessageId:number,expectedText:string) {
  return (await readOfferEvidence(c,input,sourceMessageId,expectedText,true))!==null;
}

/** Historical transport proof for reviewing an existing agreement. This does not
 * authorize new automation after an employee takes over the conversation. */
export async function recordedCheckoutOfferEvidence(c:PoolConnection,input:CheckoutIdentity,sourceMessageId:number,expectedText:string) {
  return readOfferEvidence(c,input,sourceMessageId,expectedText,false);
}

async function readOfferEvidence(c:PoolConnection,input:CheckoutIdentity,sourceMessageId:number,expectedText:string,live:boolean):Promise<string|null> {
  const [jobs]=await c.execute<any[]>(`SELECT * FROM ai_interaction_jobs WHERE merchant_id=? AND conversation_id=?
    AND incoming_message_id<? ORDER BY incoming_message_id DESC LIMIT 1`,[input.merchantId,input.conversationId,input.incomingMessageId]);
  let plan:z.infer<typeof planSchema>;
  try{plan=checkoutOfferPlan(jobs[0],input,sourceMessageId,expectedText);}catch{return null;}
  const [owners]=await c.execute<any[]>(`SELECT c.id FROM conversations c JOIN merchants m ON m.id=c.merchantId AND m.status='active'
    WHERE c.id=? AND c.merchantId=? AND c.customerPhone=?
      ${live?'AND c.human_takeover=0 AND c.handoff_version=? AND c.automation_after_message_id<?':''}`,
    [input.conversationId,input.merchantId,input.customerPhone,...(live?[plan.ownershipVersion,sourceMessageId]:[])]);
  if(owners.length!==1)return null;
  const [previous]=await c.execute<any[]>(`SELECT id FROM messages WHERE conversationId=? AND direction='incoming'
    AND id<? ORDER BY id DESC LIMIT 1`,[input.conversationId,input.incomingMessageId]);
  if(previous[0]?.id!==sourceMessageId)return null;
  const [outgoing]=await c.execute<any[]>(`SELECT id,content,aiResponse,sender_type,messageType,isProcessed FROM messages
    WHERE conversationId=? AND direction='outgoing' AND id<? ORDER BY id DESC LIMIT 1`,[input.conversationId,input.incomingMessageId]);
  const out=outgoing[0];
  if(!out||out.id<=sourceMessageId||out.content!==expectedText||out.aiResponse!==expectedText
    ||out.sender_type!=='assistant'||out.messageType!=='text'||out.isProcessed!==1)return null;
  // Nonlocking outbox reads avoid reversing the channel's reservation lock order.
  const [receipts]=await c.execute<any[]>(`SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=?
    AND idempotency_key IN (${plan.effects.map(()=>'?').join(',')})`,[input.merchantId,...plan.effects.map(e=>e.idempotencyKey)]);
  if(receipts.length!==plan.effects.length)return null;
  try{for(const e of plan.effects)checkoutOfferReceipt(receipts.find(r=>r.idempotency_key===e.idempotencyKey),e,plan,jobs[0].reply_digest);}catch{return null;}
  return hash({version:'recorded-checkout-offer.v1',merchantId:input.merchantId,conversationId:input.conversationId,
    sourceMessageId,consentMessageId:input.incomingMessageId,planDigest:jobs[0].reply_digest,outgoingMessageId:out.id,
    receipts:plan.effects.map(e=>{const r=receipts.find(r=>r.idempotency_key===e.idempotencyKey);return {
      id:r.id,instanceId:r.instance_id,key:r.idempotency_key,provider:r.provider,providerMessageId:r.provider_message_id,
      status:r.status,requestDigest:hash(decode(r.request_json))};})});
}
