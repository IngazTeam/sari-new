import type { PoolConnection } from "mysql2/promise";
import { privacyHashExact } from "../accounts/privacy-hash";
import { decryptSecret, encryptSecret } from "../security/secrets";
import {
  withPaymentSettingsAuthority,
  PaymentSettingsError,
} from "./payment-settings-authority";
import {
  paymentSettingsDefaults,
  paymentSettingsWorkspace,
  paymentSettingsSave,
  paymentSettingsSaveResult,
  paymentSettingsReview,
  paymentSettingsProbeResult,
  tapPublicKeyInput,
  tapSecretKeyInput,
  type PaymentSettingsWorkspace,
} from "../../shared/payment-settings-workspace";
import { testTapCredentials } from "./tap-client";
const columns = [
  "id",
  "merchant_id",
  "tap_enabled",
  "tap_public_key",
  "tap_secret_key",
  "tap_test_mode",
  "auto_send_payment_link",
  "payment_link_message",
  "default_currency",
  "is_verified",
  "last_verified_at",
];
async function stored(tx: PoolConnection, merchantId: number, write = false) {
  const [rows] = await tx.execute<any[]>(
    `SELECT ${columns.join(",")} FROM merchant_payment_settings WHERE merchant_id=? ORDER BY id FOR ${write ? "UPDATE" : "SHARE"}`,
    [merchantId]
  );
  if (!Array.isArray(rows)) throw new PaymentSettingsError("unavailable");
  return rows;
}
const bool = (v: unknown) =>
  v === true || v === 1 ? true : v === false || v === 0 ? false : null;
function stamp(v: unknown) {
  if (v instanceof Date)
    return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T") + "Z");
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function secret(raw: unknown): {
  state: "missing" | "stored" | "invalid" | "unreadable";
  value: string | null;
} {
  if (raw === null || raw === "") return { state: "missing", value: null };
  if (typeof raw !== "string") return { state: "invalid", value: null };
  try {
    const value = decryptSecret(raw),
      checked = tapSecretKeyInput.safeParse(value);
    return checked.success
      ? { state: "stored", value: checked.data }
      : { state: "invalid", value: null };
  } catch {
    return { state: "unreadable", value: null };
  }
}
export function projectPaymentSettings(
  actorId: number,
  merchantId: number,
  canView: boolean,
  canManage: boolean,
  rows: any[]
): PaymentSettingsWorkspace {
  const base = {
    actorId,
    merchantId,
    canView,
    canManage,
    revision: null,
    values: null,
    secretState: null,
    keysMatchMode: false,
    verified: false,
    verifiedAt: null,
    ready: false,
    invalidFields: [],
    automaticLinkDeliveryAvailable: false,
    customMessageApplied: false,
  } as const;
  if (!canView)
    return paymentSettingsWorkspace.parse({
      ...base,
      canManage: false,
      state: "restricted",
      storedRecords: 0,
    });
  const revision = privacyHashExact(
    JSON.stringify([
      "payment-settings:v1",
      actorId,
      merchantId,
      rows.map(r => columns.map(k => r[k])),
    ])
  );
  if (rows.length > 1)
    return paymentSettingsWorkspace.parse({
      ...base,
      canManage: false,
      revision,
      state: "duplicate",
      storedRecords: rows.length,
    });
  if (!rows.length)
    return paymentSettingsWorkspace.parse({
      ...base,
      revision,
      state: "missing",
      storedRecords: 0,
      values: paymentSettingsDefaults,
      secretState: "missing",
    });
  const raw = rows[0];
  if (
    raw.merchant_id !== merchantId ||
    !Number.isSafeInteger(raw.id) ||
    raw.id < 1
  )
    throw new PaymentSettingsError("unavailable");
  const publicKey = tapPublicKeyInput.safeParse(raw.tap_public_key ?? "");
  const values = {
    tapEnabled: bool(raw.tap_enabled),
    tapPublicKey: publicKey.success ? publicKey.data : null,
    tapTestMode: bool(raw.tap_test_mode),
    autoSendPaymentLink: bool(raw.auto_send_payment_link),
    paymentLinkMessage:
      raw.payment_link_message === null
        ? ""
        : typeof raw.payment_link_message === "string" &&
            raw.payment_link_message.length <= 1000
          ? raw.payment_link_message
          : null,
    defaultCurrency: raw.default_currency === "SAR" ? "SAR" : null,
  };
  const invalidFields = Object.entries(values)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  const storedSecret = secret(raw.tap_secret_key);
  if (["invalid", "unreadable"].includes(storedSecret.state))
    invalidFields.push("secret");
  const mode = values.tapTestMode,
    keysMatchMode =
      mode !== null &&
      !!values.tapPublicKey?.startsWith(mode ? "pk_test_" : "pk_live_") &&
      !!storedSecret.value?.startsWith(mode ? "sk_test_" : "sk_live_");
  const verifiedFlag = bool(raw.is_verified),
    verifiedAt = stamp(raw.last_verified_at);
  if (
    verifiedFlag === null ||
    (verifiedFlag === true && (!keysMatchMode || !verifiedAt)) ||
    (verifiedFlag === false && raw.last_verified_at !== null)
  )
    invalidFields.push("verification");
  const verified = verifiedFlag === true && keysMatchMode && !!verifiedAt;
  return paymentSettingsWorkspace.parse({
    ...base,
    revision,
    state: invalidFields.length ? "invalid" : "saved",
    storedRecords: 1,
    values,
    invalidFields,
    secretState: storedSecret.state,
    keysMatchMode,
    verified,
    verifiedAt: verified ? verifiedAt : null,
    ready:
      values.tapEnabled === true &&
      verified &&
      values.defaultCurrency === "SAR",
  });
}
export function readPaymentSettingsWorkspace(
  actorId: number,
  merchantId: number
) {
  return withPaymentSettingsAuthority(
    actorId,
    merchantId,
    false,
    async (tx, a) =>
      projectPaymentSettings(
        actorId,
        merchantId,
        a.canView,
        a.canManage,
        a.canView ? await stored(tx, merchantId) : []
      )
  );
}
export function savePaymentSettingsWorkspace(
  actorId: number,
  merchantId: number,
  rawInput: unknown
) {
  const input = paymentSettingsSave.parse(rawInput);
  return withPaymentSettingsAuthority(
    actorId,
    merchantId,
    true,
    async (tx, a) => {
      const rows = await stored(tx, merchantId, true),
        before = projectPaymentSettings(
          actorId,
          merchantId,
          a.canView,
          a.canManage,
          rows
        );
      if (before.state === "duplicate")
        throw new PaymentSettingsError("duplicate");
      if (before.revision !== input.expectedRevision)
        throw new PaymentSettingsError("stale");
      const current = rows[0],
        oldSecret = secret(current?.tap_secret_key ?? null);
      const effectiveSecret =
        input.secret.action === "replace"
          ? input.secret.value
          : input.secret.action === "clear"
            ? null
            : oldSecret.value;
      if (
        input.tapEnabled &&
        (!effectiveSecret?.startsWith(
          input.tapTestMode ? "sk_test_" : "sk_live_"
        ) ||
          !input.tapPublicKey)
      )
        throw new PaymentSettingsError("keys_required");
      // Explicit keep does not decrypt/re-encrypt or silently erase an unreadable credential.
      const encoded =
        input.secret.action === "keep"
          ? (current?.tap_secret_key ?? null)
          : input.secret.action === "clear"
            ? null
            : encryptSecret(input.secret.value);
      const credentialsChanged =
        (input.secret.action === "replace" &&
          effectiveSecret !== oldSecret.value) ||
        (input.secret.action === "clear" && oldSecret.state !== "missing") ||
        before.values!.tapPublicKey !== input.tapPublicKey ||
        before.values!.tapTestMode !== input.tapTestMode;
      const resetVerification =
        credentialsChanged ||
        !input.tapEnabled ||
        before.invalidFields.includes("verification");
      const changed =
        !current ||
        credentialsChanged ||
        before.values!.tapEnabled !== input.tapEnabled ||
        before.values!.defaultCurrency !== input.defaultCurrency ||
        (resetVerification &&
          (current.is_verified !== 0 || current.last_verified_at !== null));
      if (changed) {
        const values = [
          Number(input.tapEnabled),
          input.tapPublicKey || null,
          encoded,
          Number(input.tapTestMode),
          input.defaultCurrency,
          resetVerification ? 0 : (current?.is_verified ?? 0),
          resetVerification ? null : (current?.last_verified_at ?? null),
        ];
        if (current)
          await tx.execute(
            "UPDATE merchant_payment_settings SET tap_enabled=?,tap_public_key=?,tap_secret_key=?,tap_test_mode=?,default_currency=?,is_verified=?,last_verified_at=? WHERE id=? AND merchant_id=?",
            [...values, current.id, merchantId]
          );
        else
          await tx.execute(
            "INSERT INTO merchant_payment_settings(tap_enabled,tap_public_key,tap_secret_key,tap_test_mode,default_currency,is_verified,last_verified_at,merchant_id,auto_send_payment_link,payment_link_message) VALUES (?,?,?,?,?,?,?,?,0,NULL)",
            [...values, merchantId]
          );
      }
      const afterRows = await stored(tx, merchantId, true),
        workspace = projectPaymentSettings(
          actorId,
          merchantId,
          a.canView,
          a.canManage,
          afterRows
        ),
        after = afterRows[0];
      if (
        afterRows.length !== 1 ||
        workspace.values?.tapEnabled !== input.tapEnabled ||
        workspace.values.tapPublicKey !== input.tapPublicKey ||
        workspace.values.tapTestMode !== input.tapTestMode ||
        workspace.values.defaultCurrency !== "SAR" ||
        (after.tap_secret_key !== encoded &&
          !(
            input.secret.action === "replace" &&
            secret(after.tap_secret_key).value === input.secret.value
          )) ||
        (resetVerification &&
          (after.is_verified !== 0 || after.last_verified_at !== null))
      )
        throw new PaymentSettingsError("unavailable");
      return paymentSettingsSaveResult.parse({ changed, workspace });
    }
  );
}
/** The provider operation only checks credentials; it never creates a charge.
 * Revalidate the exact reviewed state and live authority before storing its result. */
export async function probePaymentSettingsWorkspace(
  actorId: number,
  merchantId: number,
  rawInput: unknown,
  probe = testTapCredentials
) {
  const input = paymentSettingsReview.parse(rawInput);
  const credentials = await withPaymentSettingsAuthority(
    actorId,
    merchantId,
    true,
    async (tx, a) => {
      const rows = await stored(tx, merchantId, true),
        before = projectPaymentSettings(
          actorId,
          merchantId,
          a.canView,
          a.canManage,
          rows
        );
      if (before.revision !== input.expectedRevision)
        throw new PaymentSettingsError("stale");
      if (!before.keysMatchMode || rows.length !== 1)
        throw new PaymentSettingsError("keys_required");
      return secret(rows[0].tap_secret_key).value!;
    }
  );
  let response: Awaited<ReturnType<typeof testTapCredentials>>;
  try {
    response = await probe(credentials);
  } catch {
    throw new PaymentSettingsError("provider_unavailable");
  }
  const verified = response?.ok === true && response.status === 200;
  if (
    !verified &&
    !(response?.ok === false && [401, 403].includes(response.status))
  )
    throw new PaymentSettingsError("provider_unavailable");
  return withPaymentSettingsAuthority(
    actorId,
    merchantId,
    true,
    async (tx, a) => {
      const rows = await stored(tx, merchantId, true),
        before = projectPaymentSettings(
          actorId,
          merchantId,
          a.canView,
          a.canManage,
          rows
        );
      if (before.revision !== input.expectedRevision || rows.length !== 1)
        throw new PaymentSettingsError("stale");
      await tx.execute(
        "UPDATE merchant_payment_settings SET is_verified=?,last_verified_at=? WHERE id=? AND merchant_id=?",
        [
          Number(verified),
          verified
            ? new Date().toISOString().slice(0, 19).replace("T", " ")
            : null,
          rows[0].id,
          merchantId,
        ]
      );
      const workspace = projectPaymentSettings(
        actorId,
        merchantId,
        a.canView,
        a.canManage,
        await stored(tx, merchantId, true)
      );
      return paymentSettingsProbeResult.parse({
        outcome: verified ? "verified" : "rejected",
        workspace,
      });
    }
  );
}
