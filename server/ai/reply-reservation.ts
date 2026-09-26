import type { PoolConnection } from 'mysql2/promise';
import type { ReplyPlan } from '../messaging/reply-plan';
import type { SendMerchantWhatsAppInput } from '../channels/whatsapp/types';
import { checkoutTransaction } from './checkout-agreements';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { canSendConversationReply } from './conversation-handoff';

export class ReplyReservationConflict extends Error {
  constructor() { super('Reply message ownership changed or is unavailable'); }
}
const conflict = (): never => { throw new ReplyReservationConflict(); };
export const ordinaryReplyDigest = (plan: ReplyPlan) => policyArtifactDigest({ version: 'ordinary-reply.v1', plan });
export const ordinaryReplyText = (plan: ReplyPlan) => plan.effects.filter(e => e.kind === 'text').map(e => e.text || '').join('\n').slice(0, 16000);
const parsed = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value;

/** All reply owners use merchant -> conversation -> interaction order. No channel row locks. */
export async function lockReplySource(c: PoolConnection, merchantId: number, conversationId: number, incomingMessageId: number) {
  if (![merchantId, conversationId, incomingMessageId].every(x => Number.isSafeInteger(x) && x > 0)) throw Error('Reply source ownership unavailable');
  const [merchants] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
  const [conversations] = await c.execute<any[]>('SELECT id FROM conversations WHERE merchantId=? AND id=? FOR UPDATE', [merchantId, conversationId]);
  const [messages] = await c.execute<any[]>("SELECT id FROM messages WHERE conversationId=? AND id=? AND direction='incoming' FOR SHARE", [conversationId, incomingMessageId]);
  if (merchants.length !== 1 || conversations.length !== 1 || messages.length !== 1) throw Error('Reply source ownership unavailable');
}

export async function reserveOrdinaryReply(c: PoolConnection, plan: ReplyPlan) {
  const merchant = plan.effects[0]?.merchantId;
  if (!merchant || !plan.effects.length || plan.effects.some(e => e.merchantId !== merchant || e.replyGuard || e.salesReplyGuard)) throw Error('Reply plan ownership unavailable');
  await lockReplySource(c, merchant, plan.conversationId, plan.incomingMessageId!);
  const digest = ordinaryReplyDigest(plan);
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_interaction_jobs WHERE merchant_id=? AND incoming_message_id=? FOR UPDATE', [merchant, plan.incomingMessageId!]);
  if (rows.length) {
    const row = rows[0];
    if (row.reply_origin !== 'ordinary' || row.reply_digest !== digest || Number(row.conversation_id) !== plan.conversationId
      || row.reply_text !== ordinaryReplyText(plan) || ordinaryReplyDigest(parsed(row.reply_plan)) !== digest) return conflict();
    return digest;
  }
  await c.execute(`INSERT INTO ai_interaction_jobs
    (merchant_id,conversation_id,incoming_message_id,reply_text,reply_origin,reply_digest,reply_plan)
    VALUES (?,?,?,?,'ordinary',?,?)`, [merchant, plan.conversationId, plan.incomingMessageId!,
    ordinaryReplyText(plan), digest, JSON.stringify(plan)]);
  return digest;
}

/** Last ordinary reply gate. Unanchored legacy requests cannot claim a current customer turn. */
export async function canDispatchConversationReply(input: SendMerchantWhatsAppInput, instanceRecordId: number) {
  const guard = input.replyGuard;
  if (!guard?.incomingMessageId || input.retryFailed || input.salesReplyGuard) return false;
  try {
    return await checkoutTransaction(async c => {
      await lockReplySource(c, input.merchantId, guard.conversationId, guard.incomingMessageId!);
      if (!await canSendConversationReply(c, input.merchantId, guard, input.to)) return false;
      const [latest] = await c.execute<any[]>("SELECT id FROM messages WHERE conversationId=? AND direction='incoming' ORDER BY id DESC LIMIT 1 FOR SHARE", [guard.conversationId]);
      if (Number(latest[0]?.id) !== guard.incomingMessageId) return false;
      const { replyGuard: _, ...effect } = input;
      const normalized = { ...effect, instanceRecordId };
      let digest = guard.reservationDigest;
      // Compatibility for server callers that send a single anchored reply directly.
      if (!digest) digest = await reserveOrdinaryReply(c, { version: 1, conversationId: guard.conversationId,
        incomingMessageId: guard.incomingMessageId, ownershipVersion: guard.version, effects: [normalized] });
      const [rows] = await c.execute<any[]>('SELECT * FROM ai_interaction_jobs WHERE merchant_id=? AND incoming_message_id=? FOR UPDATE', [input.merchantId, guard.incomingMessageId]);
      const row = rows[0], plan: ReplyPlan = parsed(row?.reply_plan);
      return row?.reply_origin === 'ordinary' && row.state === 'waiting_delivery' && row.reply_digest === digest
        && ordinaryReplyDigest(plan) === digest && row.reply_text === ordinaryReplyText(plan) && plan.conversationId === guard.conversationId
        && plan.incomingMessageId === guard.incomingMessageId && plan.ownershipVersion === guard.version
        && plan.effects.some(e => policyArtifactDigest(e) === policyArtifactDigest(normalized));
    });
  } catch { return false; }
}

export async function reserveReviewedReply(c: PoolConnection, input: {
  merchantId: number; conversationId: number; incomingMessageId: number; deliveryId: number; authorizationDigest: string; responseText: string;
}) {
  await lockReplySource(c, input.merchantId, input.conversationId, input.incomingMessageId);
  await c.execute(`INSERT INTO ai_interaction_jobs
    (merchant_id,conversation_id,incoming_message_id,reply_text,state,reply_origin,reply_digest,sales_delivery_id)
    VALUES (?,?,?,?,'reviewed_reserved','reviewed',?,?)`, [input.merchantId, input.conversationId, input.incomingMessageId,
    input.responseText, input.authorizationDigest, input.deliveryId]);
}

export async function ownsReviewedReply(c: PoolConnection, input: {
  merchantId: number; conversationId: number; incomingMessageId: number; deliveryId: number; authorizationDigest: string; responseText: string;
}) {
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_interaction_jobs WHERE merchant_id=? AND incoming_message_id=? FOR UPDATE', [input.merchantId, input.incomingMessageId]);
  const row = rows[0];
  return rows.length === 1 && row.reply_origin === 'reviewed' && row.state === 'reviewed_reserved'
    && Number(row.conversation_id) === input.conversationId && Number(row.sales_delivery_id) === input.deliveryId
    && row.reply_digest === input.authorizationDigest && row.reply_text === input.responseText && row.reply_plan === null;
}
