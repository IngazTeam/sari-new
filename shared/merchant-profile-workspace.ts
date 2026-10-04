import { z } from "zod";
const timeZone = z
  .string()
  .max(50)
  .refine(value => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Invalid time zone");
const logo = z
  .string()
  .url()
  .max(500)
  .refine(value => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL")
  .nullable();
export const merchantProfileFields = z
  .object({
    businessName: z
      .string()
      .min(1)
      .max(255)
      .refine(value => !!value.trim(), "A name is required"),
    phone: z
      .string()
      .max(20)
      .regex(/^[0-9+\-\s()]*$/),
    autoReplyEnabled: z.boolean(),
    timezone: timeZone,
    logoUrl: logo,
  })
  .strict();
export const merchantProfileKeys = merchantProfileFields.keyof();
const shape = merchantProfileFields.shape;
export const merchantProfileWorkspace = z
  .object({
    actorId: z.number().int().positive().max(2147483647),
    merchantId: z.number().int().positive().max(2147483647),
    canView: z.boolean(),
    canManage: z.boolean(),
    revision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    values: z
      .object({
        businessName: shape.businessName.nullable(),
        phone: shape.phone.nullable(),
        autoReplyEnabled: shape.autoReplyEnabled.nullable(),
        timezone: shape.timezone.nullable(),
        logoUrl: shape.logoUrl,
      })
      .strict()
      .nullable(),
    invalidFields: z.array(merchantProfileKeys),
  })
  .strict()
  .superRefine((d, ctx) => {
    const invalid = () =>
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent profile evidence",
      });
    if (!d.canView) {
      if (
        d.canManage ||
        d.values !== null ||
        d.revision !== null ||
        d.invalidFields.length
      )
        invalid();
      return;
    }
    if (!d.values || !d.revision) {
      invalid();
      return;
    }
    if (new Set(d.invalidFields).size !== d.invalidFields.length) invalid();
    for (const key of merchantProfileKeys.options) {
      if (key === "logoUrl") {
        if (d.invalidFields.includes(key) && d.values[key] !== null) invalid();
      } else if ((d.values[key] === null) !== d.invalidFields.includes(key))
        invalid();
    }
  });
export const merchantProfileSave = merchantProfileFields
  .extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const merchantProfileSaveResult = z
  .object({ changed: z.boolean(), workspace: merchantProfileWorkspace })
  .strict();
export type MerchantProfileWorkspace = z.infer<typeof merchantProfileWorkspace>;
