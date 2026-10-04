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
  createDisposableTrialSubscription,
} from "./tests/helpers/disposable-merchant";
import {
  readSubscriptionBilling,
  readBillingHistory,
} from "./subscriptions/billing-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "subscription billing disposable MySQL",
  () => {
    let a: Awaited<ReturnType<typeof createDisposableMerchant>>,
      b: typeof a,
      subId: number;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const addPayment = async (merchant = a.merchantId, status = "completed") =>
      Number(
        (
          await q(
            "INSERT INTO payment_transactions(merchant_id,type,amount,currency,status,metadata,tap_response) VALUES (?,'subscription','99.90','SAR',?,'PRIVATE_METADATA','PRIVATE_PROVIDER')",
            [merchant, status]
          )
        ).insertId
      );
    beforeEach(async () => {
      a = await createDisposableMerchant("billing496");
      b = await createDisposableMerchant("billing496-other");
      subId = await createDisposableTrialSubscription(a.merchantId);
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([a?.userId, b?.userId].filter(Boolean));
    });
    afterAll(closeDb);
    it("reads trial limits and never expires a record or changes entitlement on read", async () => {
      expect(
        await readSubscriptionBilling(a.userId, a.merchantId)
      ).toMatchObject({
        state: "trial",
        subscription: { id: subId, limitsSource: "trial" },
      });
      await q(
        "UPDATE merchant_subscriptions SET start_date=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 9 DAY),end_date=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY),trial_ends_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?",
        [subId]
      );
      expect(
        (await readSubscriptionBilling(a.userId, a.merchantId)).state
      ).toBe("expired");
      expect(
        (
          await q("SELECT status FROM merchant_subscriptions WHERE id=?", [
            subId,
          ])
        )[0].status
      ).toBe("trial");
      expect(
        (
          await q("SELECT current_subscription_id FROM merchants WHERE id=?", [
            a.merchantId,
          ])
        )[0].current_subscription_id
      ).toBe(subId);
    });
    it("keeps another merchant hidden and reports genuine absence", async () => {
      await addPayment();
      expect(
        await readSubscriptionBilling(b.userId, b.merchantId)
      ).toMatchObject({ state: "none", subscription: null });
      expect(
        (await readBillingHistory(b.userId, b.merchantId, {})).rows
      ).toEqual([]);
      await expect(
        readSubscriptionBilling(b.userId, a.merchantId)
      ).rejects.toThrow();
    });
    it("detects multiple active records without choosing one", async () => {
      await createDisposableTrialSubscription(a.merchantId);
      expect(
        await readSubscriptionBilling(a.userId, a.merchantId)
      ).toMatchObject({ state: "ambiguous", subscription: null });
    });
    it("shows last cancelled subscription and its recorded date", async () => {
      await q(
        "UPDATE merchant_subscriptions SET status='cancelled',cancelled_at=UTC_TIMESTAMP() WHERE id=?",
        [subId]
      );
      expect(
        await readSubscriptionBilling(a.userId, a.merchantId)
      ).toMatchObject({
        state: "cancelled",
        subscription: { id: subId, cancelledAt: expect.any(String) },
      });
    });
    it("permits member summary but restricts financial history to owners", async () => {
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [a.merchantId, b.userId]
      );
      expect(
        await readSubscriptionBilling(b.userId, a.merchantId)
      ).toMatchObject({ canManage: false, canReadPayments: false });
      await expect(
        readBillingHistory(b.userId, a.merchantId, {})
      ).rejects.toThrow("forbidden");
    });
    it("rejects explicitly revoked owners and disabled accounts", async () => {
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [a.merchantId, a.userId]
      );
      await expect(
        readBillingHistory(a.userId, a.merchantId, {})
      ).rejects.toThrow();
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        b.userId,
      ]);
      await expect(
        readSubscriptionBilling(b.userId, b.merchantId)
      ).rejects.toThrow();
    });
    it("paginates records without returning private payloads or conflating payment tables", async () => {
      for (let i = 0; i < 27; i++) await addPayment();
      await addPayment(b.merchantId);
      const first = await readBillingHistory(a.userId, a.merchantId, {});
      expect(first.rows).toHaveLength(25);
      expect(first.rows[0].amountMinor).toBe(9990);
      const second = await readBillingHistory(a.userId, a.merchantId, {
        beforeId: first.nextBeforeId,
      });
      expect(second.rows).toHaveLength(2);
      expect(second.nextBeforeId).toBeNull();
      expect(new Set([...first.rows, ...second.rows].map(r => r.id)).size).toBe(
        27
      );
      expect(JSON.stringify(first)).not.toMatch(
        /PRIVATE|metadata|tap_|checkout_/
      );
    });
    it("applies state and type filters without interpolating input", async () => {
      await addPayment();
      const failedId = await addPayment(a.merchantId, "failed");
      expect(
        (
          await readBillingHistory(a.userId, a.merchantId, {
            status: "failed",
            type: "subscription",
          })
        ).rows.map(r => r.id)
      ).toEqual([failedId]);
      expect(
        (await readBillingHistory(a.userId, a.merchantId, { type: "addon" }))
          .rows
      ).toEqual([]);
    });
    it("does not turn unavailable storage into an empty successful read", async () => {
      const pool = (await getPool())!;
      vi.spyOn(pool, "getConnection").mockRejectedValueOnce(
        Error("fixture database unavailable")
      );
      await expect(
        readBillingHistory(a.userId, a.merchantId, {})
      ).rejects.toThrow("fixture database unavailable");
    });
  }
);
