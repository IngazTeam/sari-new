import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const mocks = vi.hoisted(() => ({ db: vi.fn(), access: vi.fn() }));
vi.mock("./db/connection", () => ({ getDb: mocks.db }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./db", () => ({
  getCustomerByPhone: vi.fn(),
  getCustomerStats: vi.fn(),
  getCustomersByMerchant: vi.fn(),
  getMerchantById: vi.fn(),
  searchCustomers: vi.fn(),
}));
import { customersRouter } from "./routers-customers";
import { readCustomerList, readCustomerDetail } from "./customer-workspace";
import {
  customerListInput,
  customerDetailInput,
} from "../shared/customer-workspace";
const caller = (user: any = { id: 73, role: "user" }) =>
  customersRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const now = new Date("2026-09-30T12:00:00Z");
let results: any[], queries: any[], transaction: ReturnType<typeof vi.fn>;
const empty = () => {
  results = [
    [{ id: 20 }],
    [
      {
        total: 0,
        active: 0,
        recent: 0,
        inactive: 0,
        unknownCount: 0,
        firstRecordedThisMonth: 0,
        excludedEmptyIdentifiers: 0,
        excludedInvalidIdentifiers: 0,
      },
    ],
    [{ total: 0 }],
    [],
  ];
};
beforeEach(() => {
  vi.resetAllMocks();
  results = [];
  queries = [];
  mocks.access.mockResolvedValue({
    merchantId: 20,
    role: "viewer",
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
describe("customer workspace source and access", () => {
  it("accepts selected membership, returns real empty state, and scopes every source", async () => {
    empty();
    expect(await caller().workspace.list({})).toMatchObject({
      merchantId: 20,
      rows: [],
      totals: { all: 0 },
    });
    expect(queries[0].params).toEqual([20]);
    for (const q of queries.slice(1)) {
      expect(q.params.filter((v: any) => v === 20)).toHaveLength(5);
      expect(q.sql).toContain("customer_profiles");
    }
    expect(transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });
  it.each([
    undefined,
    null,
    [],
    [{}],
    [{ total: -1 }],
    [{ total: "not-number" }],
  ])("fails closed on missing or invalid totals %j", async bad => {
    results = [[{ id: 20 }], bad, [{ total: 0 }], []];
    await expect(readCustomerList(20, {}, now)).rejects.toThrow();
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid tenant %s before storage",
    async id => {
      await expect(readCustomerList(id, {}, now)).rejects.toThrow();
      expect(mocks.db).not.toHaveBeenCalled();
    }
  );
  it("returns explicit missing details without querying unscoped records", async () => {
    results = [[{ id: 20 }], []];
    expect(await readCustomerDetail(20, { key: "missing" }, now)).toMatchObject(
      { customer: null, orders: { rows: [] }, conversations: { rows: [] } }
    );
    expect(queries).toHaveLength(2);
  });
  it("does not expose private query failures or report success when storage is absent", async () => {
    mocks.db.mockResolvedValue(null);
    await expect(caller().workspace.list({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Customers unavailable",
    });
    mocks.db.mockRejectedValue(Error("secret SQL"));
    await expect(
      caller().workspace.detail({ key: "test" })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Customer unavailable",
    });
  });
  it("denies missing membership and unknown role before reading", async () => {
    for (const membership of [
      null,
      { merchantId: 20, role: "support_agent" },
    ]) {
      mocks.access.mockResolvedValue(membership);
      await expect(caller().workspace.list({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(
      caller(null).workspace.detail({ key: "test" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects injected tenant and oversized queries through the actual procedure", async () => {
    for (const input of [
      { merchantId: 999 },
      { search: "x".repeat(121) },
      { page: 0 },
      { activity: "new" },
    ])
      await expect(caller().workspace.list(input as any)).rejects.toMatchObject(
        { code: "BAD_REQUEST" }
      );
    await expect(
      caller().workspace.detail({ key: "test", merchantId: 999 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(["", " ", "x".repeat(51), "test\u0000"])(
    "rejects invalid detail key %j",
    key => expect(customerDetailInput.safeParse({ key }).success).toBe(false)
  );
  it("bounds detail pages and list selections", () => {
    expect(
      customerDetailInput.safeParse({ key: "a", ordersPage: 1000001 }).success
    ).toBe(false);
    expect(customerListInput.parse({ search: "  Coffee  " })).toEqual({
      search: "Coffee",
      activity: "all",
      page: 1,
    });
  });
});
