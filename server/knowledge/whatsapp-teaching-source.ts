import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, type SariDb } from "../db/connection";
import { currentInboundExecution } from "../messaging/inbound-context";
import type { KnowledgeTransaction } from "./transaction";
import { quotedEscalationMessageId } from "../ai/escalation-relay";

export type TeachingSource = Readonly<{
  merchantId: number;
  inboundId: number;
  instanceId: number;
  eventKey: string;
  authorPhone: string;
  text: string;
  digest: string;
  quotedMessageId?: string;
}>;
const decode = (value: unknown): any =>
  typeof value === "string" ? JSON.parse(value) : value;
function phone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value
    .replace(/@(c\.us|s\.whatsapp\.net)$/, "")
    .replace(/[+\s()\-]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = "966" + digits.slice(1);
  if (/^5\d{8}$/.test(digits)) digits = "966" + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** Read the durable inbound event, not caller-supplied sender/tenant claims. The final
 * read locks the event and current authority in the same transaction as knowledge. */
export async function readTeachingSource(
  merchantId: number,
  text: string,
  executor?: SariDb | KnowledgeTransaction,
  lock = false,
  quotedMessageId?: string
): Promise<TeachingSource> {
  const execution = currentInboundExecution();
  if (
    !execution ||
    execution.merchantId !== merchantId ||
    !Number.isSafeInteger(merchantId) ||
    merchantId < 1 ||
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 16000 ||
    text.includes("\0")
  )
    throw Error("Teaching source unavailable");
  if (!lock) await execution.assertOwned();
  const db = executor || (await getDb());
  if (!db) throw Error("Teaching storage unavailable");
  const [rows] =
    await db.execute(sql`SELECT j.payload_json,j.event_key,j.instance_id,
      i.instance_id AS account_id,i.provider,i.phone_number AS instance_phone,m.phone,m.emergency_phone,m.escalation_phones
    FROM whatsapp_inbound_jobs j JOIN whatsapp_instances i ON i.id=j.instance_id AND i.merchant_id=j.merchant_id
    JOIN merchants m ON m.id=j.merchant_id JOIN users u ON u.id=m.userId
    WHERE j.id=${execution.id} AND j.merchant_id=${merchantId} AND j.instance_id=${execution.instanceId}
      AND j.event_key=${execution.eventKey} AND j.lease_token=${execution.token} AND j.status='running'
      AND j.partition_key=${execution.partitionKey}
      AND j.lease_until>UTC_TIMESTAMP(3) AND i.status='active' AND m.status<>'suspended' AND u.account_status='active'
    ${lock ? sql`FOR UPDATE` : sql``}`);
  const row = (rows as unknown as any[])[0];
  if (!row) throw Error("Teaching source no longer owned");
  const payload = decode(row.payload_json),
    md = payload?.messageData;
  const eventHash = createHash("sha256")
    .update(
      JSON.stringify([
        merchantId,
        payload?.sourceProvider,
        String(payload?.instanceData?.idInstance || ""),
        String(payload?.idMessage || ""),
      ])
    )
    .digest("hex");
  const partitionHash = createHash("sha256")
    .update(
      JSON.stringify([
        merchantId,
        String(payload?.senderData?.chatId || "").replace(
          "@s.whatsapp.net",
          "@c.us"
        ),
      ])
    )
    .digest("hex");
  const sourceText =
    md?.extendedTextMessageData?.text ?? md?.textMessageData?.textMessage;
  const sender = phone(
    payload?.senderData?.sender ?? payload?.senderData?.chatId
  );
  const chat = phone(payload?.senderData?.chatId);
  if (
    payload?.typeWebhook !== "incomingMessageReceived" ||
    String(payload?.instanceData?.idInstance) !== row.account_id ||
    payload.sourceProvider !== row.provider ||
    eventHash !== row.event_key ||
    partitionHash !== execution.partitionKey ||
    !sender ||
    sender !== chat ||
    sourceText !== text ||
    !(
      quotedMessageId
        ? ["textMessage", "extendedTextMessage", "quotedMessage"]
        : ["textMessage", "extendedTextMessage"]
    ).includes(md?.typeMessage) ||
    (quotedMessageId
      ? quotedEscalationMessageId(payload) !== quotedMessageId
      : !!(
          md?.quotedMessage ||
          md?.extendedTextMessageData?.quotedMessage ||
          md?.extendedTextMessageData?.stanzaId
        ))
  ) {
    throw Error("Teaching requires an original private message");
  }
  let chain: unknown = [];
  try {
    chain = decode(row.escalation_phones);
  } catch {
    /* Invalid chain grants no authority. */
  }
  const allowed = [
    row.phone,
    row.emergency_phone,
    row.instance_phone,
    ...(Array.isArray(chain) ? chain.map(entry => entry?.phone) : []),
  ]
    .map(phone)
    .filter(Boolean);
  if (!allowed.includes(sender))
    throw Error("Teaching author no longer authorized");
  const value = {
    merchantId,
    inboundId: execution.id,
    instanceId: execution.instanceId,
    eventKey: row.event_key as string,
    authorPhone: sender,
    text,
    ...(quotedMessageId ? { quotedMessageId } : {}),
  };
  if (!/^[a-f0-9]{64}$/.test(value.eventKey))
    throw Error("Invalid teaching event");
  return Object.freeze({
    ...value,
    digest: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  });
}
