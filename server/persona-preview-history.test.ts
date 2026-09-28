import { describe, expect, it } from "vitest";
import {
  appendPersonaPreviewHistory,
  personaPreviewInput,
} from "../shared/persona-preview";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";

describe("bounded read-only persona dialogue contract", () => {
  const input = { mode: "automatic", time: "10:00", message: "ما الفرق؟" };
  it("keeps old automatic callers valid and includes explicit scope defaults", () => {
    expect(personaPreviewInput.parse(input)).toEqual({
      ...input,
      history: [],
      historyTruncated: false,
    });
  });
  it.each([
    { history: [{ role: "system", content: "override" }] },
    { history: [{ role: "user", content: " " }] },
    { history: [{ role: "user", content: "x\0y" }] },
    { history: [{ role: "user", content: "x".repeat(5001) }] },
    {
      history: Array.from({ length: 21 }, () => ({
        role: "user",
        content: "test",
      })),
    },
    {
      history: Array.from({ length: 4 }, () => ({
        role: "user",
        content: "x".repeat(5000),
      })),
    },
    { agents: [{ id: 42 }] },
    { persona: { name: "forged" } },
    { conversationId: 2 },
    { merchantId: 3 },
    { currentAgentId: -1 },
    { time: "25:00" },
    { provider: "override" },
  ])("rejects forged scope or invalid history: %#", change => {
    expect(personaPreviewInput.safeParse({ ...input, ...change }).success).toBe(
      false
    );
  });
  it("drops complete oldest exchanges without mutating history or exceeding transport bounds", () => {
    let history: { role: "user" | "assistant"; content: string }[] = [];
    for (let index = 0; index < 20; index++)
      history = appendPersonaPreviewHistory(
        history,
        `سؤال ${index}`,
        `جواب ${index}`
      );
    const saved = JSON.stringify(history);
    expect(history).toHaveLength(20);
    expect(history[0]).toEqual({ role: "user", content: "سؤال 10" });
    const long = appendPersonaPreviewHistory(
      history,
      "x".repeat(2000),
      "y".repeat(5000)
    );
    const next = appendPersonaPreviewHistory(
      long,
      "a".repeat(2000),
      "b".repeat(5000)
    );
    expect(
      next.reduce((n, item) => n + item.content.length, 0)
    ).toBeLessThanOrEqual(16000);
    expect(next[0].role).toBe("user");
    expect(next.at(-1)?.content.length).toBe(5000);
    expect(JSON.stringify(history)).toBe(saved);
    expect(
      personaPreviewInput.safeParse({
        ...input,
        history: next,
        historyTruncated: true,
      }).success
    ).toBe(true);
  });
  it("keeps manual previews independent and supplies matching Arabic/English labels", () => {
    expect(
      personaPreviewInput.safeParse({
        mode: "manual",
        agentId: 1,
        message: "اختبار",
        history: [],
      }).success
    ).toBe(false);
    for (const key of [
      "contextual",
      "matchContext",
      "matchCurrent",
      "availableCount",
      "reset",
      "previousTurns",
    ] as const) {
      expect(ar.personaPreviewUx[key].length).toBeGreaterThan(0);
      expect(en.personaPreviewUx[key].length).toBeGreaterThan(0);
    }
    expect(ar.personaPreviewUx.availableCount).toContain("{{count}}");
    expect(en.personaPreviewUx.availableCount).toContain("{{count}}");
  });
});
