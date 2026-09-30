import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readSetupProgress,
  saveSetupProgress,
  resetSetupProgress,
} from "./setup-progress";
import { SetupConflict, SetupForbidden } from "./setup-store";
describe.skipIf(!process.env.DATABASE_URL)("setup progress MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const q = async (text: string, params: any[] = []) =>
    (await (await getPool())!.execute<any>(text, params))[0];
  const read = () => readSetupProgress(owner.merchantId, owner.userId);
  const input = async (patch = {}) => ({
    expectedDigest: (await read()).digest,
    currentStep: 6,
    completedSteps: [1, 2, 3],
    wizardData: {
      businessName: "Draft name",
      products: [{ name: "Keep this", price: "" }],
    },
    ...patch,
  });
  const save = (raw: unknown) =>
    saveSetupProgress(owner.merchantId, owner.userId, raw);
  beforeEach(async () => {
    owner = await createDisposableMerchant("progress144");
    other = await createDisposableMerchant("progress-other");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupDisposableMerchants(
      [owner?.userId, other?.userId].filter(Boolean)
    );
  });
  afterAll(closeDb);
  it("reads defaults without initializing database records or enabling replies", async () => {
    const result = await read();
    expect(result).toMatchObject({
      merchantId: owner.merchantId,
      actorId: owner.userId,
      currentStep: 1,
      revision: 0,
      isCompleted: 0,
    });
    expect(JSON.parse(result.wizardData).products).toEqual([]);
    expect(
      await q("SELECT id FROM setup_wizard_progress WHERE merchant_id=?", [
        owner.merchantId,
      ])
    ).toEqual([]);
  });
  it("saves bounded raw fields and navigation without writing the live store", async () => {
    const original = await q("SELECT businessName FROM merchants WHERE id=?", [
      owner.merchantId,
    ]);
    const result = await save(await input({ completedSteps: [3, 2, 1, 1] }));
    expect(result.revision).toBe(1);
    expect(result.completedSteps).toBe("[1,2,3]");
    expect(JSON.parse(result.wizardData).products[0].price).toBe("");
    expect(
      await q("SELECT businessName FROM merchants WHERE id=?", [
        owner.merchantId,
      ])
    ).toEqual(original);
    expect(
      await q("SELECT id FROM products WHERE merchantId=?", [owner.merchantId])
    ).toEqual([]);
  });
  it("rejects stale drafts but safely acknowledges identical retries without another revision", async () => {
    const a = await input(),
      saved = await save(a);
    expect((await save(a)).revision).toBe(saved.revision);
    await expect(
      save({ ...a, wizardData: { businessName: "Stale" } })
    ).rejects.toBeInstanceOf(SetupConflict);
    expect(JSON.parse((await read()).wizardData).businessName).toBe(
      "Draft name"
    );
  });
  it("accepts only one of two concurrent different drafts", async () => {
    const a = await input(),
      b = { ...a, wizardData: { businessName: "Other tab" } };
    const result = await Promise.allSettled([save(a), save(b)]);
    expect(result.filter(v => v.status === "fulfilled")).toHaveLength(1);
    expect((await read()).revision).toBe(1);
  });
  it("does not let an old draft reopen completed setup", async () => {
    const a = await input();
    await save(a);
    await q("UPDATE merchants SET setupCompleted=1 WHERE id=?", [
      owner.merchantId,
    ]);
    await expect(save(a)).rejects.toBeInstanceOf(SetupConflict);
    expect((await read()).isCompleted).toBe(1);
  });
  it("preserves malformed saved JSON, blocks autosave, and allows a reviewed reset", async () => {
    await q(
      "INSERT INTO setup_wizard_progress (merchant_id,wizard_data) VALUES (?,'broken')",
      [owner.merchantId]
    );
    const current = await read();
    expect(current.draftUnreadable).toBe(true);
    expect(current.wizardData).toBe("broken");
    await expect(save(await input())).rejects.toBeInstanceOf(SetupConflict);
    const reset = await resetSetupProgress(owner.merchantId, owner.userId, {
      expectedDigest: current.digest,
      reviewed: true,
    });
    expect(reset.draftUnreadable).toBe(false);
    expect(reset.revision).toBe(1);
  });
  it("resets progress and canonical flags atomically while preserving the live catalog and assistant", async () => {
    await save(await input());
    await q(
      "UPDATE merchants SET setupCompleted=1,onboardingCompleted=1,onboardingStep=4 WHERE id=?",
      [owner.merchantId]
    );
    await q(
      "UPDATE setup_wizard_progress SET is_completed=1,completed_at=UTC_TIMESTAMP() WHERE merchant_id=?",
      [owner.merchantId]
    );
    await q(
      "INSERT INTO products (merchantId,name,price) VALUES (?,'Existing',100)",
      [owner.merchantId]
    );
    await q(
      "INSERT INTO bot_settings (merchant_id,tone,welcome_message,auto_reply_enabled) VALUES (?,'professional','Existing greeting',0)",
      [owner.merchantId]
    );
    const current = await read(),
      reset = await resetSetupProgress(owner.merchantId, owner.userId, {
        expectedDigest: current.digest,
        reviewed: true,
      });
    expect(reset).toMatchObject({
      isCompleted: 0,
      currentStep: 1,
      revision: 2,
    });
    expect(JSON.parse(reset.wizardData)).toMatchObject({
      products: [],
      services: [],
      botTone: "professional",
      welcomeMessage: "Existing greeting",
    });
    expect(
      (
        await q(
          "SELECT setupCompleted,onboardingCompleted,onboardingStep FROM merchants WHERE id=?",
          [owner.merchantId]
        )
      )[0]
    ).toEqual({ setupCompleted: 0, onboardingCompleted: 0, onboardingStep: 0 });
    expect(
      await q("SELECT name FROM products WHERE merchantId=?", [
        owner.merchantId,
      ])
    ).toEqual([{ name: "Existing" }]);
    expect(
      (
        await q(
          "SELECT auto_reply_enabled FROM bot_settings WHERE merchant_id=?",
          [owner.merchantId]
        )
      )[0].auto_reply_enabled
    ).toBe(0);
    await expect(
      resetSetupProgress(owner.merchantId, owner.userId, {
        expectedDigest: current.digest,
        reviewed: true,
      })
    ).rejects.toBeInstanceOf(SetupConflict);
  });
  it("rolls back reset flags when the progress write fails", async () => {
    await save(await input());
    await q("UPDATE merchants SET setupCompleted=1 WHERE id=?", [
      owner.merchantId,
    ]);
    const current = await read(),
      pool = (await getPool())!,
      original = pool.getConnection.bind(pool);
    vi.spyOn(pool, "getConnection").mockImplementation(async () => {
      const c = await original(),
        execute = c.execute.bind(c);
      vi.spyOn(c, "execute").mockImplementation((...args: any[]) => {
        if (
          String(args[0]).startsWith(
            "UPDATE setup_wizard_progress SET current_step=1"
          )
        )
          throw Error("Reset failed");
        return (execute as any)(...args);
      });
      return c;
    });
    await expect(
      resetSetupProgress(owner.merchantId, owner.userId, {
        expectedDigest: current.digest,
        reviewed: true,
      })
    ).rejects.toThrow("Reset failed");
    vi.restoreAllMocks();
    expect((await read()).isCompleted).toBe(1);
  });
  it("rejects another tenant actor and does not transfer draft defaults", async () => {
    await save(await input());
    await expect(
      readSetupProgress(owner.merchantId, other.userId)
    ).rejects.toBeInstanceOf(SetupForbidden);
    expect(
      JSON.parse(
        (await readSetupProgress(other.merchantId, other.userId)).wizardData
      ).businessName
    ).not.toBe("Draft name");
  });
  it("bounds Unicode bytes and navigation before any write", async () => {
    for (const patch of [
      { wizardData: { description: "س".repeat(500001) } },
      { currentStep: 11 },
      { completedSteps: [0] },
      { merchantId: other.merchantId },
    ])
      await expect(save(await input(patch))).rejects.toThrow();
    expect(
      await q("SELECT id FROM setup_wizard_progress WHERE merchant_id=?", [
        owner.merchantId,
      ])
    ).toEqual([]);
  });
});
