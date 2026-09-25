import { createHash } from 'node:crypto';
import { z } from 'zod';

// Contains routing identity only: no credential, prompt, source text or customer identifier.
const receiptSchema = z.object({
  version: z.literal(1), provider: z.literal('zahypi'), jobId: z.string().uuid(),
  traceId: z.string().uuid(), projectId: z.literal('sari'),
  tenantId: z.string().regex(/^merchant:[1-9]\d{0,15}$/),
  taskType: z.literal('sari.learning.pattern-analysis'), configFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const replyReceiptSchema = receiptSchema.extend({ taskType: z.literal('sari.reply') });
export type LearningProviderJobReceipt = Readonly<z.infer<typeof receiptSchema>>;
export type ReplyProviderJobReceipt = Readonly<z.infer<typeof replyReceiptSchema>>;
export type AiProviderJobReceipt = LearningProviderJobReceipt | ReplyProviderJobReceipt;
// Keep each consumer's trust boundary task-specific. Only the provider adapter accepts both.
export function parseProviderJobReceipt(value: unknown): LearningProviderJobReceipt {
  return Object.freeze(receiptSchema.parse(value));
}
export function parseReplyProviderJobReceipt(value: unknown): ReplyProviderJobReceipt {
  return Object.freeze(replyReceiptSchema.parse(value));
}
export function parseAcceptedProviderJobReceipt(value: unknown): AiProviderJobReceipt {
  return Object.freeze(z.union([receiptSchema, replyReceiptSchema]).parse(value));
}
export function providerRouteFingerprint(config: { baseUrl: string; projectId: string; model: string;
  source: string; generation?: number; taskTypes?: readonly string[]; taskTypesHash?: string }): string {
  return createHash('sha256').update(JSON.stringify([config.baseUrl, config.projectId, config.model,
    config.source, config.generation ?? null, config.taskTypes ? [...config.taskTypes].sort() : null,
    config.taskTypesHash ?? null])).digest('hex');
}
