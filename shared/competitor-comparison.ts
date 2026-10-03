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
  .strict()
  .superRefine((data, ctx) => {
    const pages = Math.ceil(data.matched / 25);
    const page = Math.min(data.selection.page, Math.max(1, pages));
    if (
      data.pages !== pages ||
      data.currentPage !== page ||
      data.rows.length !==
        Math.min(25, Math.max(0, data.matched - (page - 1) * 25)) ||
      new Set(data.rows.map(r => r.id)).size !== data.rows.length ||
      data.rows.some(r => r.status !== "completed" || r.failure !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent comparison choices",
      });
  });
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
  .strict()
  .superRefine((data, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      data.baseline.report.id !== data.selection.analysisId ||
      data.competitors.length !== data.selection.competitorIds.length ||
      data.competitors.some(
        (item, i) => item.report.id !== data.selection.competitorIds[i]
      )
    )
      invalid("Comparison reports do not match the selection");
    for (const item of [data.baseline, ...data.competitors]) {
      const { report, pricing } = item;
      if (
        report.status !== "completed" ||
        report.failure !== null ||
        pricing.pricedCount + pricing.unverifiedCount !== report.products ||
        pricing.groups.reduce((sum, g) => sum + g.count, 0) !==
          pricing.pricedCount ||
        new Set(pricing.groups.map(g => g.currency)).size !==
          pricing.groups.length ||
        pricing.groups.some(g => {
          const minimum = Number(g.minimum),
            maximum = Number(g.maximum),
            average = Number(g.average);
          return (
            g.count <= 0 ||
            ![minimum, maximum, average].every(
              n => Number.isFinite(n) && n > 0
            ) ||
            minimum > maximum ||
            average < minimum ||
            average > maximum
          );
        })
      )
        invalid("Inconsistent comparison report or prices");
    }
    for (const item of data.competitors) {
      if (new Set(item.differences.map(d => d.metric)).size !== 5)
        invalid("Repeated comparison metric");
      for (const value of item.differences) {
        const baseline = data.baseline.report.scores[value.metric];
        const competitor = item.report.scores[value.metric];
        const difference =
          baseline === null || competitor === null
            ? null
            : baseline - competitor;
        if (
          value.baseline !== baseline ||
          value.competitor !== competitor ||
          value.difference !== difference
        )
          invalid("Comparison metric differs from its report");
      }
      const currencies = data.baseline.pricing.groups
        .filter(g => item.pricing.groups.some(p => p.currency === g.currency))
        .map(g => g.currency)
        .sort();
      if (
        JSON.stringify([...item.commonCurrencies].sort()) !==
        JSON.stringify(currencies)
      )
        invalid("Inconsistent shared currencies");
    }
  });
