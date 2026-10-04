import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readMerchantProfileWorkspace,
  saveMerchantProfileWorkspace,
} from "./accounts/merchant-profile-workspace";
import { appRouter } from "./routers";
describe.skipIf(!process.env.DATABASE_URL)("reviewed merchant profile", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const q = async (sql: string, args: any[] = []) =>
    (await (await getPool())!.execute<any>(sql, args))[0];
  beforeEach(async () => {
    owner = await createDisposableMerchant("profile457");
    other = await createDisposableMerchant("profile457-other");
  });
  afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
  afterAll(closeDb);
  const read = () =>
    readMerchantProfileWorkspace(owner.userId, owner.merchantId);
  const caller = (actor = owner.userId, id = owner.merchantId) =>
    appRouter.createCaller({
      user: { id: actor, role: "user" },
      req: { headers: { "x-merchant-id": String(id) } },
      res: {},
    } as any);
  const input = async () => {
    const first = await read();
    return { ...first.values!, expectedRevision: first.revision! };
  };
  it("saves all five fields without changing currency or another tenant", async () => {
    const before = await q(
      "SELECT businessName,phone FROM merchants WHERE id=?",
      [other.merchantId]
    );
    const result = await caller().merchants.profileSaveReviewed({
      ...(await input()),
      businessName: "Reviewed store",
      phone: "",
      autoReplyEnabled: false,
      timezone: "UTC",
      logoUrl: "https://example.test/logo.png",
    } as any);
    expect(result).toMatchObject({
      changed: true,
      workspace: {
        invalidFields: [],
        values: {
          businessName: "Reviewed store",
          phone: "",
          autoReplyEnabled: false,
          timezone: "UTC",
          logoUrl: "https://example.test/logo.png",
        },
      },
    });
    expect((await caller().merchants.profileWorkspace()).revision).toBe(
      result.workspace.revision
    );
    expect(
      await q("SELECT businessName,phone FROM merchants WHERE id=?", [
        other.merchantId,
      ])
    ).toEqual(before);
    expect(
      (
        await q("SELECT currency FROM merchants WHERE id=?", [owner.merchantId])
      )[0].currency
    ).toBe("SAR");
  });
  it.each(["manager", "sales_supervisor", "viewer"])(
    "does not expose owner profile fields to %s",
    async role => {
      const changes = await input();
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
        [owner.merchantId, other.userId, role]
      );
      expect(await caller(other.userId).merchants.profileWorkspace()).toEqual({
        actorId: other.userId,
        merchantId: owner.merchantId,
        canView: false,
        canManage: false,
        values: null,
        revision: null,
        invalidFields: [],
      });
      await expect(
        caller(other.userId).merchants.profileSaveReviewed(changes as any)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  );
  it("rejects a stale concurrent profile rather than merging unnoticed", async () => {
    const old = await input();
    const results = await Promise.allSettled([
      saveMerchantProfileWorkspace(owner.userId, owner.merchantId, {
        ...old,
        businessName: "First",
      }),
      saveMerchantProfileWorkspace(owner.userId, owner.merchantId, {
        ...old,
        businessName: "Second",
      }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });
  it("preserves a valid no-op", async () => {
    expect(
      await saveMerchantProfileWorkspace(
        owner.userId,
        owner.merchantId,
        await input()
      )
    ).toMatchObject({ changed: false });
  });
  it("rejects foreign scope and unexpected currency fields", async () => {
    await expect(
      caller(owner.userId, other.merchantId).merchants.profileWorkspace()
    ).rejects.toThrow();
    await expect(
      caller().merchants.profileSaveReviewed({
        ...(await input()),
        currency: "USD",
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rechecks revoked ownership after a read", async () => {
    const changes = await input();
    await q(
      "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
      [owner.merchantId, owner.userId]
    );
    await expect(
      saveMerchantProfileWorkspace(owner.userId, owner.merchantId, changes)
    ).rejects.toMatchObject({ reason: "forbidden" });
  });
  it.each(["pending", "suspended"])(
    "does not update a %s merchant",
    async status => {
      const changes = await input();
      await q("UPDATE merchants SET status=? WHERE id=?", [
        status,
        owner.merchantId,
      ]);
      await expect(
        saveMerchantProfileWorkspace(owner.userId, owner.merchantId, changes)
      ).rejects.toMatchObject({ reason: "forbidden" });
      if (status === "pending")
        expect(await read()).toMatchObject({ canView: true, canManage: false });
      else await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
    }
  );
  it("keeps old invalid values visible for deliberate repair", async () => {
    await q(
      "UPDATE merchants SET timezone='Invalid/Zone',autoReplyEnabled=2,logo_url='broken' WHERE id=?",
      [owner.merchantId]
    );
    const before = await read();
    expect(before.invalidFields.sort()).toEqual([
      "autoReplyEnabled",
      "logoUrl",
      "timezone",
    ]);
    await saveMerchantProfileWorkspace(owner.userId, owner.merchantId, {
      ...before.values,
      autoReplyEnabled: false,
      timezone: "Asia/Riyadh",
      logoUrl: null,
      expectedRevision: before.revision,
    });
    expect((await read()).invalidFields).toEqual([]);
  });
});
