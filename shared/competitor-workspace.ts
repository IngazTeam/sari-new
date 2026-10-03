import { z } from "zod";
export const competitorSelection = z
  .object({
    query: z.string().trim().max(200).default(""),
    state: z
      .enum(["all", "pending", "analyzing", "completed", "failed"])
      .default("all"),
    sort: z.enum(["newest", "oldest"]).default("newest"),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .default({ query: "", state: "all", sort: "newest", page: 1 });
export const competitorDetailSelection = z
  .object({
    id: z.number().int().positive().max(2147483647),
    productPage: z.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const COMPETITOR_PAGE_SIZE = 25;
export const competitorDeleteInput = z
  .object({
    id: z.number().int().positive().max(2147483647),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledged: z.literal(true),
  })
  .strict();
const count = z.number().int().nonnegative(),
  id = z.number().int().positive();
const stamp = z.string().datetime().nullable();
const source = z
  .string()
  .url()
  .refine(value => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  })
  .nullable();
const score = z.number().min(0).max(100).nullable();
export const competitorReport = z
  .object({
    id,
    name: z.string(),
    industry: z.string().nullable(),
    url: source,
    status: z.enum(["pending", "analyzing", "completed", "failed", "unknown"]),
    createdAt: stamp,
    updatedAt: stamp,
    analyzedAt: stamp,
    scores: z
      .object({
        overall: score,
        seo: score,
        performance: score,
        ux: score,
        content: score,
      })
      .strict(),
    products: count,
    excludedProducts: count,
    recordedProductCount: count.nullable(),
    failure: z.literal("analysis_failed").nullable(),
    scoreEvidence: z.literal("website_estimate"),
    salesProficiency: z.null(),
  })
  .strict();
export const competitorWorkspaceResult = z
  .object({
    actorId: id,
    merchantId: id,
    selection: competitorSelection,
    canManage: z.boolean(),
    rows: z.array(competitorReport).max(25),
    matched: count,
    pages: count,
    currentPage: id,
    stats: z
      .object({ total: count, completed: count, running: count, failed: count })
      .strict(),
  })
  .strict();
const note = z
  .object({ items: z.array(z.string()), invalid: z.boolean() })
  .strict();
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
export const competitorDetailResult = z
  .object({
    actorId: id,
    merchantId: id,
    canManage: z.boolean(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    report: competitorReport,
    notes: z
      .object({ strengths: note, weaknesses: note, opportunities: note })
      .strict(),
    products: z
      .array(
        z
          .object({
            id,
            name: z.string(),
            description: z.string().nullable(),
            category: z.string().nullable(),
            price: decimal.nullable(),
            currency: currency.nullable(),
            url: source,
            imageUrl: source,
            matchedProduct: z
              .object({ id, name: z.string() })
              .strict()
              .nullable(),
            comparisonEvidence: z.literal("not_verified"),
            priceEvidence: z.enum(["extracted", "unverified"]),
          })
          .strict()
      )
      .max(25),
    productPages: count,
    productPage: id,
    pricing: z
      .object({
        pricedCount: count,
        unverifiedCount: count,
        groups: z.array(
          z
            .object({
              currency,
              count,
              minimum: decimal,
              maximum: decimal,
              average: decimal,
            })
            .strict()
        ),
        evidence: z.literal("extracted_not_current"),
      })
      .strict(),
  })
  .strict();
export type CompetitorSelection = z.infer<typeof competitorSelection>;
export type CompetitorReport = z.infer<typeof competitorReport>;
export type CompetitorDetail = z.infer<typeof competitorDetailResult>;
