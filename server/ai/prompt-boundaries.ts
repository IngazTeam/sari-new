import type { ChatMessage } from "./openai";

/** Split only assembled system context; never shorten a fact or split a UTF-16 pair. */
export function splitPromptText(text: string): string[] {
  const parts: string[] = [];
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + 14000, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end - 1);
      if (newline >= start + 7000) end = newline + 1;
      else if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

/** Match the common governed transport envelope before any paid generation. */
export function assertPromptBounds(messages: ChatMessage[]): void {
  if (!messages.length || messages.length > 100)
    throw Error("Reply prompt exceeds governed message count");
  for (const message of messages) {
    if (!["system", "user", "assistant"].includes(message.role))
      throw Error("Invalid reply prompt role");
    // ZahyPi serializes multimodal content. Validate that representation as well,
    // so a text/image array cannot silently lose its tail at the gateway.
    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
    if (
      !content ||
      !content.trim() ||
      content.length > 16000 ||
      content.includes("\u0000") ||
      (typeof message.content !== "string" && content.includes("\\u0000"))
    ) {
      throw Error("Reply prompt exceeds governed content bounds");
    }
  }
}
