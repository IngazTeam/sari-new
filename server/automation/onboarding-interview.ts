import { getMerchantById } from "../db";
import {
  beginOnboarding,
  commitOnboarding,
  findOnboardingReceipt,
  onboardingSession,
  readOnboardingContext,
  readVerifiedOnboardingAnswers,
  type OnboardingResult,
} from "./onboarding-store";
import { understandOnboarding } from "./onboarding-understanding";
import { FIELD_LABELS, nextOnboardingQuestion } from "./onboarding-questions";
import { sendOnboardingQuestion } from "./onboarding-delivery";

export async function isOnboardingActive(merchantId: number) {
  return (await onboardingSession(merchantId))?.status === "active";
}
export async function needsOnboarding(merchantId: number) {
  const [session, merchant] = await Promise.all([
    onboardingSession(merchantId),
    getMerchantById(merchantId),
  ]);
  return !!merchant && !session;
}
export async function getNextQuestion(merchantId: number) {
  return nextOnboardingQuestion(
    await readVerifiedOnboardingAnswers(merchantId)
  );
}
/** A start is not reported as delivered until the durable provider receipt exists. */
export async function startOnboardingInterview(
  merchantId: number,
  instanceId: number,
  recipient: string
): Promise<boolean> {
  const version = await beginOnboarding(merchantId, instanceId, recipient);
  return version !== null && sendOnboardingQuestion(merchantId, version);
}
/** Called for the complete merchant text before generic teaching; no keyword gate. */
export async function handleOnboardingReply(
  merchantId: number,
  message: string,
  quotedMessageId?: string
): Promise<OnboardingResult> {
  const context = await readOnboardingContext(
    merchantId,
    message,
    quotedMessageId
  );
  const prior = await findOnboardingReceipt(context);
  if (prior) return prior;
  if (quotedMessageId && !context.ownedQuote)
    return { handled: false, response: "" };
  if (context.ownedQuote && !context.input.canAnswer)
    return {
      handled: true,
      response:
        "هذا السؤال لم يعد السؤال الحالي. لم أحفظ إجابة عليه؛ أجب عن آخر سؤال أو اطلب استئناف المقابلة.",
    };
  // Failure is terminal for this routing attempt; never turn an uncertain answer into generic knowledge.
  const decision = await understandOnboarding(merchantId, context.input);
  return commitOnboarding(context, decision);
}
export const handleUpdateCommand = handleOnboardingReply;
export async function buildOnboardingContext(
  merchantId: number
): Promise<string | null> {
  try {
    const answers = await readVerifiedOnboardingAnswers(merchantId);
    const fields = Object.entries(answers).map(([key, value]) => ({
      field: key,
      label: FIELD_LABELS[key],
      value,
    }));
    return fields.length
      ? JSON.stringify({ source: "verified_merchant_onboarding", fields })
      : null;
  } catch {
    console.warn("[Onboarding] Verified context unavailable");
    return null;
  }
}
