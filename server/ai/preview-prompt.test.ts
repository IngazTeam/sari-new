import { describe, expect, it } from "vitest";
import { buildPreviewMessages, PREVIEW_RESTRICTIONS } from "./preview-prompt";
import { buildSariBusinessInput } from "./zahypi-client";
import { resolveSariTaskType } from "./task-catalog";
import { assertSariTaskPayload } from "./task-validation";
const prompt = {
  identity: "Saved persona.",
  knowledge: "Verified catalog: 125 SAR.",
  preferences: "Arabic.",
  policy: "Never infer consent from a word alone.",
  history: [{ role: "assistant" as const, content: "تحب أوضح الفرق؟" }],
  message: "نعم",
};
describe("preview prompt transport and simulation boundaries", () => {
  it("keeps the current turn once, ordered speakers and restrictions in standalone messages", () => {
    const messages = buildPreviewMessages(prompt);
    expect(messages[0].content).toBe(PREVIEW_RESTRICTIONS);
    expect(messages.at(-3)?.content).toBe(PREVIEW_RESTRICTIONS);
    expect(messages.slice(-2)).toEqual([
      ...prompt.history,
      { role: "user", content: prompt.message },
    ]);
    expect(messages.filter(m => m.content === prompt.message)).toHaveLength(1);
    expect(messages.some(m => m.content === prompt.policy)).toBe(true);
  });
  it("preserves long knowledge and late policy within ZahyPi governed bounds", () => {
    const knowledge =
      "شرح خاصية موثقة 😀 سعر ١٢٥.٥٠ ريال.\n".repeat(1200) +
      "آخر حقيقة: ٩٨٧.٦٥ ريال";
    const messages = buildPreviewMessages({
      ...prompt,
      identity: "persona ".repeat(2400),
      knowledge,
    });
    const knowledgeStart =
      messages.findIndex(m =>
        String(m.content).startsWith("The following consecutive")
      ) + 1;
    const knowledgeEnd = messages.findIndex(
      m => m.content === prompt.preferences
    );
    expect(
      messages
        .slice(knowledgeStart, knowledgeEnd)
        .map(m => m.content)
        .join("")
    ).toBe(knowledge);
    expect(messages.every(m => String(m.content).length <= 16000)).toBe(true);
    const contract = resolveSariTaskType("sari.reply");
    const payload = buildSariBusinessInput(
      contract,
      messages as { role: "system" | "user" | "assistant"; content: string }[],
      { merchantId: 20, userId: 7, taskType: "sari.reply" },
      "preview-operation"
    );
    expect(() =>
      assertSariTaskPayload(contract, "input", payload)
    ).not.toThrow();
    expect(payload.promptMessages).toEqual(messages);
    expect(messages.some(m => m.content === prompt.policy)).toBe(true);
  });
  it("never splits a surrogate pair at a chunk boundary", () => {
    const identity = "x".repeat(13999) + "😀" + "y".repeat(14000);
    const parts = buildPreviewMessages({ ...prompt, identity })
      .slice(1, 4)
      .map(m => String(m.content));
    expect(parts.join("")).toBe(identity);
    expect(parts.every(part => !/[\uD800-\uDBFF]$/.test(part))).toBe(true);
  });
  it.each([
    { policy: "x".repeat(16001) },
    { history: [{ role: "user" as const, content: "x".repeat(16001) }] },
    { message: "prefix\u0000suffix" },
    {
      history: Array.from({ length: 100 }, () => ({
        role: "user" as const,
        content: "x",
      })),
    },
  ])("fails instead of silently truncating unsupported input %#", change => {
    expect(() => buildPreviewMessages({ ...prompt, ...change })).toThrow(
      "governed bounds"
    );
  });
});
