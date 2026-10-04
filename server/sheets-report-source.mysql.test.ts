import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { collectSheetReportData } from "./sheets-report-source";
describe.skipIf(!process.env.DATABASE_URL)(
  "honest report data on disposable MySQL; no provider",
  () => {
    let a: Awaited<ReturnType<typeof createDisposableMerchant>>, b: typeof a;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const start = new Date("2026-10-01T00:00:00Z"),
      end = new Date("2026-10-02T00:00:00Z");
    const order = (
      merchant = a.merchantId,
      amount = 1200,
      currency = "SAR",
      status = "pending",
      payment = "unpaid",
      items = '[{"name":"Synthetic","quantity":2}]',
      date = "2026-10-01 00:00:00"
    ) =>
      q(
        "INSERT INTO orders(merchantId,customerPhone,customerName,totalAmount,currency,status,payment_status,items,createdAt) VALUES (?,'99900000001','PRIVATE_CUSTOMER',?,?,?,?,?,?)",
        [merchant, amount, currency, status, payment, items, date]
      );
    beforeEach(async () => {
      a = await createDisposableMerchant("sheet-report512");
      b = await createDisposableMerchant("sheet-other512");
      await order();
      await order(a.merchantId, 2300, "USD", "paid", "paid");
      await order(b.merchantId, 9999, "SAR", "paid", "paid");
      const c = Number(
        (
          await q(
            "INSERT INTO conversations(merchantId,customerPhone,createdAt) VALUES (?,'99900000001','2026-09-30 00:00:00')",
            [a.merchantId]
          )
        ).insertId
      );
      await q(
        "INSERT INTO messages(conversationId,direction,content,createdAt) VALUES (?,'incoming','PRIVATE_MESSAGE','2026-10-01 00:00:00'),(?,'incoming','PRIVATE_OUTSIDE','2026-10-02 00:00:00')",
        [c, c]
      );
      await q(
        "INSERT INTO customer_profiles(merchant_id,customer_phone,created_at) VALUES (?,'99900000001','2026-10-01 00:00:00'),(?,'99900000002','2026-10-01 00:00:00')",
        [a.merchantId, a.merchantId]
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([a?.userId, b?.userId].filter(Boolean));
    });
    afterAll(closeDb);
    it("separates currencies and counts messages by message time even in old conversations", async () => {
      const data = await collectSheetReportData(a.merchantId, start, end);
      expect(data).toMatchObject({
        totalOrders: 2,
        totalConversations: 0,
        totalMessages: 1,
        newCustomers: 2,
        orderValues: [
          { currency: "SAR", count: 1, totalMinor: 1200, markedPaidMinor: 0 },
          {
            currency: "USD",
            count: 1,
            totalMinor: 2300,
            markedPaidMinor: 2300,
          },
        ],
        topProducts: [{ name: "Synthetic", count: 4 }],
      });
      expect(JSON.stringify(data)).not.toMatch(/PRIVATE|9999/);
    });
    it("excludes the upper boundary and includes the exact start", async () => {
      await order(
        a.merchantId,
        500,
        "SAR",
        "pending",
        "unpaid",
        "[]",
        "2026-10-02 00:00:00"
      );
      expect(
        (await collectSheetReportData(a.merchantId, start, end)).totalOrders
      ).toBe(2);
    });
    it("includes cancelled orders in status counts while excluding their amounts and products", async () => {
      await order(
        a.merchantId,
        999,
        "SAR",
        "cancelled",
        "paid",
        '[{"name":"Cancelled","quantity":8}]'
      );
      const data = await collectSheetReportData(a.merchantId, start, end);
      expect(data.totalOrders).toBe(3);
      expect(data.ordersByStatus.cancelled).toBe(1);
      expect(data.orderValues[0].totalMinor).toBe(1200);
      expect(data.topProducts).toEqual([{ name: "Synthetic", count: 4 }]);
    });
    it("declares malformed amounts and items rather than defaulting them", async () => {
      await order(a.merchantId, -20, "SAR", "pending", "unpaid", "bad");
      const data = await collectSheetReportData(a.merchantId, start, end);
      expect(data).toMatchObject({ excludedAmounts: 1, excludedItemOrders: 1 });
    });
    it("returns a truthful empty range without leaking another tenant", async () => {
      const data = await collectSheetReportData(
        b.merchantId,
        new Date("2025-01-01"),
        new Date("2025-01-02")
      );
      expect(data).toMatchObject({
        totalOrders: 0,
        totalMessages: 0,
        totalConversations: 0,
        newCustomers: 0,
        orderValues: [],
        topProducts: [],
      });
    });
    it("does not shift date boundaries with process locale or timezone", async () => {
      vi.stubEnv("TZ", "America/Los_Angeles");
      try {
        expect(
          (await collectSheetReportData(a.merchantId, start, end)).totalOrders
        ).toBe(2);
      } finally {
        vi.unstubAllEnvs();
      }
    });
    it("reads one consistent version when an order is created after the size query", async () => {
      const pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      let inserted = false;
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const tx = await get(),
          execute = tx.execute.bind(tx);
        vi.spyOn(tx, "execute").mockImplementation((async (
          sql: any,
          args: any
        ) => {
          const result = await execute(sql, args);
          if (
            typeof sql === "string" &&
            sql.includes("AS records") &&
            !inserted
          ) {
            inserted = true;
            await order(a.merchantId, 4000);
          }
          return result;
        }) as any);
        return tx;
      });
      const data = await collectSheetReportData(a.merchantId, start, end);
      expect(data.totalOrders).toBe(2);
      expect(
        (
          await q("SELECT COUNT(*) AS n FROM orders WHERE merchantId=?", [
            a.merchantId,
          ])
        )[0].n
      ).toBe(3);
    });
  }
);
