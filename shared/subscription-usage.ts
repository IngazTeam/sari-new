/** The same limits used by quota enforcement for a trial without a plan. */
export const TRIAL_USAGE_LIMITS = {
  maxConversations: 100,
  maxMessages: -1,
  maxVoiceMessages: 20,
} as const;

type SubscriptionTerm = { status: string; endDate: string; trialEndsAt?: string | null };

export function subscriptionEndsAt(subscription: SubscriptionTerm): string | null {
  const end = new Date(subscription.endDate).getTime();
  const trialEnd = subscription.status === 'trial' && subscription.trialEndsAt ? new Date(subscription.trialEndsAt).getTime() : end;
  if (!Number.isFinite(end) || !Number.isFinite(trialEnd)) return null;
  return trialEnd < end ? subscription.trialEndsAt! : subscription.endDate;
}

export function subscriptionDaysRemaining(subscription: SubscriptionTerm, now = Date.now()) {
  const end = subscriptionEndsAt(subscription);
  return end ? Math.max(0, Math.ceil((new Date(end).getTime() - now) / 86_400_000)) : 0;
}

export function subscriptionQuota(used: number | null | undefined, limit: number | null | undefined) {
  const known = Number.isSafeInteger(used) && Number(used) >= 0 &&
    Number.isSafeInteger(limit) && Number(limit) >= -1;
  if (!known) return { known: false as const };
  const current = used as number, maximum = limit as number;
  return {
    known: true as const, used: current, limit: maximum, unlimited: maximum === -1,
    remaining: maximum === -1 ? null : Math.max(0, maximum - current),
    percentage: maximum === -1 ? null : maximum === 0 ? (current > 0 ? 100 : 0) : Math.min(100, current / maximum * 100),
  };
}

export function subscriptionPlanFeatures(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
  } catch { return [value]; }
}
