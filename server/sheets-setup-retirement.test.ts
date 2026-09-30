import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ db: vi.fn(), provider: vi.fn(), setup: vi.fn() }));
vi.mock("./db", () => ({ getMerchantByUserId: calls.db, getPool: calls.db }));
vi.mock("./sheets-setup-attempts", () => ({
  startSheetsSetup: calls.setup, readSheetsSetup: calls.setup,
  recoverSheetsSetup: calls.setup, acknowledgeSheetsSetup: calls.setup,
}));
vi.mock("googleapis", () => ({ google: { sheets: calls.provider } }));
import { sheetsRouter } from "./routers-sheets";
import * as sync from "./sheetsSync";
import * as provider from "./_core/googleSheets";
beforeEach(() => vi.clearAllMocks());
describe("retired unreviewed Sheets setup", () => {
  it.each([
    ["setupSpreadsheet", null], ["setupSpreadsheet", { id: 1 }],
    ["getReportSettings", null], ["getReportSettings", { id: 1 }],
  ])("rejects %s for %j before any database or provider operation", async (route, user) => {
    const caller: any = sheetsRouter.createCaller({ user, req: {}, res: {} } as any);
    await expect(caller[route as string]()).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const fn of Object.values(calls)) expect(fn).not.toHaveBeenCalled();
  });
  it("removes obsolete writers and retains current setup, settings and other Sheets consumers", () => {
    expect("setupMerchantSpreadsheet" in sync).toBe(false);
    for (const key of ["createSpreadsheet", "getConnectionStatus", "disconnect"])
      expect(key in provider).toBe(false);
    for (const key of ["setup.start", "setup.read", "setup.recover", "setup.acknowledge",
      "beginOAuth", "getStatus", "updateReportSettings", "disconnect", "syncInventory",
      "syncOrder", "syncLead", "exportConversations", "generateDailyReport", "generateWeeklyReport",
      "generateMonthlyReport", "generateCustomReport", "sendReportViaWhatsApp"])
      expect(Object.keys(sheetsRouter._def.procedures)).toContain(key);
    for (const key of ["addSheet", "writeToSheet", "appendToSheet", "readFromSheet"])
      expect(typeof provider[key as keyof typeof provider]).toBe("function");
  });
});
