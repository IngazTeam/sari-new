import { z } from "zod";
const id = z.number().int().positive().max(2147483647);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
export const tapPublicKeyInput = z
  .string()
  .trim()
  .max(500)
  .refine(
    v => v === "" || /^pk_(test|live)_[A-Za-z0-9_-]+$/.test(v),
    "Invalid public key"
  );
export const tapSecretKeyInput = z
  .string()
  .trim()
  .max(500)
  .regex(/^sk_(test|live)_[A-Za-z0-9_-]+$/);
export const paymentSettingsSave = z
  .object({
    expectedRevision: revision,
    tapEnabled: z.boolean(),
    tapPublicKey: tapPublicKeyInput,
    tapTestMode: z.boolean(),
    defaultCurrency: z.literal("SAR"),
    secret: z.discriminatedUnion("action", [
      z.object({ action: z.literal("keep") }).strict(),
      z
        .object({ action: z.literal("replace"), value: tapSecretKeyInput })
        .strict(),
      z.object({ action: z.literal("clear") }).strict(),
    ]),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (
      d.tapPublicKey &&
      !d.tapPublicKey.startsWith(d.tapTestMode ? "pk_test_" : "pk_live_")
    )
      ctx.addIssue({
        code: "custom",
        path: ["tapPublicKey"],
        message: "Mode mismatch",
      });
    if (
      d.secret.action === "replace" &&
      !d.secret.value.startsWith(d.tapTestMode ? "sk_test_" : "sk_live_")
    )
      ctx.addIssue({
        code: "custom",
        path: ["secret"],
        message: "Mode mismatch",
      });
    if (d.tapEnabled && (!d.tapPublicKey || d.secret.action === "clear"))
      ctx.addIssue({
        code: "custom",
        path: ["tapEnabled"],
        message: "Both keys are required",
      });
  });
export const paymentSettingsReview = z
  .object({ expectedRevision: revision })
  .strict();
export const paymentSettingsInvalidField = z.enum([
  "tapEnabled",
  "tapPublicKey",
  "tapTestMode",
  "autoSendPaymentLink",
  "paymentLinkMessage",
  "defaultCurrency",
  "secret",
  "verification",
]);
export const paymentSettingsDefaults = {
  tapEnabled: false,
  tapPublicKey: "",
  tapTestMode: true,
  autoSendPaymentLink: false,
  paymentLinkMessage: "",
  defaultCurrency: "SAR",
} as const;
export const paymentSettingsWorkspace = z
  .object({
    actorId: id,
    merchantId: id,
    canView: z.boolean(),
    canManage: z.boolean(),
    revision: revision.nullable(),
    state: z.enum(["restricted", "missing", "saved", "invalid", "duplicate"]),
    storedRecords: z.number().int().nonnegative(),
    values: z
      .object({
        tapEnabled: z.boolean().nullable(),
        tapPublicKey: tapPublicKeyInput.nullable(),
        tapTestMode: z.boolean().nullable(),
        autoSendPaymentLink: z.boolean().nullable(),
        paymentLinkMessage: z.string().max(1000).nullable(),
        defaultCurrency: z.literal("SAR").nullable(),
      })
      .strict()
      .nullable(),
    secretState: z
      .enum(["missing", "stored", "invalid", "unreadable"])
      .nullable(),
    keysMatchMode: z.boolean(),
    verified: z.boolean(),
    verifiedAt: z.string().datetime().nullable(),
    ready: z.boolean(),
    invalidFields: z.array(paymentSettingsInvalidField),
    automaticLinkDeliveryAvailable: z.literal(false),
    customMessageApplied: z.literal(false),
  })
  .strict()
  .superRefine((d, ctx) => {
    const fail = () =>
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent payment settings evidence",
      });
    if (d.state === "restricted") {
      if (
        d.canView ||
        d.canManage ||
        d.revision ||
        d.values ||
        d.secretState ||
        d.storedRecords ||
        d.invalidFields.length ||
        d.keysMatchMode ||
        d.verified ||
        d.verifiedAt ||
        d.ready
      )
        fail();
      return;
    }
    if (!d.canView || !d.revision) fail();
    if (d.state === "duplicate") {
      if (
        d.storedRecords < 2 ||
        d.values ||
        d.secretState ||
        d.invalidFields.length ||
        d.keysMatchMode ||
        d.verified ||
        d.verifiedAt ||
        d.ready ||
        d.canManage
      )
        fail();
      return;
    }
    if (
      !d.values ||
      !d.secretState ||
      d.storedRecords !== (d.state === "missing" ? 0 : 1)
    ) {
      fail();
      return;
    }
    if (new Set(d.invalidFields).size !== d.invalidFields.length) fail();
    for (const key of Object.keys(
      paymentSettingsDefaults
    ) as (keyof typeof paymentSettingsDefaults)[])
      if ((d.values[key] === null) !== d.invalidFields.includes(key)) fail();
    if (d.invalidFields.length > 0 !== (d.state === "invalid")) fail();
    if (
      ["invalid", "unreadable"].includes(d.secretState) !==
      d.invalidFields.includes("secret")
    )
      fail();
    if (
      d.keysMatchMode &&
      (d.secretState !== "stored" ||
        !d.values.tapPublicKey ||
        d.values.tapTestMode === null ||
        !d.values.tapPublicKey.startsWith(
          d.values.tapTestMode ? "pk_test_" : "pk_live_"
        ))
    )
      fail();
    if (
      d.verified &&
      (!d.keysMatchMode ||
        !d.verifiedAt ||
        d.invalidFields.includes("verification"))
    )
      fail();
    if (!d.verified && d.verifiedAt !== null) fail();
    if (
      d.ready !==
      (d.values.tapEnabled === true &&
        d.verified &&
        d.values.defaultCurrency === "SAR")
    )
      fail();
    if (
      d.state === "missing" &&
      (d.secretState !== "missing" ||
        d.verified ||
        d.ready ||
        d.keysMatchMode ||
        Object.entries(paymentSettingsDefaults).some(
          ([k, v]) => d.values![k as keyof typeof paymentSettingsDefaults] !== v
        ))
    )
      fail();
  });
export const paymentSettingsSaveResult = z
  .object({ changed: z.boolean(), workspace: paymentSettingsWorkspace })
  .strict()
  .superRefine((d, ctx) => {
    if (
      !d.workspace.canManage ||
      !["saved", "invalid"].includes(d.workspace.state)
    )
      ctx.addIssue({ code: "custom", message: "Invalid saved workspace" });
  });
export const paymentSettingsProbeResult = z
  .object({
    outcome: z.enum(["verified", "rejected"]),
    workspace: paymentSettingsWorkspace,
  })
  .strict()
  .superRefine((d, ctx) => {
    if (
      !d.workspace.canManage ||
      !["saved", "invalid"].includes(d.workspace.state) ||
      d.workspace.verified !== (d.outcome === "verified")
    )
      ctx.addIssue({ code: "custom", message: "Invalid verification receipt" });
  });
export type PaymentSettingsWorkspace = z.infer<typeof paymentSettingsWorkspace>;
