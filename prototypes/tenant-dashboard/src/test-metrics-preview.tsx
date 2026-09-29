import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TestMetricsReport } from "../../../client/src/components/merchant/TestMetricsReport";
import { testMetricsCsv } from "../../../client/src/lib/test-metrics-report";
import { testMetricsFixture } from "../../../server/tests/helpers/test-metrics-fixture";
import { testMetricsWindow } from "../../../shared/test-metrics-workspace";
import type { TestMetricsSnapshot } from "../../../shared/test-metrics-workspace";
import "./overview-preview.css";
declare const TEST_METRICS_PREVIEW_COPY: Record<string, Record<string, string>>;
declare global {
  interface Window {
    render: () => void;
    toast: (message: string) => void;
  }
}
const t = (s: string) => {
  const [group, key] = s.split(".");
  return key
    ? (TEST_METRICS_PREVIEW_COPY[group]?.[key] ?? s)
    : (TEST_METRICS_PREVIEW_COPY.testMetricsWorkspace[s] ??
        TEST_METRICS_PREVIEW_COPY.overviewWorkspace[s] ??
        s);
};
const e = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
let period: TestMetricsSnapshot["period"] = "day",
  mode = "normal",
  pending = false,
  version = 0;
const routes = ["/merchant/metrics-dashboard", "/merchant/try-sari-analytics"];
const current = () => routes.some(path => location.hash === "#/page" + path);
export const handles = (p: { route: string }) => routes.includes(p?.route);
export function snapshot() {
  const d = testMetricsFixture(),
    k = period === "day" ? 1 : period === "week" ? 2 : 3;
  const window = testMetricsWindow(period, new Date("2026-09-30T10:00:00Z"));
  d.period = period;
  d.from = window.from;
  d.through = window.through;
  for (const key of [
    "sessions",
    "messages",
    "replies",
    "dealRecords",
    "duplicateDeals",
    "invalidDeals",
    "invalidLatency",
  ] as const)
    d[key] *= k;
  for (const m of Object.values(d.metrics)) {
    m.sample *= k;
    if (m.denominator !== null) m.denominator *= k;
  }
  d.metrics.totalRevenue.value! *= k;
  for (const key of ["positive", "negative", "unrated"] as const)
    d.feedback[key] *= k;
  d.longSessions.count *= k;
  d.longSessions.total *= k;
  if (mode === "empty") {
    for (const key of [
      "sessions",
      "messages",
      "replies",
      "dealRecords",
      "duplicateDeals",
      "invalidDeals",
      "invalidLatency",
    ] as const)
      d[key] = 0;
    for (const m of Object.values(d.metrics)) {
      m.sample = 0;
      if (m.denominator !== null) m.denominator = 0;
      m.value = null;
    }
    d.metrics.totalRevenue.value = 0;
    Object.assign(d.feedback, {
      positive: 0,
      negative: 0,
      unrated: 0,
      positiveShare: null,
    });
    Object.assign(d.longSessions, { count: 0, total: 0, share: null });
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
  `<button type="button" class="button" data-tm-action="${action}" ${disabled ? "disabled" : ""}>${e(label)}</button>`;
const canExport = () =>
  !pending && ["normal", "empty", "export-failure"].includes(mode);
export function render() {
  const toolbar = `<div class="ov-tools tm-tools"><label for="tm-period">${e(t("period"))}<select id="tm-period">${["day", "week", "month"].map(v => `<option value="${v}" ${period === v ? "selected" : ""}>${e(t(v))}</option>`).join("")}</select></label><label for="tm-mode">حالة المثال<select id="tm-mode">${Object.entries(
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
        <TestMetricsReport data={d} t={t} href={path => "#/page" + path} />
      ) +
      `<p class="ov-note">${e(t("exportNote"))}</p>`;
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
    const csv = testMetricsCsv(snapshot(), t),
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
    a.download = `sary-test-metrics-preview-${period}.csv`;
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
  if (!["tm-period", "tm-mode"].includes(el.id)) return;
  version++;
  pending = false;
  if (el.id === "tm-period") period = el.value as typeof period;
  else mode = el.value;
  window.render();
  document.getElementById(el.id)?.focus();
});
document.addEventListener("click", event => {
  const el = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-tm-action]"
  );
  if (!el || el.disabled) return;
  if (el.dataset.tmAction === "export") exportFile();
  else if (el.dataset.tmAction === "recover") {
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
