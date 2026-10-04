import { randomUUID } from "node:crypto";
import {
  cancellationReview,
  type SubscriptionCancellationInput,
} from "../shared/subscription-cancellation";
import { readSubscriptionBilling } from "./subscriptions/billing-workspace";
import { MerchantSettingsAuthorityError } from "./accounts/merchant-settings-authority";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeDb, getPool } from "./db/connection";
import {
  cancelCurrentSubscription,
  SubscriptionCancellationConflictError,
} from "./subscriptions/cancel-subscription";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";

describe.skipIf(!process.env.DATABASE_URL)(
  "subscription cancellation MySQL contracts",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    let subscriptionId: number,
      otherId: number,
      review: SubscriptionCancellationInput;
    const addSubscription = async (merchantId: number) => {
      const pool = (await getPool())!;
      const [result] = await pool.execute<any>(
        `INSERT INTO merchant_subscriptions
      (merchant_id,status,billing_cycle,start_date,end_date) VALUES (?,'active','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))`,
        [merchantId]
      );
      await pool.execute(
        "UPDATE merchants SET current_subscription_id=?, subscription_status='active', max_customers_allowed=100 WHERE id=?",
        [result.insertId, merchantId]
      );
      return Number(result.insertId);
    };
    const readState = async (merchantId: number, id: number) => {
      const [rows] = await (await getPool())!.execute<any[]>(
        `SELECT s.status, s.cancellation_reason AS reason, m.current_subscription_id AS currentId,
      m.subscription_status AS entitlement, m.max_customers_allowed AS customers FROM merchant_subscriptions s JOIN merchants m ON m.id=s.merchant_id
      WHERE m.id=? AND s.id=?`,
        [merchantId, id]
      );
      return rows[0];
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("sub-workspace");
      other = await createDisposableMerchant("sub-other");
      subscriptionId = await addSubscription(owner.merchantId);
      otherId = await addSubscription(other.merchantId);
      review = {
        expected: cancellationReview(
          (await readSubscriptionBilling(owner.userId, owner.merchantId))
            .subscription
        )!,
      };
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("cancels the reviewed subscription and entitlement together, preserving the other tenant", async () => {
      await cancelCurrentSubscription(owner.userId, owner.merchantId, {
        ...review,
        reason: "test only",
      });
      expect(await readState(owner.merchantId, subscriptionId)).toMatchObject({
        status: "cancelled",
        reason: "test only",
        currentId: null,
        entitlement: "expired",
        customers: 0,
      });
      expect(await readState(other.merchantId, otherId)).toMatchObject({
        status: "active",
        currentId: otherId,
        entitlement: "active",
        customers: 100,
      });
    });
    it("rejects an identifier belonging to a different tenant without changing either subscription", async () => {
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, {
          expected: { ...review.expected, id: otherId },
        })
      ).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
      expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
        "active"
      );
      expect((await readState(other.merchantId, otherId)).status).toBe(
        "active"
      );
    });
    it("does not cancel a new subscription activated after the confirmation was opened", async () => {
      const nextId = await addSubscription(owner.merchantId);
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, review)
      ).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
      expect(await readState(owner.merchantId, nextId)).toMatchObject({
        status: "active",
        currentId: nextId,
        entitlement: "active",
      });
    });
    it("rejects an expired subscription without changing stored history", async () => {
      await (await getPool())!.execute(
        "UPDATE merchant_subscriptions SET end_date=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) WHERE id=?",
        [subscriptionId]
      );
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, review)
      ).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
      expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
        "active"
      );
    });
    it("serializes duplicate cancellation requests so only one succeeds", async () => {
      const results = await Promise.allSettled([
        cancelCurrentSubscription(owner.userId, owner.merchantId, review),
        cancelCurrentSubscription(owner.userId, owner.merchantId, review),
      ]);
      expect(
        results.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(
        results.filter(result => result.status === "rejected")
      ).toHaveLength(1);
      expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
        "cancelled"
      );
    });
    it("rolls back the subscription when updating its entitlement fails", async () => {
      const pool = (await getPool())!,
        connection = await pool.getConnection();
      const execute = connection.execute.bind(connection);
      vi.spyOn(connection, "execute").mockImplementation(((
        sql: string,
        values: any[]
      ) =>
        sql.startsWith("UPDATE merchants")
          ? Promise.reject(new Error("test failure"))
          : execute(sql, values)) as any);
      vi.spyOn(pool, "getConnection").mockResolvedValueOnce(connection);
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, review)
      ).rejects.toThrow("test failure");
      vi.restoreAllMocks();
      expect(await readState(owner.merchantId, subscriptionId)).toMatchObject({
        status: "active",
        currentId: subscriptionId,
        entitlement: "active",
        customers: 100,
      });
    });

    it.each([
      ["billing_cycle", "'yearly'"],
      ["start_date", "DATE_SUB(start_date,INTERVAL 1 DAY)"],
      ["end_date", "DATE_ADD(end_date,INTERVAL 1 DAY)"],
    ])("rejects in-place changed %s", async (field, value) => {
      await (await getPool())!.execute(
        `UPDATE merchant_subscriptions SET ${field}=${value} WHERE id=?`,
        [subscriptionId]
      );
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, review)
      ).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
      expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
        "active"
      );
    });
    it("rejects a changed plan on the same subscription id", async () => {
      const pool = (await getPool())!,
        name = "cancel499-" + randomUUID();
      const [created] = await pool.execute<any>(
        "INSERT INTO subscription_plans (name,name_en,monthly_price,yearly_price,currency,is_active,max_customers,max_whatsapp_numbers) VALUES (?,?,'99.00','999.00','SAR',1,100,1)",
        [name, name]
      );
      const planId = Number(created.insertId);
      try {
        await pool.execute(
          "UPDATE merchant_subscriptions SET plan_id=? WHERE id=?",
          [planId, subscriptionId]
        );
        await expect(
          cancelCurrentSubscription(owner.userId, owner.merchantId, review)
        ).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
        expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
          "active"
        );
      } finally {
        await pool.execute(
          "UPDATE merchant_subscriptions SET plan_id=NULL WHERE id=? AND merchant_id=? AND plan_id=?",
          [subscriptionId, owner.merchantId, planId]
        );
        await pool.execute(
          "DELETE FROM subscription_plans WHERE id=? AND name=?",
          [planId, name]
        );
      }
    });
    it("rejects ambiguous live rows even when the reviewed id remains the canonical pointer", async () => {
      await addSubscription(owner.merchantId);
      await (await getPool())!.execute(
        "UPDATE merchants SET current_subscription_id=? WHERE id=?",
        [subscriptionId, owner.merchantId]
      );
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, review)
      ).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
      expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
        "active"
      );
    });
    it("rejects a missing canonical pointer without cancelling history", async () => {
      await (await getPool())!.execute(
        "UPDATE merchants SET current_subscription_id=NULL WHERE id=?",
        [owner.merchantId]
      );
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, review)
      ).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
      expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
        "active"
      );
    });
    it("rejects another owner and a viewer of the selected merchant", async () => {
      await expect(
        cancelCurrentSubscription(other.userId, owner.merchantId, review)
      ).rejects.toBeInstanceOf(MerchantSettingsAuthorityError);
      await (await getPool())!.execute(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        cancelCurrentSubscription(other.userId, owner.merchantId, review)
      ).rejects.toMatchObject({ reason: "forbidden" });
      expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
        "active"
      );
    });
    it("rechecks revoked ownership after the review", async () => {
      await (await getPool())!.execute(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, review)
      ).rejects.toMatchObject({ reason: "forbidden" });
      expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
        "active"
      );
    });
    it.each(["actor", "merchant"])(
      "rejects %s deactivation after the review",
      async target => {
        await (await getPool())!.execute(
          target === "actor"
            ? "UPDATE users SET account_status='deletion_pending' WHERE id=?"
            : "UPDATE merchants SET status='pending' WHERE id=?",
          [target === "actor" ? owner.userId : owner.merchantId]
        );
        await expect(
          cancelCurrentSubscription(owner.userId, owner.merchantId, review)
        ).rejects.toMatchObject({ reason: "forbidden" });
        expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
          "active"
        );
      }
    );
    it("allows a live owner of the selected merchant even when their primary merchant differs", async () => {
      await (await getPool())!.execute(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        cancelCurrentSubscription(other.userId, owner.merchantId, review)
      ).resolves.toEqual({ success: true, subscriptionId });
      expect((await readState(other.merchantId, otherId)).status).toBe(
        "active"
      );
    });
    it("revalidates an in-place plan change after waiting for the merchant lock", async () => {
      const pool = (await getPool())!,
        tx = await pool.getConnection();
      try {
        await tx.beginTransaction();
        await tx.execute("SELECT id FROM merchants WHERE id=? FOR UPDATE", [
          owner.merchantId,
        ]);
        const waiting = cancelCurrentSubscription(
          owner.userId,
          owner.merchantId,
          review
        );
        await tx.execute(
          "UPDATE merchant_subscriptions SET billing_cycle='yearly' WHERE id=?",
          [subscriptionId]
        );
        await tx.commit();
        await expect(waiting).rejects.toBeInstanceOf(
          SubscriptionCancellationConflictError
        );
        expect((await readState(owner.merchantId, subscriptionId)).status).toBe(
          "active"
        );
      } finally {
        await tx.rollback();
        tx.release();
      }
    });
    it("treats a lost commit response as unknown while a reread finds the committed cancellation", async () => {
      const pool = (await getPool())!,
        tx = await pool.getConnection(),
        commit = tx.commit.bind(tx);
      vi.spyOn(tx, "commit").mockImplementationOnce(async () => {
        await commit();
        throw Error("lost response");
      });
      vi.spyOn(pool, "getConnection").mockResolvedValueOnce(tx);
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, review)
      ).rejects.toMatchObject({ reason: "unknown" });
      vi.restoreAllMocks();
      expect(await readState(owner.merchantId, subscriptionId)).toMatchObject({
        status: "cancelled",
        currentId: null,
        entitlement: "expired",
        customers: 0,
      });
      await expect(
        cancelCurrentSubscription(owner.userId, owner.merchantId, review)
      ).rejects.toBeInstanceOf(SubscriptionCancellationConflictError);
    });
    it.each(["receipt", "readback"])(
      "rolls back both records for unverified %s",
      async kind => {
        const pool = (await getPool())!,
          connection = await pool.getConnection(),
          execute = connection.execute.bind(connection);
        vi.spyOn(connection, "execute").mockImplementation((async (
          sql: string,
          values: any[]
        ) => {
          const result = await execute(sql, values);
          if (kind === "receipt" && sql.startsWith("UPDATE merchants"))
            return [{ affectedRows: 0 }, []];
          if (kind === "readback" && sql.startsWith("SELECT s.status"))
            return [[], []];
          return result;
        }) as any);
        vi.spyOn(pool, "getConnection").mockResolvedValueOnce(connection);
        await expect(
          cancelCurrentSubscription(owner.userId, owner.merchantId, review)
        ).rejects.toThrow();
        vi.restoreAllMocks();
        expect(await readState(owner.merchantId, subscriptionId)).toMatchObject(
          {
            status: "active",
            currentId: subscriptionId,
            entitlement: "active",
            customers: 100,
          }
        );
      }
    );
  }
);
