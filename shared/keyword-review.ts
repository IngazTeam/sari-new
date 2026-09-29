import { z } from "zod";
export const keywordCategory = z.enum([
  "product",
  "price",
  "shipping",
  "complaint",
  "question",
  "other",
]);
export const keywordStatus = z.enum([
  "new",
  "reviewed",
  "response_created",
  "ignored",
]);
export const keywordId = z.number().int().positive().max(2147483647);
export const keywordRevision = z.string().regex(/^[a-f0-9]{64}$/);
export const keywordPageInput = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const keywordListInput = keywordPageInput
  .extend({
    category: keywordCategory.optional(),
    status: keywordStatus.optional(),
    minFrequency: z.number().int().min(0).max(2147483647).optional(),
  })
  .strict();
export const keywordStatusInput = z
  .object({
    keywordId,
    expectedRevision: keywordRevision,
    status: keywordStatus,
  })
  .strict();
export const keywordDeleteInput = z
  .object({
    keywordId,
    expectedRevision: keywordRevision,
    reviewed: z.literal(true),
  })
  .strict();
