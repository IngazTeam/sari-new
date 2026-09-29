import { sql } from "drizzle-orm";
import { getDb } from "../db/connection";
import type {
  SendMerchantWhatsAppInput,
  WhatsAppProviderConfig,
} from "../channels/whatsapp/types";
import { sendMerchantWhatsApp } from "../channels/whatsapp/service";
import {
  assertCoachingSchema,
  coachingRows,
  currentCoachingQuestion,
  readCoachingQuestion,
  verifyCoachingContext,
} from "./coaching-store";

export async function canDispatchCoachingQuestion(
  input: SendMerchantWhatsAppInput,
  config: WhatsAppProviderConfig
): Promise<boolean> {
  try {
    const id = input.coachingGuard?.questionId;
    if (!Number.isSafeInteger(id) || Number(id) < 1) return false;
    const db = await getDb();
    if (!db) return false;
    const question = await readCoachingQuestion(input.merchantId, Number(id));
    if (
      !question ||
      question.merchant_verdict ||
      question.session_status !== "active" ||
      !Number(question.recent_session) ||
      Number(question.question_order) !==
        Number(question.current_question_index) + 1
    )
      return false;
    const context = await verifyCoachingContext(db, question);
    return (
      input.idempotencyKey === question.delivery_key &&
      input.instanceRecordId === context.instanceId &&
      input.to === context.recipient &&
      input.kind === "text" &&
      input.text === context.prompt &&
      config.provider === context.provider &&
      config.instanceId === context.accountId
    );
  } catch {
    return false;
  }
}

/** Stable delivery key keeps restarts/replays from resending a question with an uncertain outcome. */
export async function sendCurrentCoachingQuestion(
  merchantId: number,
  sessionId: number
): Promise<boolean> {
  await assertCoachingSchema();
  const question = await currentCoachingQuestion(merchantId, sessionId);
  if (!question) return false;
  const db = await getDb();
  if (!db) throw Error("Coaching storage unavailable");
  const context = await verifyCoachingContext(db, question);
  const result = await sendMerchantWhatsApp({
    merchantId,
    instanceRecordId: context.instanceId,
    idempotencyKey: question.delivery_key,
    to: context.recipient,
    kind: "text",
    text: context.prompt,
    coachingGuard: { questionId: Number(question.id) },
  });
  if (!result.accepted || !result.providerMessageId) return false;
  const [receipt] = await coachingRows(
    db,
    sql`SELECT provider_message_id FROM whatsapp_message_deliveries WHERE merchant_id=${merchantId}
    AND idempotency_key=${question.delivery_key} AND provider_message_id=${result.providerMessageId} AND status IN ('sent','delivered','read')`
  );
  return !!receipt;
}
