import { z } from 'zod';

export const aiMoney = z.number().finite().min(0).max(1_000_000).refine(value => {
  const scaled = value * 1_000_000;
  return Number.isSafeInteger(Math.round(scaled)) && (value === 0 || Math.round(scaled) > 0)
    && Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, scaled) * 2;
}, 'Use at most six decimal places');
const identity = {
  provider: z.enum(['openai', 'zahypi']),
  model: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
};
const fields = {
  ...identity, version: z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/),
  inputUsdPerMillion: aiMoney, outputUsdPerMillion: aiMoney, flatUsd: aiMoney,
  maxInputTokens: z.number().int().positive().max(10_000_000), enabled: z.boolean(),
};
const priced = (value: { inputUsdPerMillion: number; outputUsdPerMillion: number; flatUsd: number }) =>
  value.inputUsdPerMillion > 0 || value.outputUsdPerMillion > 0 || value.flatUsd > 0;
export const aiPriceCardInput = z.object(fields).strict().refine(priced, 'An approved nonzero price is required');
export const aiPriceDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const aiPriceCardSaveInput = z.object({
  ...fields, expectedRevision: aiPriceDigest.nullable(), requestId: z.string().uuid(),
  reference: z.string().trim().min(8).max(240).regex(/^[^\u0000-\u001f\u007f]+$/),
}).strict().refine(priced, 'An approved nonzero price is required');
export const aiPriceCurrent = z.object({ ...fields, revision: aiPriceDigest }).strict();
export const aiPriceHistoryInput = z.object({
  ...identity, beforeId: z.number().int().positive().max(2147483647).optional(),
}).strict();
export const aiPriceHistoryEntry = z.object({
  id: z.number().int().positive(), card: aiPriceCardInput, origin: z.enum(['legacy', 'admin']),
  actorId: z.number().int().positive().nullable(), reference: z.string().max(240).nullable(),
  recordedAt: z.string().datetime(),
}).strict();
export const aiPriceHistoryOutput = z.object({
  entries: z.array(aiPriceHistoryEntry).max(20), nextBeforeId: z.number().int().positive().nullable(),
}).strict();
export const aiPriceSaveOutput = z.object({
  success: z.literal(true), revisionId: z.number().int().positive(), revision: aiPriceDigest, replayed: z.boolean(),
}).strict();
export type AiPriceCard = z.infer<typeof aiPriceCardInput>;
export type AiPriceSave = z.infer<typeof aiPriceCardSaveInput>;
export type AiPriceCurrent = z.infer<typeof aiPriceCurrent>;
