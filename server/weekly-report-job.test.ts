import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ merchants: vi.fn(), generate: vi.fn(), notify: vi.fn() }));
vi.mock("./db", () => ({ getAllMerchants: m.merchants }));
vi.mock("./ai/weekly-sentiment", () => ({ generateWeeklySentimentReport: m.generate }));
vi.mock("./_core/notification", () => ({ notifyOwner: m.notify }));
import { checkAndSendWeeklyReports } from "./jobs/weekly-sentiment-report";
beforeEach(() => { vi.resetAllMocks(); m.merchants.mockResolvedValue([{ id: 41, status: "active", businessName: "Local" }]); });
describe("weekly job evidence", () => {
  it.each([
    ["accepted", "قبله مزود البريد؛ الوصول غير مؤكد."],
    ["failed", "فشل إرسال البريد."],
    ["recipient_unavailable", "لم يتوفر بريد للمستلم."],
  ])("separates generated reports from email state %s", async (emailStatus, text) => {
    m.generate.mockResolvedValue({ totalConversations: 10, positivePercentage: 40, emailStatus });
    expect(await checkAndSendWeeklyReports()).toMatchObject({ successCount: 1, errorCount: 0 });
    expect(m.notify.mock.calls[0][0].content).toContain(text);
    expect(m.notify.mock.calls[0][0].content).not.toContain("الرضا: 40");
    expect(m.notify.mock.calls[0][0].content).not.toContain("وإرسال التقرير الأسبوعي بنجاح");
  });
  it("does not announce a generated report after failure", async () => {
    m.generate.mockRejectedValue(Error("failed"));
    expect(await checkAndSendWeeklyReports()).toMatchObject({ successCount: 0, errorCount: 1 });
    expect(m.notify.mock.calls[0][0].content).toContain("فشل إنشاء التقرير");
  });
});
