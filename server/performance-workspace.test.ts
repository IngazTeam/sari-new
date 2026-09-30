import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  performanceInput,
  performanceWindows,
  performanceChange,
  performanceShare,
} from "../shared/performance-workspace";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./performance-workspace", () => ({
  readPerformanceWorkspace: m.read,
}));
import { performanceRouter } from "./routers-performance";
const range = { startDate: "2026-09-01", endDate: "2026-09-02" };
const caller = () =>
  performanceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.read.mockResolvedValue({ merchantId: 20 });
});
describe("bounded performance source", () => {
  it.each(["owner", "manager", "viewer", "sales_supervisor"])(
    "uses selected tenant and analytics permission for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await caller().workspace(range);
      expect(m.access).toHaveBeenCalledWith(7, 20);
      expect(m.read).toHaveBeenCalledWith(20, range);
    }
  );
  it.each([null, { merchantId: 20, role: "support_agent", memberId: 4 }])(
    "denies missing membership or permission %j",
    async access => {
      m.access.mockResolvedValue(access);
      await expect(caller().workspace(range)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(m.read).not.toHaveBeenCalled();
    }
  );
  it.each([
    { ...range, merchantId: 30 },
    { ...range, startDate: "no" },
    { startDate: "2026-02-30", endDate: "2026-03-01" },
    { startDate: "2026-09-02", endDate: "2026-09-01" },
    { startDate: "2026-01-01", endDate: "2026-04-01" },
    { startDate: "2099-01-01", endDate: "2099-01-02" },
    { ...range, endDate: "2026-09-02T00:00:00Z" },
  ])("rejects malformed, unbounded or forged range %j", async input => {
    await expect(caller().workspace(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("sanitizes source failure instead of returning fabricated zeros", async () => {
    m.read.mockRejectedValue(Error("secret SQL password"));
    await expect(caller().workspace(range)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Performance unavailable",
    });
  });
  it("uses inclusive second precision without overlap and equal duration across leap/month boundaries", () => {
    const w = performanceWindows(
      { startDate: "2024-03-01", endDate: "2024-03-02" },
      new Date("2024-03-05T02:00:00Z")
    );
    expect(w.seconds).toBe(172800);
    expect(w.current.from).toBe("2024-03-01T00:00:00.000Z");
    expect(w.previous.from).toBe("2024-02-28T00:00:00.000Z");
    expect(w.previous.through).toBe("2024-02-29T23:59:59.000Z");
    expect(w.partialCurrentDay).toBe(false);
  });
  it("clamps the current day to now and compares equal elapsed seconds", () => {
    const w = performanceWindows(
      { startDate: "2026-09-29", endDate: "2026-09-30" },
      new Date("2026-09-30T10:00:00.900Z")
    );
    expect(w.current.through).toBe("2026-09-30T10:00:00.000Z");
    expect(w.previous.through).toBe("2026-09-28T23:59:59.000Z");
    expect(Date.parse(w.current.from) - Date.parse(w.previous.from)).toBe(
      w.seconds * 1000
    );
    expect(w.partialCurrentDay).toBe(true);
  });
  it("accepts exactly 90 dates but rejects 91", () => {
    expect(
      performanceInput.safeParse({
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      }).success
    ).toBe(true);
    expect(
      performanceInput.safeParse({
        startDate: "2026-01-01",
        endDate: "2026-04-01",
      }).success
    ).toBe(false);
  });
  it("keeps absent comparison base and absent sample unmeasured", () => {
    expect(performanceChange(5, 0)).toBeNull();
    expect(performanceChange(0, 10)).toBe(-100);
    expect(performanceChange(15, 10)).toBe(50);
    expect(performanceShare(0, 0)).toBeNull();
    expect(performanceShare(0, 4)).toBe(0);
    expect(performanceShare(3, 4)).toBe(75);
  });
});
