import { z } from 'zod';
import { sallaCheckoutEvidenceInput, sallaCheckoutEvidenceOutput } from './salla-checkout-evidence';

const id = z.number().int().positive().max(2147483647);
const uuid = z.string().uuid().transform(v => v.toLowerCase());
export const sallaCheckoutAuditInput = z.object({ reviewId: uuid, evidence: sallaCheckoutEvidenceInput }).strict();
export const sallaCheckoutAuditItem = z.object({
  id, merchantId: id, reviewerUserId: id, reviewId: uuid,
  savedAt: z.string().datetime({ precision: 3 }), evidence: sallaCheckoutEvidenceOutput,
}).strict();
export const sallaCheckoutAuditListInput = z.object({ beforeId: id.optional() }).strict();
export const sallaCheckoutAuditPage = z.object({ merchantId: id, items: z.array(sallaCheckoutAuditItem).max(20), nextCursor: id.nullable() }).strict().superRefine((v, c) => {
  if (v.items.some((item, n) => item.merchantId !== v.merchantId || n > 0 && item.id >= v.items[n - 1].id)
    || new Set(v.items.map(item => item.reviewId)).size !== v.items.length
    || v.nextCursor !== null && (v.items.length !== 20 || v.items.at(-1)?.id !== v.nextCursor)) {
    c.addIssue({ code: 'custom', message: 'Invalid audit page' });
  }
});
