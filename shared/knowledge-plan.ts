import { z } from 'zod';

export const knowledgeSectionType = z.enum(['identity', 'services', 'policies', 'faq', 'contact', 'team', 'achievements', 'sales_intel', 'opportunities', 'custom']);
export const knowledgeProposalSchema = z.object({
  action: z.enum(['add', 'update', 'conflict', 'unchanged']),
  targetId: z.number().int().positive().nullable(),
  // A child can reference an earlier addition in this same plan, never an arbitrary tenant ID.
  parentIndex: z.number().int().nonnegative().nullable(),
  sectionType: knowledgeSectionType,
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(30_000),
  summary: z.string().trim().max(1000),
  reason: z.string().trim().min(1).max(2000),
});
export const knowledgeProposalsSchema = z.array(knowledgeProposalSchema).max(60);
export const knowledgePlanTextSchema = z.object({ title: z.string(), content: z.string(), summary: z.string().nullable() });
export const knowledgePlanItemSchema = knowledgeProposalSchema.extend({
  before: knowledgePlanTextSchema.nullable(),
  status: z.enum(['auto_approved', 'approved', 'pending_review']),
  useInBot: z.boolean(),
  injectAs: z.enum(['fact', 'behavior', 'none']),
});
export const knowledgePlanSchema = z.object({ version: z.literal(1), items: z.array(knowledgePlanItemSchema).max(60) });
export type KnowledgePlan = z.infer<typeof knowledgePlanSchema>;
export type KnowledgeProposal = z.infer<typeof knowledgeProposalSchema>;
