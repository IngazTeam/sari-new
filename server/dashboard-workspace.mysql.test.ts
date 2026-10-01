import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { getDb, getPool, closeDb } from "./db/connection";
import { readDashboardWorkspace } from "./dashboard-workspace";
import { sql } from "drizzle-orm";
describe.skipIf(!process.env.DATABASE_URL)("dashboard snapshot (MySQL)", () => {
  const users: number[] = [];
  let merchantId: number;
  const now = new Date("2026-10-01T12:00:00Z");
  const query = async (sql: string, args: unknown[] = []) =>
    (await (await getPool())!.execute(sql, args))[0] as any;
  const account = async () => {
    const a = await createDisposableMerchant("dashboard-snapshot");
    users.push(a.userId);
    return a.merchantId;
  };
  beforeEach(async () => {
    merchantId = await account();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupDisposableMerchants(users);
    users.length = 0;
  });
  afterAll(closeDb);
  const order = async ({
    merchant = merchantId,
    amount = 100,
    date = "2026-09-30 12:00:00",
    currency = "SAR",
    status = "delivered",
    items = JSON.stringify([
      { name: "Coffee", quantity: 1, unitPriceMinor: amount },
    ]),
  } = {}) =>
    query(
      "INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status,createdAt) VALUES (?,'fixture','Fixture',?,?,?,?,?)",
      [merchant, items, amount, currency, status, date]
    );
  it("returns an empty scoped snapshot with unknown growth and average", async () => {
    const data = await readDashboardWorkspace(merchantId, {}, now);
    expect(data.current.totalOrders).toBe(0);
    expect(data.current.averageValueMinor).toBeNull();
    expect(data.growth).toEqual({ orders: null, value: null });
  });
  it("isolates currency, time, tenants and delivered quantities while exposing legacy item gaps", async () => {
    const other = await account();
    await order({
      amount: 100,
      items: '[{"name":"Coffee","quantity":2,"unitPriceMinor":50}]',
    });
    await order({
      amount: 300,
      items: '[{"name":"Coffee","quantity":1,"unitPriceMinor":300}]',
    });
    await order({
      amount: -10,
      items: '[{"name":"Legacy","quantity":1,"price":10}]',
    });
    await order({ amount: 200, status: "pending" });
    await order({ merchant: other, amount: 7000 });
    await order({ currency: "USD", amount: 8000 });
    await order({ amount: 9000, date: "2026-10-01 12:00:00" });
    const data = await readDashboardWorkspace(merchantId, { days: 7 }, now);
    expect(data.current).toMatchObject({
      totalOrders: 4,
      totalValueMinor: 600,
      validValueOrders: 3,
      excludedValueOrders: 1,
      deliveredOrders: 3,
      deliveredValueMinor: 400,
      excludedDeliveredValues: 1,
      averageValueMinor: 200,
    });
    expect(data.products).toEqual([
      { name: "Coffee", quantity: 3, valueMinor: 400, averageUnitMinor: 133 },
    ]);
    expect(data.productSample).toMatchObject({
      inspectedOrders: 3,
      excludedOrders: 1,
      excludedItems: 1,
      omittedOrders: 0,
    });
    expect(data.growth.value).toBeNull();
  });
  it("bounds the product sample to the latest250 orders without presenting it as all orders", async () => {
    const values = Array.from(
      { length: 251 },
      () =>
        "(?,'fixture','Fixture','[{\"name\":\"Coffee\",\"quantity\":1,\"unitPriceMinor\":100}]',100,'SAR','delivered','2026-09-30 12:00:00')"
    ).join(",");
    await query(
      "INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status,createdAt) VALUES " +
        values,
      Array(251).fill(merchantId)
    );
    const data = await readDashboardWorkspace(merchantId, {}, now);
    expect(data.current.totalOrders).toBe(251);
    expect(data.productSample).toMatchObject({
      eligibleOrders: 251,
      inspectedOrders: 250,
      omittedOrders: 1,
    });
    expect(data.products[0].quantity).toBe(250);
  });
  it("keeps a transaction snapshot when a new order commits between the headline and chart reads", async () => {
    await order();
    const database = (await getDb())!,
      original = database.transaction.bind(database);
    vi.spyOn(database, "transaction").mockImplementation(((
      run: any,
      config: any
    ) =>
      original(async tx => {
        const execute = tx.execute.bind(tx);
        let calls = 0;
        tx.execute = (async (q: any) => {
          const data = await execute(q);
          if (++calls === 2) await order({ amount: 500 });
          return data;
        }) as any;
        return run(tx);
      }, config)) as any);
    const first = await readDashboardWorkspace(merchantId, {}, now);
    expect(first.current.totalOrders).toBe(1);
    expect(first.trend[0].orders).toBe(1);
    expect(first.productSample.eligibleOrders).toBe(1);
    vi.restoreAllMocks();
    expect(
      (await readDashboardWorkspace(merchantId, {}, now)).current.totalOrders
    ).toBe(2);
  });
  it("keeps UTC boundaries and chart dates even when the read connection uses another time zone", async () => {
    await order({ date: "2026-09-30 23:30:00" });
    const database = (await getDb())!,
      original = database.transaction.bind(database);
    vi.spyOn(database, "transaction").mockImplementation(((
      run: any,
      config: any
    ) =>
      original(async tx => {
        const [rows] = await tx.execute(sql`SELECT @@session.time_zone zone`);
        const prior = (rows as any)[0].zone;
        try {
          await tx.execute(sql`SET time_zone='+03:00'`);
          return await run(tx);
        } finally {
          await tx.execute(sql`SET time_zone=${prior}`);
        }
      }, config)) as any);
    const data = await readDashboardWorkspace(
      merchantId,
      {},
      new Date("2026-10-01T00:30:00Z")
    );
    expect(data.current.totalOrders).toBe(1);
    expect(data.trend[0].date).toBe("2026-09-30");
  });
});
