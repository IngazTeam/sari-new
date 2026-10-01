import { z } from "zod";
import { discountPolicySchema } from "@shared/discount-policy";
import { marginPolicySchema } from "@shared/checkout-margin";

export type SalesPolicyKind = "discount" | "margin";
export type SalesPolicyForm = {
  enabled: boolean;
  percent: string;
  hours: string;
};
export type SalesPolicySnapshot = {
  merchantId: number;
  policy:
    | z.infer<typeof discountPolicySchema>
    | z.infer<typeof marginPolicySchema>;
  revision: number;
  evidence: string;
};
const formSchema = z
  .object({
    enabled: z.boolean(),
    percent: z.string().max(100),
    hours: z.string().max(100),
  })
  .strict();
const versionSchema = z.object({
  merchantId: z.number().int().positive(),
  revision: z.number().int().min(0).max(2147483646),
  evidence: z.string().regex(/^[a-f0-9]{64}$/),
});
export function parseSalesPolicySnapshot(
  kind: SalesPolicyKind,
  raw: unknown,
  merchantId: number,
): SalesPolicySnapshot {
  const version = versionSchema.parse(raw);
  if (version.merchantId !== merchantId) throw Error("Policy scope mismatch");
  const policy = (
    kind === "discount" ? discountPolicySchema : marginPolicySchema
  ).parse((raw as SalesPolicySnapshot).policy);
  return { ...version, policy };
}
export function salesPolicyForm(value: SalesPolicySnapshot): SalesPolicyForm {
  const p = value.policy;
  return {
    enabled: p.enabled,
    percent: String("maxPercent" in p ? p.maxPercent : p.minPercent),
    hours: "expireHours" in p ? String(p.expireHours) : "",
  };
}
export function parseSalesPolicyRead(
  kind: SalesPolicyKind,
  raw: unknown,
  merchantId: number,
) {
  const policy =
    kind === "discount" ? discountPolicySchema : marginPolicySchema;
  const data = z
    .object({
      canManage: z.boolean(),
      history: z
        .array(
          z.object({
            revision: z.number().int().min(0),
            actorUserId: z.number().int().positive(),
            createdAt: z.string().refine((v) => Number.isFinite(Date.parse(v))),
            beforePolicy: policy,
            afterPolicy: policy,
          }),
        )
        .max(10),
    })
    .parse(raw);
  return { ...parseSalesPolicySnapshot(kind, raw, merchantId), ...data };
}
export function policyFromForm(kind: SalesPolicyKind, form: SalesPolicyForm) {
  const numeric = (v: string) => (v.trim() === "" ? NaN : Number(v));
  return (
    kind === "discount" ? discountPolicySchema : marginPolicySchema
  ).parse(
    kind === "discount"
      ? {
          enabled: form.enabled,
          maxPercent: numeric(form.percent),
          expireHours: numeric(form.hours),
        }
      : { enabled: form.enabled, minPercent: numeric(form.percent) },
  );
}
export type SalesPolicyDraft = {
  form: SalesPolicyForm;
  base: SalesPolicySnapshot;
  submitted: boolean;
};
const envelope = z
  .object({
    version: z.literal(1),
    scope: z.string(),
    kind: z.enum(["discount", "margin"]),
    updatedAt: z.number().finite(),
    value: z
      .object({
        form: formSchema,
        base: versionSchema.extend({ policy: z.unknown() }).strict(),
        submitted: z.boolean(),
      })
      .strict(),
  })
  .strict();
type RecordValue = z.infer<typeof envelope>;
const prefix = "sary:sales-policy-draft:v1:";
const cache = new Map<string, { record: RecordValue; persisted: boolean }>();
let epoch = 0;
export const salesPolicyDraftEpoch = () => epoch;
const validScope = (scope: string, kind: SalesPolicyKind) =>
  new RegExp("^[1-9]\\d*:[1-9]\\d*:sales-" + kind + "$").test(scope);
const warn = (event: BeforeUnloadEvent) => {
  if (Array.from(cache.values()).some((v) => !v.persisted)) {
    event.preventDefault();
    event.returnValue = "";
  }
};
export function readSalesPolicyDraft(
  scope: string,
  kind: SalesPolicyKind,
  now = Date.now(),
):
  | { state: "ready"; value: SalesPolicyDraft; persisted: boolean }
  | { state: "missing" | "invalid" | "expired" | "unavailable" } {
  if (!validScope(scope, kind)) return { state: "invalid" };
  const cached = cache.get(scope);
  let raw: unknown = cached?.record;
  if (!raw) {
    let stored: string | null;
    try {
      stored = sessionStorage.getItem(prefix + scope);
    } catch {
      return { state: "unavailable" };
    }
    if (stored === null) return { state: "missing" };
    try {
      raw = JSON.parse(stored);
    } catch {
      return { state: "invalid" };
    }
  }
  try {
    const parsed = envelope.parse(raw);
    if (
      parsed.scope !== scope ||
      parsed.kind !== kind ||
      parsed.updatedAt > now + 60000
    )
      throw Error("Wrong draft scope");
    if (now - parsed.updatedAt >= 86400000) return { state: "expired" };
    const base = parseSalesPolicySnapshot(
      kind,
      parsed.value.base,
      Number(scope.split(":")[1]),
    );
    return {
      state: "ready",
      value: { ...parsed.value, base },
      persisted: cached?.persisted ?? true,
    };
  } catch {
    return { state: "invalid" };
  }
}
export function writeSalesPolicyDraft(
  scope: string,
  kind: SalesPolicyKind,
  value: SalesPolicyDraft,
  expectedEpoch: number,
  now = Date.now(),
) {
  if (expectedEpoch !== epoch || !validScope(scope, kind)) return false;
  let record: RecordValue;
  try {
    record = envelope.parse({ version: 1, scope, kind, updatedAt: now, value });
    parseSalesPolicySnapshot(
      kind,
      record.value.base,
      Number(scope.split(":")[1]),
    );
  } catch {
    return false;
  }
  const encoded = JSON.stringify(record);
  let persisted = false;
  try {
    sessionStorage.setItem(prefix + scope, encoded);
    persisted = sessionStorage.getItem(prefix + scope) === encoded;
  } catch {
    /* Keep the current tab's draft. */
  }
  if (!cache.size) window.addEventListener("beforeunload", warn);
  cache.set(scope, { record, persisted });
  return persisted;
}
export function discardSalesPolicyDraft(scope: string, expectedEpoch: number) {
  if (expectedEpoch !== epoch) return false;
  try {
    sessionStorage.removeItem(prefix + scope);
    if (sessionStorage.getItem(prefix + scope) !== null) return false;
  } catch {
    return false;
  }
  cache.delete(scope);
  if (!cache.size) window.removeEventListener("beforeunload", warn);
  return true;
}
export function clearSalesPolicyDrafts() {
  epoch++;
  cache.clear();
  window.removeEventListener("beforeunload", warn);
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, i) =>
      sessionStorage.key(i),
    );
    for (const key of keys)
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    /* Account and store scopes remain independent. */
  }
}
