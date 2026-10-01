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
    expect(queries[2].params).toContain("2026-09-01 00:00:00");
    expect(queries[2].sql).toContain(" < ");
  });
  it("does not enrich forged item IDs with another tenant catalog", async () => {
    m.rows = [
      {
        items: JSON.stringify([
          { productId: 999, name: "Order snapshot", quantity: 2, price: 10 },
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
