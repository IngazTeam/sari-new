import { z } from 'zod';
import { sallaExternalId as externalId } from './salla-sales-observations';

export const sallaEvidenceExternalId = externalId.refine(v => v === v.trim());
const sallaExternalId = sallaEvidenceExternalId;
export const sallaCheckoutReference = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).refine(v => v === v.trim());
const minor = z.number().int().min(0).max(2147483647);
const status = z.string().regex(/^[a-z_]{1,40}$/).refine(v => v === v.trim());
export const sallaCheckoutEvidenceInput = z.object({
  requestId: z.string().uuid().transform(v => v.toLowerCase()),
  orderId: sallaExternalId,
  transactionId: sallaExternalId.optional(),
}).strict();
export type SallaCheckoutEvidenceInput = z.infer<typeof sallaCheckoutEvidenceInput>;
export const sallaOrderEvidence = z.object({
  orderId: sallaExternalId, checkoutId: sallaCheckoutReference.nullable(),
  status, draft: z.boolean(), totalMinor: minor, currency: z.literal('SAR'),
}).strict();
export const sallaTransactionEvidence = z.object({
  transactionId: sallaExternalId, orderId: sallaExternalId, cartId: sallaExternalId.nullable(),
  status, totalMinor: minor, currency: z.literal('SAR'),
}).strict();
export const sallaCheckoutEvidenceOutput = z.object({
  requestId: z.string().uuid(), observedAt: z.string().datetime({ precision: 3 }),
  cart: z.object({ cartId: sallaCheckoutReference, preparedTotalMinor: minor, currency: z.literal('SAR') }).strict(),
  order: sallaOrderEvidence, transaction: sallaTransactionEvidence.nullable(),
  comparison: z.object({
    checkoutReference: z.enum(['equal', 'different', 'absent']),
    transactionOrderReference: z.enum(['equal', 'different', 'not_checked']),
    transactionCartReference: z.enum(['equal', 'different', 'absent', 'not_checked']),
  }).strict(),
  providerLinkContract: z.literal('not_verified'),
  attribution: z.literal('not_recorded'), paymentFact: z.literal('not_recorded'),
}).strict().superRefine((v, ctx) => {
  const expected = sallaEvidenceComparison(v.cart.cartId, v.order, v.transaction);
  if (JSON.stringify(expected) !== JSON.stringify(v.comparison)) {
    ctx.addIssue({ code: 'custom', message: 'Evidence comparison mismatch' });
  }
});

/** Literal reference equality only. The documented identifiers are not proven
 * to share one namespace, nor is a transaction total net settled revenue. */
export function sallaEvidenceComparison(cartId: string, order: z.infer<typeof sallaOrderEvidence>, transaction: z.infer<typeof sallaTransactionEvidence> | null) {
  return {
    checkoutReference: order.checkoutId === null ? 'absent' as const : order.checkoutId === cartId ? 'equal' as const : 'different' as const,
    transactionOrderReference: !transaction ? 'not_checked' as const : transaction.orderId === order.orderId ? 'equal' as const : 'different' as const,
    transactionCartReference: !transaction ? 'not_checked' as const : transaction.cartId === null ? 'absent' as const : transaction.cartId === cartId ? 'equal' as const : 'different' as const,
  };
}
