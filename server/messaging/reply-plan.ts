import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { whatsAppEventEffectKey } from '../channels/whatsapp/effect-key';
import type { SendMerchantWhatsAppInput } from '../channels/whatsapp/types';
import { persistInboundReplyPlan } from './inbound-jobs';
import { currentInboundExecution } from './inbound-context';
import { getPool } from '../db/connection';
import { stageInteraction, finishInteractionDelivery } from '../ai/interaction-jobs';

export type ReplyPlan = {
  version: 1;
  conversationId: number;
  incomingMessageId?: number;
  ownershipVersion?: number;
  effects: SendMerchantWhatsAppInput[];
};

export function buildReplyPlan(input: {
  merchantId: number; instanceId: number; providerAccount: string; eventId: string;
  conversationId: number; incomingMessageId?: number; to: string; text: string; welcome?: string;
  ownershipVersion?: number;
  media?: Array<{ type: 'image' | 'document'; url: string; caption?: string; fileName?: string }>;
}): ReplyPlan {
  const effects: SendMerchantWhatsAppInput[] = [];
  const add = (name: string, request: Pick<SendMerchantWhatsAppInput, 'kind' | 'text' | 'mediaUrl' | 'fileName'>) => {
    effects.push({ ...request, to: input.to, merchantId: input.merchantId, instanceRecordId: input.instanceId,
      idempotencyKey: whatsAppEventEffectKey(input.merchantId, input.providerAccount, input.eventId, name) });
  };
  const addText = (name: string, text: string) => {
    if (!text.trim()) return;
    let offset = 0;
    let index = 0;
    while (offset < text.length) {
      let end = Math.min(offset + 4096, text.length);
      // Never split the UTF-16 surrogate pair of an emoji between messages.
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      add(index === 0 ? name : `${name}_${index}`, { kind: 'text', text: text.slice(offset, end) });
      offset = end; index++;
    }
  };
  addText('welcome', input.welcome || '');
  addText('reply', input.text);
  for (const [index, media] of Array.from((input.media || []).entries())) {
    add(`media_${index}`, { kind: media.type === 'image' ? 'image' : 'document',
      mediaUrl: media.url, text: media.caption, fileName: media.fileName });
  }
  if (!effects.length) throw new Error('Empty reply plan');
  return { version: 1, conversationId: input.conversationId, incomingMessageId: input.incomingMessageId, ownershipVersion: input.ownershipVersion ?? 0, effects };
}

export async function humanOwnsConversation(merchantId: number, conversationId: number): Promise<boolean> {
  const pool = await getPool();
  if (!pool) throw new Error('Conversation authority unavailable');
  const [rows] = await pool.execute<any[]>(
    `SELECT human_takeover AS humanTakeover FROM conversations WHERE id = ? AND merchantId = ?`, [conversationId, merchantId],
  );
  if (rows.length !== 1) throw new Error('Reply conversation tenant mismatch');
  // Use database UTC; a missing/manual expiry keeps human ownership active.
  if (!rows[0].humanTakeover) return false;
  const [active] = await pool.execute<any[]>(
    `SELECT id FROM conversations WHERE id = ? AND merchantId = ? AND human_takeover = 1
      AND (human_expires_at IS NULL OR human_expires_at > UTC_TIMESTAMP())`, [conversationId, merchantId],
  );
  return active.length > 0;
}

export async function dispatchReplyPlan(plan: ReplyPlan, delayMs = 0): Promise<'sent' | 'human_takeover'> {
  await persistInboundReplyPlan(plan);
  await stageInteraction(plan);
  // Plans persisted before ownership versioning cannot prove that their context is still current.
  if (!Number.isSafeInteger(plan.ownershipVersion) || plan.ownershipVersion! < 0) {
    await finishInteractionDelivery(plan, false); return 'human_takeover';
  }
  const delay = Math.max(0, Math.min(60_000, delayMs));
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  for (const effect of plan.effects) {
    const context = currentInboundExecution();
    if (context) await context.assertOwned();
    if (await humanOwnsConversation(effect.merchantId, plan.conversationId)) {
      await finishInteractionDelivery(plan, false);
      return 'human_takeover';
    }
    const replyGuard = { conversationId: plan.conversationId, incomingMessageId: plan.incomingMessageId, version: plan.ownershipVersion ?? 0 };
    const { canSendConversationReply } = await import('../ai/conversation-handoff');
    if (!await canSendConversationReply((await getPool())!, effect.merchantId, replyGuard, effect.to)) {
      await finishInteractionDelivery(plan, false); return 'human_takeover';
    }
    const result = await sendMerchantWhatsApp({ ...effect, replyGuard });
    if (result.errorCode === 'conversation_superseded') { await finishInteractionDelivery(plan, false); return 'human_takeover'; }
    if (!result.accepted) throw new Error('Reply effect requires delivery review');
  }
  await finishInteractionDelivery(plan, true);
  return 'sent';
}
