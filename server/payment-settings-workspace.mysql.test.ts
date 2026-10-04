import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readPaymentSettingsWorkspace,
  savePaymentSettingsWorkspace,
  probePaymentSettingsWorkspace,
} from "./payment/payment-settings-workspace";
import { decryptSecret } from "./security/secrets";
import { appRouter } from "./routers";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed payment settings with disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    beforeEach(async () => {
      vi.stubEnv(
        "FIELD_ENCRYPTION_KEY",
        "synthetic-payment-settings-mysql-key-only"
      );
      vi.stubEnv(
        "PRIVACY_HASH_KEY",
        "synthetic-payment-settings-mysql-hash-only"
      );
      owner = await createDisposableMerchant("pay462");
      other = await createDisposableMerchant("pay462-other");
    });
    afterEach(async () => {
      await cleanupDisposableMerchants([owner.userId, other.userId]);
      vi.unstubAllEnvs();
    });
    afterAll(closeDb);
    const read = () =>
      readPaymentSettingsWorkspace(owner.userId, owner.merchantId);
    const caller = (actor = owner.userId, id = owner.merchantId) =>
      appRouter.createCaller({
        user: { id: actor, role: "user" },
        req: { headers: { "x-merchant-id": String(id) } },
        res: {},
      } as any);
    const initialize = async () =>
      savePaymentSettingsWorkspace(owner.userId, owner.merchantId, {
        expectedRevision: (await read()).revision,
        tapEnabled: false,
        tapPublicKey: "pk_test_fixture",
        tapTestMode: true,
        defaultCurrency: "SAR",
        secret: { action: "replace", value: "sk_test_synthetic-fixture" },
      });
    const save = async (patch: any = {}) => {
      const d = await read();
      return savePaymentSettingsWorkspace(owner.userId, owner.merchantId, {
        expectedRevision: d.revision,
        tapEnabled: d.values!.tapEnabled,
        tapPublicKey: d.values!.tapPublicKey,
        tapTestMode: d.values!.tapTestMode,
        defaultCurrency: "SAR",
        secret: { action: "keep" },
        ...patch,
      });
    };
    it("reads missing defaults without insertion and registers a bounded encrypted snapshot", async () => {
      expect(await caller().merchantPayments.workspace()).toMatchObject({
        state: "missing",
        storedRecords: 0,
      });
      expect(
        await q(
          "SELECT id FROM merchant_payment_settings WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(0);
      const r = await initialize();
      expect(r).toMatchObject({
        changed: true,
        workspace: { state: "saved", secretState: "stored", ready: false },
      });
      const [raw] = await q(
        "SELECT tap_secret_key,auto_send_payment_link FROM merchant_payment_settings WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(raw.tap_secret_key).toMatch(/^enc:v1:/);
      expect(decryptSecret(raw.tap_secret_key)).toBe(
        "sk_test_synthetic-fixture"
      );
      expect(raw.auto_send_payment_link).toBe(0);
      expect(JSON.stringify(r)).not.toContain("synthetic-fixture");
      expect(
        await readPaymentSettingsWorkspace(other.userId, other.merchantId)
      ).toMatchObject({ state: "missing" });
    });
    it("saves through the real router and makes no-op and stale versions explicit", async () => {
      await initialize();
      const d = await read(),
        input = {
          expectedRevision: d.revision!,
          tapEnabled: true,
          tapPublicKey: d.values!.tapPublicKey!,
          tapTestMode: true,
          defaultCurrency: "SAR" as const,
          secret: { action: "keep" as const },
        };
      expect(await caller().merchantPayments.saveReviewed(input)).toMatchObject(
        { changed: true, workspace: { ready: false } }
      );
      await expect(
        caller().merchantPayments.saveReviewed(input)
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await save()).toMatchObject({ changed: false });
    });
    it("serializes concurrent saves and refuses the stale overwrite", async () => {
      await initialize();
      const d = await read(),
        input = {
          expectedRevision: d.revision,
          tapEnabled: true,
          tapPublicKey: "pk_test_fixture",
          tapTestMode: true,
          defaultCurrency: "SAR",
          secret: { action: "keep" },
        };
      const results = await Promise.allSettled([
        savePaymentSettingsWorkspace(owner.userId, owner.merchantId, input),
        savePaymentSettingsWorkspace(owner.userId, owner.merchantId, input),
      ]);
      expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
      expect((await read()).values!.tapEnabled).toBe(true);
    });
    it.each(["viewer", "sales_supervisor"])(
      "hides settings from %s and refuses write injection",
      async role => {
        await initialize();
        await q(
          "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
          [owner.merchantId, other.userId, role]
        );
        const d = await caller(other.userId).merchantPayments.workspace();
        expect(d).toMatchObject({
          state: "restricted",
          values: null,
          revision: null,
          secretState: null,
        });
        const ownerRead = await read();
        await expect(
          caller(other.userId).merchantPayments.saveReviewed({
            expectedRevision: ownerRead.revision!,
            tapEnabled: false,
            tapPublicKey: "",
            tapTestMode: true,
            defaultCurrency: "SAR",
            secret: { action: "clear" },
          })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    );
    it("permits managers while respecting explicit owner revocation", async () => {
      await initialize();
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      expect(
        await caller(other.userId).merchantPayments.workspace()
      ).toMatchObject({ canManage: true, actorId: other.userId });
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("refuses a foreign selector without leaking its empty or stored state", async () => {
      await initialize();
      await expect(
        caller(owner.userId, other.merchantId).merchantPayments.workspace()
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("keeps pending stores read-only and rejects inactive owner accounts", async () => {
      await initialize();
      await q("UPDATE merchants SET status='pending' WHERE id=?", [
        owner.merchantId,
      ]);
      expect(await read()).toMatchObject({ canView: true, canManage: false });
      await expect(save({ tapEnabled: true })).rejects.toMatchObject({
        reason: "forbidden",
      });
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("retains unsupported saved preferences and exposes malformed values as unknown", async () => {
      await initialize();
      await q(
        "UPDATE merchant_payment_settings SET auto_send_payment_link=1,payment_link_message='Keep me',default_currency='USD' WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await read()).toMatchObject({
        state: "invalid",
        invalidFields: ["defaultCurrency"],
        values: {
          defaultCurrency: null,
          autoSendPaymentLink: true,
          paymentLinkMessage: "Keep me",
        },
      });
      await save();
      expect(await read()).toMatchObject({
        state: "saved",
        values: {
          defaultCurrency: "SAR",
          autoSendPaymentLink: true,
          paymentLinkMessage: "Keep me",
        },
      });
    });
    it("saves a credential check only to its exact reviewed tuple, without creating a charge", async () => {
      await initialize();
      let calls = 0;
      const first = await read();
      const result = await probePaymentSettingsWorkspace(
        owner.userId,
        owner.merchantId,
        { expectedRevision: first.revision },
        async key => {
          calls++;
          expect(key).toBe("sk_test_synthetic-fixture");
          return { ok: true, status: 200 };
        }
      );
      expect(calls).toBe(1);
      expect(result).toMatchObject({
        outcome: "verified",
        workspace: { verified: true, ready: false },
      });
      await save({ tapEnabled: true });
      expect((await read()).ready).toBe(true);
      await save({
        secret: { action: "replace", value: "sk_test_replaced-fixture" },
      });
      expect((await read()).verified).toBe(false);
    });
    it("rejects provider completion after a concurrent settings edit", async () => {
      await initialize();
      const d = await read();
      await expect(
        probePaymentSettingsWorkspace(
          owner.userId,
          owner.merchantId,
          { expectedRevision: d.revision },
          async () => {
            await save({ tapPublicKey: "pk_test_other" });
            return { ok: true, status: 200 };
          }
        )
      ).rejects.toMatchObject({ reason: "stale" });
      expect((await read()).verified).toBe(false);
    });
    it("rechecks membership after provider completion", async () => {
      await initialize();
      const d = await read();
      await expect(
        probePaymentSettingsWorkspace(
          owner.userId,
          owner.merchantId,
          { expectedRevision: d.revision },
          async () => {
            await q(
              "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
              [owner.merchantId, owner.userId]
            );
            return { ok: true, status: 200 };
          }
        )
      ).rejects.toMatchObject({ reason: "forbidden" });
      expect(
        (
          await q(
            "SELECT is_verified FROM merchant_payment_settings WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].is_verified
      ).toBe(0);
    });
    it("does not accept cross-actor fingerprints or duplicate store rows", async () => {
      await initialize();
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      const d = await read();
      await expect(
        caller(other.userId).merchantPayments.saveReviewed({
          expectedRevision: d.revision!,
          tapEnabled: false,
          tapPublicKey: "pk_test_fixture",
          tapTestMode: true,
          defaultCurrency: "SAR",
          secret: { action: "keep" },
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        q("INSERT INTO merchant_payment_settings(merchant_id) VALUES (?)", [
          owner.merchantId,
        ])
      ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    });
  }
);
