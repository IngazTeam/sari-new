import { z } from 'zod';
const id = z.number().int().positive().max(2147483647);
export const checkoutAttemptLookup = z.object({ checkoutAttemptId: z.string().uuid() }).strict();
export function recordedTapCheckoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') &&
    (u.hostname === 'tap.company' || u.hostname.endsWith('.tap.company')) ? u.href : null; } catch { return null; }
}
export const checkoutAttemptSchema = z.object({
  actorId: id, merchantId: id, checkoutAttemptId: z.string().uuid(), checkedAt: z.string().datetime(),
  found: z.boolean(), transactionId: id.nullable(),
  state: z.enum(['not_found', 'pending', 'completed', 'failed', 'refunded', 'unknown']),
  planId: id.nullable(), billingCycle: z.enum(['monthly', 'yearly']).nullable(),
  amountMinor: z.number().int().nonnegative().max(100_000_000).nullable(), currency: z.enum(['SAR', 'USD']).nullable(),
  recordedCheckoutUrl: z.string().nullable(), linkExpiresAt: z.string().datetime().nullable(),
}).strict().superRefine((v, ctx) => {
  if ((!v.found && (v.state !== 'not_found' || v.transactionId !== null || v.planId !== null || v.billingCycle !== null || v.amountMinor !== null || v.currency !== null || v.recordedCheckoutUrl !== null || v.linkExpiresAt !== null)) ||
      (v.found && (v.transactionId === null || v.state === 'not_found')) ||
      (v.currency === null && v.amountMinor !== null) ||
      (v.recordedCheckoutUrl !== null && (v.state !== 'pending' || recordedTapCheckoutUrl(v.recordedCheckoutUrl) !== v.recordedCheckoutUrl || v.linkExpiresAt === null || Date.parse(v.linkExpiresAt) <= Date.parse(v.checkedAt))))
    ctx.addIssue({ code: 'custom', message: 'Inconsistent checkout attempt' });
});
export type CheckoutAttempt = z.infer<typeof checkoutAttemptSchema>;
