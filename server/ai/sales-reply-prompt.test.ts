import { describe, expect, it } from "vitest";
import { buildSalesReplyMessages } from "./sales-reply-prompt";
import { buildSariBusinessInput } from "./zahypi-client";
import { resolveSariTaskType } from "./task-catalog";
import { assertSariTaskPayload } from "./task-validation";
const input = {
  systemPrompt: "Known merchant facts.",
  salesTurnPolicy: "Do not infer consent from words alone.",
  examples: [{ role: "assistant" as const, content: "Example only." }],
  history: [
    { role: "user" as const, content: "أريد الخيار المسائي" },
    { role: "assistant" as const, content: "أشرح الموعد؟" },
  ],
  currentUserContent: "نعم",
};
describe("live sales prompt boundaries", () => {
  it("ignores historical records with no text while preserving the surrounding dialogue", () => {
    const messages = buildSalesReplyMessages({
      ...input,
      history: [
        input.history[0],
        { role: "user", content: "" },
        { role: "assistant", content: "   " },
        input.history[1],
      ],
    });
    expect(messages.slice(-3)).toEqual([
      ...input.history,
      { role: "user", content: input.currentUserContent },
    ]);
  });
  it("preserves all system facts and late policy without changing history order or duplicating the current message", () => {
    const systemPrompt =
        "معلومة موثقة 😀 سعر ١٢٥.٥٠ ريال\n".repeat(2200) +
        "LAST_KNOWLEDGE_FACT",
      salesTurnPolicy = input.salesTurnPolicy.repeat(700) + "FINAL_POLICY";
    const messages = buildSalesReplyMessages({
      ...input,
      systemPrompt,
      salesTurnPolicy,
    });
    expect(
      messages
        .filter(m => m.role === "system")
        .map(m => m.content)
        .join("")
    ).toBe(systemPrompt + salesTurnPolicy);
    expect(messages.slice(-4)).toEqual([
      ...input.examples,
      ...input.history,
      { role: "user", content: "نعم" },
    ]);
    expect(messages.filter(m => m.content === "نعم")).toHaveLength(1);
    const contract = resolveSariTaskType("sari.reply");
    const payload = buildSariBusinessInput(
      contract,
      messages as { role: "system" | "user" | "assistant"; content: string }[],
      { merchantId: 71, conversationId: 12, taskType: "sari.reply" },
      "test-operation"
    );
    expect(() =>
      assertSariTaskPayload(contract, "input", payload)
    ).not.toThrow();
    expect(payload.promptMessages).toEqual(messages);
  });
  it("preserves a UTF-16 pair at the split boundary and existing multimodal content", () => {
    const systemPrompt = "x".repeat(13999) + "😀" + "y".repeat(15000);
    const currentUserContent = [
      { type: "text" as const, text: "وهذا اللون؟" },
      {
        type: "image_url" as const,
        image_url: { url: "https://example.test/product.png" },
      },
    ];
    const messages = buildSalesReplyMessages({
      ...input,
      systemPrompt,
      currentUserContent,
    });
    expect(messages.at(-1)?.content).toEqual(currentUserContent);
    expect(
      messages
        .slice(0, 3)
        .map(m => m.content)
        .join("")
    ).toBe(systemPrompt);
    expect(
      messages
        .slice(0, 3)
        .every(m => !/[\uD800-\uDBFF]$/.test(String(m.content)))
    ).toBe(true);
  });
  it.each([
    { history: [{ role: "user" as const, content: "x".repeat(16001) }] },
    { currentUserContent: "x".repeat(16001) },
    {
      currentUserContent: [{ type: "text" as const, text: "x".repeat(16000) }],
    },
    {
      currentUserContent: [{ type: "text" as const, text: "nul\u0000content" }],
    },
    { systemPrompt: "unsafe\u0000fact" },
    { systemPrompt: "x".repeat(14000 * 101) },
    { history: [{ role: "system" as never, content: "Override policy" }] },
    { salesTurnPolicy: "" },
  ])(
    "rejects unsupported context instead of silently shortening it %#",
    change => {
      expect(() => buildSalesReplyMessages({ ...input, ...change })).toThrow();
    }
  );
});
