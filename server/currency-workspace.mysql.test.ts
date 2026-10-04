import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readCurrencyWorkspace,
  saveCurrencyWorkspace,
} from "./currency-workspace";
import { appRouter } from "./routers";
describe.skipIf(!process.env.DATABASE_URL)("reviewed tenant currency", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const q = async (sql: string, args: any[] = []) =>
    (await (await getPool())!.execute<any>(sql, args))[0];
  beforeEach(async () => {
    owner = await createDisposableMerchant("currency453");
    other = await createDisposableMerchant("currency453-other");
  });
  afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
  afterAll(closeDb);
  const read = () => readCurrencyWorkspace(owner.userId, owner.merchantId);
  const save = async (currency: "SAR" | "USD", expectedRevision?: string) =>
    saveCurrencyWorkspace(owner.userId, owner.merchantId, {
      currency,
      expectedRevision: expectedRevision || (await read()).revision,
    });
  const caller = (actor = owner.userId, id = owner.merchantId) =>
    appRouter.createCaller({
      user: { id: actor, role: "user" },
      req: { headers: { "x-merchant-id": String(id) } },
      res: {},
    } as any);
  it("reads and saves the selected currency through the real router", async () => {
    const first = await caller().merchants.currencyWorkspace();
    expect(first).toMatchObject({
      currency: "SAR",
      canManage: true,
      convertsAmounts: false,
    });
    const result = await caller().merchants.currencySaveReviewed({
      currency: "USD",
      expectedRevision: first.revision,
    });
    expect(result).toMatchObject({
      changed: true,
      workspace: { currency: "USD" },
    });
    expect((await read()).revision).toBe(result.workspace.revision);
    expect(
      (
        await q("SELECT currency FROM merchants WHERE id=?", [other.merchantId])
      )[0].currency
    ).toBe("SAR");
  });
  it("keeps a no-op explicit and rejects a stale save", async () => {
    const first = await read();
    expect(await save("SAR", first.revision)).toMatchObject({ changed: false });
    await save("USD", first.revision);
    await expect(save("SAR", first.revision)).rejects.toMatchObject({
      reason: "stale",
    });
    expect((await read()).currency).toBe("USD");
  });
  it("serializes competing saves so the stale request cannot overwrite", async () => {
    const first = await read();
    const results = await Promise.allSettled([
      save("USD", first.revision),
      save("USD", first.revision),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });
  it.each(["viewer", "sales_supervisor", "manager"])(
    "allows %s to read without expanding owner-only writes",
    async role => {
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
        [owner.merchantId, other.userId, role]
      );
      const before = await caller(other.userId).merchants.currencyWorkspace();
      expect(before).toMatchObject({
        currency: "SAR",
        canManage: false,
        actorId: other.userId,
      });
      await expect(
        caller(other.userId).merchants.currencySaveReviewed({
          currency: "USD",
          expectedRevision: before.revision,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await read()).currency).toBe("SAR");
    }
  );
  it("rejects a foreign selector and injected tenant in the input", async () => {
    await expect(
      caller(owner.userId, other.merchantId).merchants.currencyWorkspace()
    ).rejects.toThrow();
    await expect(
      caller().merchants.currencySaveReviewed({
        currency: "USD",
        expectedRevision: (await read()).revision,
        merchantId: other.merchantId,
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rechecks explicit owner revocation after the page read", async () => {
    const first = await read();
    await q(
      "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
      [owner.merchantId, owner.userId]
    );
    await expect(save("USD", first.revision)).rejects.toMatchObject({
      reason: "forbidden",
    });
  });
  it.each(["pending", "suspended"])(
    "blocks writes to a %s merchant",
    async status => {
      const first = await read();
      await q("UPDATE merchants SET status=? WHERE id=?", [
        status,
        owner.merchantId,
      ]);
      await expect(save("USD", first.revision)).rejects.toMatchObject({
        reason: "forbidden",
      });
      if (status === "pending")
        expect(await read()).toMatchObject({ canManage: false });
      else await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
    }
  );
  it.each(["owner", "actor"])("rejects an inactive %s account", async kind => {
    await q(
      "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',1)",
      [owner.merchantId, other.userId]
    );
    const first = await readCurrencyWorkspace(other.userId, owner.merchantId);
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
      kind === "owner" ? owner.userId : other.userId,
    ]);
    await expect(
      saveCurrencyWorkspace(other.userId, owner.merchantId, {
        currency: "USD",
        expectedRevision: first.revision,
      })
    ).rejects.toMatchObject({ reason: "forbidden" });
  });
  it("changes only currency, leaving business data intact", async () => {
    const [before] = await q(
      "SELECT businessName,phone,timezone,autoReplyEnabled FROM merchants WHERE id=?",
      [owner.merchantId]
    );
    await save("USD");
    const [after] = await q(
      "SELECT businessName,phone,timezone,autoReplyEnabled FROM merchants WHERE id=?",
      [owner.merchantId]
    );
    expect(after).toEqual(before);
  });
});
