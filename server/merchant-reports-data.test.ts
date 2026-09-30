import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const mocks = vi.hoisted(() => ({ access: vi.fn(), db: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./db/connection", () => ({ getDb: mocks.db }));
import { reportsRouter } from "./routers-reports";
import { readReportWorkspace, reportProducts } from "./report-workspace";
import { reportWindow, reportWorkspaceInput } from "../shared/report-workspace";
const caller = () =>
  reportsRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
let results: any[], queries: any[], transaction: ReturnType<typeof vi.fn>;
const now = new Date("2026-09-30T12:00:00.987Z");
const sales = () =>
  (results = [
    [{ id: 20 }],
    [{ total: 2, valid: 2, value: 250, markedPaid: 125 }],
    [{ total: 1, valid: 1, value: 100, markedPaid: 0 }],
    [{ total: 4 }],
    [
      {
        items: '[{"name":"Coffee","quantity":2,"unitPriceMinor":125}]',
        characters: 64,
      },
      { items: "invalid", characters: 7 },
    ],
  ]);
beforeEach(() => {
  vi.resetAllMocks();
  results = [];
  queries = [];
  mocks.access.mockResolvedValue({
    merchantId: 20,
    role: "owner",
    memberId: 3,
  });
  transaction = vi.fn(async run =>
    run({
      execute: async (q: any) => {
        queries.push(new MySqlDialect().sqlToQuery(q));
        return [results.shift(), []];
      },
    })
  );
  mocks.db.mockResolvedValue({ transaction });
});
describe("bounded report source", () => {
  it("reads one repeatable read snapshot, scopes every SQL read and separates payment", async () => {
    sales();
    const data = await readReportWorkspace(
      20,
      { kind: "sales", period: "week", currency: "USD" },
      now
    );
    expect(data).toMatchObject({
      kind: "sales",
      totalRevenue: 250,
      markedPaidMinor: 125,
      growth: 150,
      growthAvailable: true,
      currency: "USD",
      conversionRate: 50,
      topProducts: [{ name: "Coffee", quantity: 2, revenue: 250 }],
      productSample: {
        inspectedOrders: 2,
        excludedOrders: 1,
        omittedOrders: 0,
      },
    });
    for (const p of queries) {
      expect(p.params).toContain(20);
      if (p.sql.includes("FROM orders")) {
        expect(p.params).toContain("USD");
        expect(p.sql).toContain("createdAt<=");
      }
    }
    expect(transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    expect(queries.at(-1).params).toContain(250);
    expect(queries.at(-1).params).toContain(16384);
  });
  it("returns null for absent denominators and preserves real monetary zero", async () => {
    results = [
      [{ id: 20 }],
      [{ total: 1, valid: 1, value: 0, markedPaid: 0 }],
      [{ total: 0, valid: 0, value: 0, markedPaid: 0 }],
      [{ total: 0 }],
      [{ items: "[]", characters: 2 }],
    ];
    expect(
      await readReportWorkspace(20, { kind: "sales", period: "month" }, now)
    ).toMatchObject({
      totalRevenue: 0,
      averageOrderValue: 0,
      conversionRate: null,
      growth: null,
      growthAvailable: false,
    });
  });
  it("does not infer response speed, topics or satisfaction from a purchase counter", async () => {
    results = [[{ id: 20 }], [{ total: 4, purchases: 1, invalid: 1 }]];
    expect(
      await readReportWorkspace(
        20,
        { kind: "conversations", period: "month" },
        now
      )
    ).toMatchObject({
      conversionRate: 25,
      withPurchase: 1,
      invalidPurchaseCounters: 1,
      averageResponseTime: null,
      satisfactionRate: null,
      topicsAvailable: false,
    });
    expect(queries).toHaveLength(2);
  });
  it.each([
    undefined,
    null,
    [],
    [{}],
    [{ total: null }],
    [{ total: "" }],
    [{ total: -1 }],
  ])("fails closed on absent/invalid aggregates %j", async bad => {
    results = [[{ id: 20 }], bad];
    await expect(
      readReportWorkspace(20, { kind: "conversations", period: "day" }, now)
    ).rejects.toThrow();
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid merchant %s before reading",
    async id => {
      await expect(
        readReportWorkspace(id, { kind: "sales", period: "day" }, now)
      ).rejects.toThrow();
      expect(mocks.db).not.toHaveBeenCalled();
    }
  );
  it("propagates transaction failure without an empty success", async () => {
    transaction.mockRejectedValue(Error("private SQL error"));
    await expect(
      caller().workspace({ kind: "sales", period: "day" })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Reports unavailable",
    });
  });
});
describe("report inputs and time boundaries", () => {
  it.each(["day", "week", "month", "year"] as const)(
    "has inclusive adjacent equal windows for %s",
    period => {
      const w = reportWindow(period, now);
      expect(w.through).toBe("2026-09-30T12:00:00.000Z");
      expect(Date.parse(w.from) - Date.parse(w.previousThrough)).toBe(1000);
      expect(Date.parse(w.through) - Date.parse(w.from)).toBe(
        Date.parse(w.previousThrough) - Date.parse(w.previousFrom)
      );
      if (period !== "day")
        expect(w.seconds).toBe(
          { week: 7, month: 30, year: 365 }[period] * 86400
        );
    }
  );
  it("handles UTC midnight without an empty baseline and does not mutate the clock", () => {
    const date = new Date("2026-01-01T00:00:00.999Z"),
      w = reportWindow("day", date);
    expect(w.seconds).toBe(1);
    expect(w.previousFrom).toBe("2025-12-31T23:59:59.000Z");
    expect(date.getMilliseconds()).toBe(999);
  });
  it.each([
    { kind: "sales", period: "day", merchantId: 999 },
    { kind: "sales", period: "quarter" },
    { kind: "sales", period: "day", currency: "EUR" },
  ])("rejects %j", input =>
    expect(reportWorkspaceInput.safeParse(input).success).toBe(false)
  );
  it("rejects invalid clocks", () =>
    expect(() => reportWindow("day", new Date("bad"))).toThrow());
});
describe("item sample units and exclusions", () => {
  const row = (items: unknown) => {
    const text = JSON.stringify(items);
    return { items: text, characters: text.length };
  };
  it("counts ambiguous, invalid and oversized items rather than assuming money units", () => {
    const data = reportProducts(
      [
        row([
          { name: "A", quantity: 2, price: 125 },
          { name: "A", quantity: 2, unitPriceMinor: 125 },
          { name: "B", quantity: 1, price: 300, priceUnit: "minor" },
          { name: "C", quantity: 1.5, unitPriceMinor: 300 },
        ]),
        row(null),
        { items: "[]", characters: 17000 },
      ],
      5
    );
    expect(data.topProducts).toEqual([
      { name: "B", quantity: 1, revenue: 300 },
      { name: "A", quantity: 2, revenue: 250 },
    ]);
    expect(data.productSample).toMatchObject({
      inspectedOrders: 3,
      eligibleOrders: 5,
      excludedOrders: 3,
      includedItems: 2,
      excludedItems: 2,
      omittedOrders: 2,
    });
  });
  it("groups exact names only, preserves literal hostile names and guards sum overflow", () => {
    const name = "<script>alert(1)</script>";
    expect(
      reportProducts([row([{ name, quantity: 1, unitPriceMinor: 10 }])], 1)
        .topProducts[0].name
    ).toBe(name);
    expect(() =>
      reportProducts(
        [
          row([
            { name: "A", quantity: 1, unitPriceMinor: Number.MAX_SAFE_INTEGER },
            { name: "A", quantity: 1, unitPriceMinor: 1 },
          ]),
        ],
        1
      )
    ).toThrow();
  });
});
describe("report permission and retired routes", () => {
  it("uses resolved membership rather than injected context", async () => {
    sales();
    expect(
      await caller().workspace({
        kind: "sales",
        period: "week",
        currency: "USD",
      })
    ).toMatchObject({ merchantId: 20, currency: "USD" });
    expect(queries[0].params).toEqual([20]);
  });
  it("denies every read to a role without analytics.read", async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: "support_agent" });
    for (const kind of ["sales", "customers", "conversations"] as const)
      await expect(
        caller().workspace({ kind, period: "day" })
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects tenant injection at each route", async () => {
    for (const kind of ["sales", "customers", "conversations"] as const)
      await expect(
        caller().workspace({ kind, period: "day", merchantId: 999 } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("surfaces unavailable storage", async () => {
    mocks.db.mockResolvedValue(null);
    await expect(
      caller().workspace({ kind: "sales", period: "month" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
  it.each(["getSalesReport", "getCustomersReport", "getConversationsReport"])(
    "rejects retired %s without access or database reads",
    async method => {
      await expect(
        (caller() as any)[method]({ period: "month" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mocks.access).not.toHaveBeenCalled();
      expect(mocks.db).not.toHaveBeenCalled();
    }
  );
});
