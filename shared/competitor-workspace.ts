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
