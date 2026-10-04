import { usageWorkspaceSchema } from "@shared/usage-workspace";
export const usageViews = ["subscription", "resources", "history"] as const;
export type UsageView = (typeof usageViews)[number];
export function scopedUsage(
  value: unknown,
  actorId: number,
  merchantId: number
) {
  const parsed = usageWorkspaceSchema.safeParse(value);
  return parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId
    ? parsed.data
    : null;
}
export const usageLabels = (
  t: (key: string) => string
): Record<string, string> => ({
  eyebrow: t("usageWorkspaceUx.eyebrow"),
  title: t("usageWorkspaceUx.title"),
  intro: t("usageWorkspaceUx.intro"),
  refresh: t("usageWorkspaceUx.refresh"),
  subscription: t("usageWorkspaceUx.subscription"),
  resources: t("usageWorkspaceUx.resources"),
  history: t("usageWorkspaceUx.history"),
  checkedAt: t("usageWorkspaceUx.checkedAt"),
  sourceNotice: t("usageWorkspaceUx.sourceNotice"),
  unknown: t("usageWorkspaceUx.unknown"),
  unlimited: t("usageWorkspaceUx.unlimited"),
  used: t("usageWorkspaceUx.used"),
  limit: t("usageWorkspaceUx.limit"),
  remaining: t("usageWorkspaceUx.remaining"),
  noAllowance: t("usageWorkspaceUx.noAllowance"),
  reached: t("usageWorkspaceUx.reached"),
  unknownLimit: t("usageWorkspaceUx.unknownLimit"),
  unknownCount: t("usageWorkspaceUx.unknownCount"),
  conversations: t("usageWorkspaceUx.conversations"),
  messages: t("usageWorkspaceUx.messages"),
  voiceMessages: t("usageWorkspaceUx.voiceMessages"),
  customers: t("usageWorkspaceUx.customers"),
  whatsappNumbers: t("usageWorkspaceUx.whatsappNumbers"),
  products: t("usageWorkspaceUx.products"),
  quotaHint: t("usageWorkspaceUx.quotaHint"),
  resourceHint: t("usageWorkspaceUx.resourceHint"),
  customerHint: t("usageWorkspaceUx.customerHint"),
  whatsappHint: t("usageWorkspaceUx.whatsappHint"),
  productHint: t("usageWorkspaceUx.productHint"),
  activityHint: t("usageWorkspaceUx.activityHint"),
  campaigns: t("usageWorkspaceUx.campaigns"),
  outgoingMessages: t("usageWorkspaceUx.outgoingMessages"),
  month: t("usageWorkspaceUx.month"),
  from: t("usageWorkspaceUx.from"),
  to: t("usageWorkspaceUx.to"),
  start: t("usageWorkspaceUx.start"),
  end: t("usageWorkspaceUx.end"),
  reset: t("usageWorkspaceUx.reset"),
  resetHint: t("usageWorkspaceUx.resetHint"),
  plan: t("usageWorkspaceUx.plan"),
  basePlan: t("usageWorkspaceUx.basePlan"),
  trialLimits: t("usageWorkspaceUx.trialLimits"),
  noPlan: t("usageWorkspaceUx.noPlan"),
  none: t("usageWorkspaceUx.none"),
  active: t("usageWorkspaceUx.active"),
  trial: t("usageWorkspaceUx.trial"),
  expired: t("usageWorkspaceUx.expired"),
  ambiguous: t("usageWorkspaceUx.ambiguous"),
  unknownState: t("usageWorkspaceUx.unknownState"),
  ambiguousHint: t("usageWorkspaceUx.ambiguousHint"),
  noneHint: t("usageWorkspaceUx.noneHint"),
  expiredHint: t("usageWorkspaceUx.expiredHint"),
  unknownHint: t("usageWorkspaceUx.unknownHint"),
  plans: t("usageWorkspaceUx.plans"),
  compare: t("usageWorkspaceUx.compare"),
  details: t("usageWorkspaceUx.details"),
  historyHint: t("usageWorkspaceUx.historyHint"),
  historyEmpty: t("usageWorkspaceUx.historyEmpty"),
  currentMonth: t("usageWorkspaceUx.currentMonth"),
  countOnly: t("usageWorkspaceUx.countOnly"),
  zeroHint: t("usageWorkspaceUx.zeroHint"),
  readFailed: t("usageWorkspaceUx.readFailed"),
  invalidView: t("usageWorkspaceUx.invalidView"),
  resetView: t("usageWorkspaceUx.resetView"),
  billingCycle: t("usageWorkspaceUx.billingCycle"),
  monthly: t("usageWorkspaceUx.monthly"),
  yearly: t("usageWorkspaceUx.yearly"),
  percentUsed: t("usageWorkspaceUx.percentUsed"),
  nearLimit: t("usageWorkspaceUx.nearLimit"),
  notSalesScore: t("usageWorkspaceUx.notSalesScore"),
});

export const usageQueryOptions = {
  retry: false,
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: false,
};
