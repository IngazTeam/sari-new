import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, getDb, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readReportWorkspace } from "./report-workspace";
const now = new Date("2026-09-30T12:00:00.000Z");
describe.skipIf(!process.env.DATABASE_URL)("report snapshot on MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const q = async (sql: string, args: any[] = []) =>
    (await (await getPool())!.execute<any>(sql, args))[0];
  const insert = async (
    table: "orders" | "conversations",
    overrides: Record<string, unknown> = {}
  ) => {
    const row = {
      merchantId: owner.merchantId,
      customerPhone: "+12025550151",
      createdAt: "2026-09-30 10:00:00",
      ...(table === "orders"
        ? {
            customerName: "Local report",
            items: '[{"name":"Coffee","quantity":2,"unitPriceMinor":125}]',
            totalAmount: 250,
            currency: "SAR",
            status: "processing",
            payment_status: "unpaid",
          }
        : {
            customerName: "Local phone",
            status: "active",
            lastMessageAt: "2026-09-30 10:00:00",
            purchaseCount: 0,
            totalSpent: 0,
          }),
      ...overrides,
    };
    const keys = Object.keys(row);
    return Number(
      (
        await q(
          `INSERT INTO ${table} (${keys.map(k => "`" + k + "`").join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
          Object.values(row)
        )
      ).insertId
    );
  };
  const read = (kind: "sales" | "customers" | "conversations", extras = {}) =>
    readReportWorkspace(
      owner.merchantId,
      { kind, period: "day", ...extras },
      now
    );
  beforeEach(async () => {
    owner = await createDisposableMerchant("report-owner");
    other = await createDisposableMerchant("report-other");
  });
  afterEach(async () =>
    cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
  );
  afterAll(closeDb);
  it("keeps aggregates and the item sample consistent across a concurrent committed insert", async () => {
    await insert("orders");
    const database = (await getDb())!;
    const original = database.transaction.bind(database);
    let calls = 0;
    const spy = vi.spyOn(database, "transaction").mockImplementation(((
      run: any,
      options: any
    ) =>
      original(async tx => {
        const proxy = new Proxy(tx, {
          get(target, key, receiver) {
            if (key === "execute")
              return async (statement: any) => {
                const result = await target.execute(statement);
                if (++calls === 2)
                  await insert("orders", { totalAmount: 9999 });
                return result;
              };
            return Reflect.get(target, key, receiver);
          },
        });
        return run(proxy);
      }, options)) as typeof database.transaction);
    try {
      expect(await read("sales")).toMatchObject({
        totalOrders: 1,
        totalRevenue: 250,
        productSample: { inspectedOrders: 1 },
      });
    } finally {
      spy.mockRestore();
    }
    expect(await read("sales")).toMatchObject({
      totalOrders: 2,
      totalRevenue: 10249,
      productSample: { inspectedOrders: 2 },
    });
  });
  it("isolates currency, tenant, status and future timestamps while separating recorded payment", async () => {
    await insert("orders");
    await insert("orders", { totalAmount: 750, payment_status: "paid" });
    await insert("orders", { totalAmount: 9999, currency: "USD" });
    await insert("orders", { totalAmount: 9999, merchantId: other.merchantId });
    await insert("orders", { totalAmount: 9999, status: "pending" });
    await insert("orders", { totalAmount: 9999, status: "cancelled" });
    await insert("orders", {
      totalAmount: 9999,
      createdAt: "2026-09-30 12:00:01",
    });
    await insert("conversations");
    await insert("conversations", { merchantId: other.merchantId });
    await insert("conversations", { createdAt: "2026-09-30 12:00:01" });
    expect(await read("sales")).toMatchObject({
      totalOrders: 2,
      totalRevenue: 1000,
      markedPaidMinor: 750,
      totalConversations: 1,
      conversionRate: 200,
      topProducts: [{ name: "Coffee", quantity: 4, revenue: 500 }],
    });
  });
  it("keeps boundary seconds in exactly one period and compares equal elapsed windows", async () => {
    await insert("orders", {
      createdAt: "2026-09-30 00:00:00",
      totalAmount: 100,
    });
    await insert("orders", {
      createdAt: "2026-09-30 12:00:00",
      totalAmount: 300,
    });
    await insert("orders", {
      createdAt: "2026-09-29 23:59:59",
      totalAmount: 100,
    });
    await insert("orders", {
      createdAt: "2026-09-29 11:59:59",
      totalAmount: 100,
    });
    await insert("orders", {
      createdAt: "2026-09-29 11:59:58",
      totalAmount: 9999,
    });
    expect(await read("sales")).toMatchObject({
      totalOrders: 2,
      totalRevenue: 400,
      previousRevenue: 200,
      growth: 100,
      previousFrom: "2026-09-29T11:59:59.000Z",
    });
  });
  it("excludes negative amounts, retains zero and does not assume legacy item units", async () => {
    await insert("orders", {
      totalAmount: -100,
      items: '[{"name":"Legacy","quantity":2,"price":300}]',
    });
    await insert("orders", {
      totalAmount: 0,
      items: '[{"name":"Zero","quantity":1,"price":0,"priceUnit":"minor"}]',
    });
    await insert("orders", { totalAmount: 100, items: "broken" });
    expect(await read("sales")).toMatchObject({
      totalOrders: 3,
      validAmountOrders: 2,
      excludedAmounts: 1,
      totalRevenue: 100,
      averageOrderValue: 50,
      productSample: { excludedOrders: 2, excludedItems: 1, includedItems: 1 },
      topProducts: [{ name: "Zero", quantity: 1, revenue: 0 }],
    });
  });
  it("caps the item sample deterministically without truncating order aggregates", async () => {
    for (let i = 0; i < 251; i++)
      await insert("orders", {
        items: JSON.stringify([
          {
            name: i === 0 ? "Outside" : "Inside",
            quantity: 1,
            unitPriceMinor: 1,
          },
        ]),
        totalAmount: 1,
      });
    const data = await read("sales");
    expect(data).toMatchObject({
      totalOrders: 251,
      totalRevenue: 251,
      productSample: {
        inspectedOrders: 250,
        eligibleOrders: 251,
        omittedOrders: 1,
      },
      topProducts: [{ name: "Inside", quantity: 250, revenue: 250 }],
    });
  });
  it("distinguishes exact trimmed phone identifiers, unknown phones and conversation rows", async () => {
    await insert("conversations", {
      customerPhone: " A ",
      purchaseCount: 2,
      totalSpent: 9999,
    });
    await insert("conversations", {
      customerPhone: "A",
      purchaseCount: 3,
      totalSpent: 1,
    });
    await insert("conversations", {
      customerPhone: "a",
      createdAt: "2026-09-20 12:00:00",
      lastMessageAt: "2026-09-30 12:00:01",
      purchaseCount: 1,
    });
    await insert("conversations", {
      customerPhone: "   ",
      totalSpent: -1,
      purchaseCount: 4,
    });
    await insert("conversations", {
      customerPhone: "foreign",
      merchantId: other.merchantId,
      purchaseCount: 999,
    });
    await insert("conversations", {
      customerPhone: "future",
      createdAt: "2026-09-30 12:00:01",
      purchaseCount: 999,
    });
    const result = await read("customers");
    expect(result).toMatchObject({
      totalCustomers: 2,
      newCustomers: 1,
      activeCustomers: 1,
      unknownPhoneConversations: 1,
      retentionRate: 50,
    });
    if (result.kind !== "customers") throw Error("Wrong report");
    expect(result.topCustomers.map(v => v.purchaseCount)).toEqual([4, 3, 2, 1]);
    expect(result.topCustomers[0].totalSpent).toBeNull();
  });
  it("bounds conversation counts and declares historical counters and absent measures", async () => {
    await insert("conversations", { purchaseCount: 5 });
    await insert("conversations", { purchaseCount: -1 });
    await insert("conversations");
    await insert("conversations", {
      createdAt: "2026-09-29 23:59:59",
      purchaseCount: 999,
    });
    await insert("conversations", {
      createdAt: "2026-09-30 12:00:01",
      purchaseCount: 999,
    });
    await insert("conversations", {
      merchantId: other.merchantId,
      purchaseCount: 999,
    });
    expect(await read("conversations")).toMatchObject({
      totalConversations: 3,
      withPurchase: 1,
      invalidPurchaseCounters: 1,
      conversionRate: 33.33,
      averageResponseTime: null,
      satisfactionRate: null,
    });
  });
  it("distinguishes empty data from missing merchant and excludes oversized snapshots", async () => {
    expect(await read("sales")).toMatchObject({
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: null,
      conversionRate: null,
      growth: null,
    });
    expect(await read("customers")).toMatchObject({
      totalCustomers: 0,
      retentionRate: null,
      topCustomers: [],
    });
    expect(await read("conversations")).toMatchObject({
      totalConversations: 0,
      conversionRate: null,
    });
    await insert("orders", {
      items: JSON.stringify([
        { name: "Long".repeat(5000), quantity: 1, unitPriceMinor: 5 },
      ]),
    });
    expect(await read("sales")).toMatchObject({
      productSample: { excludedOrders: 1 },
      topProducts: [],
    });
    await expect(
      readReportWorkspace(2147483647, { kind: "sales", period: "day" }, now)
    ).rejects.toThrow();
  });
});
