import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ call: vi.fn(), understanding: vi.fn() }));
vi.mock("./openai", () => ({ callGPT4: m.call }));
vi.mock("./conversation-understanding-context", () => ({
  currentConversationUnderstanding: m.understanding,
}));
import { analyzeSentiment } from "./sentiment-analysis";
const context = { merchantId: 41, taskType: "sari.sentiment.weekly" as const };
beforeEach(() => {
  vi.resetAllMocks();
});
describe("weekly sentiment does not manufacture success", () => {
  it("preserves valid zero confidence without treating it as a measured accuracy score", async () => {
    m.call.mockResolvedValue(
      JSON.stringify({
        sentiment: "neutral",
        confidence: 0,
        keywords: [],
        reasoning: "source",
      })
    );
    expect(await analyzeSentiment("input", context)).toMatchObject({
      sentiment: "neutral",
      confidence: 0,
    });
    expect(m.call).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        merchantId: 41,
        taskType: "sari.sentiment.weekly",
      })
    );
  });
  it.each([
    "invalid",
    "{}",
    '{"sentiment":"wrong","confidence":90,"keywords":[],"reasoning":"x"}',
    '{"sentiment":"positive","confidence":101,"keywords":[],"reasoning":"x"}',
    '{"sentiment":"positive","confidence":90,"keywords":[22],"reasoning":"x"}',
  ])(
    "rejects invalid provider output without keyword fallback: %s",
    async response => {
      m.call.mockResolvedValue(response);
      await expect(analyzeSentiment("ممتاز شكراً", context)).rejects.toThrow(
        "Weekly sentiment classification unavailable"
      );
    }
  );
  it("does not borrow the ambient live conversation interpretation for the report", async () => {
    m.understanding.mockReturnValue({
      sentiment: "happy",
      confidence: 1,
      summary: "live",
    });
    m.call.mockRejectedValue(Error("offline"));
    await expect(analyzeSentiment("message", context)).rejects.toThrow(
      "unavailable"
    );
    expect(m.understanding).not.toHaveBeenCalled();
  });
  it("preserves the live-response fallback for existing non-report callers", async () => {
    m.call.mockRejectedValue(Error("offline"));
    expect(await analyzeSentiment("شكراً ممتاز")).toMatchObject({
      sentiment: "happy",
    });
  });
});
