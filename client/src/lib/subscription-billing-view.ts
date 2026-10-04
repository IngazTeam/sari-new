import {
  billingHistorySchema,
  subscriptionBillingSchema,
  type BillingHistoryInput,
} from "@shared/subscription-billing-workspace";
export function scopedBilling(
  value: unknown,
  actorId: number,
  merchantId: number
) {
  const parsed = subscriptionBillingSchema.safeParse(value);
  return parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId
    ? parsed.data
    : null;
}
export function scopedBillingHistory(
  value: unknown,
  actorId: number,
  merchantId: number,
  input: BillingHistoryInput
) {
  const parsed = billingHistorySchema.safeParse(value);
  return parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId &&
    parsed.data.input.beforeId === input.beforeId &&
    parsed.data.input.pageSize === input.pageSize &&
    parsed.data.input.status === input.status &&
    parsed.data.input.type === input.type
    ? parsed.data
    : null;
}
export const subscriptionReviewIdentity = (
  v: NonNullable<ReturnType<typeof scopedBilling>>["subscription"]
) =>
  v
    ? JSON.stringify([
        v.id,
        v.planId,
        v.recordedStatus,
        v.billingCycle,
        v.startDate,
        v.endDate,
      ])
    : null;
