import type { ConversationUnderstanding } from "./conversation-understanding-context";
import type { UnderstandingInput } from "./conversation-understanding";
import type { ContextualMemoryFact } from "../../shared/customer-memory";

export function resolvedMemoryFacts(
  analysis?: ConversationUnderstanding
): ContextualMemoryFact[] {
  return !analysis ||
    analysis.confidence < 0.85 ||
    analysis.conditional ||
    analysis.ambiguous
    ? []
    : analysis.memoryFacts || [];
}

/** Values are interpreted; this verifies data types, source references and attribution, not language accuracy. */
export function validateMemoryFacts(
  analysis: ConversationUnderstanding,
  input: UnderstandingInput
) {
  const facts = analysis.memoryFacts || [];
  if (!facts.length) return;
  if (
    !resolvedMemoryFacts(analysis).length ||
    new Set(facts.map(f => f.field)).size !== facts.length
  )
    throw Error("Invalid contextual memory decision");
  for (const fact of facts) {
    if (
      !fact.evidence.some(
        e =>
          e.messageId === input.currentMessageId &&
          input.messages.some(m => m.id === e.messageId && m.role === "user")
      ) ||
      fact.evidence.some(
        e =>
          !input.messages.some(
            m =>
              m.id === e.messageId &&
              m.id <= input.currentMessageId &&
              m.content.includes(e.excerpt)
          )
      )
    )
      throw Error("Ungrounded contextual memory");
    if (
      fact.field === "preferredName" &&
      !fact.evidence.some(
        e =>
          input.messages.some(m => m.id === e.messageId && m.role === "user") &&
          e.excerpt.includes(String(fact.value))
      )
    )
      throw Error("Unproven preferred name");
  }
}
