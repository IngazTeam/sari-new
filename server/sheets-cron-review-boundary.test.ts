import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  schedule: vi.fn(),
  merchants: vi.fn(),
  integration: vi.fn(),
  daily: vi.fn(),
  weekly: vi.fn(),
  monthly: vi.fn(),
  send: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
}));
vi.mock("node-cron", () => ({ default: { schedule: m.schedule } }));
vi.mock("./db", () => ({
  getAllMerchants: m.merchants,
  getGoogleIntegration: m.integration,
  createProduct: m.create,
  updateProduct: m.update,
}));
vi.mock("./sheetsReports", () => ({
  generateDailyReport: m.daily,
  generateWeeklyReport: m.weekly,
  generateMonthlyReport: m.monthly,
  sendReportViaWhatsApp: m.send,
}));
vi.mock("./_core/googleSheets", () => ({ readFromSheet: m.read }));
import { startAllSheetsCronJobs } from "./sheetsCronJobs";
import * as sync from "./sheetsSync";
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  m.merchants.mockResolvedValue([{ id: 7 }]);
  for (const report of [m.daily, m.weekly, m.monthly])
    report.mockResolvedValue({ success: true, data: {} });
});
afterEach(() => vi.useRealTimers());
describe("review-required Sheet product imports", () => {
  it.each([undefined, true, false])(
    "does not schedule or write products with legacy autoSyncProducts=%s",
    async value => {
      m.integration.mockResolvedValue({
        id: 8,
        isActive: 1,
        sheetId: "local",
        settings: JSON.stringify({ autoSyncProducts: value }),
      });
      startAllSheetsCronJobs();
      expect(m.schedule.mock.calls.map(c => c[0])).toEqual([
        "59 23 * * *",
        "59 23 * * 0",
        "59 23 28-31 * *",
      ]);
      for (const call of m.schedule.mock.calls) await call[1]();
      for (const report of [m.daily, m.weekly, m.monthly])
        expect(report).toHaveBeenCalledExactlyOnceWith(7);
      expect(m.send).not.toHaveBeenCalled();
      expect(m.create).not.toHaveBeenCalled();
      expect(m.update).not.toHaveBeenCalled();
      expect(m.read).not.toHaveBeenCalled();
      expect("syncProductsFromSheets" in sync).toBe(false);
      expect("syncInventoryToSheets" in sync).toBe(false);
      expect("updateInventoryFromSheets" in sync).toBe(false);
    }
  );
  it("still honors opted-in report delivery without a product import job", async () => {
    m.integration.mockResolvedValue({
      id: 8,
      isActive: 1,
      sheetId: "local",
      settings: JSON.stringify({
        sendDailyReports: true,
        autoSyncProducts: true,
      }),
    });
    startAllSheetsCronJobs();
    await m.schedule.mock.calls[0][1]();
    expect(m.send).toHaveBeenCalledExactlyOnceWith(7, "يومي", {});
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
});
