import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readSelfProfile,
  renameSelfProfile,
} from "./accounts/self-profile-workspace";
import { appRouter } from "./routers";
describe.skipIf(!process.env.DATABASE_URL)("reviewed self profile", () => {
  let actor: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof actor;
  const q = async (sql: string, args: any[] = []) =>
    (await (await getPool())!.execute<any>(sql, args))[0];
  beforeEach(async () => {
    actor = await createDisposableMerchant("self458");
    other = await createDisposableMerchant("self458-other");
  });
  afterEach(() => cleanupDisposableMerchants([actor.userId, other.userId]));
  afterAll(closeDb);
  const read = () => readSelfProfile(actor.userId);
  const caller = () =>
    appRouter.createCaller({
      user: { id: actor.userId, role: "user" },
      req: { headers: { "x-merchant-id": String(other.merchantId) } },
      res: {},
    } as any);
  it("renames the authenticated person independently of a foreign store selector", async () => {
    const first = await caller().auth.selfProfileWorkspace(),
      otherBefore = await readSelfProfile(other.userId);
    expect(
      await caller().auth.renameReviewed({
        name: "Updated person",
        expectedRevision: first.revision,
      })
    ).toMatchObject({
      changed: true,
      workspace: {
        actorId: actor.userId,
        name: "Updated person",
        email: first.email,
      },
    });
    expect(await readSelfProfile(other.userId)).toEqual(otherBefore);
  });
  it("preserves email, verification, role and password when renaming", async () => {
    const [before] = await q(
      "SELECT email,email_verified_at,role,password FROM users WHERE id=?",
      [actor.userId]
    );
    await renameSelfProfile(actor.userId, {
      name: "Trimmed person ",
      expectedRevision: (await read()).revision,
    });
    expect((await read()).name).toBe("Trimmed person");
    expect(
      (
        await q(
          "SELECT email,email_verified_at,role,password FROM users WHERE id=?",
          [actor.userId]
        )
      )[0]
    ).toEqual(before);
  });
  it("rejects concurrent renames based on the same old snapshot", async () => {
    const expectedRevision = (await read()).revision,
      results = await Promise.allSettled(
        ["First person", "Second person"].map(name =>
          renameSelfProfile(actor.userId, { name, expectedRevision })
        )
      );
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });
  it("rechecks account deletion status after an earlier read", async () => {
    const expectedRevision = (await read()).revision;
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
      actor.userId,
    ]);
    await expect(
      renameSelfProfile(actor.userId, { name: "Denied", expectedRevision })
    ).rejects.toMatchObject({ reason: "forbidden" });
  });
  it("rejects injected account and email fields at the API boundary", async () => {
    const input = {
      name: "Ignored",
      expectedRevision: (await read()).revision,
    };
    for (const extra of [
      { actorId: other.userId },
      { email: "attacker@example.test" },
      { role: "admin" },
    ])
      await expect(
        caller().auth.renameReviewed({ ...input, ...extra } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("marks verified email from live stored evidence", async () => {
    await q("UPDATE users SET email_verified_at=UTC_TIMESTAMP() WHERE id=?", [
      actor.userId,
    ]);
    expect((await read()).emailVerified).toBe(true);
  });
  it("accepts an explicit no-op without altering the revision", async () => {
    const first = await read();
    expect(
      await renameSelfProfile(actor.userId, {
        name: first.name!,
        expectedRevision: first.revision,
      })
    ).toMatchObject({
      changed: false,
      workspace: { revision: first.revision },
    });
  });
});
