import { z } from 'zod';
const id = z.number().int().positive().max(2147483647);
export const checkoutReviewInput = z.object({ planId: id, billingCycle: z.enum(['monthly', 'yearly']) }).strict();
export const checkoutReviewProof = z.object({ reviewedAt: z.string().datetime(), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const checkoutReviewSchema = z.object({
  actorId: id, merchantId: id, planId: id, nameAr: z.string(), nameEn: z.string(),
  billingCycle: z.enum(['monthly', 'yearly']), mode: z.enum(['subscribe', 'upgrade']),
  subscriptionId: id.nullable(), currency: z.enum(['SAR', 'USD']),
  previous: z.object({ planId: id.nullable(), billingCycle: z.enum(['monthly', 'yearly']), status: z.enum(['active', 'trial']), startDate: z.string().datetime(), endDate: z.string().datetime() }).strict().nullable(),
  priceMinor: z.number().int().positive().max(100_000_000),
  creditMinor: z.number().int().nonnegative().max(100_000_000),
  chargeMinor: z.number().int().nonnegative().max(100_000_000),
  daysRemaining: z.number().int().nonnegative(),
  reviewedAt: z.string().datetime(), expiresAt: z.string().datetime(), token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((v, ctx) => {
  if (v.chargeMinor !== Math.max(0, v.priceMinor - v.creditMinor) ||
      (v.mode === 'subscribe' && (v.subscriptionId !== null || v.creditMinor !== 0)) ||
      (v.mode === 'upgrade' && v.subscriptionId === null) ||
      (v.mode === 'subscribe' ? v.previous !== null : v.previous === null) ||
      (v.previous?.status === 'active' && v.previous.planId === null) ||
      Date.parse(v.expiresAt) - Date.parse(v.reviewedAt) !== 300_000)
    ctx.addIssue({ code: 'custom', message: 'Inconsistent checkout review' });
});
export type CheckoutReview = z.infer<typeof checkoutReviewSchema>;
