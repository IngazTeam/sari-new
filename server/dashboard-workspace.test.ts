import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const mocks = vi.hoisted(() => ({ db: vi.fn(), access: vi.fn() }));
vi.mock("./db/connection", () => ({ getDb: mocks.db }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
import {
  readDashboardWorkspace,
  dashboardProductSample,
} from "./dashboard-workspace";
import { dashboardRouter } from "./routers-dashboard";
let results: any[], queries: any[], transaction: ReturnType<typeof vi.fn>;
const empty = {
  total: 0,
  valid: 0,
  value: 0,
  delivered: 0,
  deliveredValue: 0,
  invalidDelivered: 0,
};
const clock = new Date("2026-10-01T12:00:00.987Z");
beforeEach(() => {
  vi.resetAllMocks();
  queries = [];
  results = [[{ id: 20, currency: "USD" }], [empty], [empty], [], []];
  transaction = vi.fn(async run =>
    run({
      execute: async (q: any) => {
        queries.push(new MySqlDialect().sqlToQuery(q));
        return [results.shift(), []];
      },
    })
  );
  mocks.db.mockResolvedValue({ transaction });
  mocks.access.mockResolvedValue({
    merchantId: 20,
    role: "owner",
    memberId: 7,
  });
});
describe("dashboard consistent snapshot and data quality", () => {
  it("reads every source inside one read-only snapshot and uses server currency and exclusive epoch bounds", async () => {
    const value = await readDashboardWorkspace(20, { days: 7 }, clock);
    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    expect(value).toMatchObject({
      merchantId: 20,
      currency: "USD",
      growth: { orders: null, value: null },
      current: { averageValueMinor: null },
    });
    expect(queries).toHaveLength(5);
    for (const q of queries.slice(1)) {
      expect(q.params).toContain(20);
      expect(q.params).toContain("USD");
      expect(q.sql).toContain("createdAt<FROM_UNIXTIME(");
    }
    expect(queries[2].params.at(-1)).toBe(Date.parse(value.from) / 1000);
    expect(queries[1].params.at(-1)).toBe(Date.parse(value.through) / 1000);
    expect(queries[4].params).toContain(250);
    expect(queries[4].params).toContain(16384);
  });
  it("excludes invalid values from totals and averages and refuses growth from incomplete samples", async () => {
    results[1] = [
      {
        total: 3,
        valid: 2,
        value: 250,
        delivered: 1,
        deliveredValue: 0,
        invalidDelivered: 1,
      },
    ];
    results[2] = [{ ...empty, total: 1, valid: 1, value: 100 }];
    results[3] = [
      {
        date: "2026-09-30",
        total: 3,
        delivered: 1,
        value: 250,
        deliveredValue: 0,
        invalid: 1,
      },
    ];
    results[4] = [{ items: "invalid", characters: 7 }];
    const value = await readDashboardWorkspace(20, { days: 7 }, clock);
    expect(value.current).toMatchObject({
      totalOrders: 3,
      totalValueMinor: 250,
      validValueOrders: 2,
      excludedValueOrders: 1,
      averageValueMinor: 125,
    });
    expect(value.growth).toEqual({ orders: 200, value: null });
    expect(value.productSample).toMatchObject({
      eligibleOrders: 1,
      inspectedOrders: 1,
      excludedOrders: 1,
    });
  });
  it("rejects missing or foreign owners, malformed aggregates and a mismatching trend", async () => {
    results[0] = [{ id: 21, currency: "USD" }];
    await expect(readDashboardWorkspace(20, {}, clock)).rejects.toThrow(
      "owner"
    );
    results = [[{ id: 20, currency: "USD" }], [{ ...empty, total: "NaN" }]];
    await expect(readDashboardWorkspace(20, {}, clock)).rejects.toThrow(
      "aggregate"
    );
    results = [
      [{ id: 20, currency: "USD" }],
      [{ ...empty, total: 1, valid: 1 }],
      [empty],
      [],
      [],
    ];
    await expect(readDashboardWorkspace(20, {}, clock)).rejects.toThrow(
      "trend"
    );
    results = [[]];
    await expect(readDashboardWorkspace(20, {}, clock)).rejects.toThrow(
      "aggregate"
    );
  });
  it("fails closed when the database cannot be read", async () => {
    mocks.db.mockResolvedValue(null);
    await expect(readDashboardWorkspace(20, {}, clock)).rejects.toThrow(
      "unavailable"
    );
  });
  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects an invalid owner %s before storage",
    async merchant => {
      await expect(
        readDashboardWorkspace(merchant, {}, clock)
      ).rejects.toThrow();
      expect(mocks.db).not.toHaveBeenCalled();
    }
  );
  it.each([
    { days: 1 },
    { days: 366 },
    { days: "7" },
    { days: 7, merchantId: 2 },
    { currency: "SAR" },
  ])("rejects unapproved client selection %j", async input => {
    await expect(readDashboardWorkspace(20, input, clock)).rejects.toThrow();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("uses explicit minor units, weighted averages and safe name grouping; records incomplete legacy items", () => {
    const item = JSON.stringify([
      { name: "__proto__", quantity: 2, unitPriceMinor: 100 },
      { name: "__proto__", quantity: 1, price: 400, priceUnit: "minor" },
      { name: "unknown price", quantity: 1, price: 900 },
      { name: "missing quantity", unitPriceMinor: 10 },
    ]);
    const result = dashboardProductSample(
      [
        { items: item, characters: item.length },
        { items: "[]", characters: 20000 },
      ],
      3
    );
    expect(result.products).toEqual([
      {
        name: "__proto__",
        quantity: 3,
        valueMinor: 600,
        averageUnitMinor: 200,
      },
    ]);
    expect(result.productSample).toMatchObject({
      inspectedOrders: 2,
      omittedOrders: 1,
      excludedOrders: 2,
      excludedItems: 2,
      includedItems: 2,
    });
    expect(Object.prototype).not.toHaveProperty("valueMinor");
  });
  it("rejects overflow and invalid product sample bounds instead of silently returning zero", () => {
    expect(() =>
      dashboardProductSample([{ items: "[]", characters: 2 }], 0)
    ).toThrow();
    const item = JSON.stringify([
      { name: "big", quantity: 1, unitPriceMinor: Number.MAX_SAFE_INTEGER },
      { name: "big", quantity: 1, unitPriceMinor: 1 },
    ]);
    expect(() =>
      dashboardProductSample([{ items: item, characters: item.length }], 1)
    ).toThrow();
  });
});
describe("dashboard workspace access", () => {
  const caller = (user: any = { id: 7, role: "user" }) =>
    dashboardRouter.createCaller({
      user,
      merchantId: 999,
      req: { headers: { "x-merchant-id": "20" } },
      res: {},
    } as any);
  it("uses resolved membership and sanitizes database errors", async () => {
    expect((await caller().workspace({ days: 7 })).merchantId).toBe(20);
    mocks.db.mockRejectedValue(new Error("SQL SECRET"));
    await expect(caller().workspace({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Dashboard unavailable",
    });
  });
  it("rejects anonymous or absent membership before data access", async () => {
    await expect(caller(null).workspace({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    mocks.access.mockResolvedValue(null);
    await expect(caller().workspace({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
