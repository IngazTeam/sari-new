import { z } from 'zod';

export const reconcileCheckoutSchema = z.object({
  orderId: z.number().int().positive().safe(),
  attemptId: z.string().uuid(),
  chargeId: z.string().trim().regex(/^chg_[A-Za-z0-9_-]{6,250}$/),
  evidence: z.string().regex(/^[0-9a-f]{64}$/),
  reviewed: z.literal(true),
}).strict();
export type ReconcileCheckoutInput = z.infer<typeof reconcileCheckoutSchema>;
