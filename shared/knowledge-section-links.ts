import { z } from 'zod';

/** Immutable identifiers and fingerprints, saved with the receipt in the plan transaction. */
export const knowledgeSectionLinksSchema = z.object({
  version: z.literal(1),
  items: z.array(z.object({
    planIndex: z.number().int().min(0).max(59),
    sectionId: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    settingsHash: z.string().regex(/^[a-f0-9]{64}$/),
  })).max(60),
});
export type KnowledgeSectionLinks = z.infer<typeof knowledgeSectionLinksSchema>;
export const KNOWLEDGE_SECTION_LINKS_PAGE_SIZE = 5;
export const knowledgeSectionLinksInput = z.object({
  id: z.number().int().positive().max(2_147_483_647),
  page: z.number().int().min(1).max(100_000).default(1),
});
