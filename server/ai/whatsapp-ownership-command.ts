import { z } from "zod";
import { checkoutTransaction } from "./checkout-agreements";
import { transitionOwnershipInTransaction } from "./conversation-handoff";
import { destroySession } from "./session-context";

/** Deliberate controls, never an interpretation of ordinary conversation. */
export function explicitOwnershipCommand(
  text: unknown
): "takeover" | "resume" | null {
  if (typeof text !== "string") return null;
  const command = text.trim().toLowerCase();
  return command === "#stop"
    ? "takeover"
    : command === "#start"
      ? "resume"
      : null;
}

export function isUnquotedManualText(payload: any): boolean {
  const data = payload?.messageData,
    extended = data?.extendedTextMessageData;
  return (
    payload?.typeWebhook === "outgoingMessageReceived" &&
    ["textMessage", "extendedTextMessage"].includes(data?.typeMessage) &&
    data?.quotedMessage === undefined &&
    extended?.quotedMessage === undefined &&
    extended?.stanzaId === undefined
  );
}

const inputSchema = z
  .object({
    merchantId: z.number().int().positive().safe(),
    instanceRecordId: z.number().int().positive().safe(),
    customerPhone: z.string().regex(/^\d{7,15}$/),
    messageId: z.string().regex(/^[^\s<>\x00-\x1f]{1,255}$/),
    text: z.string().min(1).max(100),
  })
  .strict();

/** Only called for authenticated, manual, unquoted text callbacks. Save the
 * receipt and ownership atomically so a delayed duplicate cannot undo new work. */
export async function applyWhatsAppOwnershipCommand(
  value: z.infer<typeof inputSchema>
) {
  const input = inputSchema.parse(value),
    action = explicitOwnershipCommand(input.text);
  if (!action) throw Error("Explicit ownership command required");
  const result = await checkoutTransaction(async connection => {
    await connection.execute("SELECT id FROM merchants WHERE id=? FOR UPDATE", [
      input.merchantId,
    ]);
    const [instances] = await connection.execute<any[]>(
      "SELECT id FROM whatsapp_instances WHERE id=? AND merchant_id=? FOR UPDATE",
      [input.instanceRecordId, input.merchantId]
    );
    if (instances.length !== 1) throw Error("Command instance unavailable");
    const [conversations] = await connection.execute<any[]>(
      "SELECT id,handoff_version FROM conversations WHERE merchantId=? AND customerPhone=? FOR UPDATE",
      [input.merchantId, input.customerPhone]
    );
    if (conversations.length !== 1)
      throw Error("Command conversation unavailable");
    const conversation = conversations[0];
    const [receipts] = await connection.execute<any[]>(
      "SELECT conversationId,direction,sender_type,content,externalId FROM messages WHERE externalId=?",
      [input.messageId]
    );
    if (receipts.length) {
      const receipt = receipts[0];
      if (
        receipt.externalId !== input.messageId ||
        receipt.conversationId !== conversation.id ||
        receipt.direction !== "outgoing" ||
        receipt.sender_type !== "merchant" ||
        receipt.content !== input.text
      )
        throw Error("Command receipt conflict");
      // Also treats a command recorded while commands were disabled as already
      // observed: enabling settings later must not execute an old message.
      return {
        changed: false,
        duplicate: true,
        conversationId: conversation.id,
        version: conversation.handoff_version,
      };
    }
    await connection.execute(
      `INSERT INTO messages (conversationId,direction,sender_type,messageType,content,externalId,isProcessed)
      VALUES (?,'outgoing','merchant','text',?,?,1)`,
      [conversation.id, input.text, input.messageId]
    );
    const transition = await transitionOwnershipInTransaction(
      connection,
      conversation.id,
      action === "takeover"
        ? {
            humanTakeover: 1,
            humanTakeoverAt: new Date(),
            humanExpiresAt: null,
          }
        : { humanTakeover: 0, humanExpiresAt: null },
      {
        merchantId: input.merchantId,
        expectedVersion: conversation.handoff_version,
        reason: "manual",
      }
    );
    await connection.execute(
      "UPDATE conversations SET lastMessageAt=UTC_TIMESTAMP() WHERE id=? AND merchantId=?",
      [conversation.id, input.merchantId]
    );
    return {
      changed: transition.changed,
      duplicate: false,
      conversationId: conversation.id,
      version: transition.version,
    };
  });
  if (result.changed) destroySession(input.merchantId, result.conversationId);
  return { ...result, action };
}
