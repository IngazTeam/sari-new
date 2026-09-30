import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  disconnect: vi.fn(),
  access: vi.fn(),
}));
vi.mock("./sheets-settings", () => ({
  readSheetsSettings: m.read,
  writeSheetsReportSettings: m.write,
  disconnectSheets: m.disconnect,
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
import { sheetsRouter } from "./routers-sheets";
const sessionId = "a".repeat(64),
  input = {
    expectedDigest: "b".repeat(64),
    reviewed: true,
    changes: { sendDailyReports: true },
  };
const caller = (session: any = { sessionId }) =>
  sheetsRouter.createCaller({
    user: { id: 9 },
    session,
    req: { headers: { "x-merchant-id": "7" } },
    res: {},
  } as any);
const run = (name: string, c = caller()) =>
  name === "updateReportSettings"
    ? c.updateReportSettings(input as any)
    : name === "disconnect"
      ? c.disconnect({ expectedDigest: input.expectedDigest, reviewed: true })
      : c.getStatus();
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 7, role: "manager" });
  m.read.mockResolvedValue({ reports: { sendDailyReports: false } });
});
describe("Sheets settings permissions", () => {
  it.each([
    "getStatus",
    "updateReportSettings",
    "disconnect",
  ])("scopes %s to the selected tenant and session", async name => {
    await run(name);
    const f =
      name === "disconnect"
        ? m.disconnect
        : name === "updateReportSettings"
          ? m.write
          : m.read;
    expect(f.mock.calls[0][0]).toEqual({ merchantId: 7, userId: 9, sessionId });
  });
  it.each([
    "getStatus",
    "updateReportSettings",
    "disconnect",
  ])("blocks viewer access to %s", async name => {
    m.access.mockResolvedValue({ merchantId: 7, role: "viewer" });
    await expect(run(name)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.read).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
    expect(m.disconnect).not.toHaveBeenCalled();
  });
  it.each([
    "getStatus",
    "updateReportSettings",
    "disconnect",
  ])("blocks missing session in %s", async name => {
    await expect(run(name, caller(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("rejects old unreviewed writes", async () => {
    await expect((caller() as any).disconnect()).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      (caller() as any).updateReportSettings({ sendDailyReports: true })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.write).not.toHaveBeenCalled();
    expect(m.disconnect).not.toHaveBeenCalled();
  });
});
