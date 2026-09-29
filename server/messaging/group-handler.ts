import { getPool } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";
import { checkoutTransaction } from "../ai/checkout-agreements";
import { readGroupContext, groupJson } from "./group-context";
import {
  understandGroup,
  validateGroupDecision,
} from "../ai/group-understanding";
import { currentInboundExecution } from "./inbound-context";
import {
  createConversation,
  createMessage,
  getConversationById,
  getActiveSubscriptionByMerchantId,
  shouldBotRespond,
} from "../db";
import {
  hasReachedConversationLimit,
  hasReachedMessageLimit,
  incrementConversationUsage,
} from "../usage-tracking";
import { buildReplyPlan, dispatchReplyPlan } from "./reply-plan";
import type { PoolConnection } from "mysql2/promise";
import type { SendMerchantWhatsAppInput } from "../channels/whatsapp/types";

export const assertGroupSchema = () =>
  assertRuntimeSchema("contextual group understanding", [
    {
      table: "ai_group_understanding",
      columns: ["basis_hash", "decision_json", "incoming_message_id"],
      uniqueIndexes: ["uq_group_inbound", "uq_group_message"],
    },
  ]);
async function permitted(merchantId: number) {
  return (
    !!(await getActiveSubscriptionByMerchantId(merchantId)) &&
    (await shouldBotRespond(merchantId)).shouldRespond &&
    !(await hasReachedMessageLimit(merchantId))
  );
}
/** Group conversations never enter customer checkout, memory, keyword rules or merchant commands. */
export async function handleContextualGroup(
  payload: any
): Promise<{ success: boolean; message: string }> {
  try {
    const e = currentInboundExecution();
    if (!e) throw Error("Group execution unavailable");
    // Unsupported media is retained in ingress, not transcribed under a private customer's identity.
    if (
      !["textMessage", "extendedTextMessage", "quotedMessage"].includes(
        payload?.messageData?.typeMessage
      )
    )
      return {
        success: true,
        message: "Group media retained without automated interpretation",
      };
    const pool = await getPool();
    if (!pool) throw Error("Group storage unavailable");
    const [settings] = await pool.execute<any[]>(
      "SELECT group_mode,auto_reply_enabled FROM bot_settings WHERE merchant_id=?",
      [e.merchantId]
    );
    if (
      !settings.length ||
      settings[0].group_mode === "disabled" ||
      !settings[0].auto_reply_enabled
    )
      return { success: true, message: "Group automation disabled" };
    await e.assertOwned();
    await assertGroupSchema();
    const [existing] = await pool.execute<any[]>(
      "SELECT incoming_message_id FROM ai_group_understanding WHERE merchant_id=? AND inbound_id=?",
      [e.merchantId, e.id]
    );
    if (existing.length)
      return {
        success: existing[0].incoming_message_id === null,
        message: "Group interpretation already recorded",
      };
    if (!(await permitted(e.merchantId)))
      return {
        success: true,
        message: "Group response not permitted by current settings or capacity",
      };
    const context = await checkoutTransaction(c => readGroupContext(c));
    if (context.authority.humanOwned)
      return { success: true, message: "Human owns group conversation" };
    if (context.input.mode === "mention_only" && !context.input.mentioned)
      return {
        success: true,
        message: "Group has no native mention of the connected account",
      };
    if (context.input.messages.find(m => m.id === e.id)?.unresolvedQuote)
      return {
        success: true,
        message: "Group quote requires its original context",
      };
    const decision = validateGroupDecision(
      JSON.stringify(await understandGroup(e.merchantId, context.input)),
      context.input
    );
    await e.assertOwned();
    let conversationId: number | null = null,
      incomingMessageId: number | null = null,
      ownershipVersion = 0;
    if (decision.action !== "ignore") {
      if (!(await permitted(e.merchantId)))
        throw Error("Group permission changed");
      const phone = `group_${context.groupJid.slice(0, -5)}`;
      const [found] = await pool.execute<any[]>(
        "SELECT id FROM conversations WHERE merchantId=? AND customerPhone=? ORDER BY id LIMIT 2",
        [e.merchantId, phone]
      );
      if (found.length > 1) throw Error("Ambiguous group conversation");
      conversationId = found[0]?.id || null;
      if (!conversationId) {
        if (await hasReachedConversationLimit(e.merchantId))
          throw Error("Group conversation limit");
        const created = await createConversation({
          merchantId: e.merchantId,
          customerPhone: phone,
          customerName: "مجموعة واتساب",
          status: "active",
        });
        if (!created) throw Error("Group conversation not saved");
        conversationId = created.id;
        await incrementConversationUsage(e.merchantId);
      }
      const conversation = await getConversationById(conversationId!);
      if (
        !conversation ||
        conversation.merchantId !== e.merchantId ||
        conversation.customerPhone !== phone
      )
        throw Error("Group ownership unavailable");
      if (conversation.humanTakeover)
        return { success: true, message: "Human owns group conversation" };
      if (conversation.handoffVersion !== context.authority.version)
        throw Error("Group ownership changed during AI");
      ownershipVersion = context.authority.version;
      const incoming = await createMessage({
        conversationId: conversationId!,
        direction: "incoming",
        messageType: "text",
        content: context.input.messages.find(m => m.id === e.id)!.text,
        externalId: `inbound:v1:${e.eventKey}`,
        isProcessed: 0,
      });
      if (!incoming) throw Error("Group message not saved");
      incomingMessageId = incoming.id;
    }
    await checkoutTransaction(async c => {
      await c.execute("SELECT id FROM merchants WHERE id=? FOR UPDATE", [
        e.merchantId,
      ]);
      const fresh = await readGroupContext(c, true);
      if (fresh.input.basisHash !== context.input.basisHash)
        throw Error("Group context changed during AI");
      validateGroupDecision(JSON.stringify(decision), fresh.input);
      await c.execute(
        `INSERT INTO ai_group_understanding (merchant_id,instance_id,inbound_id,event_key,basis_hash,decision_json,conversation_id,incoming_message_id)
        VALUES (?,?,?,?,?,?,?,?)`,
        [
          e.merchantId,
          e.instanceId,
          e.id,
          e.eventKey,
          context.input.basisHash,
          JSON.stringify(decision),
          conversationId,
          incomingMessageId,
        ]
      );
    });
    if (decision.action === "ignore")
      return {
        success: true,
        message: "Group context does not require a reply",
      };
    const plan = buildReplyPlan({
      merchantId: e.merchantId,
      instanceId: e.instanceId,
      providerAccount: context.account,
      eventId: `inbound:v1:${e.eventKey}`,
      conversationId: conversationId!,
      incomingMessageId: incomingMessageId!,
      ownershipVersion,
      to: context.groupJid,
      text: decision.reply!,
    });
    const result = await dispatchReplyPlan(plan);
    if (result !== "sent")
      return {
        success: true,
        message: "Group reply suppressed by current authority",
      };
    await createMessage({
      conversationId: conversationId!,
      direction: "outgoing",
      senderType: "assistant",
      messageType: "text",
      content: decision.reply!,
      aiResponse: decision.reply!,
      isProcessed: 1,
    });
    await pool.execute(
      "UPDATE messages SET isProcessed=1 WHERE id=? AND conversationId=?",
      [incomingMessageId, conversationId]
    );
    return { success: true, message: "Contextual group reply accepted" };
  } catch {
    console.warn("[GroupUnderstanding] Group reply not confirmed");
    return {
      success: false,
      message: "Group interpretation or delivery unavailable",
    };
  }
}

/** Recheck the persisted interpretation and its original group immediately before channel dispatch. */
export async function canDispatchGroupReply(
  c: PoolConnection,
  input: SendMerchantWhatsAppInput,
  instanceId: number
) {
  const e = currentInboundExecution(),
    guard = input.replyGuard;
  if (
    !e ||
    !guard?.incomingMessageId ||
    e.merchantId !== input.merchantId ||
    e.instanceId !== instanceId ||
    input.kind !== "text"
  )
    return false;
  await assertGroupSchema();
  const [rows] = await c.execute<any[]>(
    `SELECT a.*,m.content,m.externalId FROM ai_group_understanding a JOIN messages m ON m.id=a.incoming_message_id AND m.conversationId=a.conversation_id
    WHERE a.merchant_id=? AND a.instance_id=? AND a.inbound_id=? AND a.conversation_id=? AND a.incoming_message_id=? FOR SHARE`,
    [
      input.merchantId,
      instanceId,
      e.id,
      guard.conversationId,
      guard.incomingMessageId,
    ]
  );
  if (rows.length !== 1) return false;
  const context = await readGroupContext(c, true),
    row = rows[0];
  if (
    context.groupJid !== input.to ||
    row.event_key !== e.eventKey ||
    row.basis_hash !== context.input.basisHash ||
    row.externalId !== `inbound:v1:${e.eventKey}` ||
    row.content !== context.input.messages.find(m => m.id === e.id)?.text
  )
    return false;
  const decision = validateGroupDecision(
    JSON.stringify(groupJson(row.decision_json)),
    context.input
  );
  return decision.action !== "ignore" && decision.reply === input.text;
}
