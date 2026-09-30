import { z } from "zod";
import {
  setupProductSchema,
  setupServiceSchema,
  setupWebUrl,
} from "./setup-catalog";
import { setupTemplateHours } from "./setup-template";

export const setupCompletionFields = z
  .object({
    businessType: z.enum(["store", "services", "both"]),
    businessName: z.string().trim().min(2).max(255),
    phone: z
      .string()
      .trim()
      .min(7)
      .max(20)
      .regex(/^[+0-9][0-9\s()\-]+$/),
    address: z.string().trim().max(500).default(""),
    description: z.string().trim().max(10_000).default(""),
    workingHoursType: z.enum(["24_7", "weekdays", "custom"]),
    workingHours: setupTemplateHours.optional(),
    botTone: z.enum(["friendly", "professional", "casual"]),
    botLanguage: z.enum(["ar", "en", "fr", "tr", "es", "it", "both"]),
    welcomeMessage: z.string().trim().max(2000).default(""),
    products: z.array(setupProductSchema.strict()).max(100),
    services: z.array(setupServiceSchema.strict()).max(100),
    // Attribution only: this is NOT a completed website/knowledge analysis.
    websiteAnalysis: z
      .object({
        websiteUrl: setupWebUrl.refine(value => value.length > 0),
        platform: z.enum([
          "salla",
          "zid",
          "shopify",
          "woocommerce",
          "custom",
          "unknown",
        ]),
      })
      .strict()
      .optional(),
    templateId: z.number().int().positive().optional(),
  })
  .strict();
export type SetupCompletionFields = z.infer<typeof setupCompletionFields>;
export const setupReviewInput = z
  .object({ fields: setupCompletionFields })
  .strict();
export const setupCompletionInput = setupReviewInput
  .extend({
    requestId: z.string().uuid(),
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
  })
  .strict();
export const setupReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const setupCompletionReceipt = z
  .object({
    merchantId: z.number().int().positive(),
    actorId: z.number().int().positive(),
    requestId: z.string().uuid(),
    confirmedAt: z.string().min(20),
    businessName: z.string(),
    currency: z.enum(["SAR", "USD"]),
    products: z.array(
      z
        .object({
          id: z.number().int().positive(),
          name: z.string(),
          priceMinor: z.number().int().nonnegative(),
          currency: z.enum(["SAR", "USD"]),
        })
        .strict()
    ),
    services: z.array(
      z
        .object({
          id: z.number().int().positive(),
          name: z.string(),
          priceMinor: z.number().int().nonnegative(),
          durationMinutes: z.number().int().positive(),
        })
        .strict()
    ),
    templateId: z.number().int().positive().nullable(),
    reviewedWebsite: setupCompletionFields.shape.websiteAnalysis
      .unwrap()
      .nullable(),
  })
  .strict();
export type SetupCompletionReceipt = z.infer<typeof setupCompletionReceipt>;
export type SetupCatalogConflict = {
  kind: "products" | "services";
  index: number;
  reason: "draft_duplicate" | "existing_name";
};
const nameKey = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ar");
/** Existing and repeated names need a merchant decision; never silently drop an item. */
export function setupCatalogConflicts(
  fields: SetupCompletionFields,
  existing: { products: { name: string }[]; services: { name: string }[] }
) {
  const conflicts: SetupCatalogConflict[] = [];
  for (const kind of ["products", "services"] as const) {
    const old = new Set(existing[kind].map(row => nameKey(row.name)));
    const seen = new Map<string, number>();
    fields[kind].forEach((row, index) => {
      const key = nameKey(row.name),
        first = seen.get(key);
      if (old.has(key))
        conflicts.push({ kind, index, reason: "existing_name" });
      if (first !== undefined) {
        if (
          !conflicts.some(
            c =>
              c.kind === kind &&
              c.index === first &&
              c.reason === "draft_duplicate"
          )
        )
          conflicts.push({ kind, index: first, reason: "draft_duplicate" });
        conflicts.push({ kind, index, reason: "draft_duplicate" });
      }
      seen.set(key, first ?? index);
    });
  }
  return conflicts;
}
