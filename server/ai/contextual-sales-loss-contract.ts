import type { ConversationUnderstanding } from "./conversation-understanding-context";

/** This describes an explicit decision about this sales opportunity, never a payment fact or causal sales lift. */
export function contextualSalesLossReason(
  analysis?: ConversationUnderstanding
) {
  if (!analysis) return null;
  const loss = analysis.salesLoss;
  if (
    !loss ||
    loss.status !== "declined" ||
    !loss.reason ||
    analysis.confidence < 0.85 ||
    analysis.conditional ||
    analysis.ambiguous ||
    analysis.intent !== "declined" ||
    analysis.goal !== "respect_decline" ||
    analysis.nextStep !== "respect_decline" ||
    !["respond", "decline_offer"].includes(analysis.action) ||
    (analysis.followup && analysis.followup.status !== "none") ||
    (analysis.automaticFollowup &&
      analysis.automaticFollowup.status !== "none") ||
    (analysis.appointmentReminder &&
      analysis.appointmentReminder.status !== "none")
  )
    return null;
  return loss.reason;
}
