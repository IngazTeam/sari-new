import { getPool } from "../db/connection";
import { sendMerchantWhatsApp } from "../channels/whatsapp/service";
import type {
  SendMerchantWhatsAppInput,
  WhatsAppProviderConfig,
} from "../channels/whatsapp/types";
import {
  onboardingSession,
  readVerifiedOnboardingAnswers,
  verifyOnboardingRecipient,
  onboardingRows,
} from "./onboarding-store";
import { onboardingPrompt } from "./onboarding-questions";
export async function canDispatchOnboardingQuestion(
  input: SendMerchantWhatsAppInput,
  config: WhatsAppProviderConfig
) {
  try {
    const db = await getPool();
    if (!db) return false;
    const session = await onboardingSession(input.merchantId, db);
    if (
      !session ||
      session.status !== "active" ||
      session.version !== input.onboardingGuard?.version ||
      session.instance_id !== input.instanceRecordId ||
      session.recipient !== input.to ||
      input.kind !== "text" ||
      input.idempotencyKey !== session.delivery_key ||
      input.text !== session.prompt_text
    )
      return false;
    const recipient = await verifyOnboardingRecipient(
      db,
      input.merchantId,
      session.instance_id,
      session.recipient
    );
    return (
      recipient.provider === config.provider &&
      recipient.account === config.instanceId &&
      session.prompt_text ===
        onboardingPrompt(
          await readVerifiedOnboardingAnswers(input.merchantId, db)
        )
    );
  } catch {
    return false;
  }
}
export async function sendOnboardingQuestion(
  merchantId: number,
  version: number
): Promise<boolean> {
  const session = await onboardingSession(merchantId);
  if (!session || session.version !== version || session.status !== "active")
    return false;
  const result = await sendMerchantWhatsApp({
    merchantId,
    instanceRecordId: session.instance_id,
    idempotencyKey: session.delivery_key,
    to: session.recipient,
    kind: "text",
    text: session.prompt_text,
    onboardingGuard: { version },
  });
  if (!result.accepted || !result.providerMessageId) return false;
  const db = await getPool();
  if (!db) return false;
  const [receipt] = await onboardingRows(
    db,
    "SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? AND provider_message_id=? AND status IN ('sent','delivered','read')",
    [merchantId, session.delivery_key, result.providerMessageId]
  );
  return !!receipt;
}
