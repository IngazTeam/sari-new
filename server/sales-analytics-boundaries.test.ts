import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { products, campaigns } from "../drizzle/schema";
const m = vi.hoisted(() => ({
  getDb: vi.fn(),
  codes: vi.fn(),
  where: vi.fn(),
  rows: [] as any[],
  productRows: [] as any[],
}));
vi.mock("./db", () => ({
  getDb: m.getDb,
  getDiscountCodesByMerchantId: m.codes,
}));
import * as analytics from "./analytics/analytics";
const methods = [
  analytics.getDashboardKPIs,
  analytics.getRevenueTrends,
  analytics.getTopProducts,
  analytics.getCampaignAnalytics,
  analytics.getCustomerSegments,
  analytics.getHourlyAnalytics,
  analytics.getWeekdayAnalytics,
  analytics.getDiscountCodeAnalytics,
];
const range = () => ({
  startDate: new Date("2026-09-01T00:00:00Z"),
  endDate: new Date("2026-10-01T00:00:00Z"),
});
const dialect = new MySqlDialect();
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  m.rows = [];
  m.productRows = [];
  m.codes.mockResolvedValue([]);
  m.getDb.mockResolvedValue({
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: any) => {
          m.where(table, condition);
          const promise = Promise.resolve(
            table === products ? m.productRows : m.rows
          );
          return Object.assign(promise, { limit: () => promise });
        },
      }),
    }),
  });
});
afterEach(() => vi.useRealTimers());
describe("sales analytics boundaries and evidence", () => {
  it("accepts only the stored currency and rejects a stale or forged requested currency", () => {
    expect(analytics.resolveAnalyticsCurrency("USD", "USD")).toBe("USD");
    expect(analytics.resolveAnalyticsCurrency("SAR")).toBe("SAR");
    expect(() => analytics.resolveAnalyticsCurrency("USD", "SAR")).toThrow(
      "currency changed"
    );
    expect(() => analytics.resolveAnalyticsCurrency("EUR")).toThrow(
      "Invalid analytics currency"
    );
  });
  it.each([
    () => analytics.getDashboardKPIs(20, range(), "USD"),
    () => analytics.getRevenueTrends(20, range(), "day", "USD"),
    () => analytics.getTopProducts(20, range(), 10, "USD"),
    () => analytics.getCustomerSegments(20, range(), "USD"),
    () => analytics.getHourlyAnalytics(20, range(), "USD"),
    () => analytics.getWeekdayAnalytics(20, range(), "USD"),
    () => analytics.getDiscountCodeAnalytics(20, range(), "USD"),
  ])("keeps monetary reads in the requested server currency", async read => {
    m.codes.mockResolvedValue([{ code: "EXAMPLE", type: "fixed", value: 10 }]);
    await read();
    expect(m.where.mock.calls.length).toBeGreaterThan(0);
    for (const [, condition] of m.where.mock.calls) {
      const q = dialect.sqlToQuery(condition);
      expect(q.params).toContain("USD");
      expect(q.sql).toContain("currency");
    }
  });
  it("keeps missing baselines, averages and conversion unknown", async () => {
    expect(await analytics.getDashboardKPIs(20, range())).toMatchObject({
      totalRevenue: 0,
      totalOrders: 0,
      averageOrderValue: null,
      conversionRate: null,
      revenueGrowth: null,
      ordersGrowth: null,
    });
  });
  it("keeps the per-order segment average separate from the number of customers", async () => {
    m.rows = [
      { customerPhone: "one", totalAmount: 100 },
      { customerPhone: "one", totalAmount: 300 },
    ];
    const rows = await analytics.getCustomerSegments(20, range());
    expect(rows.find(r => r.segment === "returning")).toMatchObject({
      count: 1,
      revenue: 400,
      averageOrderValue: 200,
    });
    expect(rows.find(r => r.segment === "new")?.averageOrderValue).toBeNull();
  });
  it("does not guess item prices or quantities from ambiguous legacy JSON", async () => {
    m.rows = [
      {
        items: JSON.stringify([
          null,
          { productId: 1, name: { untrusted: true }, quantity: 2, price: 10 },
          { productId: 2, name: "Zero", quantity: 0, unitPriceMinor: 100 },
          { productId: 3, name: "Known", quantity: 2, unitPriceMinor: 125 },
        ]),
      },
    ];
    const rows = await analytics.getTopProducts(20, range());
    expect(rows).toEqual([
      {
        productId: 3,
        productName: "Known",
        totalSales: 2,
        totalRevenue: 250,
        averagePrice: 125,
        stockLevel: null,
      },
    ]);
  });
  it("rejects corrupt amounts rather than producing a plausible total", async () => {
    m.rows = [
      {
        customerPhone: "one",
        createdAt: "2026-09-20 10:00:00",
        totalAmount: -1,
      },
    ];
    for (const read of [
      analytics.getDashboardKPIs,
      analytics.getRevenueTrends,
      analytics.getHourlyAnalytics,
      analytics.getWeekdayAnalytics,
      analytics.getCustomerSegments,
    ])
      await expect(read(20, range())).rejects.toThrow(
        "Invalid analytics amount"
      );
  });
  it.each(methods)(
    "%s rejects unavailable storage instead of empty success",
    async read => {
      m.getDb.mockResolvedValue(null);
      await expect(read(20, range())).rejects.toThrow("unavailable");
    }
  );
  it.each(methods)("%s rejects invalid scope before reading", async read => {
    for (const bad of [
      { ...range(), startDate: new Date("bad") },
      { ...range(), startDate: new Date("2026-10-02") },
      { ...range(), startDate: new Date("2020-01-01") },
      { ...range(), endDate: new Date("2026-09-01") },
    ])
      await expect(read(20, bad)).rejects.toThrow("Invalid analytics scope");
    await expect(read(0, range())).rejects.toThrow("Invalid analytics scope");
    expect(m.getDb).not.toHaveBeenCalled();
  });
  it.each(methods)(
    "%s keeps reads bounded by tenant and exclusive end",
    async read => {
      await read(20, range());
      for (const [, condition] of m.where.mock.calls) {
        const q = dialect.sqlToQuery(condition);
        expect(q.params).toContain(20);
        expect(q.sql).toContain(" < ");
        expect(q.sql).not.toContain("<=");
      }
    }
  );
  it("clamps future end to the current second and keeps the comparison boundary exclusive", async () => {
    await analytics.getDashboardKPIs(20, {
      ...range(),
      endDate: new Date("2026-10-02"),
    });
    const queries = m.where.mock.calls.map(([, c]) => dialect.sqlToQuery(c));
    expect(queries[0].params).toContain("2026-10-01 12:00:00");
    expect(queries[1].params).toContain("2026-09-01 00:00:00");
    expect(queries[1].sql).toContain(" < ");
  });
  it("does not enrich forged item IDs with another tenant catalog", async () => {
    m.rows = [
      {
        items: JSON.stringify([
          {
            productId: 999,
            name: "Order snapshot",
            quantity: 2,
            price: 10,
            priceUnit: "minor",
          },
        ]),
      },
    ];
    const rows = await analytics.getTopProducts(20, range());
    expect(rows[0]).toMatchObject({
      productName: "Order snapshot",
      stockLevel: null,
    });
    const query = dialect.sqlToQuery(
      m.where.mock.calls.find(([table]) => table === products)![1]
    );
    expect(query.params).toEqual([999, 20]);
    expect(query.sql).toContain("merchantId");
  });
  it.each([0, -1, 101, 1.5, NaN])(
    "rejects product limit %s before storage",
    async limit => {
      await expect(
        analytics.getTopProducts(20, range(), limit)
      ).rejects.toThrow("Invalid analytics limit");
      expect(m.getDb).not.toHaveBeenCalled();
    }
  );
  it("returns recorded campaign sends and no invented attribution, opens, clicks or ROI", async () => {
    m.rows = [{ id: 4, name: "Example", sentCount: 8, recipientCount: 1000 }];
    const rows = await analytics.getCampaignAnalytics(20, range());
    expect(rows).toEqual([
      {
        campaignId: 4,
        campaignName: "Example",
        sentCount: 8,
        openRate: null,
        clickRate: null,
        conversionRate: null,
        revenue: null,
        roi: null,
      },
    ]);
    expect(m.where).toHaveBeenCalledOnce();
    expect(m.where.mock.calls[0][0]).toBe(campaigns);
  });
  it("does not turn corrupt recorded send counts into zero", async () => {
    m.rows = [{ id: 4, name: "Example", sentCount: -1 }];
    expect(
      (await analytics.getCampaignAnalytics(20, range()))[0].sentCount
    ).toBeNull();
  });
  it("buckets MySQL timestamps by UTC regardless of server timezone", async () => {
    m.rows = [{ createdAt: "2026-09-20 23:00:00", totalAmount: 100 }];
    expect((await analytics.getHourlyAnalytics(20, range()))[23].orders).toBe(
      1
    );
    expect((await analytics.getWeekdayAnalytics(20, range()))[0].orders).toBe(
      1
    );
    expect(
      (await analytics.getRevenueTrends(20, range(), "week"))[0].date
    ).toBe("2026-09-20");
  });
});
