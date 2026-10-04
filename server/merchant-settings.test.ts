import { beforeEach, afterEach, afterAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getPool, closeDb } from "./db/connection";
import { getMerchantById, updateMerchant } from "./db";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "merchant profile with disposable MySQL",
  () => {
    let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
    let email: string;
    const caller = () =>
      appRouter.createCaller({
        user: { id: fixture.userId, email, role: "user" },
        req: { headers: { "x-merchant-id": String(fixture.merchantId) } },
        res: {},
      } as any);
    beforeEach(async () => {
      fixture = await createDisposableMerchant("settings");
      const [rows] = await (await getPool())!.execute<any[]>(
        "SELECT email FROM users WHERE id = ?",
        [fixture.userId]
      );
      email = rows[0].email;
    });
    afterEach(async () => {
      await cleanupDisposableMerchants([fixture.userId]);
    });
    afterAll(closeDb);
    it("updates a name while retaining the verified email", async () => {
      await caller().auth.updateProfile({ name: "Updated fixture" });
      const [rows] = await (await getPool())!.execute<any[]>(
        "SELECT name,email FROM users WHERE id = ?",
        [fixture.userId]
      );
      expect(rows[0]).toEqual({ name: "Updated fixture", email });
    });
    it("rejects an email replacement until the verification flow exists", async () => {
      await expect(
        caller().auth.updateProfile({
          name: "forged",
          email: "other@example.test",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const [rows] = await (await getPool())!.execute<any[]>(
        "SELECT name,email FROM users WHERE id = ?",
        [fixture.userId]
      );
      expect(rows[0].email).toBe(email);
      expect(rows[0].name).not.toBe("forged");
    });
    it("rejects an invalid email", async () => {
      await expect(
        caller().auth.updateProfile({ email: "invalid" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
    it("updates the selected business without overwriting omitted fields", async () => {
      await caller().merchants.update({
        businessName: "First fixture",
        phone: "+966500000009",
      });
      await caller().merchants.update({ businessName: "Second fixture" });
      expect(await getMerchantById(fixture.merchantId)).toMatchObject({
        businessName: "Second fixture",
        phone: "+966500000009",
      });
    });
    it("rejects a forged selector rather than changing an owned store", async () => {
      const foreign = appRouter.createCaller({
        user: { id: fixture.userId, role: "user" },
        req: { headers: { "x-merchant-id": "2147483647" } },
        res: {},
      } as any);
      await expect(
        foreign.merchants.update({ businessName: "forged" })
      ).rejects.toThrow();
      expect(
        (await getMerchantById(fixture.merchantId))?.businessName
      ).not.toBe("forged");
    });
    it("accepts repeated identical profile saves using the real driver receipt", async () => {
      await expect(caller().merchants.update({businessName:"Same name"})).resolves.toEqual({success:true});
      await expect(caller().merchants.update({businessName:"Same name"})).resolves.toEqual({success:true});
      expect((await getMerchantById(fixture.merchantId))?.businessName).toBe("Same name");
    });
    it("does not acknowledge a profile write to a missing merchant", async () => {
      const [rows]=await (await getPool())!.execute<any[]>("SELECT id FROM merchants WHERE id=2147483647");
      expect(rows).toHaveLength(0);
      await expect(updateMerchant(2147483647,{businessName:"Missing"})).rejects.toThrow("MERCHANT_UPDATE_UNCONFIRMED");
    });
  }
);
