import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  create: vi.fn(),
  llm: vi.fn(),
}));
vi.mock("./db", () => ({ createWeeklySentimentReport: mock.create }));
vi.mock("./_core/llm", () => ({ invokeLLM: mock.llm }));
vi.mock("./reports/email-sender", () => ({ sendEmail: vi.fn() }));
vi.mock("./reports/weekly-cohort", async original => ({
  ...(await original<typeof import("./reports/weekly-cohort")>()),
  readWeeklyCohort: mock.read,
}));
import { currentReportWindow } from "./reports/weekly-cohort";
import { generateWeeklyReport } from "./reports/sentiment-weekly";
describe("weekly report generation sample", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T10:11:12.456Z"));
    mock.read.mockResolvedValue({
      totalConversations: 10,
      positiveCount: 4,
      negativeCount: 2,
      neutralCount: 1,
      unclassified: 3,
      topKeywords: ["shipping"],
      topComplaints: ["delay"],
    });
    mock.create.mockResolvedValue(123);
    mock.llm.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              recommendations: ["Review the source messages"],
            }),
          },
        },
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });
  it.each([
    [
      "2026-09-29T10:11:12.456Z",
      "2026-09-27T00:00:00.000Z",
      "2026-09-29T10:11:12.000Z",
    ],
    [
      "2026-09-27T00:00:00Z",
      "2026-09-27T00:00:00.000Z",
      "2026-09-27T00:00:00.000Z",
    ],
    [
      "2026-01-01T00:01:00+03:00",
      "2025-12-28T00:00:00.000Z",
      "2025-12-31T21:01:00.000Z",
    ],
  ])("uses one UTC window for %s", (now, start, end) => {
    const window = currentReportWindow(new Date(now));
    expect(window.start.toISOString()).toBe(start);
    expect(window.end.toISOString()).toBe(end);
  });
  it("persists exactly the captured cohort and gives the model its limits", async () => {
    expect(await generateWeeklyReport(41)).toBe(123);
    expect(mock.read).toHaveBeenCalledWith(41, currentReportWindow());
    expect(mock.create).toHaveBeenCalledWith({
      merchantId: 41,
      weekStartDate: new Date("2026-09-27T00:00:00Z"),
      weekEndDate: new Date("2026-09-29T10:11:12Z"),
      totalConversations: 10,
      positiveCount: 4,
      negativeCount: 2,
      neutralCount: 1,
      topKeywords: ["shipping"],
      topComplaints: ["delay"],
      recommendations: ["Review the source messages"],
    });
    expect(mock.llm.mock.calls[0][0]).toMatchObject({
      merchantId: 41,
      taskType: "sari.sentiment.weekly",
    });
    expect(mock.llm.mock.calls[0][0].messages[1].content).toContain(
      "غير المصنفة: 3"
    );
  });
  it.each([0, 7])(
    "avoids invented advice and model calls when %i conversations have no classifications",
    async total => {
      mock.read.mockResolvedValue({
        totalConversations: total,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        unclassified: total,
        topKeywords: [],
        topComplaints: [],
      });
      await generateWeeklyReport(41);
      expect(mock.llm).not.toHaveBeenCalled();
      expect(mock.create.mock.calls[0][0].recommendations).toEqual([]);
    }
  );
  it.each([
    "invalid",
    '{"recommendations":"not a list"}',
    '{"recommendations":[12]}',
    '{"recommendations":[" "]}',
  ])(
    "does not replace malformed model advice with fabricated claims: %s",
    async content => {
      mock.llm.mockResolvedValue({ choices: [{ message: { content } }] });
      await generateWeeklyReport(41);
      expect(mock.create.mock.calls[0][0].recommendations).toEqual([]);
    }
  );
  it("propagates data-read failure without storing an empty report", async () => {
    mock.read.mockRejectedValue(Error("database down"));
    await expect(generateWeeklyReport(41)).rejects.toThrow("database down");
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.llm).not.toHaveBeenCalled();
  });
  it("stores the sample without advice after a provider failure", async () => {
    mock.llm.mockRejectedValue(Error("offline"));
    await generateWeeklyReport(41);
    expect(mock.create.mock.calls[0][0]).toMatchObject({
      totalConversations: 10,
      recommendations: [],
    });
  });
});
