import { z } from "zod";
import { majorToMinor } from "./product-money";

export const SETUP_CATALOG_LIMIT = 100;
export const SETUP_PRICE_LIMIT_MINOR = 100_000_000;
export const setupWebUrl = z
  .string()
  .trim()
  .max(500)
  .refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Invalid web URL");
export const setupProductSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().default(""),
  priceMinor: z.number().int().nonnegative().max(SETUP_PRICE_LIMIT_MINOR),
  currency: z.enum(["SAR", "USD"]).optional().default("SAR"),
  imageUrl: setupWebUrl.optional().default(""),
  productUrl: setupWebUrl.optional().default(""),
  category: z.string().trim().max(100).optional().default(""),
});
export const setupServiceSchema = setupProductSchema
  .pick({
    name: true,
    description: true,
    priceMinor: true,
    category: true,
  })
  .extend({
    durationMinutes: z.number().int().min(1).max(1440).optional().default(30),
  });

// Blank, malformed and over-precise input must never become a free item.
const draftPrice = z.union([z.string(), z.number()]).transform((raw, ctx) => {
  try {
    const minor = majorToMinor(raw);
    if (minor > SETUP_PRICE_LIMIT_MINOR) throw Error("Price limit");
    return minor;
  } catch {
    ctx.addIssue({
      code: "custom",
      message:
        "Enter a price with at most two decimals; use 0 only for a free item.",
    });
    return z.NEVER;
  }
});
const productDraft = setupProductSchema
  .omit({ priceMinor: true })
  .extend({ price: draftPrice })
  .transform(({ price, ...row }) => ({ ...row, priceMinor: price }));
const serviceDraft = setupServiceSchema
  .omit({ priceMinor: true })
  .extend({
    price: draftPrice,
    durationMinutes: z.preprocess(
      value =>
        typeof value === "string" && /^\d+$/.test(value)
          ? Number(value)
          : value,
      setupServiceSchema.shape.durationMinutes
    ),
  })
  .transform(({ price, ...row }) => ({ ...row, priceMinor: price }));

function whollyEmpty(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return [
    "name",
    "description",
    "price",
    "imageUrl",
    "productUrl",
    "category",
    "durationMinutes",
  ].every(
    key =>
      row[key] === undefined ||
      (typeof row[key] === "string" && !row[key].trim())
  );
}
function draftRows<T extends z.ZodType>(schema: T) {
  // Keep original indices for field errors. Fully blank placeholders alone may be omitted.
  return z
    .array(z.unknown())
    .max(SETUP_CATALOG_LIMIT)
    .default([])
    .transform((rows, ctx) => {
      const values: z.output<T>[] = [];
      rows.forEach((row, index) => {
        if (whollyEmpty(row)) return;
        const parsed = schema.safeParse(row);
        if (parsed.success) values.push(parsed.data);
        else
          for (const issue of parsed.error.issues)
            ctx.addIssue({ ...issue, path: [index, ...issue.path] });
      });
      return values;
    });
}
export const setupCatalogDraft = z.object({
  products: draftRows(productDraft),
  services: draftRows(serviceDraft),
});
