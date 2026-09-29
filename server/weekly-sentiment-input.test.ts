import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  read: vi.fn(),
  analyze: vi.fn(),
  create: vi.fn(),
  merchant: vi.fn(),
  pipeline: vi.fn(),
}));
vi.mock("./db", () => ({
  createWeeklySentimentReport: m.create,
  getMerchantById: m.merchant,
  getUserById: vi.fn(),
  markReportEmailSent: vi.fn(),
}));
vi.mock("./ai/sentiment-analysis", () => ({ analyzeSentiment: m.analyze }));
vi.mock("./reports/email-sender", () => ({ sendEmail: vi.fn() }));
vi.mock("./ai/loss-detector", () => ({ getPipelineSummary: m.pipeline }));
vi.mock("./reports/weekly-cohort", async original => ({
  ...(await original<typeof import("./reports/weekly-cohort")>()),
  readWeeklyAnalysisInput: m.read,
}));
import { generateWeeklySentimentReport } from "./ai/weekly-sentiment";
import { previousReportWindow } from "./reports/weekly-cohort";
beforeEach(() => {
  vi.resetAllMocks();
  m.create.mockResolvedValue(71);
  m.merchant.mockResolvedValue(null);
  m.read.mockResolvedValue([
    { id: 1, text: "in-period text", unavailable: null },
  ]);
  m.analyze.mockResolvedValue({ sentiment: "positive" });
});
describe("completed-week analysis", () => {
  it.each([
    [
      "2026-09-27T00:00:00Z",
      "2026-09-20T00:00:00.000Z",
      "2026-09-26T23:59:59.000Z",
    ],
    [
      "2026-09-29T10:00:00Z",
      "2026-09-20T00:00:00.000Z",
      "2026-09-26T23:59:59.000Z",
    ],
    [
      "2026-01-01T00:00:00+03:00",
      "2025-12-21T00:00:00.000Z",
      "2025-12-27T23:59:59.000Z",
    ],
  ])("never includes the running week at %s", (now, start, end) => {
    const window = previousReportWindow(new Date(now));
    expect(window.start.toISOString()).toBe(start);
    expect(window.end.toISOString()).toBe(end);
  });
  it("uses only captured inputs and keeps failed, blank and oversized inputs unclassified", async () => {
    m.read.mockResolvedValue([
      { id: 1, text: "positive", unavailable: null },
      { id: 2, text: "provider fails", unavailable: null },
      { id: 3, text: null, unavailable: "empty" },
      { id: 4, text: null, unavailable: "input_limit" },
      { id: 5, text: "neutral", unavailable: null },
    ]);
    m.analyze
      .mockResolvedValueOnce({ sentiment: "happy" })
      .mockRejectedValueOnce(Error("offline"))
      .mockResolvedValueOnce({ sentiment: "neutral" });
    const result = await generateWeeklySentimentReport(41);
    expect(result).toMatchObject({
      totalConversations: 5,
      positiveCount: 1,
      neutralCount: 1,
      negativeCount: 0,
      unclassifiedCount: 3,
      failedAnalysisCount: 1,
      inputLimitedCount: 1,
      positivePercentage: 20,
    });
    expect(m.analyze).toHaveBeenCalledTimes(3);
    expect(m.analyze).toHaveBeenCalledWith("positive", {
      merchantId: 41,
      taskType: "sari.sentiment.weekly",
    });
    expect(m.create.mock.calls[0][0]).toMatchObject({
      totalConversations: 5,
      positiveCount: 1,
      neutralCount: 1,
    });
    expect(m.pipeline).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("salesKPIs");
  });
  it("does not classify unexpected output as neutral or suggest a satisfaction fix from missing data", async () => {
    m.analyze.mockResolvedValue({ sentiment: "invalid" });
    expect(await generateWeeklySentimentReport(41)).toMatchObject({
      positiveCount: 0,
      neutralCount: 0,
      unclassifiedCount: 1,
      failedAnalysisCount: 1,
      improvementSuggestions: [],
    });
  });
  it("does not store a partial or empty report after a data-read failure", async () => {
    m.read.mockRejectedValue(Error("snapshot failed"));
    await expect(generateWeeklySentimentReport(41)).rejects.toThrow(
      "snapshot failed"
    );
    expect(m.create).not.toHaveBeenCalled();
    expect(m.analyze).not.toHaveBeenCalled();
  });
  it("returns no report for an actually empty week", async () => {
    m.read.mockResolvedValue([]);
    expect(await generateWeeklySentimentReport(41)).toBeNull();
    expect(m.create).not.toHaveBeenCalled();
  });
});
