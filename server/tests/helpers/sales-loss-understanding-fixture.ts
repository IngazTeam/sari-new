import type { ConversationUnderstanding } from "../../ai/conversation-understanding-context";
import type { UnderstandingInput } from "../../ai/conversation-understanding";
import { followupUnderstandingFixture } from "./followup-understanding-fixture";

/** A synthetic provider result for storage/control tests, not evidence of live model comprehension. */
export function salesLossUnderstandingFixture(
  input: UnderstandingInput,
  changes: Partial<ConversationUnderstanding> = {}
): ConversationUnderstanding {
  const base = followupUnderstandingFixture(input);
  delete base.followup;
  return {
    ...base,
    intent: "declined",
    goal: "respect_decline",
    action: "respond",
    nextStep: "respect_decline",
    objection: "none",
    needs: [],
    summary: "رفض العميل إتمام فرصة الشراء الحالية بسبب التوقيت.",
    salesLoss: {
      status: "declined",
      reason: "timing",
      evidence: base.evidence,
    },
    ...changes,
  };
}
