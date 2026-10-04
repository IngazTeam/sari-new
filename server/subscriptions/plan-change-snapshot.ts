import { subscriptionTimestamp } from '../../shared/subscription-usage';
export class SubscriptionPlanChangeConflictError extends Error {
  constructor() { super('SUBSCRIPTION_PLAN_CHANGE_CONFLICT'); }
}
const time = (value: unknown) => value instanceof Date && Number.isFinite(value.getTime()) ? value.getTime() : subscriptionTimestamp(value);
const id = (value: unknown) => value === null || Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
/** Compare reviewed billing fields under the subscription row lock, excluding usage counters. */
export function assertPlanChangeSnapshot(current: Record<string, unknown> | undefined, metadata: Record<string, unknown>, now: Date) {
  const start = time(metadata.previousStartDate), end = time(metadata.previousEndDate);
  if (!current || !id(metadata.previousPlanId) ||
      !['monthly', 'yearly'].includes(metadata.previousBillingCycle as string) ||
      !['active', 'trial'].includes(metadata.previousStatus as string) ||
      (metadata.previousStatus === 'active' && metadata.previousPlanId === null) ||
      start === null || end === null || start >= end || !Number.isFinite(now.getTime()) || now.getTime() < start || now.getTime() >= end ||
      current.plan_id !== metadata.previousPlanId || current.billing_cycle !== metadata.previousBillingCycle ||
      current.status !== metadata.previousStatus || time(current.start_date) !== start || time(current.end_date) !== end)
    throw new SubscriptionPlanChangeConflictError();
}
