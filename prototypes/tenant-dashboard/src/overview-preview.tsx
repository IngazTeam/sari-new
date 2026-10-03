import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewReport } from "../../../client/src/components/merchant/OverviewReport";
import { overviewCsv } from "../../../client/src/lib/overview-export";
import { overviewWorkspaceFixture } from "../../../server/tests/helpers/overview-workspace-fixture";
import { messageWindow } from "../../../shared/message-workspace";
import type { OverviewSnapshot } from "../../../shared/overview-workspace";
import "./overview-preview.css";
declare const OVERVIEW_PREVIEW_COPY: Record<string, string>;
declare global {
  interface Window {
    render: () => void;
    toast: (message: string) => void;
  }
}
const t = (key: string) => OVERVIEW_PREVIEW_COPY[key.split(".").at(-1)!] ?? key;
const e = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
let period: OverviewSnapshot["period"] = "30d",
  mode = "normal",
  pending = false,
  version = 0;
const current = () => location.hash === "#/page/merchant/overview-analytics";
export const handles = (p: { route: string }) =>
  p?.route === "/merchant/overview-analytics";
export function snapshot() {
  const d = overviewWorkspaceFixture(),
    k = period === "7d" ? 1 : period === "30d" ? 2 : 3,
    window = messageWindow(period, new Date("2026-09-30T10:00:00Z"));
  d.period = period;
  d.from = window.from;
  d.through = window.through;
  d.orders.total *= k;
  d.orders.statuses.forEach(r => (r.count *= k));
  d.orders.payments.forEach(r => (r.count *= k));
  d.orders.values.forEach(r => {
    r.count *= k;
    r.totalMinor *= k;
    r.markedPaidCount *= k;
    r.markedPaidMinor *= k;
    r.excludedAmounts *= k;
  });
  d.reviews.total *= k;
  d.reviews.valid *= k;
  d.reviews.invalid *= k;
  d.reviews.unlinked *= k;
  d.reviews.distribution.forEach(r => (r.count *= k));
  for (const key of [
    "total",
    "markedRecovered",
    "other",
    "invalidFlags",
  ] as const)
    d.carts[key] *= k;
  for (const key of [
    "total",
    "markedCompleted",
    "pending",
    "invalidFlags",
  ] as const)
    d.referrals[key] *= k;
  d.association.total *= k;
  d.association.positive *= k;
  if (mode === "empty") {
    d.orders.total = 0;
    d.orders.statuses.forEach(r => (r.count = 0));
    d.orders.payments.forEach(r => (r.count = 0));
    d.orders.values.forEach(r =>
      Object.assign(r, {
        count: 0,
        totalMinor: 0,
        averageMinor: null,
        markedPaidCount: 0,
        markedPaidMinor: 0,
        excludedAmounts: 0,
      })
    );
    Object.assign(d.reviews, { total: 0, valid: 0, invalid: 0, unlinked: 0, average: null });
    d.reviews.distribution.forEach(r =>
      Object.assign(r, { count: 0, share: null })
    );
    Object.assign(d.carts, {
      total: 0,
      markedRecovered: 0,
      other: 0,
      invalidFlags: 0,
      share: null,
    });
    Object.assign(d.referrals, {
      total: 0,
      markedCompleted: 0,
      pending: 0,
      invalidFlags: 0,
      share: null,
    });
    Object.assign(d.association, { total: 0, positive: 0, ratio: null });
  }
  return d;
}
const modes = {
  normal: "بيانات توضيحية",
  empty: "فترة بلا سجلات",
  loading: "جارٍ التحميل",
  error: "فشل القراءة",
  offline: "انقطاع الاتصال",
  forbidden: "دون صلاحية",
  "export-failure": "فشل التصدير",
};
const button = (label: string, action: string, disabled = false) =>
  `<button type="button" class="button" data-ov-action="${action}" ${disabled ? "disabled" : ""}>${e(label)}</button>`;
const canExport = () =>
  !pending && ["normal", "empty", "export-failure"].includes(mode);
export function render() {
  const toolbar = `<div class="ov-tools"><label for="ov-period">${e(t("period"))}<select id="ov-period">${["7d", "30d", "90d"].map(v => `<option value="${v}" ${period === v ? "selected" : ""}>${e(t("days" + v.slice(0, -1)))}</option>`).join("")}</select></label><label for="ov-mode">حالة المثال<select id="ov-mode">${Object.entries(
    modes
  )
    .map(
      ([v, label]) =>
        `<option value="${v}" ${mode === v ? "selected" : ""}>${e(label)}</option>`
    )
    .join(
      ""
    )}</select></label>${button(t("export"), "export", !canExport())}</div>`;
  let body = "";
  if (pending || mode === "loading")
    body =
      '<section class="ov-panel" aria-busy="true"><h2>نجهز اللقطة</h2><p role="status">جارٍ تحميل البيانات التوضيحية…</p>' +
      button("استعادة المثال", "recover") +
      "</section>";
  else if (["error", "offline", "forbidden"].includes(mode))
    body = `<section class="ov-panel" role="alert"><h2>${mode === "forbidden" ? "تحتاج صلاحية لهذا القسم" : mode === "offline" ? "تعذّر الاتصال" : "تعذّر عرض البيانات"}</h2><p>هذه محاكاة محلية؛ لا نعرض أصفارًا بدل المصدر غير المتاح.</p>${button("استعادة المثال", "recover")}</section>`;
  else {
    const d = snapshot();
    body =
      `<div class="ov-period"><p>${e(t("from"))}: <time datetime="${d.from}">${e(d.from)}</time> · ${e(t("through"))}: <time datetime="${d.through}">${e(d.through)}</time> UTC</p><p>${e(t("periodNote"))}</p></div>` +
      renderToStaticMarkup(
        <OverviewReport data={d} t={t} href={path => "#/page" + path} />
      ) +
      `<p class="ov-note">${e(t("snapshotNote"))}</p>`;
  }
  return `<div class="ov-workspace ov-preview" dir="rtl">${toolbar}${body}</div>`;
}
export const primaryLabel = () => t("refresh");
export const canPrimary = () => !pending;
export async function primary() {
  if (pending) return;
  pending = true;
  const token = ++version;
  window.render();
  await new Promise(r => setTimeout(r, 180));
  if (token !== version || !current()) return;
  pending = false;
  if (["error", "offline", "forbidden"].includes(mode)) {
    window.render();
    window.toast(t("refreshFailed"));
    return;
  }
  if (mode === "loading") mode = "normal";
  window.render();
  window.toast("تم تحديث المثال المحلي");
}
function exportFile() {
  if (!canExport()) return;
  try {
    if (mode === "export-failure") throw Error("Simulated failure");
    const csv = overviewCsv(snapshot(), t),
      blob = new Blob(
        [
          '\uFEFF"نموذج محلي — بيانات مصطنعة وليست نتائج متجر"\r\n' +
            csv.replace(/^\uFEFF/, ""),
        ],
        { type: "text/csv;charset=utf-8" }
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `sary-overview-preview-${period}.csv`;
    a.hidden = true;
    document.body.append(a);
    try {
      a.click();
    } finally {
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    window.toast(t("exportReady"));
  } catch {
    window.toast(t("exportFailed"));
  }
}
document.addEventListener("change", event => {
  const el = event.target as HTMLSelectElement;
  if (!["ov-period", "ov-mode"].includes(el.id)) return;
  version++;
  pending = false;
  if (el.id === "ov-period") period = el.value as typeof period;
  else mode = el.value;
  window.render();
  document.getElementById(el.id)?.focus();
});
document.addEventListener("click", event => {
  const el = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-ov-action]"
  );
  if (!el || el.disabled) return;
  if (el.dataset.ovAction === "export") exportFile();
  else if (el.dataset.ovAction === "recover") {
    mode = "normal";
    version++;
    pending = false;
    void primary();
  }
});
window.addEventListener("hashchange", () => {
  version++;
  pending = false;
});
