import { beforeEach, afterEach, afterAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getPool, closeDb } from "./db/connection";
import { getMerchantById, updateMerchant } from "./db";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed settings and retired legacy writes with MySQL",
  () => {
    let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
    const caller = (selector = fixture.merchantId) =>
      appRouter.createCaller({
        user: { id: fixture.userId, role: "user" },
        req: { headers: { "x-merchant-id": String(selector) } },
        res: {},
      } as any);
    const account = async () =>
      (
        await (await getPool())!.execute<any[]>(
          "SELECT name,email,email_verified_at FROM users WHERE id=?",
          [fixture.userId]
        )
      )[0][0];
    beforeEach(async () => {
      fixture = await createDisposableMerchant("settings460");
    });
    afterEach(() => cleanupDisposableMerchants([fixture.userId]));
    afterAll(closeDb);
    it("saves a reviewed account name without changing email or verification", async () => {
      const before = await account(),
        first = await caller().auth.selfProfileWorkspace();
      const result = await caller().auth.renameReviewed({
        name: "Updated fixture",
        expectedRevision: first.revision,
      });
      expect(result).toMatchObject({
        changed: true,
        workspace: { actorId: fixture.userId, name: "Updated fixture" },
      });
      expect(await account()).toEqual({ ...before, name: "Updated fixture" });
    });
    it("refuses valid legacy account writes without changing any profile field", async () => {
      const before = await account();
      for (const input of [
        { name: "Legacy change" },
        { name: "Legacy change", email: "other@example.test" },
        {},
      ])
        await expect(caller().auth.updateProfile(input)).rejects.toMatchObject({
          code: "PRECONDITION_FAILED",
        });
      expect(await account()).toEqual(before);
    });
    it("rejects email and injected authority fields in the reviewed rename", async () => {
      const before = await account(),
        first = await caller().auth.selfProfileWorkspace();
      for (const extra of [
        { email: "other@example.test" },
        { role: "admin" },
        { userId: fixture.userId + 1 },
      ])
        await expect(
          caller().auth.renameReviewed({
            name: "Forged",
            expectedRevision: first.revision,
            ...extra,
          } as any)
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await account()).toEqual(before);
    });
    it("saves the complete reviewed store profile and accepts a verified no-op", async () => {
      const first = await caller().merchants.profileWorkspace();
      const result = await caller().merchants.profileSaveReviewed({
        ...first.values!,
        businessName: "Reviewed fixture",
        phone: "+966500000009",
        expectedRevision: first.revision!,
      } as any);
      expect(result.changed).toBe(true);
      const again = await caller().merchants.profileSaveReviewed({
        ...result.workspace.values!,
        expectedRevision: result.workspace.revision!,
      } as any);
      expect(again.changed).toBe(false);
      expect(await getMerchantById(fixture.merchantId)).toMatchObject({
        businessName: "Reviewed fixture",
        phone: "+966500000009",
      });
    });
    it("refuses legacy store writes even with a forged selector and retains its snapshot", async () => {
      const before = await caller().merchants.profileWorkspace();
      for (const selector of [fixture.merchantId, 2147483647])
        await expect(
          caller(selector).merchants.update({
            businessName: "Forged",
            phone: "",
          })
        ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(await caller().merchants.profileWorkspace()).toEqual(before);
    });
    it("retains matched unchanged-row acknowledgement for internal database consumers", async () => {
      await expect(
        updateMerchant(fixture.merchantId, { businessName: "Same name" })
      ).resolves.toBeUndefined();
      await expect(
        updateMerchant(fixture.merchantId, { businessName: "Same name" })
      ).resolves.toBeUndefined();
    });
    it("does not acknowledge an internal write to a missing merchant", async () => {
      const [rows] = await (await getPool())!.execute<any[]>(
        "SELECT id FROM merchants WHERE id=2147483647"
      );
      expect(rows).toHaveLength(0);
      await expect(
        updateMerchant(2147483647, { businessName: "Missing" })
      ).rejects.toThrow("MERCHANT_UPDATE_UNCONFIRMED");
    });
  }
);
