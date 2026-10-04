import { z } from "zod";
import type { SubscriptionBillingWorkspace } from "./subscription-billing-workspace";
const id = z.number().int().positive().max(2147483647);
export const cancellationSnapshot = z
  .object({
    id,
    planId: id.nullable(),
    status: z.enum(["active", "trial"]),
    billingCycle: z.enum(["monthly", "yearly"]),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
  })
  .strict()
  .refine(
    v => Date.parse(v.endDate) > Date.parse(v.startDate),
    "Invalid subscription period"
  );
export const subscriptionCancellationInput = z
  .object({
    expected: cancellationSnapshot,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type SubscriptionCancellationInput = z.infer<
  typeof subscriptionCancellationInput
>;
export function cancellationReview(
  subscription: SubscriptionBillingWorkspace["subscription"]
) {
  if (!subscription) return null;
  const parsed = cancellationSnapshot.safeParse({
    id: subscription.id,
    planId: subscription.planId,
    status: subscription.recordedStatus,
    billingCycle: subscription.billingCycle,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
  });
  return parsed.success ? parsed.data : null;
}
export function sameCancellationSnapshot(
  a: z.infer<typeof cancellationSnapshot>,
  b: z.infer<typeof cancellationSnapshot>
) {
  return (
    a.id === b.id &&
    a.planId === b.planId &&
    a.status === b.status &&
    a.billingCycle === b.billingCycle &&
    Date.parse(a.startDate) === Date.parse(b.startDate) &&
    Date.parse(a.endDate) === Date.parse(b.endDate)
  );
}
