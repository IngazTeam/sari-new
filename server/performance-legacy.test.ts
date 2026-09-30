import { beforeEach, describe, expect, it, vi } from "vitest";
import { performanceFixture } from "./tests/helpers/performance-fixture";
import { legacyPerformanceResult } from "./performance-legacy";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./performance-workspace", () => ({
  readPerformanceWorkspace: m.read,
}));
import { performanceRouter } from "./routers-performance";
const input = { startDate: "2026-09-01", endDate: "2026-09-02" };
const caller = () =>
  performanceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.read.mockResolvedValue(performanceFixture());
});
describe("legacy performance source unification", () => {
  it.each([undefined, 20])(
    "reads the selected tenant once with optional matching legacy id %s",
    async merchantId => {
      const result = await caller().getPerformanceMetrics({
        ...input,
        ...(merchantId === undefined ? {} : { merchantId }),
      });
      expect(m.read).toHaveBeenCalledExactlyOnceWith(20, input);
      expect(result.totalMessages).toBe(10);
      expect(result.evidence.merchantId).toBe(20);
    }
  );
  it.each([1, 21, 999999])(
    "rejects mismatching legacy tenant id %s before reading",
    async merchantId => {
      await expect(
        caller().getPerformanceMetrics({ ...input, merchantId })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(m.read).not.toHaveBeenCalled();
    }
  );
  it.each(["owner", "manager", "viewer", "sales_supervisor"])(
    "uses analytics permission for role %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await caller().getPerformanceMetrics(input);
      expect(m.read).toHaveBeenCalledOnce();
    }
  );
  it.each([null, { merchantId: 20, role: "support_agent", memberId: 4 }])(
    "denies missing membership/permission %j",
    async access => {
      m.access.mockResolvedValue(access);
      await expect(caller().getPerformanceMetrics(input)).rejects.toMatchObject(
        { code: "FORBIDDEN" }
      );
      expect(m.read).not.toHaveBeenCalled();
    }
  );
  it.each([
    { ...input, merchantId: 0 },
    { ...input, merchantId: 1.5 },
    { ...input, all: true },
    { startDate: "2026-01-01", endDate: "2026-04-01" },
    { startDate: "2026-09-02", endDate: "2026-09-01" },
    { startDate: "2099-01-01", endDate: "2099-01-02" },
  ])("rejects invalid input %j", async value => {
    await expect(
      caller().getPerformanceMetrics(value as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("returns failures as sanitized errors, never an empty successful metric set", async () => {
    m.read.mockRejectedValue(Error("SQL password secret"));
    await expect(caller().getPerformanceMetrics(input)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Performance unavailable",
    });
  });
  it("preserves historical keys with unsupported outcomes null and full original evidence", () => {
    const data = performanceFixture(),
      result = legacyPerformanceResult(data);
    expect(result.evidence).toBe(data);
    expect(result).toMatchObject({
      totalMessages: 10,
      messageChange: 100,
      totalOrders: 4,
      completedOrders: 2,
      orderFulfillmentRate: 50,
      orderFulfillmentRateChange: null,
    });
    for (const key of [
      "responseTime",
      "responseTimeChange",
      "conversionRate",
      "conversionRateChange",
      "customerSatisfaction",
      "customerSatisfactionChange",
      "repeatPurchaseRate",
      "repeatPurchaseRateChange",
      "totalRevenue",
      "revenueChange",
      "totalCost",
      "netProfit",
      "roi",
      "roiChange",
      "uniqueCustomers",
      "repeatCustomers",
    ] as const)
      expect(result[key]).toBeNull();
    expect(result.evidence.current.orders.values).toHaveLength(2);
    expect(result.evidence.current.orderPhones.repeatShare).toBe(50);
  });
  it("distinguishes empty samples, zero bases and changes against nonzero bases", () => {
    const data = performanceFixture();
    data.current.orders.deliveredShare = 0;
    data.previous.orders.deliveredShare = 20;
    data.previous.messages.total = 0;
    const r = legacyPerformanceResult(data);
    expect(r.orderFulfillmentRate).toBe(0);
    expect(r.orderFulfillmentRateChange).toBe(-100);
    expect(r.messageChange).toBeNull();
    data.current.orders.deliveredShare = null;
    expect(legacyPerformanceResult(data).orderFulfillmentRate).toBeNull();
  });
});
