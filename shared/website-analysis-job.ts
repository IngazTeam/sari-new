import { z } from "zod";
import {
  websiteAnalysisAttempt,
  websiteIndexingOutcome,
} from "./website-analysis-tracking";

const count = z.number().int().nonnegative().safe();
export const websiteJobExecution = websiteAnalysisAttempt
  .extend({ token: z.string().uuid() })
  .strict();
export type WebsiteJobExecution = z.infer<typeof websiteJobExecution>;
export const websiteJobStep = z.enum([
  "scraping",
  "processing",
  "knowledge",
  "embedding",
  "completed",
]);
export const websiteJobIssue = z.enum([
  "interrupted",
  "processing_failed",
  "result_unavailable",
]);

/** Only merchant-facing result fields may be persisted or returned. No provider errors or raw text. */
export const websiteJobResult = z
  .object({
    success: z.literal(true),
    title: z.string().max(2000).optional(),
    industry: z.string().max(1000).optional(),
    score: z.number().finite().min(0).max(100).nullable().optional(),
    knowledgeEvolution: z
      .object({
        added: count,
        merged: count.optional(),
        evolved: count,
        conflicts: count,
        unchanged: count,
      })
      .strict()
      .nullable(),
    salesIntelSummary: z
      .object({
        totalSections: count,
        hasIntel: z.boolean(),
        hasOpportunities: z.boolean(),
      })
      .strict()
      .nullable(),
    knowledgeError: z
      .enum(["knowledge_processing_incomplete", "insufficient_text"])
      .nullable(),
    indexingOutcome: websiteIndexingOutcome,
    crawlStats: z
      .object({
        pagesDiscovered: count.optional(),
        pagesCrawled: count.optional(),
        pagesSuccess: count.optional(),
        mainPageWords: count.optional(),
        totalWords: count.optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type WebsiteJobResult = z.infer<typeof websiteJobResult>;
