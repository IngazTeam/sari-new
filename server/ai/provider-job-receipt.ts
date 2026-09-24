import { createHash } from 'node:crypto';
import { z } from 'zod';

// Contains routing identity only: no credential, prompt, source text or customer identifier.
const receiptSchema = z.object({
  version: z.literal(1), provider: z.literal('zahypi'), jobId: z.string().uuid(),
  traceId: z.string().uuid(), projectId: z.literal('sari'),
  tenantId: z.string().regex(/^merchant:[1-9]\d{0,15}$/),
  taskType: z.literal('sari.learning.pattern-analysis'), configFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type AiProviderJobReceipt = Readonly<z.infer<typeof receiptSchema>>;
export function parseProviderJobReceipt(value: unknown): AiProviderJobReceipt {
  return Object.freeze(receiptSchema.parse(value));
}
export function providerRouteFingerprint(config: { baseUrl: string; projectId: string; model: string;
  source: string; generation?: number; taskTypes?: readonly string[]; taskTypesHash?: string }): string {
  return createHash('sha256').update(JSON.stringify([config.baseUrl, config.projectId, config.model,
    config.source, config.generation ?? null, config.taskTypes ? [...config.taskTypes].sort() : null,
    config.taskTypesHash ?? null])).digest('hex');
}
