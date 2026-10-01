/** The same limits used by quota enforcement for a trial without a plan. */
export const TRIAL_USAGE_LIMITS = {
  maxConversations: 100,
  maxMessages: -1,
  maxVoiceMessages: 20,
} as const;

type SubscriptionTerm = { status: string; endDate: string; trialEndsAt?: string | null };

/** Database timestamps without an offset use the storage connection's UTC zone. */
export function subscriptionTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!parts) return null;
  const [, y, m, d, h = '00', min = '00', sec = '00', fraction = '', zone = 'Z'] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return null;
  const stamp = Date.parse(`${y}-${m}-${d}T${h}:${min}:${sec}${fraction.slice(0,4)}${zone}`);
  return Number.isFinite(stamp) ? stamp : null;
}

export function subscriptionEndsAt(subscription: SubscriptionTerm): string | null {
  const end = subscriptionTimestamp(subscription.endDate);
  const trialEnd = subscription.status === 'trial' && subscription.trialEndsAt ? subscriptionTimestamp(subscription.trialEndsAt) : end;
  if (end === null || trialEnd === null) return null;
  return trialEnd < end ? subscription.trialEndsAt! : subscription.endDate;
}

export function subscriptionDaysRemaining(subscription: SubscriptionTerm, now = Date.now()) {
  const end = subscriptionEndsAt(subscription);
  return end ? Math.max(0, Math.ceil((subscriptionTimestamp(end)! - now) / 86_400_000)) : 0;
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
