import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readNotificationPreferences } from "./notification-preferences-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "tenant notification preferences source",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    beforeEach(async () => {
      owner = await createDisposableMerchant("prefs447");
      other = await createDisposableMerchant("prefs447-other");
    });
    afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
    afterAll(closeDb);
    const read = () =>
      readNotificationPreferences(owner.userId, owner.merchantId);
    it("returns marked defaults for absence without inserting anything", async () => {
      expect(await read()).toMatchObject({
        status: "default",
        canManage: true,
        storedRecords: 0,
      });
      expect(
        await q("SELECT id FROM notification_preferences WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
    });
    it("reads actual false settings and never includes the other tenant", async () => {
      await q(
        "INSERT INTO notification_preferences (merchant_id,new_orders_enabled,preferred_method) VALUES (?,0,'email'),(?,1,'push')",
        [owner.merchantId, other.merchantId]
      );
      expect(await read()).toMatchObject({
        status: "saved",
        values: { newOrdersEnabled: false, preferredMethod: "email" },
      });
      await expect(
        readNotificationPreferences(owner.userId, other.merchantId)
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("marks null or malformed times and interval as unknown", async () => {
      await q(
        "INSERT INTO notification_preferences (merchant_id,quiet_hours_start,quiet_hours_end,batch_interval) VALUES (?,'99:99',NULL,-1)",
        [owner.merchantId]
      );
      expect(await read()).toMatchObject({
        status: "invalid",
        values: {
          quietHoursStart: null,
          quietHoursEnd: null,
          batchInterval: null,
        },
        invalidFields: ["quietHoursStart", "quietHoursEnd", "batchInterval"],
      });
    });
    it("database uniqueness rejects conflicting duplicate records", async () => {
      await expect(
        q(
          "INSERT INTO notification_preferences (merchant_id,preferred_method) VALUES (?,'email'),(?,'push')",
          [owner.merchantId, owner.merchantId]
        )
      ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      expect(await read()).toMatchObject({
        status: "default",
        storedRecords: 0,
      });
    });
    it.each(["viewer", "sales_supervisor", "manager"])(
      "reads selected membership for %s with correct edit capability",
      async role => {
        await q(
          "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
          [owner.merchantId, other.userId, role]
        );
        expect(
          await readNotificationPreferences(other.userId, owner.merchantId)
        ).toMatchObject({
          actorId: other.userId,
          merchantId: owner.merchantId,
          canManage: role === "manager",
        });
      }
    );
    it("rejects an explicitly revoked owner membership instead of falling back to legacy ownership", async () => {
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
    });
    it.each(["owner", "actor"])("blocks an inactive %s", async kind => {
      const actor = kind === "actor" ? other.userId : owner.userId;
      if (kind === "actor")
        await q(
          "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
          [owner.merchantId, other.userId]
        );
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        kind === "owner" ? owner.userId : other.userId,
      ]);
      await expect(
        readNotificationPreferences(actor, owner.merchantId)
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("allows a pending store to inspect but not edit preferences", async () => {
      await q("UPDATE merchants SET status='pending' WHERE id=?", [
        owner.merchantId,
      ]);
      expect(await read()).toMatchObject({ canManage: false });
    });
    it("invalidates the fingerprint after a stored setting changes", async () => {
      await q("INSERT INTO notification_preferences (merchant_id) VALUES (?)", [
        owner.merchantId,
      ]);
      const first = await read();
      expect((await read()).revision).toBe(first.revision);
      await q(
        "UPDATE notification_preferences SET new_orders_enabled=0 WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect((await read()).revision).not.toBe(first.revision);
    });
  }
);
