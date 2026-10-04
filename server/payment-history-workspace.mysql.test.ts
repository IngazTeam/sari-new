import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readPaymentHistoryWorkspace,
  readPaymentHistoryDetail,
} from "./payment/payment-history-workspace";
import { appRouter } from "./routers";
describe.skipIf(!process.env.DATABASE_URL)(
  "payment history in disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const add = async (p: any = {}) =>
      Number(
        (
          await q(
            "INSERT INTO order_payments(merchant_id,customer_phone,customer_name,amount,currency,status,created_at,description,metadata,error_message,tap_payment_url,order_id,booking_id) VALUES (?,?,?,?,?,?,?,?,'private metadata','private provider message','https://private.invalid',?,?)",
            [
              p.merchant ?? owner.merchantId,
              p.phone ?? "synthetic",
              p.name ?? "Local customer",
              p.amount ?? 12550,
              p.currency ?? "SAR",
              p.status ?? "captured",
              p.created ?? "2026-10-04 12:00:00",
              "Local record",
              p.order ?? null,
              p.booking ?? null,
            ]
          )
        ).insertId
      );
    const caller = (userId = owner.userId, merchantId = owner.merchantId) =>
      appRouter.createCaller({
        user: { id: userId, role: "user" },
        req: { headers: { "x-merchant-id": String(merchantId) } },
        res: {},
      } as any).payments.workspace;
    beforeEach(async () => {
      owner = await createDisposableMerchant("payhist466");
      other = await createDisposableMerchant("payhist466-alt");
    });
    afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
    afterAll(closeDb);
    it("keeps captured, authorized, refunded and currencies independent", async () => {
      await add({ amount: 10000 });
      await add({ amount: 20000, status: "authorized" });
      await add({ amount: 30000, currency: "USD" });
      await add({ amount: 40000, currency: "USD", status: "refunded" });
      await add({ amount: 90000, merchant: other.merchantId });
      const d = await caller().list({});
      expect(d.totals).toMatchObject({
        total: 4,
        states: { captured: 2, authorized: 1, refunded: 1 },
        currencies: [
          {
            currency: "SAR",
            capturedMinor: 10000,
            authorizedMinor: 20000,
            totalMinor: 30000,
          },
          {
            currency: "USD",
            capturedMinor: 30000,
            refundedMinor: 40000,
            totalMinor: 70000,
          },
        ],
      });
      expect(JSON.stringify(d)).not.toContain("private");
    });
    it("paginates all rows with stable tie breaking instead of silently truncating to 100", async () => {
      const ids = [];
      for (let i = 0; i < 51; i++) ids.push(await add({ amount: i }));
      const a = await caller().list({ pageSize: 25 }),
        b = await caller().list({ page: 2, pageSize: 25 }),
        c = await caller().list({ page: 3, pageSize: 25 });
      expect([...a.items, ...b.items, ...c.items].map(x => x.id)).toEqual(
        ids.reverse()
      );
      expect(a.hasNext).toBe(true);
      expect(b.hasNext).toBe(true);
      expect(c.hasNext).toBe(false);
      expect(c.totals?.total).toBe(51);
      expect(c.items).toHaveLength(1);
    });
    it("applies status, literal search and inclusive date range equally to rows and totals", async () => {
      const id = await add({
        name: "Match 100%_!",
        created: "2026-10-04 23:59:59",
        status: "authorized",
      });
      await add({
        name: "Match 100abc!",
        created: "2026-10-04 23:59:59",
        status: "authorized",
      });
      await add({
        name: "Match 100%_!",
        created: "2026-10-05 00:00:00",
        status: "authorized",
      });
      await add({ name: "Match 100%_!", status: "captured" });
      const d = await caller().list({
        status: "authorized",
        search: "100%_!",
        from: "2026-10-04",
        to: "2026-10-04",
      });
      expect(d.items.map(x => x.id)).toEqual([id]);
      expect(d.totals?.total).toBe(1);
      expect(
        (await caller().list({ search: "' OR 1=1 --" })).totals?.total
      ).toBe(0);
    });
    it("excludes unknown currency and negative amount without inventing financial totals", async () => {
      await add({ currency: "sar" });
      await add({ currency: "KWD" });
      await add({ amount: -1 });
      await add({ amount: 0 });
      const d = await caller().list({});
      expect(d.totals).toMatchObject({
        total: 4,
        excludedAmounts: 3,
        currencies: [
          { currency: "SAR", records: 1, capturedMinor: 0, totalMinor: 0 },
        ],
      });
      expect(d.items.filter(x => x.currency === null)).toHaveLength(2);
      expect(d.items.filter(x => x.amountMinor === null)).toHaveLength(1);
    });
    it("keeps an absent dataset distinct from an invalid request", async () => {
      expect(await caller().list({})).toMatchObject({
        state: "ready",
        items: [],
        totals: { total: 0, currencies: [] },
      });
      await expect(
        caller().list({ merchantId: other.merchantId } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(caller().detail({ id: 1.1 })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
    it("bounds detail fields and cannot disclose another tenant's row", async () => {
      const id = await add(),
        foreign = await add({ merchant: other.merchantId });
      const d = await caller().detail({ id });
      expect(d).toMatchObject({
        state: "found",
        payment: {
          id,
          amountMinor: 12550,
          hasRecordedError: true,
          related: { kind: "none" },
        },
      });
      expect(JSON.stringify(d)).not.toContain("private");
      expect(await caller().detail({ id: foreign })).toMatchObject({
        state: "missing",
        payment: null,
      });
      await expect(
        caller(owner.userId, other.merchantId).detail({ id: foreign })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it.each(["manager", "viewer", "sales_supervisor"])(
      "does not silently grant owner financial records to %s",
      async role => {
        const id = await add();
        await q(
          "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
          [owner.merchantId, other.userId, role]
        );
        expect(await caller(other.userId).list({})).toMatchObject({
          state: "restricted",
          items: [],
          totals: null,
        });
        expect(await caller(other.userId).detail({ id })).toMatchObject({
          state: "restricted",
          payment: null,
        });
      }
    );
    it("checks live owner/account revocation independently of a still authenticated context", async () => {
      const id = await add();
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(
        readPaymentHistoryDetail(owner.userId, owner.merchantId, { id })
      ).rejects.toThrow("forbidden");
      await q(
        "DELETE FROM merchant_members WHERE merchant_id=? AND user_id=?",
        [owner.merchantId, owner.userId]
      );
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(
        readPaymentHistoryWorkspace(owner.userId, owner.merchantId, {})
      ).rejects.toThrow("forbidden");
    });
    it("only links orders whose tenant matches the payment", async () => {
      const order = Number(
        (
          await q(
            "INSERT INTO orders(merchantId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,'synthetic','Local','[]',12550,'SAR')",
            [owner.merchantId]
          )
        ).insertId
      );
      const foreign = Number(
        (
          await q(
            "INSERT INTO orders(merchantId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,'synthetic','Local','[]',12550,'SAR')",
            [other.merchantId]
          )
        ).insertId
      );
      expect(
        (await caller().detail({ id: await add({ order }) })).payment?.related
      ).toEqual({ kind: "order", id: order });
      expect(
        (await caller().detail({ id: await add({ order: foreign }) })).payment
          ?.related
      ).toEqual({ kind: "unavailable" });
    });
    it("validates the full booking and service chain and hides ambiguous targets", async () => {
      const service = Number(
          (
            await q(
              "INSERT INTO services(merchant_id,name,duration_minutes,is_active) VALUES (?,'Own service',60,1)",
              [owner.merchantId]
            )
          ).insertId
        ),
        foreignService = Number(
          (
            await q(
              "INSERT INTO services(merchant_id,name,duration_minutes,is_active) VALUES (?,'Foreign service',60,1)",
              [other.merchantId]
            )
          ).insertId
        );
      const book = async (s: number, m = owner.merchantId) =>
        Number(
          (
            await q(
              "INSERT INTO bookings(merchant_id,service_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,final_price) VALUES (?,?,'synthetic','2026-10-04','10:00','11:00',60,12550,12550)",
              [m, s]
            )
          ).insertId
        );
      const own = await book(service),
        bad = await book(foreignService),
        foreign = await book(foreignService, other.merchantId);
      expect(
        (await caller().detail({ id: await add({ booking: own }) })).payment
          ?.related
      ).toEqual({ kind: "booking", id: own });
      for (const booking of [bad, foreign])
        expect(
          (await caller().detail({ id: await add({ booking }) })).payment
            ?.related
        ).toEqual({ kind: "unavailable" });
      const order = Number(
        (
          await q(
            "INSERT INTO orders(merchantId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,'synthetic','Local','[]',12550,'SAR')",
            [owner.merchantId]
          )
        ).insertId
      );
      expect(
        (await caller().detail({ id: await add({ booking: own, order }) }))
          .payment?.related
      ).toEqual({ kind: "unavailable" });
    });
  }
);
