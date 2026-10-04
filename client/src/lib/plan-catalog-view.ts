import { planCatalogWorkspaceSchema } from "@shared/plan-catalog-workspace";
import { checkoutReviewSchema } from "@shared/subscription-checkout-review";
export type PlanCycle = "monthly" | "yearly";
export function catalogSelection(search: string, checkout = false) {
  const p = new URLSearchParams(search),
    cycle = p.get("cycle") ?? "monthly",
    raw = p.get("planId");
  const q = p.get("q") ?? "";
  if (
    ["cycle", "q", "planId"].some(k => p.getAll(k).length > 1) ||
    !["monthly", "yearly"].includes(cycle) ||
    q.length > 100 ||
    (checkout &&
      (!raw || !/^[1-9]\d{0,9}$/.test(raw) || Number(raw) > 2147483647))
  )
    return null;
  return {
    cycle: cycle as PlanCycle,
    q,
    planId: checkout ? Number(raw) : null,
  };
}
export function scopedCatalog(
  value: unknown,
  actorId: number,
  merchantId: number
) {
  const p = planCatalogWorkspaceSchema.safeParse(value);
  return p.success &&
    p.data.actorId === actorId &&
    p.data.merchantId === merchantId
    ? p.data
    : null;
}
export function scopedCheckoutReview(
  value: unknown,
  actorId: number,
  merchantId: number,
  planId: number,
  cycle: PlanCycle
) {
  const p = checkoutReviewSchema.safeParse(value);
  return p.success &&
    p.data.actorId === actorId &&
    p.data.merchantId === merchantId &&
    p.data.planId === planId &&
    p.data.billingCycle === cycle
    ? p.data
    : null;
}
export function annualSaving(monthly: number | null, yearly: number | null) {
  return monthly !== null &&
    yearly !== null &&
    monthly > 0 &&
    yearly < monthly * 12
    ? monthly * 12 - yearly
    : null;
}
export function safeTapCheckoutUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      (u.hostname === "tap.company" || u.hostname.endsWith(".tap.company"))
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export const planLabels = (
  t: (key: string) => string
): Record<string, string> => ({
  subscriptionHistory: t("planCatalogUx.subscriptionHistory"),
  recoveryTitle: t("planCatalogUx.recoveryTitle"),
  recoveryEyebrow: t("planCatalogUx.recoveryEyebrow"),
  storageBlocked: t("planCatalogUx.storageBlocked"),
  recoveryUnavailable: t("planCatalogUx.recoveryUnavailable"),
  checkAttempt: t("planCatalogUx.checkAttempt"),
  attempt_not_found: t("planCatalogUx.attempt_not_found"),
  attempt_pending: t("planCatalogUx.attempt_pending"),
  attempt_completed: t("planCatalogUx.attempt_completed"),
  attempt_failed: t("planCatalogUx.attempt_failed"),
  attempt_refunded: t("planCatalogUx.attempt_refunded"),
  attempt_unknown: t("planCatalogUx.attempt_unknown"),
  recordedOnly: t("planCatalogUx.recordedOnly"),
  attemptMissingNote: t("planCatalogUx.attemptMissingNote"),
  recordedAmount: t("planCatalogUx.recordedAmount"),
  attemptTargetUnknown: t("planCatalogUx.attemptTargetUnknown"),
  noRecordedLink: t("planCatalogUx.noRecordedLink"),
  openAttempt: t("planCatalogUx.openAttempt"),
  retryAttempt: t("planCatalogUx.retryAttempt"),
  chooseAgain: t("planCatalogUx.chooseAgain"),
  returnAttempt: t("planCatalogUx.returnAttempt"),
  title: t("planCatalogUx.title"),
  compare: t("planCatalogUx.compare"),
  intro: t("planCatalogUx.intro"),
  compareIntro: t("planCatalogUx.compareIntro"),
  monthly: t("planCatalogUx.monthly"),
  yearly: t("planCatalogUx.yearly"),
  cycle: t("planCatalogUx.cycle"),
  search: t("planCatalogUx.search"),
  refresh: t("planCatalogUx.refresh"),
  unknown: t("planCatalogUx.unknown"),
  unlimited: t("planCatalogUx.unlimited"),
  customers: t("planCatalogUx.customers"),
  whatsappNumbers: t("planCatalogUx.whatsappNumbers"),
  conversations: t("planCatalogUx.conversations"),
  messages: t("planCatalogUx.messages"),
  voiceMessages: t("planCatalogUx.voiceMessages"),
  quotaNote: t("planCatalogUx.quotaNote"),
  choose: t("planCatalogUx.choose"),
  current: t("planCatalogUx.current"),
  annualTotal: t("planCatalogUx.annualTotal"),
  monthlyTotal: t("planCatalogUx.monthlyTotal"),
  saving: t("planCatalogUx.saving"),
  priceNote: t("planCatalogUx.priceNote"),
  invalid: t("planCatalogUx.invalid"),
  empty: t("planCatalogUx.empty"),
  noResults: t("planCatalogUx.noResults"),
  readonly: t("planCatalogUx.readonly"),
  checkedAt: t("planCatalogUx.checkedAt"),
  usage: t("planCatalogUx.usage"),
  badQuery: t("planCatalogUx.badQuery"),
  reset: t("planCatalogUx.reset"),
  features: t("planCatalogUx.features"),
  currentUnknown: t("planCatalogUx.currentUnknown"),
  currentNone: t("planCatalogUx.currentNone"),
  reviewTitle: t("planCatalogUx.reviewTitle"),
  reviewIntro: t("planCatalogUx.reviewIntro"),
  plan: t("planCatalogUx.plan"),
  price: t("planCatalogUx.price"),
  credit: t("planCatalogUx.credit"),
  due: t("planCatalogUx.due"),
  creditNote: t("planCatalogUx.creditNote"),
  expires: t("planCatalogUx.expires"),
  expired: t("planCatalogUx.expired"),
  acknowledge: t("planCatalogUx.acknowledge"),
  pay: t("planCatalogUx.pay"),
  apply: t("planCatalogUx.apply"),
  pending: t("planCatalogUx.pending"),
  failed: t("planCatalogUx.failed"),
  conflict: t("planCatalogUx.conflict"),
  history: t("planCatalogUx.history"),
  gatewayNote: t("planCatalogUx.gatewayNote"),
  terms: t("planCatalogUx.terms"),
  privacy: t("planCatalogUx.privacy"),
  completed: t("planCatalogUx.completed"),
  changePlan: t("planCatalogUx.changePlan"),
  limits: t("planCatalogUx.limits"),
});
