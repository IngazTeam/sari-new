import { z } from 'zod';
import { KNOWLEDGE_PREVIEW_LIMIT } from './knowledge-preview';

export const knowledgeIntakeInput = z.object({
  content: z.string().min(10).max(KNOWLEDGE_PREVIEW_LIMIT).refine(value => value.trim().length >= 10),
  contentType: z.enum(['document', 'products', 'custom']),
  fileName: z.string().trim().max(255).optional(),
});
const explanation = z.string().trim().min(1).max(5000);
export const knowledgeAnalysisSchema = z.object({
  contentType: z.enum(['products', 'services', 'policies', 'general']),
  summary: explanation,
  itemCount: z.number().int().nonnegative().max(1_000_000),
  conflicts: z.array(explanation).max(100),
  impact: explanation,
  riskLevel: z.enum(['low', 'medium', 'high']),
  sampleQA: z.array(z.object({ question: explanation, answer: explanation })).max(10),
  recommendation: z.enum(['approve', 'review', 'reject']),
  recommendationReason: explanation,
});
export type KnowledgeAnalysis = z.infer<typeof knowledgeAnalysisSchema>;

// Keep the complete accepted text; filtering is not a substitute for prompt boundaries.
export function prepareKnowledgeText(content: string) {
  return knowledgeIntakeInput.shape.content.parse(content)
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
    .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
    .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
    .replace(/do\s+not\s+follow/gi, '[filtered]')
    .replace(/override\s+(system|all|your)/gi, '[filtered]');
}
