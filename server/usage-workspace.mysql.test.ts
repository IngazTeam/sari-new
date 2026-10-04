import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  createDisposableTrialSubscription,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readUsageWorkspace } from "./accounts/usage-workspace";
import { appRouter } from "./routers";
describe.skipIf(!process.env.DATABASE_URL)(
  "truthful usage workspace on local MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    let planId: number | undefined;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const read = () => readUsageWorkspace(owner.userId, owner.merchantId);
    const plan = async () => {
      planId = (
        await q(
          "INSERT INTO subscription_plans(name,name_en,monthly_price,yearly_price,max_customers,max_whatsapp_numbers,conversation_limit,message_limit,voice_message_limit) VALUES ('usage482','usage482',1,12,0,999999,0,-1,10)"
        )
      ).insertId;
      await q(
        "UPDATE merchant_subscriptions SET plan_id=?,status='active' WHERE merchant_id=?",
        [planId, owner.merchantId]
      );
    };
    beforeEach(async () => {
      planId = undefined;
      owner = await createDisposableMerchant("usage482");
      other = await createDisposableMerchant("usage482-other");
    });
    afterEach(async () => {
      await cleanupDisposableMerchants([owner.userId, other.userId]);
      if (planId)
        await q("DELETE FROM subscription_plans WHERE id=? AND name=?", [
          planId,
          "usage482",
        ]);
    });
    afterAll(closeDb);
    it("shows real inventory and six empty UTC months without inventing a subscription", async () => {
      const result = await read();
      expect(result.subscription.state).toBe("none");
      expect(result.quotas.messages.used).toBeNull();
      expect(result.resources.products).toMatchObject({
        used: 0,
        limit: null,
        unlimited: null,
      });
      expect(result.history).toHaveLength(6);
      expect(
        result.history.every(row => !row.campaigns && !row.outgoingMessages)
      ).toBe(true);
      expect(result.activity.to).toBe(result.checkedAt);
    });
    it("counts products beyond the old 500-row page and excludes another tenant", async () => {
      await q(
        `INSERT INTO products(merchantId,name,price) VALUES ${Array.from({ length: 501 }, () => "(?,'Usage product',1)").join(",")}`,
        Array(501).fill(owner.merchantId)
      );
      await q(
        "INSERT INTO products(merchantId,name,price) VALUES (?,'Foreign product',1)",
        [other.merchantId]
      );
      expect((await read()).resources.products).toMatchObject({
        used: 501,
        limit: null,
        unlimited: null,
      });
    });
    it("uses canonical trial counters and actual trial limits without a paid plan", async () => {
      const id = await createDisposableTrialSubscription(owner.merchantId);
      await q(
        "UPDATE merchant_subscriptions SET conversations_used=3,messages_used=9,voice_messages_used=2 WHERE id=?",
        [id]
      );
      const result = await read();
      expect(result.subscription).toMatchObject({
        id,
        state: "trial",
        limitsSource: "trial",
        planId: null,
      });
      expect(result.quotas.conversations).toMatchObject({
        used: 3,
        limit: 100,
        remaining: 97,
      });
      expect(result.quotas.messages).toMatchObject({
        used: 9,
        unlimited: true,
        percentage: null,
      });
      expect(result.quotas.voiceMessages.limit).toBe(20);
      expect(result.resources.customers.limit).toBeNull();
    });
    it("distinguishes zero allowances and resource infinity from missing product/campaign limits", async () => {
      await createDisposableTrialSubscription(owner.merchantId);
      await plan();
      const result = await read();
      expect(result.quotas.conversations).toMatchObject({
        used: 0,
        limit: 0,
        unlimited: false,
        percentage: 0,
      });
      expect(result.resources.customers).toMatchObject({
        limit: 0,
        unlimited: false,
      });
      expect(result.resources.whatsappNumbers).toMatchObject({
        unlimited: true,
        limit: null,
      });
      expect(result.resources.products.limit).toBeNull();
    });
    it("does not reset or expire stored subscriptions as a side effect of reading", async () => {
      const id = await createDisposableTrialSubscription(owner.merchantId);
      await q(
        "UPDATE merchant_subscriptions SET trial_ends_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY),messages_used=19 WHERE id=?",
        [id]
      );
      expect((await read()).subscription.state).toBe("expired");
      expect(
        (
          await q(
            "SELECT status,messages_used FROM merchant_subscriptions WHERE id=?",
            [id]
          )
        )[0]
      ).toEqual({ status: "trial", messages_used: 19 });
    });
    it("exposes conflicting active subscriptions instead of guessing a latest winner", async () => {
      await createDisposableTrialSubscription(owner.merchantId);
      await createDisposableTrialSubscription(owner.merchantId);
      const result = await read();
      expect(result.subscription.state).toBe("ambiguous");
      expect(result.quotas.messages.used).toBeNull();
    });
    it("counts only stored outgoing messages in the stated window and tenant, not AI proficiency", async () => {
      const conv = await q(
        "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,'966500000007')",
        [owner.merchantId]
      );
      const foreign = await q(
        "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,'966500000008')",
        [other.merchantId]
      );
      await q(
        "INSERT INTO messages(conversationId,direction,messageType,content,createdAt) VALUES (?,'outgoing','text','Local',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)),(?,'incoming','text','Incoming',UTC_TIMESTAMP()),(?,'outgoing','text','Future',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR)),(?,'outgoing','text','Foreign',UTC_TIMESTAMP())",
        [conv.insertId, conv.insertId, conv.insertId, foreign.insertId]
      );
      const result = await read();
      expect(
        result.history.reduce((n, row) => n + row.outgoingMessages, 0)
      ).toBe(1);
      expect(result.resources.customers.used).toBe(1);
      expect(JSON.stringify(result)).not.toContain("966500000007");
      expect(result).not.toHaveProperty("aiMessages");
    });
    it("allows an active member through the mounted route and rejects later revocation", async () => {
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, other.userId]
      );
      const caller = () =>
        appRouter.createCaller({
          user: { id: other.userId, role: "user" },
          req: { headers: { "x-merchant-id": String(owner.merchantId) } },
          res: {},
        } as any);
      expect(await caller().usage.workspace()).toMatchObject({
        actorId: other.userId,
        merchantId: owner.merchantId,
      });
      await q(
        "UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?",
        [owner.merchantId, other.userId]
      );
      await expect(caller().usage.workspace()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
    it("rejects an inactive owner account at the source boundary", async () => {
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
    });
  }
);
