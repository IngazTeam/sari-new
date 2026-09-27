import { z } from 'zod';

export const sallaExternalId = z.string().regex(/^[1-9][0-9]{0,19}$/);
export const sallaObservedState = z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']);
export const sallaObservationsInput = z.object({
  merchantId: z.number().int().positive().max(2147483647), storeId: sallaExternalId, orderId: sallaExternalId,
}).strict();
export const sallaObservationsOutput = sallaObservationsInput.extend({
  source: z.literal('salla_authenticated_order_read'), paymentEvidence: z.literal('not_measured'),
  observations: z.array(z.object({
    state: sallaObservedState, providerStatus: z.string().regex(/^[a-z_]{1,40}$/),
    firstObservedAt: z.string().datetime(),
  }).strict()).max(6),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.observations.map(o => o.state)).size !== value.observations.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate observed state' });
  }
});
export type SallaObservationsRequest = z.infer<typeof sallaObservationsInput>;
