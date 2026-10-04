import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readNotificationPreferences,
  saveNotificationPreferences,
} from "./notification-preferences-workspace";
import { defaultNotificationPreferences as defaults } from "../shared/notification-preferences-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed notification preference writes",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    beforeEach(async () => {
      owner = await createDisposableMerchant("prefs448");
      other = await createDisposableMerchant("prefs448-other");
    });
    afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
    afterAll(closeDb);
    const read = () =>
      readNotificationPreferences(owner.userId, owner.merchantId);
    const input = async () => ({
      ...defaults,
      expectedRevision: (await read()).revision,
    });
    const save = async (value: unknown) =>
      saveNotificationPreferences(owner.userId, owner.merchantId, value);
    it("saves all false settings on the selected merchant and preserves another tenant", async () => {
      await q(
        "INSERT INTO notification_preferences (merchant_id,preferred_method) VALUES (?,'email')",
        [other.merchantId]
      );
      const result = await save({
        ...(await input()),
        newOrdersEnabled: false,
        newMessagesEnabled: false,
        appointmentsEnabled: false,
        orderStatusEnabled: false,
        missedMessagesEnabled: false,
        whatsappDisconnectEnabled: false,
        preferredMethod: "push",
      });
      expect(result).toMatchObject({
        changed: true,
        workspace: {
          status: "saved",
          storedRecords: 1,
          values: {
            newOrdersEnabled: false,
            newMessagesEnabled: false,
            preferredMethod: "push",
          },
        },
      });
      expect(
        await q(
          "SELECT preferred_method FROM notification_preferences WHERE merchant_id=?",
          [other.merchantId]
        )
      ).toEqual([{ preferred_method: "email" }]);
    });
    it("no-op does not alter the revision and a stale tab cannot overwrite", async () => {
      const first = await input();
      const saved = await save(first);
      const noOp = await save({
        ...defaults,
        expectedRevision: saved.workspace.revision,
      });
      expect(noOp).toMatchObject({
        changed: false,
        workspace: { revision: saved.workspace.revision },
      });
      await expect(
        save({ ...first, preferredMethod: "email" })
      ).rejects.toMatchObject({ reason: "stale" });
      expect((await read()).values!.preferredMethod).toBe("both");
    });
    it("serializes competing writes so only one reviewed version wins", async () => {
      const snapshot = await input();
      const results = await Promise.allSettled([
        save({ ...snapshot, preferredMethod: "push" }),
        save({ ...snapshot, preferredMethod: "email" }),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find(r => r.status === "rejected")).toMatchObject({
        reason: { reason: "stale" },
      });
      expect((await read()).storedRecords).toBe(1);
    });
    it("repairs invalid active fields while preserving unsupported legacy values", async () => {
      await q(
        "INSERT INTO notification_preferences (merchant_id,quiet_hours_start,quiet_hours_end,instant_notifications,batch_notifications,batch_interval) VALUES (?,'99:99',NULL,0,1,-7)",
        [owner.merchantId]
      );
      const result = await save(await input());
      expect(result.workspace).toMatchObject({
        status: "invalid",
        invalidFields: ["batchInterval"],
        values: {
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
          instantNotifications: false,
          batchNotifications: true,
          batchInterval: null,
        },
      });
      expect(
        (
          await q(
            "SELECT batch_interval FROM notification_preferences WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].batch_interval
      ).toBe(-7);
    });
    it.each(["viewer", "sales_supervisor", "manager"])(
      "enforces current %s membership",
      async role => {
        await q(
          "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
          [owner.merchantId, other.userId, role]
        );
        const scoped = await readNotificationPreferences(
          other.userId,
          owner.merchantId
        );
        const action = saveNotificationPreferences(
          other.userId,
          owner.merchantId,
          { ...defaults, expectedRevision: scoped.revision }
        );
        if (role === "manager")
          expect((await action).workspace.actorId).toBe(other.userId);
        else
          await expect(action).rejects.toMatchObject({ reason: "forbidden" });
      }
    );
    it("rejects a revoked owner even with a previously valid snapshot", async () => {
      const before = await input();
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(save(before)).rejects.toMatchObject({ reason: "forbidden" });
    });
    it.each(["pending", "suspended"])(
      "blocks %s merchant writes",
      async status => {
        const before = await input();
        await q("UPDATE merchants SET status=? WHERE id=?", [
          status,
          owner.merchantId,
        ]);
        await expect(save(before)).rejects.toMatchObject({
          reason: "forbidden",
        });
      }
    );
    it.each(["actor", "owner"])("blocks a deletion-pending %s", async kind => {
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      const before = await readNotificationPreferences(
        other.userId,
        owner.merchantId
      );
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        kind === "owner" ? owner.userId : other.userId,
      ]);
      await expect(
        saveNotificationPreferences(other.userId, owner.merchantId, {
          ...defaults,
          expectedRevision: before.revision,
        })
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("does not accept another actor or tenant fingerprint", async () => {
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        saveNotificationPreferences(
          other.userId,
          owner.merchantId,
          await input()
        )
      ).rejects.toMatchObject({ reason: "stale" });
      await expect(
        saveNotificationPreferences(
          owner.userId,
          other.merchantId,
          await input()
        )
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it.each([
      { quietHoursStart: "24:00" },
      {
        quietHoursEnabled: true,
        quietHoursStart: "08:00",
        quietHoursEnd: "08:00",
      },
      { batchNotifications: true },
      { merchantId: 1 },
    ])(
      "rejects invalid or unsupported input %# before any mutation",
      async values => {
        await expect(
          save({ ...(await input()), ...values })
        ).rejects.toBeDefined();
        expect((await read()).status).toBe("default");
      }
    );
  }
);
