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
  getCustomerSegments,
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
    it("separates stored currencies and keeps values in minor units", async () => {
      await order(id, "2024-01-02 10:00:00");
      const usd = await order(id, "2024-01-02 11:00:00");
      await run("UPDATE orders SET currency=?,totalAmount=? WHERE id=?", [
        "USD",
        250,
        usd.insertId,
      ]);
      expect(await getDashboardKPIs(id, range, "SAR")).toMatchObject({
        totalRevenue: 100,
        totalOrders: 1,
        averageOrderValue: 100,
        conversionRate: null,
        revenueGrowth: null,
        ordersGrowth: null,
      });
      expect(await getDashboardKPIs(id, range, "USD")).toMatchObject({
        totalRevenue: 250,
        totalOrders: 1,
        averageOrderValue: 250,
      });
      expect((await getHourlyAnalytics(id, range, "USD"))[11]).toMatchObject({
        orders: 1,
        revenue: 250,
      });
    });
    it("computes the customer segment average per order and excludes future lifetime orders", async () => {
      await order(id, "2024-01-02 10:00:00");
      await order(id, "2024-01-02 11:00:00");
      for (let i = 0; i < 3; i++) await order(id, "2024-01-04 10:00:00");
      const rows = await getCustomerSegments(id, range, "SAR");
      expect(rows.find(r => r.segment === "returning")).toMatchObject({
        count: 1,
        revenue: 200,
        averageOrderValue: 100,
      });
      expect(rows.find(r => r.segment === "vip")).toMatchObject({
        count: 0,
        averageOrderValue: null,
      });
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
            priceUnit: "minor",
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
