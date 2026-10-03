import { z } from 'zod';

const count = z.number().int().nonnegative().safe();

/** Counts describe one batch and one later read, never durable readiness or reply approval. */
export const knowledgeIndexingEvidence = z.object({
  selectedSections: count,
  attemptedSections: count,
  storedSections: count,
  reusedSections: count,
  unconfirmedSections: count,
  currentSnapshot: z.object({
    sections: count,
    matchingEmbeddings: count,
    changedSinceStart: z.boolean(),
  }).strict().refine(value => value.matchingEmbeddings <= value.sections).nullable(),
}).strict().refine(value =>
  value.attemptedSections === value.storedSections + value.unconfirmedSections &&
  value.selectedSections === value.attemptedSections + value.reusedSections,
);

export type KnowledgeIndexingEvidence = z.infer<typeof knowledgeIndexingEvidence>;
