import { z } from "zod";

export const faqFields = {
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(3).max(2000),
  category: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(),
  useInBot: z.boolean().optional(),
};
export const faqCreateInput = z.object({
  ...faqFields,
  requestId: z.string().uuid().optional(),
});
export const faqUpdateInput = z.object({
  id: z.number().int().positive(),
  ...faqFields,
  question: faqFields.question.optional(),
  answer: faqFields.answer.optional(),
  expectedRevision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const faqDeleteInput = z.object({
  id: z.number().int().positive(),
  expectedRevision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const faqListInput = z
  .object({
    search: z.string().trim().max(100).default(""),
    status: z.enum(["all", "enabled", "paused"]).default("all"),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .default({ search: "", status: "all", page: 1 });
export type FaqItem = {
  id: number;
  question: string;
  answer: string;
  category: string;
  isActive: boolean;
  useInBot: boolean;
  revision: string;
  requestId: string | null;
  pageId: number | null;
  syncSource: string;
};
export type FaqList = {
  items: FaqItem[];
  total: number;
  page: number;
  totalPages: number;
  canManage: boolean;
};
