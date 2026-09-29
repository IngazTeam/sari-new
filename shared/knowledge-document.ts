import { z } from 'zod';

export const knowledgeDocumentRequest = z.object({ requestId: z.uuid() });
export const knowledgeDocumentReprocess = knowledgeDocumentRequest.extend({ id: z.number().int().positive().max(2_147_483_647) });
export const knowledgeDocumentSource = z.object({ id: z.number().int().positive().max(2_147_483_647), revision: z.string().regex(/^[a-f0-9]{64}$/) });
export const knowledgeDocumentResultSchema = z.object({
  fileName: z.string(), fileType: z.enum(['pdf', 'docx', 'xlsx']),
  sourceDocumentId: z.number().int().positive().nullable(),
  extraction: z.enum(['pending', 'extracted', 'failed']),
  issue: z.enum(['empty', 'too_large', 'unreadable']).nullable(),
  characters: z.number().int().nonnegative().nullable(),
  originalStored: z.boolean(),
});
export type KnowledgeDocumentResult = z.infer<typeof knowledgeDocumentResultSchema>;
