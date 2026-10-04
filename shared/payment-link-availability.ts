export interface PaymentLinkState {
  isActive: number | boolean;
  status: string;
  expiresAt?: string | Date | null;
  maxUsageCount?: number | null;
  usageCount: number;
}
export type PaymentLinkAvailability =
  | { available: true }
  | {
      available: false;
      reason: "disabled" | "expired" | "exhausted" | "invalid";
    };

// MySQL timestamps have no zone in the returned string; this application's
// payment records use UTC. Reject impossible calendar dates instead of rolling
// them forward or interpreting the string in the browser/server local zone.
function expiryMillis(value: unknown): number | null {
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== "string") return null;
  const m =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value
    );
  if (!m || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4]) > 59)
    return null;
  const day = new Date(m[1] + "T00:00:00Z");
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== m[1]
  )
    return null;
  const time = Date.parse(value.replace(" ", "T") + (m[5] ? "" : "Z"));
  return Number.isFinite(time) ? time : null;
}
const count = (value: unknown) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 2147483647;
export function getPaymentLinkAvailability(
  link: PaymentLinkState,
  now = new Date()
): PaymentLinkAvailability {
  const invalid = { available: false, reason: "invalid" } as const;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return invalid;
  if (link.isActive === 0 || link.isActive === false)
    return { available: false, reason: "disabled" };
  if (link.isActive !== 1 && link.isActive !== true) return invalid;
  if (link.status === "disabled")
    return { available: false, reason: "disabled" };
  if (link.status === "completed")
    return { available: false, reason: "exhausted" };
  if (link.status === "expired") return { available: false, reason: "expired" };
  if (link.status !== "active") return invalid;
  if (
    !count(link.usageCount) ||
    (link.maxUsageCount != null &&
      (!count(link.maxUsageCount) || link.maxUsageCount < 1))
  )
    return invalid;
  if (link.expiresAt != null) {
    const expiry = expiryMillis(link.expiresAt);
    if (expiry === null) return invalid;
    if (expiry <= now.getTime()) return { available: false, reason: "expired" };
  }
  if (link.maxUsageCount != null && link.usageCount >= link.maxUsageCount)
    return { available: false, reason: "exhausted" };
  return { available: true };
}
