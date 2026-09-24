import { z } from 'zod';

export const checkoutDiscountReleaseSchema=z.object({
  orderId:z.number().int().positive().safe(),evidence:z.string().regex(/^[0-9a-f]{64}$/),
  reason:z.string().trim().min(10).max(500),reviewed:z.literal(true),
}).strict();
export const discountReleaseBlockers=['legacy','order','identity','payment','coupon','counter'] as const;
export type DiscountReleaseBlocker=typeof discountReleaseBlockers[number];
export type CheckoutDiscountReleaseInput=z.infer<typeof checkoutDiscountReleaseSchema>;
