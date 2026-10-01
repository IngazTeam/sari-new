import { afterAll, afterEach, beforeEach, describe, it, expect } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  getTopProducts,
  getCampaignAnalytics,
  getDashboardKPIs,
  getHourlyAnalytics,
} from "./analytics/analytics";
describe.skipIf(!process.env.DATABASE_URL)(
  "sales analytics boundaries MySQL",
  () => {
    const users: number[] = [];
    let id: number, foreign: number;
    const run = async (sql: string, args: unknown[] = []) =>
      (await (await getPool())!.execute(sql, args))[0] as any;
    const range = {
      startDate: new Date("2024-01-02T00:00:00Z"),
      endDate: new Date("2024-01-03T00:00:00Z"),
    };
    beforeEach(async () => {
      const a = await createDisposableMerchant("sales-analytics"),
        b = await createDisposableMerchant("sales-foreign");
      users.push(a.userId, b.userId);
      id = a.merchantId;
      foreign = b.merchantId;
    });
    afterEach(async () => {
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    const order = async (merchant: number, createdAt: string, items = "[]") =>
      run(
        "INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,status,createdAt) VALUES (?,'fixture','Fixture',?,100,'paid',?)",
        [merchant, items, createdAt]
      );
    it("rejects foreign catalog enrichment while retaining the merchant order snapshot", async () => {
      const product = await run(
        "INSERT INTO products (merchantId,name,price,stock) VALUES (?,'FOREIGN SECRET',100,987)",
        [foreign]
      );
      await order(
        id,
        "2024-01-02 12:00:00",
        JSON.stringify([
          {
            productId: product.insertId,
            name: "Recorded item",
            quantity: 1,
            price: 100,
          },
        ])
      );
      const rows = await getTopProducts(id, range);
      expect(rows[0]).toMatchObject({
        productName: "Recorded item",
        stockLevel: null,
      });
      expect(JSON.stringify(rows)).not.toContain("FOREIGN SECRET");
      expect(JSON.stringify(rows)).not.toContain("987");
    });
    it("keeps tenant and period boundaries exclusive with UTC hour grouping", async () => {
      await order(id, "2024-01-01 23:59:59");
      await order(id, "2024-01-02 00:00:00");
      await order(id, "2024-01-03 00:00:00");
      await order(foreign, "2024-01-02 00:00:00");
      const kpi = await getDashboardKPIs(id, range);
      expect(kpi.totalOrders).toBe(1);
      expect(kpi.ordersGrowth).toBe(0);
      const hours = await getHourlyAnalytics(id, range);
      expect(hours[0].orders).toBe(1);
      expect(hours.reduce((n, h) => n + h.orders, 0)).toBe(1);
    });
    it("keeps campaign scope without assigning all later orders as campaign revenue", async () => {
      for (const merchant of [id, foreign])
        await run(
          "INSERT INTO campaigns (merchantId,name,message,sentCount,createdAt) VALUES (?,'Campaign','Fixture',9,'2024-01-02 00:00:00')",
          [merchant]
        );
      await order(id, "2024-01-02 12:00:00");
      await order(id, "2024-01-04 12:00:00");
      const rows = await getCampaignAnalytics(id, range);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        sentCount: 9,
        revenue: null,
        roi: null,
        openRate: null,
        clickRate: null,
        conversionRate: null,
      });
    });
  }
);
