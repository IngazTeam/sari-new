import type {
  QuotationDetail,
  QuotationStatus,
} from "@shared/quotation-workspace";
export function quotationDisplay(t: (key: string) => string, language: string) {
  const number = (v: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(v);
  return {
    number,
    money: (minor: number | null, currency: string) =>
      minor === null
        ? t("quotationWorkspace.unavailable")
        : `${new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} ${currency}`,
    date: (v: string | null) =>
      v && Number.isFinite(Date.parse(v))
        ? new Intl.DateTimeFormat(language, {
            dateStyle: "medium",
            calendar: "gregory",
            timeZone: "UTC",
          }).format(new Date(v))
        : t("quotationWorkspace.noDate"),
    statuses: {
      draft: t("quotationWorkspace.draft"),
      sent: t("quotationWorkspace.sent"),
      viewed: t("quotationWorkspace.viewed"),
      accepted: t("quotationWorkspace.accepted"),
      rejected: t("quotationWorkspace.rejected"),
      expired: t("quotationWorkspace.expired"),
      unknown: t("quotationWorkspace.unknown"),
    } satisfies Record<QuotationStatus, string>,
  };
}
/** Copies only the loaded saved fields. No implicit template or invented commercial terms. */
export function quotationPlainText(
  q: QuotationDetail,
  t: (key: string) => string,
  language: string
) {
  if (q.rawItems !== null || q.itemsTruncated)
    throw Error("Incomplete quotation");
  const d = quotationDisplay(t, language);
  return [
    `${t("quotationWorkspace.title")} · ${q.number}`,
    `${t("quotationWorkspace.customer")}: ${q.customerName || t("quotationWorkspace.unnamed")}`,
    ...(q.customerPhone ? [q.customerPhone] : []),
    `${t("quotationWorkspace.status")}: ${d.statuses[q.status]}`,
    `${t("quotationWorkspace.validUntil")}: ${d.date(q.validUntil)}`,
    ...q.items.map(
      (item, i) =>
        `${i + 1}. ${item.name}${item.description ? "\n" + item.description : ""}\n${t("quotationWorkspace.quantity")}: ${item.quantity === null ? "—" : d.number(item.quantity)} · ${t("quotationWorkspace.unitPrice")}: ${d.money(item.unitPriceMinor, q.currency)} · ${t("quotationWorkspace.lineTotal")}: ${d.money(item.totalMinor, q.currency)}`
    ),
    `${t("quotationWorkspace.subtotal")}: ${d.money(q.subtotalMinor, q.currency)}`,
    `${t("quotationWorkspace.tax")}${q.taxBasisPoints === null ? "" : ` (${d.number(q.taxBasisPoints / 100)}%)`}: ${d.money(q.taxMinor, q.currency)}`,
    `${t("quotationWorkspace.total")}: ${d.money(q.totalMinor, q.currency)}`,
    t("quotationWorkspace.copyNote"),
  ].join("\n\n");
}
