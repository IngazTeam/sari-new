import {
  reportSnapshotSchema,
  type ReportSnapshot,
} from "@shared/report-workspace";
import type { ReportDocument } from "./report-export";

export type MerchantReportDocument = ReportDocument & {
  empty: boolean;
  tableEmptyText: string;
};
export function merchantReportDocument(
  raw: ReportSnapshot,
  t: (key: string, values?: Record<string, unknown>) => string,
  language: string
): MerchantReportDocument {
  const d = reportSnapshotSchema.parse(raw);
  const n = (v: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(v);
  const unavailable = t("reportWorkspaceUx.unmeasured");
  const percent = (v: number | null) => (v === null ? unavailable : `${n(v)}%`);
  const money = (v: number | null) =>
    v === null
      ? unavailable
      : new Intl.NumberFormat(language, {
          style: "currency",
          currency: d.kind === "sales" ? d.currency : "SAR",
        }).format(v / 100);
  const date = (v: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "medium",
      calendar: "gregory",
      timeZone: "UTC",
    }).format(new Date(v));
  const row = (label: string, value: string | number) => ({ label, value });
  const common = {
    period: `${date(d.from)} — ${date(d.through)} · UTC`,
    tableEmptyText: t("reportWorkspaceUx.noRows"),
  };
  if (d.kind === "sales")
    return {
      ...common,
      title: t("reportWorkspaceUx.sales"),
      note: t("reportWorkspaceUx.salesNote", { currency: d.currency }),
      empty: d.totalOrders === 0,
      warning:
        d.excludedAmounts ||
        d.previousExcludedAmounts ||
        d.productSample.excludedOrders ||
        d.productSample.omittedOrders
          ? t("reportWorkspaceUx.limited")
          : undefined,
      metrics: [
        row(t("reportWorkspaceUx.revenue"), money(d.totalRevenue)),
        row(t("reportWorkspaceUx.orders"), n(d.totalOrders)),
        row(t("reportWorkspaceUx.average"), money(d.averageOrderValue)),
        row(
          t("reportWorkspaceUx.growth"),
          d.growthAvailable
            ? percent(d.growth)
            : t("reportWorkspaceUx.unavailable")
        ),
      ],
      details: [
        row(t("reportWorkspaceUx.markedPaid"), money(d.markedPaidMinor)),
        row(
          t("reportWorkspaceUx.amountSample"),
          `${n(d.validAmountOrders)} / ${n(d.totalOrders)}`
        ),
        row(t("reportWorkspaceUx.totalConversations"), n(d.totalConversations)),
        row(t("reportWorkspaceUx.orderRatio"), percent(d.conversionRate)),
        row(
          t("reportWorkspaceUx.previousPeriod"),
          `${date(d.previousFrom)} — ${date(d.previousThrough)} · UTC`
        ),
        row(t("reportWorkspaceUx.previousValue"), money(d.previousRevenue)),
        row(
          t("reportWorkspaceUx.evidence"),
          t("reportWorkspaceUx.salesEvidence", {
            ...d.productSample,
            excludedAmounts: d.excludedAmounts,
            previousExcludedAmounts: d.previousExcludedAmounts,
          })
        ),
      ],
      tableTitle: t("reportWorkspaceUx.topProducts"),
      tableNote: t("reportWorkspaceUx.productSample", { ...d.productSample }),
      columns: [
        t("reportWorkspaceUx.product"),
        t("reportWorkspaceUx.quantity"),
        t("reportWorkspaceUx.itemValue"),
      ],
      rows: d.topProducts.map(p => [p.name, n(p.quantity), money(p.revenue)]),
      tableEmptyText:
        d.productSample.eligibleOrders && !d.topProducts.length
          ? t("reportWorkspaceUx.noUsableItems")
          : common.tableEmptyText,
    };
  if (d.kind === "customers")
    return {
      ...common,
      title: t("reportWorkspaceUx.customers"),
      note: t("reportWorkspaceUx.customersNote"),
      empty: d.totalCustomers === 0 && d.unknownPhoneConversations === 0,
      metrics: [
        row(t("reportWorkspaceUx.totalCustomers"), n(d.totalCustomers)),
        row(t("reportWorkspaceUx.newCustomers"), n(d.newCustomers)),
        row(t("reportWorkspaceUx.activeCustomers"), n(d.activeCustomers)),
        row(t("reportWorkspaceUx.activeRatio"), percent(d.retentionRate)),
      ],
      details: [
        row(
          t("reportWorkspaceUx.evidence"),
          t("reportWorkspaceUx.customerEvidence", {
            count: d.unknownPhoneConversations,
          })
        ),
      ],
      tableTitle: t("reportWorkspaceUx.topCustomers"),
      tableNote: t("reportWorkspaceUx.customerTableNote"),
      columns: [
        t("reportWorkspaceUx.conversationId"),
        t("reportWorkspaceUx.customer"),
        t("reportWorkspaceUx.phone"),
        t("reportWorkspaceUx.purchases"),
        t("reportWorkspaceUx.recordedSpend"),
      ],
      rows: d.topCustomers.map(c => [
        String(c.conversationId),
        c.customerName || t("reportWorkspaceUx.unnamed"),
        c.customerPhone,
        n(c.purchaseCount),
        c.totalSpent === null ? unavailable : n(c.totalSpent),
      ]),
    };
  return {
    ...common,
    title: t("reportWorkspaceUx.conversations"),
    note: t("reportWorkspaceUx.conversationsNote"),
    empty: d.totalConversations === 0,
    metrics: [
      row(t("reportWorkspaceUx.totalConversations"), n(d.totalConversations)),
      row(t("reportWorkspaceUx.withPurchase"), n(d.withPurchase)),
      row(t("reportWorkspaceUx.purchaseRatio"), percent(d.conversionRate)),
    ],
    details: [
      row(t("reportWorkspaceUx.responseTime"), unavailable),
      row(t("reportWorkspaceUx.satisfaction"), unavailable),
      row(
        t("reportWorkspaceUx.evidence"),
        t("reportWorkspaceUx.conversationEvidence", {
          count: d.invalidPurchaseCounters,
        })
      ),
    ],
    tableTitle: t("reportWorkspaceUx.topTopics"),
    columns: [t("reportWorkspaceUx.topic")],
    rows: [],
    tableEmptyText: t("reportWorkspaceUx.topicsUnavailable"),
  };
}
