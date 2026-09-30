import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readPerformanceWorkspace } from "./performance-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "performance period evidence in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const now = new Date("2026-09-30T10:00:00Z"),
      inside = "2026-09-29 12:00:00";
    const run = async (sql: string, args: any[] = []) => {
      const [r] = await (await getPool())!.execute<any>(sql, args);
      return Number(r.insertId);
    };
    const read = () =>
      readPerformanceWorkspace(
        owner.merchantId,
        { startDate: "2026-09-29", endDate: "2026-09-29" },
        now
      );
    const order = (
      options: {
        merchant?: number;
        status?: string;
        payment?: string;
        currency?: string;
        amount?: number;
        date?: string;
        phone?: string;
      } = {}
    ) =>
      run(
        "INSERT INTO orders (merchantId,customerName,customerPhone,items,totalAmount,status,payment_status,currency,createdAt) VALUES (?,'Local',?,'[]',?,?,?,?,?)",
        [
          options.merchant ?? owner.merchantId,
          options.phone ?? "local",
          options.amount ?? 12000,
          options.status ?? "pending",
          options.payment ?? "unpaid",
          options.currency ?? "SAR",
          options.date ?? inside,
        ]
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("performance");
      other = await createDisposableMerchant("performance-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("reports real empty samples, two currencies and unmeasured causal/financial claims", async () => {
      const r = await read();
      expect(r.current.messages.total).toBe(0);
      expect(r.current.orders.deliveredShare).toBeNull();
      expect(r.current.orderPhones.repeatShare).toBeNull();
      expect(r.current.reviews.positiveShare).toBeNull();
      expect(r.current.orders.values.map(v => v.currency)).toEqual([
        "SAR",
        "USD",
      ]);
      expect(Object.values(r.unmeasured).every(v => v === null)).toBe(true);
      expect(r.previous.orders.total).toBe(0);
    });
    it("bounds messages by sent date, scopes through conversation owner and keeps periods disjoint", async () => {
      const c = await run(
        "INSERT INTO conversations (merchantId,customerPhone,createdAt) VALUES (?,'same','2020-01-01 00:00:00')",
        [owner.merchantId]
      );
      const otherC = await run(
        "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'same')",
        [other.merchantId]
      );
      for (const [id, date, direction] of [
        [c, "2026-09-29 00:00:00", "incoming"],
        [c, "2026-09-29 23:59:59", "outgoing"],
        [c, "2026-09-28 23:59:59", "incoming"],
        [c, "2026-09-30 00:00:00", "outgoing"],
        [otherC, inside, "incoming"],
      ])
        await run(
          "INSERT INTO messages (conversationId,createdAt,direction,messageType,content) VALUES (?,?,?,'text','fixture')",
          [id, date, direction]
        );
      const r = await read();
      expect(r.current.messages).toMatchObject({
        total: 2,
        incoming: 1,
        outgoing: 1,
        contactPhones: 1,
        activeConversations: 1,
      });
      expect(r.previous.messages.total).toBe(1);
      expect(r.current.orders.total).toBe(0);
    });
    it("separates currencies and paid flags, excludes cancelled/invalid amounts without losing counts", async () => {
      await order({ status: "delivered", payment: "paid", amount: 12000 });
      await order({ status: "cancelled", payment: "paid", amount: 9000 });
      await order({ currency: "USD", amount: 1500 });
      await order({ amount: -40 });
      await order({ merchant: other.merchantId, amount: 99000 });
      await order({ date: "2026-09-28 12:00:00", amount: 1000 });
      const r = await read();
      expect(r.current.orders).toMatchObject({
        total: 4,
        delivered: 1,
        cancelled: 1,
        deliveredShare: 25,
      });
      expect(r.current.orders.values).toEqual([
        {
          currency: "SAR",
          count: 1,
          totalMinor: 12000,
          markedPaidMinor: 12000,
          excludedAmounts: 1,
        },
        {
          currency: "USD",
          count: 1,
          totalMinor: 1500,
          markedPaidMinor: 0,
          excludedAmounts: 0,
        },
      ]);
      expect(r.previous.orders.total).toBe(1);
    });
    it("counts repeated exact trimmed phones within noncancelled orders, never as satisfaction", async () => {
      await order({ phone: " 123 " });
      await order({ phone: "123" });
      await order({ phone: "+123" });
      await order({ phone: "other" });
      await order({ phone: "other", status: "cancelled" });
      await order({ phone: " " });
      await order({ phone: "" });
      await order({ phone: "+123", date: "2026-09-28 12:00:00" });
      const r = await read();
    expect(r.current.orderPhones).toMatchObject({
        known: 3,
        repeated: 1,
        unknownPhoneOrders: 2,
    });
    expect(r.current.orderPhones.repeatShare).toBeCloseTo(100 / 3, 10);
      expect(r.unmeasured.customerSatisfaction).toBeNull();
      expect(r.current.messages.contactPhones).toBe(0);
    });
    it("uses valid saved reviews and excludes cross-tenant references and out-of-period reviews", async () => {
      const own = await order(),
        foreign = await order({ merchant: other.merchantId });
      for (const [mid, oid, rating, date] of [
        [owner.merchantId, own, 5, inside],
        [owner.merchantId, own, 2, inside],
        [owner.merchantId, own, 9, inside],
        [owner.merchantId, foreign, 5, inside],
        [other.merchantId, foreign, 5, inside],
        [owner.merchantId, own, 4, "2026-09-28 12:00:00"],
      ])
        await run(
          "INSERT INTO customer_reviews (merchantId,orderId,customerPhone,rating,createdAt) VALUES (?,?,'local',?,?)",
          [mid, oid, rating, date]
        );
      const r = await read();
      expect(r.current.reviews).toEqual({
        total: 3,
        valid: 2,
        invalid: 1,
        positive: 1,
        average: 3.5,
        positiveShare: 50,
      });
      expect(r.previous.reviews.valid).toBe(1);
      expect(r.meanings.reviews).toBe("valid_order_review_records_not_csat");
    });
    it("rejects invalid scope and future windows before issuing reads", async () => {
      await expect(
        readPerformanceWorkspace(
          0,
          { startDate: "2026-09-29", endDate: "2026-09-29" },
          now
        )
      ).rejects.toThrow();
      await expect(
        readPerformanceWorkspace(
          owner.merchantId,
          { startDate: "2026-10-01", endDate: "2026-10-01" },
          now
        )
      ).rejects.toThrow("Future");
    });
  }
);
