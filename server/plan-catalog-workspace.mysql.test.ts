import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readPlanCatalogWorkspace } from "./subscriptions/plan-catalog-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "plan catalog scoped local MySQL source",
  () => {
    let a: Awaited<ReturnType<typeof createDisposableMerchant>>,
      b: typeof a,
      planId: number,
      prefix: string;
    let ids: number[] = [];
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const add = async (active = 1) => {
      const row = await q(
        `INSERT INTO subscription_plans (name,name_en,monthly_price,yearly_price,currency,max_customers,max_whatsapp_numbers,conversation_limit,message_limit,voice_message_limit,features,is_active)
 VALUES (?,?,'9.99','99.90','SAR',999999,0,100,-1,20,'["Synthetic feature"]',?)`,
        [prefix, "Sample catalog plan", active]
      );
      ids.push(Number(row.insertId));
      return Number(row.insertId);
    };
    beforeEach(async () => {
      a = await createDisposableMerchant("catalog487");
      b = await createDisposableMerchant("catalog487-other");
      prefix = "catalog487-" + randomUUID();
      ids = [];
      planId = await add();
    });
    afterEach(async () => {
      if (ids.length)
        await q(
          `DELETE FROM subscription_plans WHERE id IN (${ids.map(() => "?").join(",")}) AND name=?`,
          [...ids, prefix]
        );
      await cleanupDisposableMerchants([a?.userId, b?.userId].filter(Boolean));
    });
    afterAll(closeDb);
    it("reads exact prices, explicit limits and owner authority without a subscription", async () => {
      const value = await readPlanCatalogWorkspace(a.userId, a.merchantId);
      expect(value).toMatchObject({
        actorId: a.userId,
        merchantId: a.merchantId,
        canManage: true,
      });
      expect(value.plans.find(p => p.id === planId)).toMatchObject({
        monthlyMinor: 999,
        yearlyMinor: 9990,
        features: ["Synthetic feature"],
        invalidFields: [],
        limits: {
          customers: { limit: null, unlimited: true },
          whatsappNumbers: { limit: 0, unlimited: false },
        },
      });
    });
    it("keeps the complete active catalog and excludes disabled entries", async () => {
      const disabled = await add(0);
      for (let i = 0; i < 31; i++) await add();
      const value = await readPlanCatalogWorkspace(a.userId, a.merchantId);
      expect(value.plans.some(p => p.id === disabled)).toBe(false);
      expect(value.plans.filter(p => ids.includes(p.id))).toHaveLength(32);
    });
    it("keeps invalid stored price and feature data unknown instead of making a free plan", async () => {
      await q(
        "UPDATE subscription_plans SET monthly_price=-1,voice_message_limit=-2,features='{}' WHERE id=?",
        [planId]
      );
      const plan = (
        await readPlanCatalogWorkspace(a.userId, a.merchantId)
      ).plans.find(p => p.id === planId)!;
      expect(plan.monthlyMinor).toBeNull();
      expect(plan.invalidFields).toEqual(
        expect.arrayContaining([
          "monthly_price",
          "voice_message_limit",
          "features",
        ])
      );
    });
    it("allows member reading in the selected tenant without granting owner controls", async () => {
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [b.merchantId, a.userId]
      );
      expect(
        await readPlanCatalogWorkspace(a.userId, b.merchantId)
      ).toMatchObject({
        actorId: a.userId,
        merchantId: b.merchantId,
        canManage: false,
      });
      await q(
        "UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?",
        [b.merchantId, a.userId]
      );
      await expect(
        readPlanCatalogWorkspace(a.userId, b.merchantId)
      ).rejects.toThrow();
    });
    it("rejects an inactive owner and a foreign actor", async () => {
      await expect(
        readPlanCatalogWorkspace(b.userId, a.merchantId)
      ).rejects.toThrow();
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        a.userId,
      ]);
      await expect(
        readPlanCatalogWorkspace(a.userId, a.merchantId)
      ).rejects.toThrow();
    });
  }
);
