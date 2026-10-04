import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readMerchantWorkspaceIdentity } from "./accounts/merchant-workspace-identity";
import { getMerchantByUserId } from "./db";
import { withMerchantRequest } from "./accounts/merchant-context";
describe.skipIf(!process.env.DATABASE_URL)(
  "minimal member workspace identity",
  () => {
    let store: Awaited<ReturnType<typeof createDisposableMerchant>>,
      member: typeof store;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    beforeEach(async () => {
      store = await createDisposableMerchant("identity451");
      member = await createDisposableMerchant("identity451-member");
    });
    afterEach(() => cleanupDisposableMerchants([store.userId, member.userId]));
    afterAll(closeDb);
    it.each(["owner", "manager", "sales_supervisor", "viewer"])(
      "returns only the selected identity to an active %s",
      async role => {
        await q(
          "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
          [store.merchantId, member.userId, role]
        );
        expect(
          await readMerchantWorkspaceIdentity(member.userId, store.merchantId)
        ).toEqual({ id: store.merchantId, actorId: member.userId });
        if (role !== "owner")
          expect(
            await withMerchantRequest(
              { userId: member.userId, selectedMerchantId: store.merchantId },
              () => getMerchantByUserId(member.userId)
            )
          ).toBeUndefined();
      }
    );
    it("retains a legacy owner without an explicit membership", async () => {
      expect(
        await readMerchantWorkspaceIdentity(store.userId, store.merchantId)
      ).toEqual({ id: store.merchantId, actorId: store.userId });
    });
    it("does not expose a foreign merchant identity", async () => {
      await expect(
        readMerchantWorkspaceIdentity(member.userId, store.merchantId)
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("does not fall back to ownership after explicit membership revocation", async () => {
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [store.merchantId, store.userId]
      );
      await expect(
        readMerchantWorkspaceIdentity(store.userId, store.merchantId)
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it.each(["actor", "owner"])("blocks a deletion-pending %s", async who => {
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [store.merchantId, member.userId]
      );
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        who === "actor" ? member.userId : store.userId,
      ]);
      await expect(
        readMerchantWorkspaceIdentity(member.userId, store.merchantId)
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("blocks a suspended store", async () => {
      await q("UPDATE merchants SET status='suspended' WHERE id=?", [
        store.merchantId,
      ]);
      await expect(
        readMerchantWorkspaceIdentity(store.userId, store.merchantId)
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("can identify a pending store without granting permission to write", async () => {
      await q("UPDATE merchants SET status='pending' WHERE id=?", [
        store.merchantId,
      ]);
      expect(
        await readMerchantWorkspaceIdentity(store.userId, store.merchantId)
      ).toEqual({ id: store.merchantId, actorId: store.userId });
    });
  }
);
