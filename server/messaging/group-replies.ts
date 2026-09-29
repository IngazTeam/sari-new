import type { PoolConnection } from "mysql2/promise";
import { groupDecisionSchema, groupHash } from "../ai/group-understanding";
import { ordinaryReplyDigest } from "../ai/reply-reservation";
import { policyArtifactDigest } from "../ai/learning-policy-evaluation-bundle";
import { whatsAppEventEffectKey } from "../channels/whatsapp/effect-key";

const parsed = (v: any): any => (typeof v === "string" ? JSON.parse(v) : v);
type Message = { id: number; providerId: string; text: string };
/** Reconstruct history from the original turn, reserved plan and accepted outbox.
 * A participant's embedded quote text is never evidence of what the bot sent. */
export async function readVerifiedGroupReplies(
  c: Pick<PoolConnection, "execute">,
  input: {
    merchantId: number;
    instanceId: number;
    account: string;
    provider: string;
    groupJid: string;
    currentId: number;
    messages: Message[];
  },
  lock = false
) {
  const ids = input.messages.filter(m => m.id < input.currentId).map(m => m.id);
  if (!ids.length) return [];
  const [rows] = await c.execute<any[]>(
    `SELECT a.*,j.reply_plan_json,m.content,m.externalId,
    i.reply_plan,i.reply_digest,i.reply_text,i.reply_origin,i.usage_outbox_id,i.usage_request_digest,i.usage_provider,
    d.id AS delivery_id,d.provider_message_id,d.request_json,d.provider,d.idempotency_key,
    (SELECT COUNT(*) FROM whatsapp_message_deliveries other WHERE other.merchant_id=d.merchant_id
      AND other.instance_id=d.instance_id AND other.provider=d.provider AND other.direction='outgoing' AND other.provider_message_id=d.provider_message_id) AS receipt_count
    FROM ai_group_understanding a
    JOIN whatsapp_inbound_jobs j ON j.id=a.inbound_id AND j.merchant_id=a.merchant_id AND j.instance_id=a.instance_id AND j.event_key=a.event_key AND j.status='completed'
    JOIN conversations v ON v.id=a.conversation_id AND v.merchantId=a.merchant_id AND v.customerPhone=?
    JOIN messages m ON m.id=a.incoming_message_id AND m.conversationId=a.conversation_id AND m.direction='incoming'
    JOIN ai_interaction_jobs i ON i.merchant_id=a.merchant_id AND i.conversation_id=a.conversation_id AND i.incoming_message_id=a.incoming_message_id
    JOIN whatsapp_message_deliveries d ON d.id=i.usage_outbox_id AND d.merchant_id=a.merchant_id AND d.instance_id=a.instance_id
    WHERE a.merchant_id=? AND a.instance_id=? AND a.inbound_id IN (${ids.map(() => "?").join(",")})
      AND d.direction='outgoing' AND d.status IN ('sent','delivered','read')
      AND d.provider_message_id IS NOT NULL ORDER BY a.inbound_id,d.id${lock ? " FOR SHARE" : ""}`,
    [
      `group_${input.groupJid.slice(0, -5)}`,
      input.merchantId,
      input.instanceId,
      ...ids,
    ]
  );
  return rows.flatMap(r => {
    try {
      const decision = groupDecisionSchema.parse(parsed(r.decision_json)),
        req = parsed(r.request_json),
        plan = parsed(r.reply_plan);
      const source = input.messages.find(m => m.id === Number(r.inbound_id));
      if (
        !source ||
        !decision.reply ||
        decision.action === "ignore" ||
        decision.basisHash !== r.basis_hash ||
        decision.currentMessageId !== source.id ||
        !decision.evidence.some(e => e.messageId === source.id) ||
        decision.evidence.some(
          e =>
            !input.messages.some(
              m =>
                m.id <= source.id &&
                m.id === e.messageId &&
                m.text.includes(e.excerpt)
            )
        ) ||
        r.content !== source.text ||
        r.externalId !== `inbound:v1:${r.event_key}` ||
        r.reply_origin !== "ordinary" ||
        r.provider !== input.provider ||
        r.usage_provider !== input.provider ||
        Number(r.receipt_count) !== 1 ||
        typeof r.provider_message_id !== "string" ||
        !r.provider_message_id.trim() ||
        r.provider_message_id.length > 255 ||
        ordinaryReplyDigest(plan) !== r.reply_digest ||
        ordinaryReplyDigest(parsed(r.reply_plan_json)) !== r.reply_digest ||
        plan.effects?.length !== 1 ||
        plan.conversationId !== Number(r.conversation_id) ||
        plan.incomingMessageId !== Number(r.incoming_message_id) ||
        !req ||
        policyArtifactDigest(req) !== r.usage_request_digest ||
        req.inboundJobId !== source.id ||
        req.replyGuard?.conversationId !== plan.conversationId ||
        req.replyGuard?.incomingMessageId !== plan.incomingMessageId ||
        req.replyGuard?.version !== plan.ownershipVersion ||
        req.replyGuard?.reservationDigest !== r.reply_digest ||
        req.kind !== "text" ||
        req.to !== input.groupJid ||
        req.text !== decision.reply ||
        r.reply_text !== decision.reply
      )
        return [];
      const expected = {
        kind: "text",
        text: decision.reply,
        to: input.groupJid,
        merchantId: input.merchantId,
        instanceRecordId: input.instanceId,
        idempotencyKey: whatsAppEventEffectKey(
          input.merchantId,
          input.account,
          `inbound:v1:${r.event_key}`,
          "reply"
        ),
      };
      if (
        policyArtifactDigest(plan.effects[0]) !==
          policyArtifactDigest(expected) ||
        r.idempotency_key !== expected.idempotencyKey
      )
        return [];
      return [
        {
          afterMessageId: source.id,
          text: decision.reply,
          providerMessageId: r.provider_message_id as string,
          proof: groupHash({
            deliveryId: r.delivery_id,
            event: r.event_key,
            basis: r.basis_hash,
            decision,
            plan,
            request: req,
            providerMessageId: r.provider_message_id,
          }),
        },
      ];
    } catch {
      return [];
    }
  });
}
