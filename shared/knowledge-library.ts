import { z } from 'zod';

export const KNOWLEDGE_LIBRARY_PAGE_SIZE = 12;
export const KNOWLEDGE_TEXT_PAGE_SIZE = 4000;
export const knowledgeLibraryInput = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  search: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'pending', 'processing', 'completed', 'failed']).default('all'),
}).default({ page: 1, search: '', status: 'all' });
export const knowledgeTextInput = z.object({
  id: z.number().int().positive().max(2_147_483_647),
  page: z.number().int().min(1).max(100_000).default(1),
  revision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
