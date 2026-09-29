import { beforeEach, describe, expect, it, vi } from "vitest";
import { testMetricsWindow } from "../shared/test-metrics-workspace";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./test-metrics-workspace", () => ({
  readTestMetricsWorkspace: m.read,
}));
import { testMetricsWorkspaceRouter } from "./routers-test-metrics-workspace";
const caller = () =>
  testMetricsWorkspaceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.read.mockResolvedValue({ merchantId: 20 });
});
describe("test metrics scope and periods", () => {
  it.each(["owner", "manager", "viewer", "sales_supervisor"])(
    "uses selected tenant for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role });
      await caller().read({});
      expect(m.read).toHaveBeenCalledWith(20, { period: "day" });
    }
  );
  it.each([
    { period: "all" },
    { period: "90d" },
    { period: 7 },
    { merchantId: 21 },
    { from: "bad" },
  ])("rejects invalid input %j", async input => {
    await expect(caller().read(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("denies missing membership", async () => {
    m.access.mockResolvedValue(null);
    await expect(caller().read({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("hides source details without returning fabricated zeros", async () => {
    m.read.mockRejectedValue(Error("SQL private"));
    await expect(caller().read({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Test metrics unavailable",
    });
  });
  it.each([
    ["day", "2026-09-30T00:00:00.000Z"],
    ["week", "2026-09-24T00:00:00.000Z"],
    ["month", "2026-09-01T00:00:00.000Z"],
  ] as const)("uses one bounded UTC %s period", (period, start) => {
    const w = testMetricsWindow(period, new Date("2026-09-30T10:20:30.999Z"));
    expect(w.from).toBe(start);
    expect(w.through).toBe("2026-09-30T10:20:30.000Z");
  });
  it("handles year boundaries and timezone offsets", () => {
    const w = testMetricsWindow("week", new Date("2026-01-01T00:05:00+03:00"));
    expect(w.from).toBe("2025-12-25T00:00:00.000Z");
    expect(w.through).toBe("2025-12-31T21:05:00.000Z");
  });
});
