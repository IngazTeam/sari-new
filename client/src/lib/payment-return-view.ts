import {
  TAP_CHARGE_ID_PATTERN,
  PAYMENT_PROVIDER_REFERENCE_PATTERN,
} from "@shared/subscription-payment-status";
export type ReturnKind = "public" | "legacy" | "cancel";
export type ReturnSelection =
  | { kind: "invalid" | "missing" }
  | { kind: "tap"; reference: string }
  | { kind: "legacy"; reference: string; subscriptionId: number };
export function paymentReturnSelection(
  search: string,
  kind: ReturnKind
): ReturnSelection {
  const p = new URLSearchParams(search);
  if (
    ["tap_id", "token", "subscriptionId"].some(key => p.getAll(key).length > 1)
  )
    return { kind: "invalid" };
  const tap = p.get("tap_id"),
    token = p.get("token"),
    id = p.get("subscriptionId");
  if (tap === null && token === null && id === null) return { kind: "missing" };
  if (tap !== null && token !== null) return { kind: "invalid" };
  if (id !== null && kind !== "public") {
    const reference = tap ?? token;
    return /^[1-9]\d{0,9}$/.test(id) &&
      Number(id) <= 2147483647 &&
      reference &&
      PAYMENT_PROVIDER_REFERENCE_PATTERN.test(reference)
      ? { kind: "legacy", subscriptionId: Number(id), reference }
      : { kind: "invalid" };
  }
  return id === null && token === null && tap && TAP_CHARGE_ID_PATTERN.test(tap)
    ? { kind: "tap", reference: tap }
    : { kind: "invalid" };
}
export function paymentReturnStatus(
  value: unknown
): "processing" | "completed" | "failed" | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1
  )
    return null;
  const status = (value as { status?: unknown }).status;
  return status === "processing" ||
    status === "completed" ||
    status === "failed"
    ? status
    : null;
}
export const MAX_STATUS_POLLS = 30;
export const STATUS_POLL_WINDOW_MS = 60_000;
export function paymentReturnInterval(
  value: unknown,
  error: boolean,
  polls: number,
  elapsed: number
) {
  if (
    error ||
    polls >= MAX_STATUS_POLLS ||
    elapsed >= STATUS_POLL_WINDOW_MS ||
    !Number.isFinite(elapsed) ||
    elapsed < 0
  )
    return false;
  return value === undefined || paymentReturnStatus(value) === "processing"
    ? 2000
    : false;
}
export const paymentReturnLabels = (t: (key: string) => string) => ({
  eyebrow: t("paymentReturnUx.eyebrow"),
  checking: t("paymentReturnUx.checking"),
  checkingBody: t("paymentReturnUx.checkingBody"),
  completed: t("paymentReturnUx.completed"),
  completedBody: t("paymentReturnUx.completedBody"),
  failed: t("paymentReturnUx.failed"),
  failedBody: t("paymentReturnUx.failedBody"),
  pending: t("paymentReturnUx.pending"),
  pendingBody: t("paymentReturnUx.pendingBody"),
  unavailable: t("paymentReturnUx.unavailable"),
  unavailableBody: t("paymentReturnUx.unavailableBody"),
  invalid: t("paymentReturnUx.invalid"),
  invalidBody: t("paymentReturnUx.invalidBody"),
  interrupted: t("paymentReturnUx.interrupted"),
  interruptedBody: t("paymentReturnUx.interruptedBody"),
  refresh: t("paymentReturnUx.refresh"),
  subscription: t("paymentReturnUx.subscription"),
  history: t("paymentReturnUx.history"),
  dashboard: t("paymentReturnUx.dashboard"),
  source: t("paymentReturnUx.source"),
  noRepeat: t("paymentReturnUx.noRepeat"),
  autoCheck: t("paymentReturnUx.autoCheck"),
  signIn: t("paymentReturnUx.signIn"),
});
