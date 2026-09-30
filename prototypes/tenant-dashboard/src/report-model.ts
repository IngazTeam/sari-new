import {
  reportWorkspaceInput,
  reportSnapshotSchema,
  reportWindow,
  type ReportSelection,
  type ReportSnapshot,
} from "../../../shared/report-workspace";
export const reportPreviewScope = "9000071:9000071:reports";
export const reportModes = {
  data: "بيانات مكتملة الوحدات",
  empty: "لا توجد سجلات",
  loading: "تحميل",
  error: "فشل القراءة",
  offline: "الاتصال موقوف",
  forbidden: "دون صلاحية",
  session: "الجلسة منتهية",
  wrongTenant: "لقطة لتيننت مختلف",
  wrongPeriod: "لقطة لفترة مختلفة",
  wrongCurrency: "لقطة بعملة مختلفة",
  legacy: "بنود بوحدة قديمة مجهولة",
  partial: "عينة ناقصة ومبالغ مستبعدة",
  noBase: "دون فترة أساس",
  long: "نصوص طويلة",
  exportError: "فشل تجهيز Excel",
  exportSlow: "تجهيز Excel مؤجل",
} as const;
export type ReportMode = keyof typeof reportModes;
export function reportFixture(
  raw: ReportSelection,
  mode: ReportMode = "data",
  now = new Date("2026-09-30T12:00:00.000Z")
): ReportSnapshot {
  const s = reportWorkspaceInput.parse(raw),
    w = reportWindow(s.period, now),
    factor = { day: 1, week: 2, month: 4, year: 6 }[s.period];
  const base = {
    merchantId: mode === "wrongTenant" ? 9000072 : 9000071,
    period:
      mode === "wrongPeriod" ? (s.period === "day" ? "week" : "day") : s.period,
    from: w.from,
    through: w.through,
    timeZone: "UTC",
  } as const;
  const empty = mode === "empty",
    partial = mode === "partial",
    legacy = mode === "legacy",
    currency =
      mode === "wrongCurrency"
        ? s.currency === "SAR"
          ? "USD"
          : "SAR"
        : s.currency;
  if (s.kind === "sales") {
    const total = empty ? 0 : partial ? 300 : factor * 2,
      valid = partial ? 299 : total,
      value = valid * (s.currency === "SAR" ? 12500 : 2500),
      previous = empty || mode === "noBase" ? 0 : 5000 * factor;
    const name =
      mode === "long" ? "منتج توضيحي_".repeat(65) : "حزمة بداية · منتج توضيحي";
    return reportSnapshotSchema.parse({
      ...base,
      kind: "sales",
      currency,
      previousFrom: w.previousFrom,
      previousThrough: w.previousThrough,
      totalOrders: total,
      validAmountOrders: valid,
      excludedAmounts: total - valid,
      totalRevenue: value,
      markedPaidMinor: Math.floor(value / 2),
      averageOrderValue: valid ? Math.round(value / valid) : null,
      totalConversations: total * 2,
      conversionRate: empty ? null : 50,
      previousRevenue: previous,
      previousExcludedAmounts: partial ? 1 : 0,
      growth: previous
        ? Math.round(((value - previous) / previous) * 10000) / 100
        : null,
      growthAvailable: previous > 0,
      productSample: {
        inspectedOrders: Math.min(total, 250),
        eligibleOrders: total,
        excludedOrders: legacy ? total : partial ? 3 : 0,
        includedItems: empty || legacy ? 0 : partial ? 247 : total,
        excludedItems: legacy ? total : partial ? 3 : 0,
        omittedOrders: Math.max(0, total - 250),
        orderLimit: 250,
      },
      topProducts:
        empty || legacy
          ? []
          : [
              {
                name,
                quantity: partial ? 247 : total,
                revenue:
                  (partial ? 247 : total) *
                  (s.currency === "SAR" ? 12500 : 2500),
              },
            ],
    });
  }
  if (s.kind === "customers")
    return reportSnapshotSchema.parse({
      ...base,
      kind: "customers",
      totalCustomers: empty ? 0 : 10 * factor,
      newCustomers: empty ? 0 : 4 * factor,
      activeCustomers: empty ? 0 : 6 * factor,
      unknownPhoneConversations: partial ? 3 : 0,
      retentionRate: empty ? null : 60,
      topCustomers: empty
        ? []
        : Array.from({ length: 5 }, (_, i) => ({
            conversationId: 7100 + i,
            customerPhone: i === 0 ? "0500000071" : `+120255507${i}1`,
            customerName:
              mode === "long" && i === 0
                ? "اسم عميل طويل_".repeat(45)
                : `عميل توضيحي ${i + 1}`,
            purchaseCount: 10 - i,
            totalSpent: i === 0 ? null : (5 - i) * 1000,
          })),
    });
  return reportSnapshotSchema.parse({
    ...base,
    kind: "conversations",
    totalConversations: empty ? 0 : 10 * factor,
    withPurchase: empty ? 0 : factor,
    invalidPurchaseCounters: partial ? 2 : 0,
    conversionRate: empty ? null : 10,
    averageResponseTime: null,
    satisfactionRate: null,
    responseTimeAvailable: false,
    satisfactionAvailable: false,
    topicsAvailable: false,
    topTopics: [],
  });
}
