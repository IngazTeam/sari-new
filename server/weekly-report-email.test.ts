import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWeeklyReportEmail } from "./reports/weekly-report-email";
const m = vi.hoisted(() => ({
  report: vi.fn(),
  merchant: vi.fn(),
  user: vi.fn(),
  mark: vi.fn(),
  send: vi.fn(),
  create: vi.fn(),
  conversations: vi.fn(),
  messages: vi.fn(),
  analyze: vi.fn(),
  notify: vi.fn(),
  merchants: vi.fn(),
  generated: vi.fn(),
}));
vi.mock("./db", () => ({
  getWeeklySentimentReportById: m.report,
  getMerchantById: m.merchant,
  getUserById: m.user,
  markReportEmailSent: m.mark,
  createWeeklySentimentReport: m.create,
  getConversationsByMerchantId: m.conversations,
  getMessagesByConversationId: m.messages,
  getAllMerchants: m.merchants,
}));
vi.mock("./reports/email-sender", () => ({ sendEmail: m.send }));
vi.mock("./reports/weekly-cohort", async original => ({
  ...(await original<typeof import("./reports/weekly-cohort")>()),
  readWeeklyAnalysisInput: vi
    .fn()
    .mockResolvedValue([{ id: 10, text: "message", unavailable: null }]),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./ai/sentiment-analysis", () => ({ analyzeSentiment: m.analyze }));
vi.mock("./ai/loss-detector", () => ({
  getPipelineSummary: vi
    .fn()
    .mockResolvedValue({ stages: {}, lossReasons: {} }),
}));
import { sendReportEmail } from "./reports/sentiment-weekly";
import { generateWeeklySentimentReport } from "./ai/weekly-sentiment";
const report = {
  id: 7,
  merchantId: 41,
  weekStartDate: "2026-09-20 00:00:00",
  weekEndDate: "2026-09-26 23:59:59",
  totalConversations: 10,
  positiveCount: 4,
  negativeCount: 2,
  neutralCount: 1,
  positivePercentage: 99,
  negativePercentage: 99,
  satisfactionScore: 100,
  topKeywords: '["shipping"]',
  topComplaints: "legacy complaint",
  recommendations: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.report.mockResolvedValue(report);
  m.merchant.mockResolvedValue({
    id: 41,
    userId: 22,
    businessName: "Local shop",
  });
  m.user.mockResolvedValue({ email: "local@example.test" });
  m.send.mockResolvedValue(true);
  m.create.mockResolvedValue(55);
  m.mark.mockResolvedValue(undefined);
  const date = new Date();
  date.setDate(date.getDate() - date.getDay());
  date.setHours(12, 0, 0, 0);
  m.conversations.mockResolvedValue([{ id: 10, createdAt: date }]);
  m.messages.mockResolvedValue([{ direction: "incoming", content: "message" }]);
  m.analyze.mockResolvedValue({ sentiment: "positive" });
});
describe("safe report email content", () => {
  it("escapes names and every stored prose field, preserving legacy text", () => {
    const html = renderWeeklyReportEmail(
      {
        ...report,
        topKeywords: '["<img src=x onerror=alert(1)>"]',
        topComplaints: '<a href="https://evil.test">legacy</a>',
        recommendations: "[broken <script>alert(1)</script>",
      },
      '<iframe src="x">& shop'
    );
    expect(html).not.toMatch(/<(script|img|iframe)\b/);
    expect(html).not.toContain('href="https://evil.test"');
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("نص محفوظ بصيغة قديمة");
    expect(html).toContain("[broken &lt;script&gt;");
    expect(html).toContain("&lt;iframe src=&quot;x&quot;&gt;&amp; shop");
  });
  it("calculates observed shares and missing classifications without using legacy satisfaction", () => {
    const html = renderWeeklyReportEmail(report, "shop");
    expect(html).toContain("40%");
    expect(html).toContain("20%");
    expect(html).not.toContain("99%");
    expect(html).not.toContain(">100%</td>");
    expect(html).toContain("غير مصنفة");
    expect(html).toContain("ليست قياسًا لرضا العملاء");
    expect(html).toContain("2026-09-20 00:00:00 UTC");
  });
  it.each([
    [
      {
        totalConversations: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
      },
      "العينة فارغة",
    ],
    [
      {
        totalConversations: 2,
        positiveCount: 3,
        negativeCount: 0,
        neutralCount: 0,
      },
      "العدادات المحفوظة غير متسقة",
    ],
  ])(
    "does not create a percentage for missing or invalid samples",
    (counts, message) => {
      const html = renderWeeklyReportEmail({ ...report, ...counts }, "shop");
      expect(html).toContain(message);
      expect(html).toContain("غير متاح");
      expect(html).not.toMatch(/>\d+(\.\d+)?%</);
    }
  );
  it("accepts non-array JSON as legacy text and has a fluid layout with no fabricated contact channels", () => {
    const html = renderWeeklyReportEmail(
      { ...report, topKeywords: '{"x":"value"}', weekStartDate: "invalid" },
      "shop"
    );
    expect(html).toContain("{&quot;x&quot;:&quot;value&quot;}");
    expect(html).toContain("تاريخ غير متاح");
    expect(html).toContain("max-width:600px");
    expect(html).not.toContain('width="600"');
    expect(html).not.toContain("wa.me/966500000000");
    expect(html).toContain("https://sary.live/merchant/insights");
  });
});
describe("report email provider acknowledgement", () => {
  it("marks only the persisted report after provider acceptance", async () => {
    expect(await sendReportEmail(7)).toBe(true);
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "local@example.test",
        html: expect.stringContaining("40%"),
      })
    );
    expect(m.mark).toHaveBeenCalledWith(7);
  });
  it("does not mark provider rejection as success", async () => {
    m.send.mockResolvedValue(false);
    expect(await sendReportEmail(7)).toBe(false);
    expect(m.mark).not.toHaveBeenCalled();
  });
  it("fails missing recipients without a send", async () => {
    m.user.mockResolvedValue(null);
    await expect(sendReportEmail(7)).rejects.toThrow("User email not found");
    expect(m.send).not.toHaveBeenCalled();
  });
  it("propagates an acknowledgement write failure instead of reporting confirmed bookkeeping", async () => {
    m.mark.mockRejectedValueOnce(Error("database down"));
    await expect(sendReportEmail(7)).rejects.toThrow("database down");
  });
  it("uses the safe renderer and records acceptance in the alternate producer", async () => {
    const result = await generateWeeklySentimentReport(41);
    expect(result?.emailStatus).toBe("accepted");
    expect(m.mark).toHaveBeenCalledWith(55);
    expect(m.send.mock.calls[0][0].html).toContain("ليست قياسًا لرضا العملاء");
  });
  it.each([false, "throws"])(
    "retains a generated report but does not claim email success on %s",
    async outcome => {
      if (outcome === "throws") m.send.mockRejectedValueOnce(Error("offline"));
      else m.send.mockResolvedValue(false);
      expect((await generateWeeklySentimentReport(41))?.emailStatus).toBe(
        "failed"
      );
      expect(m.mark).not.toHaveBeenCalled();
      expect(m.create).toHaveBeenCalled();
    }
  );
  it("returns recipient_unavailable independently of a generated report", async () => {
    m.user.mockResolvedValue(null);
    expect((await generateWeeklySentimentReport(41))?.emailStatus).toBe(
      "recipient_unavailable"
    );
    expect(m.send).not.toHaveBeenCalled();
    expect(m.mark).not.toHaveBeenCalled();
  });
});
