import { z } from "zod";
import {
  competitorReport,
  competitorDetailResult,
} from "./competitor-workspace";
const id = z.number().int().min(1).max(2147483647);
export const competitorComparisonChoices = z
  .object({
    source: z.enum(["website", "competitor"]),
    query: z.string().trim().max(200).default(""),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const competitorComparisonInput = z
  .object({
    analysisId: id,
    competitorIds: z
      .array(id)
      .min(1)
      .max(5)
      .refine(ids => new Set(ids).size === ids.length),
  })
  .strict();
export const competitorComparisonOptions = z
  .object({
    actorId: id,
    merchantId: id,
    selection: competitorComparisonChoices,
    rows: z.array(competitorReport).max(25),
    matched: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
    currentPage: id,
  })
  .strict();
const profile = z
  .object({
    report: competitorReport,
    pricing: competitorDetailResult.shape.pricing,
  })
  .strict();
const metric = z.enum(["overall", "seo", "performance", "ux", "content"]);
export const competitorComparisonView = z
  .object({
    actorId: id,
    merchantId: id,
    selection: competitorComparisonInput,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    baseline: profile,
    competitors: z
      .array(
        profile
          .extend({
            differences: z
              .array(
                z
                  .object({
                    metric,
                    baseline: z.number().min(0).max(100).nullable(),
                    competitor: z.number().min(0).max(100).nullable(),
                    difference: z.number().min(-100).max(100).nullable(),
                  })
                  .strict()
              )
              .length(5),
            commonCurrencies: z.array(z.string().regex(/^[A-Z]{3}$/)),
          })
          .strict()
      )
      .min(1)
      .max(5),
    evidence: z.literal("stored_website_estimates"),
    priceComparability: z.literal("products_not_matched"),
    salesProficiency: z.null(),
  })
  .strict();
