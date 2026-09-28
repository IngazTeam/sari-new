import type { ChatMessage } from "./openai";
import { assertPromptBounds, splitPromptText } from "./prompt-boundaries";

export const CONTEXTUAL_REPLY_UNAVAILABLE =
  "تعذر إكمال الرد اعتمادًا على سياق المحادثة الآن. حاول مرة أخرى أو اطلب مساعدة فريق النشاط.";

/** Fast and full paths carry identical policy/history boundaries to either provider. */
export function buildSalesReplyMessages(input: {
  systemPrompt: string;
  salesTurnPolicy: string;
  examples: ChatMessage[];
  history: { role: "user" | "assistant"; content: string }[];
  currentUserContent: ChatMessage["content"];
}): ChatMessage[] {
  if (
    !input.systemPrompt.trim() ||
    !input.salesTurnPolicy.trim() ||
    input.history.some(message => !["user", "assistant"].includes(message.role))
  ) {
    throw Error("Invalid contextual reply prompt");
  }
  const messages: ChatMessage[] = [
    ...splitPromptText(input.systemPrompt).map(content => ({
      role: "system" as const,
      content,
    })),
    ...splitPromptText(input.salesTurnPolicy).map(content => ({
      role: "system" as const,
      content,
    })),
    ...input.examples,
    // Historical media records may have no text. They carry no language context
    // and must not replace an empty gateway message with fabricated content.
    ...input.history.filter(message => message.content.trim()),
    { role: "user", content: input.currentUserContent },
  ];
  assertPromptBounds(messages);
  return messages;
}
