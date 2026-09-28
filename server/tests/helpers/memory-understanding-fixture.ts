import type { UnderstandingInput } from "../../ai/conversation-understanding";
import type { ConversationUnderstanding } from "../../ai/conversation-understanding-context";
import type { ContextualMemoryFact } from "../../../shared/customer-memory";
import { learningUnderstandingFixture } from "./learning-understanding-fixture";

/** Explicit synthetic responses for persistence tests, not an evaluator of model language quality. */
export function memoryUnderstandingFixture(
  input: UnderstandingInput,
  facts: Array<
    Pick<ContextualMemoryFact, "field" | "value"> & {
      kind?: ContextualMemoryFact["kind"];
    }
  > = [],
  changes: Partial<ConversationUnderstanding> = {}
): ConversationUnderstanding {
  const current = input.messages.find(m => m.id === input.currentMessageId)!;
  return {
    ...learningUnderstandingFixture(input, []),
    intent: "inquiring",
    goal: "explain_requested_information",
    nextStep: "answer",
    memoryFacts: facts.map(f => ({
      ...f,
      kind: f.kind || "explicit",
      evidence: [
        { messageId: current.id, excerpt: current.content.slice(0, 300) },
      ],
    })),
    ...changes,
  };
}
