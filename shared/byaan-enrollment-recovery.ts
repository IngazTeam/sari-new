import { z } from 'zod';
const id = z.number().int().positive().max(2147483647);
export const byaanEnrollmentRecoveryInput = z.object({ operationId: id }).strict();
export const byaanEnrollmentRecoveryStamp = z.object({
  reviewerUserId: id, restoredAt: z.string().datetime({ precision: 3 }),
}).strict();
export const byaanEnrollmentRecoveryOutput = z.object({
  merchantId: id, operationId: id, quotationId: id, requestId: z.string().uuid(),
  outcome: z.literal('projection_present'), replayed: z.boolean(), recovery: byaanEnrollmentRecoveryStamp.nullable(),
  providerStatus: z.literal('not_checked'), paymentEvidence: z.literal('not_verified'),
  externalRequest: z.literal('not_sent'), customerMessage: z.literal('not_sent'),
}).strict().refine(v => v.replayed || v.recovery !== null, 'A new restoration requires an audit stamp');
