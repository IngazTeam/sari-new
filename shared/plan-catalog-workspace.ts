import { z } from "zod";
import { usageQuota } from "./usage-workspace";
const id = z.number().int().positive().max(2147483647);
const count = z.number().int().nonnegative().safe();
export function planPriceMinor(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value))
    return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
const limitSchema = z
  .object({ limit: count.nullable(), unlimited: z.boolean().nullable() })
  .strict()
  .superRefine((v, ctx) => {
    if (v.unlimited === false ? v.limit === null : v.limit !== null)
      ctx.addIssue({ code: "custom", message: "Inconsistent plan allowance" });
  });
const planSchema = z
  .object({
    id,
    nameAr: z.string().nullable(),
    nameEn: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    descriptionEn: z.string().nullable(),
    currency: z.enum(["SAR", "USD"]).nullable(),
    recordedCurrency: z.string().nullable(),
    monthlyMinor: count.nullable(),
    yearlyMinor: count.nullable(),
    limits: z
      .object({
        customers: limitSchema,
        whatsappNumbers: limitSchema,
        conversations: limitSchema,
        messages: limitSchema,
        voiceMessages: limitSchema,
      })
      .strict(),
    features: z.array(z.string()),
    invalidFields: z.array(z.string()),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.currency === null &&
      (v.monthlyMinor !== null || v.yearlyMinor !== null)
    )
      ctx.addIssue({ code: "custom", message: "Price currency unavailable" });
  });
export const planCatalogWorkspaceSchema = z
  .object({
    actorId: id,
    merchantId: id,
    canManage: z.boolean(),
    checkedAt: z.string().datetime(),
    plans: z.array(planSchema),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.plans.map(p => p.id)).size !== v.plans.length)
      ctx.addIssue({ code: "custom", message: "Duplicate plan" });
  });
export type PlanCatalogWorkspace = z.infer<typeof planCatalogWorkspaceSchema>;
export function projectCatalogPlan(
  row: Record<string, unknown>
): z.infer<typeof planSchema> {
  const invalidFields: string[] = [];
  const text = (key: string, required = false) => {
    const v = row[key];
    if (v === null && !required) return null;
    if (typeof v !== "string" || (required && !v.trim())) {
      invalidFields.push(key);
      return null;
    }
    return v;
  };
  const recordedCurrency = text("currency", true),
    normalized = recordedCurrency?.trim().toUpperCase();
  const currency =
    normalized === "SAR" || normalized === "USD" ? normalized : null;
  if (!currency) invalidFields.push("currency");
  const price = (key: string) => {
    const n = planPriceMinor(row[key]);
    if (n === null) invalidFields.push(key);
    return currency ? n : null;
  };
  const limit = (key: string, resource = false) => {
    const q = usageQuota(null, row[key], resource);
    if (q.unlimited === null) invalidFields.push(key);
    return { limit: q.limit, unlimited: q.unlimited };
  };
  let features: string[] = [];
  if (
    row.features !== null &&
    row.features !== undefined &&
    (typeof row.features !== "string" || !!row.features.trim())
  ) {
    if (typeof row.features !== "string") invalidFields.push("features");
    else {
      try {
        const parsed: unknown = JSON.parse(row.features);
        if (!Array.isArray(parsed)) invalidFields.push("features");
        else {
          features = parsed.filter(
            (v): v is string => typeof v === "string" && !!v.trim()
          );
          if (features.length !== parsed.length) invalidFields.push("features");
        }
      } catch {
        if (/^[\[{]/.test(row.features.trim())) invalidFields.push("features");
        else features = [row.features];
      }
    }
  }
  const plan = {
    id: row.id as number,
    nameAr: text("name", true),
    nameEn: text("name_en", true),
    descriptionAr: text("description"),
    descriptionEn: text("description_en"),
    currency,
    recordedCurrency,
    monthlyMinor: price("monthly_price"),
    yearlyMinor: price("yearly_price"),
    limits: {
      customers: limit("max_customers", true),
      whatsappNumbers: limit("max_whatsapp_numbers", true),
      conversations: limit("conversation_limit"),
      messages: limit("message_limit"),
      voiceMessages: limit("voice_message_limit"),
    },
    features,
    invalidFields,
  };
  return planSchema.parse({
    ...plan,
    invalidFields: Array.from(new Set(invalidFields)),
  });
}
