import { z } from 'zod';

const id = z.number().int().positive().max(2147483647);
export const byaanSalesReviewInput = z.object({ beforeId: id.optional() }).strict();
export const byaanSalesReviewAccess = z.object({ merchantId: id }).strict();
export const byaanSalesReviewItem = z.object({
  id, requestId: z.string().uuid(), kind: z.enum(['enrollment', 'payment']),
  state: z.enum(['preparing', 'dispatching', 'reported', 'not_sent', 'unknown']),
  createdAt: z.string().datetime({ precision: 3 }), updatedAt: z.string().datetime({ precision: 3 }),
  evidence: z.enum(['pending', 'consistent', 'invalid']),
  reference: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).nullable(),
  providerStatus: z.literal('not_checked'), paymentEvidence: z.literal('not_verified'),
}).strict().superRefine((v, c) => {
  if ((v.evidence === 'pending') !== ['preparing', 'dispatching'].includes(v.state) && v.evidence !== 'invalid'
    || v.reference !== null && (v.state !== 'reported' || v.evidence !== 'consistent')
    || v.evidence === 'consistent' && v.state === 'reported' && v.reference === null
    || Date.parse(v.updatedAt) < Date.parse(v.createdAt)) {
    c.addIssue({ code: 'custom', message: 'Inconsistent operation evidence' });
  }
});
export const byaanSalesReviewPage = z.object({
  merchantId: id, items: z.array(byaanSalesReviewItem).max(20), nextCursor: id.nullable(),
}).strict().superRefine((v, c) => {
  if (new Set(v.items.map(i => i.requestId.toLowerCase())).size !== v.items.length
    || v.items.some((i, n) => n > 0 && i.id >= v.items[n - 1].id)
    || v.nextCursor !== null && (v.items.length !== 20 || v.items.at(-1)?.id !== v.nextCursor)) {
    c.addIssue({ code: 'custom', message: 'Invalid operation page' });
  }
});
