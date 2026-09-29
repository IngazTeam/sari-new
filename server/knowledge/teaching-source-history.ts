import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, type SariDb } from "../db/connection";
import type { KnowledgeTransaction } from "./transaction";
import type { TeachingSource } from "./whatsapp-teaching-source";
import { quotedEscalationMessageId } from "../ai/escalation-relay";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const decode = (value: any) =>
  typeof value === "string" ? JSON.parse(value) : value;
export const teachingHistoryPhone = (value: any) => {
  if (typeof value !== "string") return null;
  let digits = value
    .replace(/@(c\.us|s\.whatsapp\.net)$/, "")
    .replace(/[+\s()\-]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = "966" + digits.slice(1);
  if (/^5\d{8}$/.test(digits)) digits = "966" + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
};
/** Historical fragments need source integrity, not a lease that has long since completed. */
export async function verifyTeachingHistory(
  source: TeachingSource,
  executor?: Pick<SariDb | KnowledgeTransaction, "execute">,
  lock = false
) {
  const db = executor || (await getDb());
  if (!db) throw Error("Teaching history unavailable");
  const [rows] =
    await db.execute(sql`SELECT j.payload_json,j.event_key,j.partition_key,j.instance_id,i.instance_id AS account_id,i.provider
    FROM whatsapp_inbound_jobs j JOIN whatsapp_instances i ON i.id=j.instance_id AND i.merchant_id=j.merchant_id
    WHERE j.id=${source.inboundId} AND j.merchant_id=${source.merchantId} ${lock ? sql`FOR UPDATE` : sql``}`);
  validateTeachingHistory(source, Array.isArray(rows) ? rows[0] : undefined);
}

/** Pure validation shared by approval and batched knowledge retrieval. */
export function validateTeachingHistory(source: TeachingSource, row: any) {
  if (!row) throw Error("Teaching history removed");
  const payload = decode(row.payload_json),
    md = payload?.messageData;
  const body = {
    merchantId: source.merchantId,
    inboundId: source.inboundId,
    instanceId: source.instanceId,
    eventKey: source.eventKey,
    authorPhone: source.authorPhone,
    text: source.text,
    ...(source.quotedMessageId
      ? { quotedMessageId: source.quotedMessageId }
      : {}),
  };
  if (
    source.digest !== hash(body) ||
    source.eventKey !== row.event_key ||
    source.instanceId !== row.instance_id ||
    payload?.typeWebhook !== "incomingMessageReceived" ||
    payload?.sourceProvider !== row.provider ||
    String(payload?.instanceData?.idInstance) !== row.account_id ||
    hash([
      source.merchantId,
      payload.sourceProvider,
      String(payload.instanceData.idInstance),
      String(payload.idMessage || ""),
    ]) !== row.event_key ||
    hash([
      source.merchantId,
      String(payload?.senderData?.chatId || "").replace(
        "@s.whatsapp.net",
        "@c.us"
      ),
    ]) !== row.partition_key ||
    teachingHistoryPhone(
      payload?.senderData?.sender ?? payload?.senderData?.chatId
    ) !== source.authorPhone ||
    teachingHistoryPhone(payload?.senderData?.chatId) !== source.authorPhone ||
    (md?.extendedTextMessageData?.text ?? md?.textMessageData?.textMessage) !==
      source.text ||
    (quotedEscalationMessageId(payload) || undefined) !==
      source.quotedMessageId ||
    source.quotedMessageId ||
    [
      md?.quotedMessage?.stanzaId,
      md?.extendedTextMessageData?.stanzaId,
      md?.extendedTextMessageData?.quotedMessage?.stanzaId,
    ].some(v => v !== undefined && v !== null) ||
    !["textMessage", "extendedTextMessage"].includes(md?.typeMessage)
  )
    throw Error("Teaching history changed");
}
