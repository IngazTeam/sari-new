import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PerformanceReport } from "../../../client/src/components/merchant/PerformanceReport";
import { performanceCsv } from "../../../client/src/lib/performance-report";
import { performanceFixture } from "../../../server/tests/helpers/performance-fixture";
import {
  performanceWindows,
  type PerformanceInput,
  type PerformancePeriod,
} from "../../../shared/performance-workspace";
import "./overview-preview.css";
declare const PERFORMANCE_PREVIEW_COPY: Record<string, string>;
const t = (key: string) =>
  PERFORMANCE_PREVIEW_COPY[key.replace(/^performanceWorkspace\./, "")] ?? key;
const e = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
const now = new Date("2026-09-30T10:00:00Z"),
  route = "/merchant/performance-metrics";
let applied: PerformanceInput = {
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  },
  draft = { ...applied },
  invalid = false,
  mode = "normal",
  pending = false,
  version = 0;
const current = () => location.hash === "#/page" + route;
export const handles = (p: { route: string }) => p?.route === route;
const dirty = () =>
  draft.startDate !== applied.startDate || draft.endDate !== applied.endDate;
const button = (label: string, action: string, disabled = false) =>
  `<button type="button" class="button" data-pp-action="${action}" ${disabled ? "disabled" : ""}>${e(label)}</button>`;
function adjust(p: PerformancePeriod, factor: number, empty = false) {
  for (const key of Object.keys(p.messages) as Array<keyof typeof p.messages>)
    p.messages[key] *= factor;
  for (const key of ["total", "delivered", "cancelled"] as const)
    p.orders[key] *= factor;
  for (const key of ["known", "repeated", "unknownPhoneOrders"] as const)
    p.orderPhones[key] *= factor;
  for (const key of ["total", "valid", "invalid", "unlinked", "positive"] as const)
    p.reviews[key] *= factor;
  for (const v of p.orders.values)
    for (const key of [
      "count",
      "totalMinor",
      "markedPaidMinor",
      "excludedAmounts",
    ] as const)
      v[key] *= factor;
  if (empty) {
    p.orders.deliveredShare = null;
    p.orderPhones.repeatShare = null;
    p.reviews.average = null;
    p.reviews.positiveShare = null;
  }
}
export function snapshot() {
  const d = performanceFixture(),
    w = performanceWindows(applied, now),
    factor = Math.max(1, Math.ceil(w.seconds / 864000));
  d.selection = { ...applied };
  d.secondsPerPeriod = w.seconds;
  d.partialCurrentDay = w.partialCurrentDay;
  d.current.from = w.current.from;
  d.current.through = w.current.through;
  d.previous.from = w.previous.from;
  d.previous.through = w.previous.through;
  adjust(d.current, mode === "empty" ? 0 : factor, mode === "empty");
  adjust(
    d.previous,
    mode === "empty" || mode === "no-previous" ? 0 : factor,
    mode === "empty" || mode === "no-previous"
  );
  return d;
}
const modes = {
  normal: "بيانات توضيحية",
  empty: "فترة بلا سجلات",
  "no-previous": "دون عينة سابقة",
  loading: "جارٍ التحميل",
  error: "فشل القراءة",
  offline: "انقطاع الاتصال",
  forbidden: "دون صلاحية",
  "export-failure": "فشل التصدير",
};
const canExport = () =>
  !pending &&
  !dirty() &&
  ["normal", "empty", "no-previous", "export-failure"].includes(mode);
export function render() {
  const toolbar = `<div class="ov-tools"><label for="pp-mode">حالة المثال<select id="pp-mode">${Object.entries(
    modes
  )
    .map(
      ([key, label]) =>
        `<option value="${key}" ${key === mode ? "selected" : ""}>${e(label)}</option>`
    )
    .join(
      ""
    )}</select></label>${button(t("export"), "export", !canExport())}</div>`;
  const range = `<section class="ov-panel" aria-label="${e(t("apply"))}"><form id="pp-range" class="pf-range" novalidate><label for="pp-start">${e(t("start"))}<input id="pp-start" type="date" max="2026-09-30" value="${e(draft.startDate)}" aria-invalid="${invalid}" ${invalid ? 'aria-describedby="pp-error"' : ""}></label><label for="pp-end">${e(t("end"))}<input id="pp-end" type="date" max="2026-09-30" value="${e(draft.endDate)}" aria-invalid="${invalid}" ${invalid ? 'aria-describedby="pp-error"' : ""}></label><button class="button" type="submit" ${!dirty() && !invalid ? "disabled" : ""}>${e(t("apply"))}</button></form>${invalid ? `<p role="alert" id="pp-error">${e(t("rangeError"))}</p>` : ""}${dirty() ? `<p role="status">${e(t("dirty"))}</p>` : ""}<div class="pf-presets">${[7, 30, 90].map(days => button(t("days" + days), "days-" + days)).join("")}</div></section>`;
  let body = "";
  if (pending || mode === "loading")
    body = `<section class="ov-panel" aria-busy="true"><h2>نجهز اللقطة</h2><p role="status">جارٍ تحميل البيانات التوضيحية…</p>${button("استعادة المثال", "recover")}</section>`;
  else if (["error", "offline", "forbidden"].includes(mode))
    body = `<section class="ov-panel" role="alert"><h2>${mode === "forbidden" ? "تحتاج صلاحية لهذا القسم" : mode === "offline" ? "تعذّر الاتصال" : "تعذّر عرض البيانات"}</h2><p>هذه محاكاة محلية؛ لا نعرض أصفارًا بدل المصدر غير المتاح.</p>${button("استعادة المثال", "recover")}</section>`;
  else
    body = renderToStaticMarkup(
      <PerformanceReport
        data={snapshot()}
        t={t}
        href={path => "#/page" + path}
      />
    );
  return `<div class="ov-workspace ov-preview pf-preview" dir="rtl"><p class="ov-note">التاريخ المرجعي للمثال 30 سبتمبر 2026؛ لا اتصال بخادم التاجر أو مزود خارجي.</p>${toolbar}${range}${body}</div>`;
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
function apply(range: PerformanceInput) {
  try {
    performanceWindows(range, now);
    applied = { ...range };
    draft = { ...range };
    invalid = false;
    version++;
    pending = false;
  } catch {
    invalid = true;
  }
  window.render();
}
function exportFile() {
  if (!canExport()) return;
  try {
    if (mode === "export-failure") throw Error("Simulated failure");
    const csv = performanceCsv(snapshot(), t),
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
    a.download = `sary-performance-preview-${applied.startDate}-${applied.endDate}.csv`;
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
  const el = event.target as HTMLInputElement;
  if (!["pp-start", "pp-end", "pp-mode"].includes(el.id)) return;
  if (el.id === "pp-mode") {
    mode = el.value;
    version++;
    pending = false;
  } else
    draft = {
      ...draft,
      [el.id === "pp-start" ? "startDate" : "endDate"]: el.value,
    };
  window.render();
  document.getElementById(el.id)?.focus();
});
document.addEventListener("submit", event => {
  if ((event.target as HTMLElement).id !== "pp-range") return;
  event.preventDefault();
  apply(draft);
});
document.addEventListener("click", event => {
  const el = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-pp-action]"
  );
  if (!el || el.disabled) return;
  const action = el.dataset.ppAction;
  if (action === "export") exportFile();
  else if (action === "recover") {
    mode = "normal";
    version++;
    pending = false;
    void primary();
  } else if (action?.startsWith("days-")) {
    const first = new Date(now);
    first.setUTCDate(first.getUTCDate() - Number(action.slice(5)) + 1);
    apply({
      startDate: first.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
    });
  }
});
window.addEventListener("hashchange", () => {
  version++;
  pending = false;
});
