import type { ConversationUnderstanding } from "../../ai/conversation-understanding-context";
import type { UnderstandingInput } from "../../ai/conversation-understanding";
import type { ContextualLearningSignal } from "../../ai/contextual-learning-contract";
import { followupUnderstandingFixture } from "./followup-understanding-fixture";

/** Explicit synthetic model output for lifecycle tests, not a language-classification oracle. */
export function learningUnderstandingFixture(
  input: UnderstandingInput,
  types: ContextualLearningSignal["type"][] = ["price_objection"],
  changes: Partial<ConversationUnderstanding> = {}
): ConversationUnderstanding {
  const base = followupUnderstandingFixture(input);
  delete base.followup;
  const current = input.messages.find(m => m.id === input.currentMessageId)!;
  const assistant = input.messages
    .filter(
      m =>
        m.id < input.currentMessageId &&
        m.role === "assistant" &&
        m.isAiReply === true
    )
    .at(-1);
  const handoff = types.includes("escalation_requested");
  return {
    ...base,
    intent: "objecting",
    goal: "understand_objection",
    action: handoff ? "request_human" : "respond",
    nextStep: handoff ? "handoff" : "address_objection",
    objection: types.includes("price_objection")
      ? "price"
      : types.includes("sales_objection")
        ? "trust"
        : "none",
    summary: "تفسير اصطناعي لإشارات الحوار مع الإسناد إلى الرد السابق.",
    learningSignals: types.map(type => ({
      type,
      aboutAssistantMessageId: assistant?.id ?? null,
      evidence: [
        { messageId: current.id, excerpt: current.content.slice(0, 300) },
        ...(assistant
          ? [
              {
                messageId: assistant.id,
                excerpt: assistant.content.slice(0, 300),
              },
            ]
          : []),
      ],
    })),
    ...changes,
  };
}
