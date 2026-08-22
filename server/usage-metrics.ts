export type UsageMetric = {
  current: number;
  max: number;
  percentage: number;
};

const UNLIMITED_QUOTA = 999_999;

export function buildUsageMetric(
  currentValue: number,
  configuredLimit: number | null | undefined,
  fallbackLimit: number,
): UsageMetric {
  const current = Number.isFinite(currentValue) ? Math.max(0, Math.trunc(currentValue)) : 0;
  const rawLimit = Number(configuredLimit);

  if (rawLimit === -1 || rawLimit >= UNLIMITED_QUOTA) {
    return { current, max: UNLIMITED_QUOTA, percentage: 0 };
  }

  const max = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.trunc(rawLimit)
    : Math.max(1, Math.trunc(fallbackLimit));

  return {
    current,
    max,
    percentage: Math.min(100, (current / max) * 100),
  };
}
