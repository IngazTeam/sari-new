import {
  paymentHistoryInput,
  paymentHistoryDetail,
  type PaymentHistoryDetail,
} from "@shared/payment-history-workspace";
export function readPaymentHistorySearch(search: string) {
  const p = new URLSearchParams(search);
  return paymentHistoryInput.safeParse({
    search: p.get("search") ?? "",
    status: p.get("status") ?? "all",
    from: p.get("from") || undefined,
    to: p.get("to") || undefined,
    page: p.has("page") ? Number(p.get("page")) : 1,
    pageSize: p.has("pageSize") ? Number(p.get("pageSize")) : 25,
  });
}
export function paymentHistorySearch(input: unknown) {
  const d = paymentHistoryInput.parse(input),
    p = new URLSearchParams();
  if (d.search) p.set("search", d.search);
  if (d.status !== "all") p.set("status", d.status);
  if (d.from) p.set("from", d.from);
  if (d.to) p.set("to", d.to);
  if (d.page > 1) p.set("page", String(d.page));
  if (d.pageSize !== 25) p.set("pageSize", String(d.pageSize));
  return p.toString() ? "?" + p.toString() : "";
}
export function paymentHistoryExport(snapshot: PaymentHistoryDetail) {
  const checked = paymentHistoryDetail.parse(snapshot);
  if (checked.state !== "found") throw Error("missing");
  return JSON.stringify(
    {
      source: checked.source,
      checkedAt: checked.checkedAt,
      payment: checked.payment,
    },
    null,
    2
  );
}
export function downloadPaymentHistory(snapshot: PaymentHistoryDetail) {
  const text = paymentHistoryExport(snapshot),
    url = URL.createObjectURL(
      new Blob([text], { type: "application/json;charset=utf-8" })
    );
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-${snapshot.payment!.id}.json`;
    document.body.append(a);
    try {
      a.click();
    } finally {
      a.remove();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export function paymentHistoryDate(
  value: string | null,
  locale: string,
  unavailable: string
) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value))
    : unavailable;
}
