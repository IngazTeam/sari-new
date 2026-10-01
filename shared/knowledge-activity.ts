import { z } from "zod";
export const knowledgeActivityInput = z
  .object({
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(5).max(50).default(15),
    actionType: z.string().min(1).max(100).optional(),
    // Accepted for old readers; pageSize remains the explicit pagination authority.
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict()
  .optional();
export type KnowledgeActivityInput = z.infer<typeof knowledgeActivityInput>;
export const knowledgeActivityItem = z
  .object({
    id: z.number().int().positive(),
    actionType: z.string().min(1).max(100),
    description: z.string(),
    createdAt: z.string().datetime().nullable(),
    // Details are intentionally not expanded by the summary feed. Malformed legacy
    // JSON must not break other entries or expose a raw payload to the browser.
    details: z.null(),
  })
  .strict();
export const knowledgeActivityPage = z
  .object({
    merchantId: z.number().int().positive(),
    filter: z.string().max(100).nullable(),
    items: z.array(knowledgeActivityItem).max(50),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().min(5).max(50),
    totalPages: z.number().int().nonnegative(),
    actionTypes: z.array(z.string().min(1).max(100)).max(201),
    actionTypesTruncated: z.boolean(),
  })
  .strict();
export type KnowledgeActivityPage = z.infer<typeof knowledgeActivityPage>;
