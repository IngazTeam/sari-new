import { randomUUID } from 'node:crypto';
import { getPool } from '../../db/connection';
import { assertDisposableDatabase } from './disposable-merchant';
import { stageInteraction, finishInteractionDelivery } from '../../ai/interaction-jobs';
import { ordinaryReplyDigest } from '../../ai/reply-reservation';
import type { ReplyPlan } from '../../messaging/reply-plan';

/** Synthetic receipts for financial regression fixtures only. Actual channel dispatch
 * is exercised separately in checkout-offer-evidence.mysql.test.ts. */
export async function stageCheckoutOfferFixture(input: ReplyPlan, accepted = true) {
  assertDisposableDatabase();
  const pool = (await getPool())!, plan = structuredClone(input);
  const merchantId = plan.effects[0].merchantId;
  const [instance] = await pool.execute<any>(`INSERT INTO whatsapp_instances
    (merchant_id,instance_id,token,provider,status) VALUES (?,?,'fixture','green_api','active')`, [merchantId, randomUUID()]);
  for (const e of plan.effects) e.instanceRecordId = Number(instance.insertId);
  await stageInteraction(plan);
  if (!accepted) return plan;
  const replyGuard = { conversationId:plan.conversationId,incomingMessageId:plan.incomingMessageId,
    version:plan.ownershipVersion!,reservationDigest:ordinaryReplyDigest(plan) };
  for (const e of plan.effects) await pool.execute(`INSERT INTO whatsapp_message_deliveries
    (merchant_id,instance_id,provider,provider_message_id,idempotency_key,direction,status,request_json)
    VALUES (?,?,'green_api',?,?,'outgoing','sent',?)`, [merchantId,Number(instance.insertId),randomUUID(),e.idempotencyKey,
    JSON.stringify({to:e.to,kind:e.kind,text:e.text,replyGuard})]);
  await finishInteractionDelivery(plan,true);
  const text=plan.effects.map(e=>e.text||'').join('');
  await pool.execute(`INSERT INTO messages (conversationId,direction,sender_type,messageType,content,aiResponse,isProcessed)
    VALUES (?,'outgoing','assistant','text',?,?,1)`, [plan.conversationId,text,text]);
  return plan;
}
