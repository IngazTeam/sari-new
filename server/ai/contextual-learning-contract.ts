import type { ConversationUnderstanding } from "./conversation-understanding-context";
import type { UnderstandingInput } from "./conversation-understanding";

export type ContextualLearningSignal = NonNullable<
  ConversationUnderstanding["learningSignals"]
>[number];
export const contextualLearningWeights: Record<
  ContextualLearningSignal["type"],
  number
> = {
  positive_feedback: 1,
  question_repeated: 1.2,
  price_objection: 1,
  sales_objection: 1,
  escalation_requested: 1.5,
  knowledge_gap: 1.3,
};
export function resolvedLearningSignals(
  analysis?: ConversationUnderstanding
): ContextualLearningSignal[] {
  return !analysis ||
    analysis.confidence < 0.85 ||
    analysis.ambiguous ||
    analysis.conditional
    ? []
    : analysis.learningSignals || [];
}
/** Facts come from stored messages. This validator does not reinterpret words or prove causal sales improvement. */
export function validateLearningSignals(
  analysis: ConversationUnderstanding,
  input: UnderstandingInput
) {
  const signals = analysis.learningSignals || [];
  if (!signals.length) return;
  if (
    !resolvedLearningSignals(analysis).length ||
    new Set(signals.map(s => s.type)).size !== signals.length
  )
    throw Error("Invalid learning decision");
  if (
    signals.some(s => s.type === "price_objection") &&
    signals.some(s => s.type === "sales_objection")
  )
    throw Error("Duplicate objection");
  for (const signal of signals) {
    if (
      !signal.evidence.some(
        e =>
          e.messageId === input.currentMessageId &&
          input.messages.some(m => m.id === e.messageId && m.role === "user")
      ) ||
      signal.evidence.some(
        e =>
          !input.messages.some(
            m =>
              m.id === e.messageId &&
              m.id <= input.currentMessageId &&
              m.content.includes(e.excerpt)
          )
      )
    )
      throw Error("Ungrounded learning decision");
    if (
      (signal.type === "price_objection" && analysis.objection !== "price") ||
      (signal.type === "sales_objection" &&
        ["none", "price"].includes(analysis.objection)) ||
      (signal.type === "escalation_requested" &&
        analysis.action !== "request_human" &&
        analysis.nextStep !== "handoff")
    )
      throw Error("Contradictory learning decision");
    const target = signal.aboutAssistantMessageId;
    if (
      ["positive_feedback", "question_repeated", "knowledge_gap"].includes(
        signal.type
      ) &&
      target === null
    )
      throw Error("Missing evaluated assistant reply");
    if (
      target !== null &&
      (!input.messages.some(
        m =>
          m.id === target &&
          m.id < input.currentMessageId &&
          m.role === "assistant" &&
          m.isAiReply === true
      ) ||
        !signal.evidence.some(e => e.messageId === target))
    )
      throw Error("Unproven assistant attribution");
  }
}
