import { z } from 'zod';

export const abIdentity = z.number().int().positive().safe();
export const abStatus = z.enum(['running', 'completed', 'paused']);
export const abWinner = z.enum(['variant_a', 'variant_b', 'no_winner']);
export const abCreateInput = z.object({
  testName: z.string().trim().min(1).max(255), keyword: z.string().trim().min(1).max(255),
  variantAText: z.string().trim().min(1).max(8000), variantBText: z.string().trim().min(1).max(8000),
}).strict();
export const abReadInput = z.object({ testId: abIdentity }).strict();
export const abListInput = z.object({ status: abStatus.optional() }).strict();
export const abCloseInput = abReadInput.extend({ winner: abWinner }).strict();

// Counters lack customers, exposures, verified outcomes and a frozen stopping rule.
// They cannot establish statistical confidence, even with a large apparent lead.
export function describeLegacyAB<T extends { confidenceLevel: number }>(test: T) {
  return { ...test, confidenceLevel: 0, evidenceKind: 'legacy_unverified_observations' as const,
    selectionKind: 'unvalidated_selection' as const, statisticalConfidence: null,
    activationAllowed: false as const };
}
export class LegacyABConflict extends Error {
  constructor() { super('Legacy A/B test state is unavailable'); }
}
