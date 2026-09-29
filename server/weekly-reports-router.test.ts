import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./weekly-reports-store", () => ({
  readWeeklyReportRecords: m.list,
  readWeeklyReportRecord: m.get,
}));
vi.mock("./reports/sentiment-weekly", () => ({
  generateWeeklyReport: m.generate,
}));
import { weeklyReportsRouter } from "./routers-weekly-reports";
const caller = () =>
  weeklyReportsRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.list.mockResolvedValue([]);
  m.get.mockResolvedValue({ id: 3, merchantId: 20 });
  m.generate.mockResolvedValue(11);
});
describe("weekly report tenant API", () => {
  it.each(["owner", "manager", "viewer", "sales_supervisor"])(
    "scopes reads to selected membership for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await caller().list({});
      expect(m.access).toHaveBeenCalledWith(7, 20);
      expect(m.list).toHaveBeenCalledWith(20, 10, 1);
      await caller().list({ limit: 5, page: 2 });
      expect(m.list).toHaveBeenLastCalledWith(20, 5, 2);
      expect(await caller().getById({ reportId: 3 })).toEqual({
        id: 3,
        merchantId: 20,
      });
      expect(m.get).toHaveBeenCalledWith(20, 3);
    }
  );
  it.each(["owner", "manager"])(
    "permits generation by %s within the selected tenant",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      expect(await caller().generateTest()).toEqual({
        success: true,
        reportId: 11,
      });
      expect(m.generate).toHaveBeenCalledWith(20);
    }
  );
  it.each(["viewer", "sales_supervisor"])(
    "denies provider-backed generation by %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await expect(caller().generateTest()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(m.generate).not.toHaveBeenCalled();
    }
  );
  it("rejects missing membership before accessing reports or generating", async () => {
    m.access.mockResolvedValue(null);
    await expect(caller().list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller().generateTest()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.generate).not.toHaveBeenCalled();
  });
  it.each([
    { limit: 0 },
    { limit: -1 },
    { limit: 53 },
    { limit: 1.5 },
    { limit: Infinity },
    { page: 0 },
    { page: 100001 },
    { page: 1.5 },
    { merchantId: 21 },
  ])("rejects invalid list input %j", async input => {
    await expect(caller().list(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.list).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 2147483648, Infinity])(
    "rejects invalid report id %s",
    async reportId => {
      await expect(caller().getById({ reportId })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(m.get).not.toHaveBeenCalled();
    }
  );
  it("does not let payload identity select another report tenant or generation tenant", async () => {
    await expect(
      caller().getById({ reportId: 3, merchantId: 21 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().generateTest({ merchantId: 21 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("returns a non-enumerating missing result", async () => {
    m.get.mockResolvedValue(null);
    await expect(caller().getById({ reportId: 3 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Report unavailable",
    });
  });
  it("does not leak SQL failures or convert them to empty or successful responses", async () => {
    m.list.mockRejectedValue(Error("secret SQL"));
    m.get.mockRejectedValue(Error("secret SQL"));
    m.generate.mockRejectedValue(Error("secret SQL"));
    for (const operation of [
      () => caller().list({}),
      () => caller().getById({ reportId: 3 }),
      () => caller().generateTest(),
    ])
      await expect(operation()).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Weekly reports unavailable",
      });
  });
  it("wires one protected implementation in the application router", () => {
    const source = readFileSync(
      new URL("./routers.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("weeklyReports: weeklyReportsRouter");
    expect(source).not.toContain("weeklyReports: router({");
  });
});
