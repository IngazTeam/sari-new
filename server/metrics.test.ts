import { beforeEach, describe, it, expect, vi } from "vitest";
import { testMetricsFixture } from "./tests/helpers/test-metrics-fixture";
const m = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./test-metrics-workspace", () => ({
  readTestMetricsWorkspace: m.read,
}));
import { calculateAllMetrics, legacyTestMetrics } from "./metrics";
beforeEach(() => {
  vi.resetAllMocks();
  m.read.mockResolvedValue(testMetricsFixture());
});
describe("legacy test metrics use canonical evidence", () => {
  it.each(["day", "week", "month"] as const)(
    "reads one bounded %s snapshot",
    async period => {
      const now = new Date("2026-09-30T10:00:00Z");
      await calculateAllMetrics(20, period, now);
      expect(m.read).toHaveBeenCalledTimes(1);
      expect(m.read).toHaveBeenCalledWith(20, { period }, now);
    }
  );
  it("retains all 15 identifiers and precise trial units with their evidence", () => {
    const d = testMetricsFixture(),
      r = legacyTestMetrics(d);
    expect(r.conversion).toEqual({
      conversionRate: 25,
      avgDealValue: 149.5,
      totalRevenue: 149.5,
    });
    expect(r.time).toEqual({
      avgResponseTime: 1500,
      avgConversationLength: 2,
      avgTimeToConversion: 120,
    });
    expect(
      Object.keys({
        ...r.conversion,
        ...r.time,
        ...r.quality,
        ...r.growth,
        ...r.advanced,
      })
    ).toHaveLength(15);
    expect(r.evidence).toBe(d);
    expect(r.evidence.metrics.totalRevenue.meaning).toBe(
      "test_value_unknown_currency"
    );
    expect(r.evidence.metrics.avgResponseTime.unit).toBe("ms");
  });
  it("never substitutes test marks or ratings for customer outcomes", async () => {
    const r = await calculateAllMetrics(20, "day");
    expect(r.quality).toEqual({
      resolutionRate: null,
      escalationRate: null,
      engagementRate: 50,
    });
    expect(r.growth).toEqual({ returnRate: null, referralRate: null });
    expect(r.advanced).toEqual({
      productClickRate: null,
      orderCompletionRate: null,
      csatScore: null,
      npsScore: null,
    });
    expect(r.evidence.salesProficiency).toBeNull();
    expect(r.evidence.feedback.positiveShare).toBe(50);
  });
  it("preserves missing denominators instead of coercing them to zero", async () => {
    const d = testMetricsFixture();
    d.metrics.conversionRate.value = null;
    d.metrics.totalRevenue.value = 0;
    d.metrics.avgDealValue.value = null;
    d.metrics.avgResponseTime.value = null;
    m.read.mockResolvedValue(d);
    const r = await calculateAllMetrics(20, "day");
    expect(r.conversion).toEqual({
      conversionRate: null,
      avgDealValue: null,
      totalRevenue: 0,
    });
    expect(r.time.avgResponseTime).toBeNull();
  });
  it("propagates unavailable source instead of returning a zero report", async () => {
    m.read.mockRejectedValue(Error("Source unavailable"));
    await expect(calculateAllMetrics(20, "day")).rejects.toThrow(
      "Source unavailable"
    );
  });
});
