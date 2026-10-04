import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
import {
  readPaymentSettingsWorkspace,
  projectPaymentSettings,
  savePaymentSettingsWorkspace,
  probePaymentSettingsWorkspace,
} from "./payment/payment-settings-workspace";
import {
  paymentSettingsWorkspace,
  paymentSettingsSave,
  paymentSettingsProbeResult,
} from "../shared/payment-settings-workspace";
import { encryptSecret } from "./security/secrets";
const row = () => ({
  id: 8,
  merchant_id: 2,
  tap_enabled: 0,
  tap_public_key: "pk_test_fixture",
  tap_secret_key: "sk_test_private-fixture",
  tap_test_mode: 1,
  auto_send_payment_link: 1,
  payment_link_message: "Saved legacy message",
  default_currency: "SAR",
  is_verified: 0,
  last_verified_at: null,
});
let tx: any,
  records: any[],
  role: string,
  active: number,
  status: string,
  accountStatus: string,
  writeApplied: boolean;
const project = () =>
  projectPaymentSettings(1, 2, true, status === "active", records);
const input = () =>
  ({
    expectedRevision: project().revision!,
    tapEnabled: false,
    tapPublicKey: "pk_test_fixture",
    tapTestMode: true,
    defaultCurrency: "SAR",
    secret: { action: "keep" },
  }) as const;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PRIVACY_HASH_KEY", "synthetic-payment-workspace-hash-key-only");
  vi.stubEnv(
    "FIELD_ENCRYPTION_KEY",
    "synthetic-payment-workspace-encryption-key-only"
  );
  records = [row()];
  role = "owner";
  active = 1;
  status = "active";
  accountStatus = "active";
  writeApplied = true;
  tx = {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
    execute: vi.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith("SELECT id,userId"))
        return [[{ id: 2, userId: 1, status }]];
      if (sql.includes("FROM users"))
        return [[{ id: 1, account_status: accountStatus }]];
      if (sql.includes("FROM merchant_members"))
        return [[{ role, is_active: active }]];
      if (sql.includes("FROM merchant_payment_settings"))
        return [structuredClone(records)];
      if (sql.startsWith("UPDATE merchant_payment_settings SET is_verified")) {
        if (writeApplied) {
          records[0].is_verified = args[0];
          records[0].last_verified_at = args[1];
        }
        return [{ affectedRows: writeApplied ? 1 : 0 }];
      }
      if (sql.startsWith("UPDATE") || sql.startsWith("INSERT")) {
        if (writeApplied) {
          let r = records[0] ?? {
            ...row(),
            auto_send_payment_link: 0,
            payment_link_message: null,
          };
          [
            "tap_enabled",
            "tap_public_key",
            "tap_secret_key",
            "tap_test_mode",
            "default_currency",
            "is_verified",
            "last_verified_at",
          ].forEach((k, i) => (r[k] = args[i]));
          records = [r];
        }
        return [{ affectedRows: writeApplied ? 1 : 0 }];
      }
      throw Error("Unexpected query");
    }),
  };
  m.pool.mockResolvedValue({ getConnection: async () => tx });
});
afterEach(() => vi.unstubAllEnvs());
it("reads only bounded fields without inserting defaults or exposing secrets", async () => {
  const value = await readPaymentSettingsWorkspace(1, 2);
  expect(value).toMatchObject({
    state: "saved",
    canManage: true,
    secretState: "stored",
    verified: false,
    keysMatchMode: true,
    automaticLinkDeliveryAvailable: false,
    customMessageApplied: false,
  });
  expect(JSON.stringify(value)).not.toContain("private-fixture");
  expect(
    tx.execute.mock.calls.every(([sql]: string[]) => sql.startsWith("SELECT"))
  ).toBe(true);
  expect(
    tx.execute.mock.calls.every(
      ([sql]: string[]) => !sql.includes("tap_webhook_secret")
    )
  ).toBe(true);
});
it("marks missing records as unsaved defaults and never writes on read", async () => {
  records = [];
  expect(await readPaymentSettingsWorkspace(1, 2)).toMatchObject({
    state: "missing",
    storedRecords: 0,
    values: { tapEnabled: false, autoSendPaymentLink: false },
    verified: false,
  });
  expect(records).toEqual([]);
});
it.each(["viewer", "sales_supervisor"])(
  "hides all settings from %s without selecting payment rows",
  async value => {
    role = value;
    expect(await readPaymentSettingsWorkspace(1, 2)).toMatchObject({
      state: "restricted",
      revision: null,
      values: null,
      secretState: null,
    });
    expect(
      tx.execute.mock.calls.some(([sql]: string[]) =>
        sql.includes("merchant_payment_settings")
      )
    ).toBe(false);
    await expect(
      savePaymentSettingsWorkspace(1, 2, input())
    ).rejects.toMatchObject({ reason: "forbidden" });
  }
);
it("allows an authorized manager without broadening ownership rules", async () => {
  role = "manager";
  expect(await readPaymentSettingsWorkspace(1, 2)).toMatchObject({
    canManage: true,
  });
  expect(
    await savePaymentSettingsWorkspace(1, 2, { ...input(), tapEnabled: true })
  ).toMatchObject({ changed: true, workspace: { ready: false } });
});
it.each(["suspended", "invalid"])("rejects tenant status %s", async value => {
  status = value;
  await expect(readPaymentSettingsWorkspace(1, 2)).rejects.toMatchObject({
    reason: "forbidden",
  });
});
it.each(["deletion_pending", "anonymized"])(
  "rejects inactive account %s",
  async value => {
    accountStatus = value;
    await expect(readPaymentSettingsWorkspace(1, 2)).rejects.toMatchObject({
      reason: "forbidden",
    });
  }
);
it("does not revive an explicitly revoked owner", async () => {
  active = 0;
  await expect(readPaymentSettingsWorkspace(1, 2)).rejects.toMatchObject({
    reason: "forbidden",
  });
});
it("shows pending owner settings read-only", async () => {
  status = "pending";
  expect(await readPaymentSettingsWorkspace(1, 2)).toMatchObject({
    canView: true,
    canManage: false,
  });
  await expect(
    savePaymentSettingsWorkspace(1, 2, input())
  ).rejects.toMatchObject({ reason: "forbidden" });
});
it("does not turn unavailable storage into missing settings", async () => {
  m.pool.mockResolvedValue(null);
  await expect(readPaymentSettingsWorkspace(1, 2)).rejects.toMatchObject({
    reason: "unavailable",
  });
});
it.each([
  ["tap_enabled", 2, "tapEnabled"],
  ["tap_test_mode", "0", "tapTestMode"],
  ["auto_send_payment_link", 4, "autoSendPaymentLink"],
  ["payment_link_message", "x".repeat(1001), "paymentLinkMessage"],
  ["default_currency", "USD", "defaultCurrency"],
  ["tap_public_key", "bad", "tapPublicKey"],
  ["tap_secret_key", "enc:v1:bad", "secret"],
  ["is_verified", 8, "verification"],
])("marks invalid stored %s unknown", (key, value, field) => {
  records[0][key as string] = value;
  const v = project();
  expect(v.state).toBe("invalid");
  expect(v.invalidFields).toContain(field);
  expect(v.ready).toBe(false);
});
it("does not treat a mismatched mode or missing verification timestamp as readiness", () => {
  for (const patch of [{ tap_test_mode: 0 }, { last_verified_at: null }]) {
    records = [
      {
        ...row(),
        tap_enabled: 1,
        is_verified: 1,
        last_verified_at: "2026-10-04 12:00:00",
        ...patch,
      },
    ];
    expect(project().ready).toBe(false);
  }
});
it("binds opaque revisions to actor, merchant, and exact case-sensitive credentials", () => {
  const first = project().revision;
  expect(projectPaymentSettings(3, 2, true, true, records).revision).not.toBe(
    first
  );
  const other = [{ ...row(), merchant_id: 3 }];
  expect(projectPaymentSettings(1, 3, true, true, other).revision).not.toBe(
    first
  );
  records[0].tap_secret_key = "sk_test_Private-fixture";
  expect(project().revision).not.toBe(first);
});
it("blocks duplicate records without picking one or disclosing their data", async () => {
  records.push({ ...row(), id: 9 });
  expect(await readPaymentSettingsWorkspace(1, 2)).toMatchObject({
    state: "duplicate",
    values: null,
    canManage: false,
    storedRecords: 2,
  });
  await expect(
    savePaymentSettingsWorkspace(1, 2, input())
  ).rejects.toMatchObject({ reason: "duplicate" });
});
it("retains legacy preference values and verified no-op while saving only editable fields", async () => {
  expect(await savePaymentSettingsWorkspace(1, 2, input())).toMatchObject({
    changed: false,
  });
  expect(
    tx.execute.mock.calls.some(([sql]: string[]) => sql.startsWith("UPDATE"))
  ).toBe(false);
  await savePaymentSettingsWorkspace(1, 2, { ...input(), tapEnabled: true });
  expect(records[0]).toMatchObject({
    auto_send_payment_link: 1,
    payment_link_message: "Saved legacy message",
    tap_enabled: 1,
  });
});
it("rejects stale writes before updating", async () => {
  const old = input();
  records[0].payment_link_message = "Changed concurrently";
  await expect(savePaymentSettingsWorkspace(1, 2, old)).rejects.toMatchObject({
    reason: "stale",
  });
  expect(
    tx.execute.mock.calls.some(([sql]: string[]) => sql.startsWith("UPDATE"))
  ).toBe(false);
});
it("requires a usable key pair before enabling", async () => {
  records[0].tap_secret_key = null;
  await expect(
    savePaymentSettingsWorkspace(1, 2, { ...input(), tapEnabled: true })
  ).rejects.toMatchObject({ reason: "keys_required" });
});
it("replaces secrets with encryption and clears previous verification", async () => {
  Object.assign(records[0], {
    tap_enabled: 1,
    is_verified: 1,
    last_verified_at: "2026-10-04 12:00:00",
  });
  const r = await savePaymentSettingsWorkspace(1, 2, {
    ...input(),
    tapEnabled: true,
    secret: { action: "replace", value: "sk_test_new-fixture" },
  });
  expect(records[0].tap_secret_key).toMatch(/^enc:v1:/);
  expect(r.workspace).toMatchObject({
    verified: false,
    verifiedAt: null,
    ready: false,
  });
  expect(JSON.stringify(r)).not.toContain("new-fixture");
});
it("keeps unreadable secrets while disabling without replacing them silently", async () => {
  Object.assign(records[0], { tap_secret_key: "enc:v1:bad", tap_enabled: 1 });
  await savePaymentSettingsWorkspace(1, 2, input());
  expect(records[0].tap_secret_key).toBe("enc:v1:bad");
  expect(records[0].tap_enabled).toBe(0);
});
it("clears a credential only on an explicit clear action while disabled", async () => {
  await savePaymentSettingsWorkspace(1, 2, {
    ...input(),
    secret: { action: "clear" },
  });
  expect(records[0].tap_secret_key).toBe(null);
});
it("does not claim a save when the update did not persist", async () => {
  writeApplied = false;
  await expect(
    savePaymentSettingsWorkspace(1, 2, { ...input(), tapEnabled: true })
  ).rejects.toMatchObject({ reason: "unavailable" });
  expect(tx.rollback).toHaveBeenCalled();
});
it("marks a lost commit unknown and discards the connection", async () => {
  tx.commit.mockRejectedValue(Error("private connection error"));
  await expect(
    savePaymentSettingsWorkspace(1, 2, input())
  ).rejects.toMatchObject({ reason: "unknown" });
  expect(tx.destroy).toHaveBeenCalledOnce();
  expect(tx.release).not.toHaveBeenCalled();
});
it.each([
  { tapSecretKey: "sk_test_hidden" },
  { merchantId: 3 },
  { autoSendPaymentLink: true },
  { paymentLinkMessage: "Overwritten" },
  { isVerified: true },
])("rejects injected or unsupported fields %j", extra =>
  expect(paymentSettingsSave.safeParse({ ...input(), ...extra }).success).toBe(
    false
  )
);
it.each([
  { tapPublicKey: "pk_live_wrong" },
  { secret: { action: "replace", value: "sk_live_wrong" } },
  { tapEnabled: true, secret: { action: "clear" } },
])("rejects incompatible key intent %j", patch =>
  expect(paymentSettingsSave.safeParse({ ...input(), ...patch }).success).toBe(
    false
  )
);
it("requires fresh authority and exact settings after provider verification", async () => {
  const probe = vi.fn(async () => {
    active = 0;
    return { ok: true, status: 200 };
  });
  await expect(
    probePaymentSettingsWorkspace(
      1,
      2,
      { expectedRevision: project().revision },
      probe
    )
  ).rejects.toMatchObject({ reason: "forbidden" });
  expect(records[0].is_verified).toBe(0);
});
it("cannot apply a late probe to changed settings", async () => {
  const probe = vi.fn(async () => {
    records[0].tap_public_key = "pk_test_other";
    return { ok: true, status: 200 };
  });
  await expect(
    probePaymentSettingsWorkspace(
      1,
      2,
      { expectedRevision: project().revision },
      probe
    )
  ).rejects.toMatchObject({ reason: "stale" });
  expect(records[0].is_verified).toBe(0);
});
it.each([401, 403])(
  "clears verification only on authenticated rejection %s",
  async status => {
    Object.assign(records[0], {
      is_verified: 1,
      last_verified_at: "2026-10-04 12:00:00",
    });
    expect(
      await probePaymentSettingsWorkspace(
        1,
        2,
        { expectedRevision: project().revision },
        async () => ({ ok: false, status })
      )
    ).toMatchObject({
      outcome: "rejected",
      workspace: { verified: false, verifiedAt: null },
    });
  }
);
it("does not mark provider unavailability as rejection or success", async () => {
  const before = structuredClone(records);
  await expect(
    probePaymentSettingsWorkspace(
      1,
      2,
      { expectedRevision: project().revision },
      async () => ({ ok: false, status: 503 })
    )
  ).rejects.toMatchObject({ reason: "provider_unavailable" });
  expect(records).toEqual(before);
});
it("verifies saved keys but does not enable payments implicitly", async () => {
  const r = await probePaymentSettingsWorkspace(
    1,
    2,
    { expectedRevision: project().revision },
    async () => ({ ok: true, status: 200 })
  );
  expect(r).toMatchObject({
    outcome: "verified",
    workspace: { verified: true, ready: false, values: { tapEnabled: false } },
  });
});
it("rejects inconsistent or extended DTOs", () => {
  const d = project();
  for (const patch of [
    { ready: true },
    { verified: true },
    { secretState: null },
    { tapSecretKey: "private" },
    { state: "missing" },
  ])
    expect(paymentSettingsWorkspace.safeParse({ ...d, ...patch }).success).toBe(
      false
    );
  expect(
    paymentSettingsProbeResult.safeParse({ outcome: "verified", workspace: d })
      .success
  ).toBe(false);
});
it("does not lose presence or readiness when a stored secret is encrypted", () => {
  records[0].tap_secret_key = encryptSecret("sk_test_private-fixture");
  expect(project()).toMatchObject({
    secretState: "stored",
    keysMatchMode: true,
  });
});
it("rejects key-mode and secret-state contradictions in response evidence", () => {
  const d = project();
  expect(
    paymentSettingsWorkspace.safeParse({
      ...d,
      values: { ...d.values, tapPublicKey: "pk_live_other" },
    }).success
  ).toBe(false);
  expect(
    paymentSettingsWorkspace.safeParse({ ...d, secretState: "invalid" }).success
  ).toBe(false);
  expect(
    paymentSettingsWorkspace.safeParse({
      ...d,
      state: "invalid",
      invalidFields: ["secret"],
    }).success
  ).toBe(false);
});
it("does not accept a successful probe if the verification update did not persist", async () => {
  writeApplied = false;
  await expect(
    probePaymentSettingsWorkspace(
      1,
      2,
      { expectedRevision: project().revision },
      async () => ({ ok: true, status: 200 })
    )
  ).rejects.toThrow();
  expect(tx.rollback).toHaveBeenCalled();
  expect(records[0].is_verified).toBe(0);
});
it("keeps a same-secret replacement explicit without unnecessary encryption changes", async () => {
  records[0].tap_secret_key = encryptSecret("sk_test_private-fixture");
  const before = records[0].tap_secret_key;
  expect(
    await savePaymentSettingsWorkspace(1, 2, {
      ...input(),
      secret: { action: "replace", value: "sk_test_private-fixture" },
    })
  ).toMatchObject({ changed: false });
  expect(records[0].tap_secret_key).toBe(before);
});
