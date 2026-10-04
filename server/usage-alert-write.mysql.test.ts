import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { writeUsageAlert } from "./notifications/usage-alert-write";
describe.skipIf(!process.env.DATABASE_URL)(
  "usage alert local inbox write authority",
  () => {
    let a: Awaited<ReturnType<typeof createDisposableMerchant>>, b: typeof a;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const notice = {
      type: "warning" as const,
      title: "usage486 synthetic",
      message: "Local inbox receipt",
      link: "/merchant/usage",
    };
    beforeEach(async () => {
      a = await createDisposableMerchant("usage486");
      b = await createDisposableMerchant("usage486-other");
    });
    afterEach(() =>
      cleanupDisposableMerchants([a?.userId, b?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("stores exactly the current owner account notification", async () => {
      const id = await writeUsageAlert(a.userId, a.merchantId, notice);
      const rows = await q(
        "SELECT userId,title,message,link FROM notifications WHERE id=?",
        [id]
      );
      expect(rows).toEqual([
        {
          userId: a.userId,
          ...{
            title: notice.title,
            message: notice.message,
            link: notice.link,
          },
        },
      ]);
      expect(
        await q("SELECT id FROM notifications WHERE userId=?", [b.userId])
      ).toEqual([]);
    });
    it("rejects a foreign owner without creating a notification", async () => {
      await expect(
        writeUsageAlert(b.userId, a.merchantId, notice)
      ).rejects.toThrow();
      expect(
        await q("SELECT id FROM notifications WHERE userId IN (?,?)", [
          a.userId,
          b.userId,
        ])
      ).toEqual([]);
    });
    it("rechecks owner revocation before the write", async () => {
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [a.merchantId, a.userId]
      );
      await expect(
        writeUsageAlert(a.userId, a.merchantId, notice)
      ).rejects.toThrow();
      expect(
        await q("SELECT id FROM notifications WHERE userId=?", [a.userId])
      ).toEqual([]);
    });
    it("refuses a former owner even if an owner-role membership remains", async () => {
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',1)",
        [a.merchantId, a.userId]
      );
      await q("UPDATE merchants SET userId=? WHERE id=?", [
        b.userId,
        a.merchantId,
      ]);
      await expect(
        writeUsageAlert(a.userId, a.merchantId, notice)
      ).rejects.toThrow();
      expect(
        await q("SELECT id FROM notifications WHERE userId=?", [a.userId])
      ).toEqual([]);
    });
  }
);
