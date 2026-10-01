import { z } from 'zod';
const merchantId = z.number().int().min(1).max(2147483647);
const jobId = z.string().uuid();
export const websiteAnalysisScope = z.object({ merchantId }).strict();
export const websiteAnalysisAttempt = z.object({ merchantId, jobId }).strict();
export const websiteAnalysisAccepted = z.object({ merchantId, jobId, started: z.literal(true), alreadyRunning: z.boolean() }).strict();
export const websiteAnalysisSnapshot = z.object({
  merchantId, jobId,
  status: z.enum(['idle', 'running', 'completed', 'error']),
  currentStep: z.string().optional(),
  progress: z.number().finite().min(0).max(100).optional(),
}).passthrough();
export const websiteKnowledgeSummary = z.object({
  merchantId, totalPages: z.number().int().nonnegative(), activePages: z.number().int().nonnegative(), canManage: z.boolean(),
}).strict().refine(value => value.activePages <= value.totalPages);
