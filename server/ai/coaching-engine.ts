/** Merchant coaching: sourced questions, quoted replies and central AI interpretation. */
import { getMerchantById } from "../db";
import {
  getActiveSession,
  getReviewCandidates,
  getLastSessionDate,
  expireStaleSessions,
} from "../db/coaching";
import { createContextualCoachingSession } from "./coaching-store";
import { sendCurrentCoachingQuestion } from "./coaching-delivery";
export { getActiveSession, sendCurrentCoachingQuestion };
export { handleMerchantTeaching as handleTeachCommand } from "./merchant-teaching-handler";
export { handleContextualCoachingReply as handleCoachingReply } from "./coaching-handler";
const MIN_HOURS_BETWEEN_SESSIONS = 24;
const MIN_CANDIDATES_TO_TRIGGER = 3;
export async function shouldTriggerCoaching(
  merchantId: number
): Promise<boolean> {
  try {
    // Gate 1: Cooldown — at least 24 hours since last session
    const lastSession = await getLastSessionDate(merchantId);
    if (lastSession) {
      const hoursSinceLast =
        (Date.now() - lastSession.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < MIN_HOURS_BETWEEN_SESSIONS) return false;
    }

    // Gate 2: Business hours (8 AM - 9 PM)
    const hour = new Date().getHours();
    if (hour < 8 || hour >= 21) return false;

    // Gate 3: No active session already running
    const active = await getActiveSession(merchantId);
    if (active) return false;

    // Gate 4: Enough unreviewed content (3+ candidates)
    const candidates = await getReviewCandidates(
      merchantId,
      MIN_CANDIDATES_TO_TRIGGER
    );
    if (candidates.length < MIN_CANDIDATES_TO_TRIGGER) return false;

    // Gate 5: Merchant has WhatsApp escalation phones configured
    const merchant = await getMerchantById(merchantId);
    if (!merchant) return false;
    const hasPhone =
      (merchant as any).escalationPhones ||
      (merchant as any).emergencyPhone ||
      merchant.phone;
    if (!hasPhone) return false;

    return true;
  } catch (err: any) {
    console.warn("[Coaching] Trigger unavailable");
    return false;
  }
}

export async function startCoachingSession(
  merchantId: number
): Promise<number | null> {
  try {
    const candidates = await getReviewCandidates(merchantId, 2);
    if (!candidates.length) return null;
    const sessionId = await createContextualCoachingSession(
      merchantId,
      candidates
    );
    if (
      !sessionId ||
      !(await sendCurrentCoachingQuestion(merchantId, sessionId))
    )
      return null;
    return sessionId;
  } catch {
    console.warn("[Coaching] Session delivery not confirmed");
    return null;
  }
}
export async function processCoachingMaintenance(): Promise<void> {
  try {
    await expireStaleSessions();
  } catch {
    console.warn("[Coaching] Maintenance not confirmed");
  }
}
