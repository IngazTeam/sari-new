import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  createDisposableTrialSubscription,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { appRouter } from "./routers";
describe.skipIf(!process.env.DATABASE_URL)(
  "selected-tenant usage reads on local MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const caller = (merchantId: number) =>
      appRouter.createCaller({
        user: { id: owner.userId, role: "user" },
        req: { headers: { "x-merchant-id": String(merchantId) } },
        res: {},
        merchantId: -1,
      } as any);
    beforeEach(async () => {
      owner = await createDisposableMerchant("usage481");
      other = await createDisposableMerchant("usage481-other");
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [other.merchantId, owner.userId]
      );
      for (const [fixture, used] of [
        [owner, 11],
        [other, 47],
      ] as const) {
        const subscriptionId = await createDisposableTrialSubscription(
          fixture.merchantId
        );
        await q(
          "UPDATE merchant_subscriptions SET conversations_used=?,messages_used=?,voice_messages_used=2,last_reset_at=UTC_TIMESTAMP() WHERE id=?",
          [used, used * 2, subscriptionId]
        );
      }
    });
    afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
    afterAll(closeDb);
    it("returns the selected member tenant instead of the actor-owned tenant", async () => {
      expect(await caller(other.merchantId).usage.workspace()).toMatchObject({
        quotas: { conversations: { used: 47 }, messages: { used: 94 } },
      });
      expect(await caller(owner.merchantId).usage.workspace()).toMatchObject({
        quotas: { conversations: { used: 11 }, messages: { used: 22 } },
      });
    });
    it("scopes historical messages to the selected tenant", async () => {
      for (const [fixture, count] of [
        [owner, 1],
        [other, 3],
      ] as const) {
        const conv = await q(
          "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,'966500000019')",
          [fixture.merchantId]
        );
        for (let i = 0; i < count; i++)
          await q(
            "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'outgoing','text','Synthetic usage record')",
            [conv.insertId]
          );
      }
      expect(
        (await caller(other.merchantId).usage.workspace()).history.reduce(
          (total, row) => total + row.outgoingMessages,
          0
        )
      ).toBe(3);
      expect(
        (await caller(owner.merchantId).usage.workspace()).history.reduce(
          (total, row) => total + row.outgoingMessages,
          0
        )
      ).toBe(1);
    });
    it("rejects revoked workspace access without falling back to the owner store", async () => {
      await q(
        "UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?",
        [other.merchantId, owner.userId]
      );
      await expect(
        caller(other.merchantId).usage.workspace()
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("honours an explicit revoked owner membership", async () => {
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(
        caller(owner.merchantId).usage.workspace()
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  }
);
