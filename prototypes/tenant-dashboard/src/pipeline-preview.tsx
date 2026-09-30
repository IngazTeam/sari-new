import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PipelineReport } from "../../../client/src/components/merchant/PipelineReport";
import { pipelineFixture } from "../../../server/tests/helpers/pipeline-fixture";
import {
  pipelineInput,
  type PipelineInput,
} from "../../../shared/pipeline-workspace";
import "./overview-preview.css";
declare const PIPELINE_PREVIEW_COPY: Record<string, string>;
const t = (key: string) =>
  PIPELINE_PREVIEW_COPY[key.replace(/^pipelineWorkspace\./, "")] ?? key;
let selection: PipelineInput = { queue: "ready", page: 1, pageSize: 20 },
  mode = "normal",
  pending = false,
  version = 0;
const route = "/merchant/sales-pipeline",
  current = () => location.hash === "#/page" + route;
const e = (s: string) =>
  s.replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
export const handles = (p: { route: string }) => p?.route === route;
export const heading = () => t("title");
export const intro = () => t("subtitle");
export function linkedContact(phone: string) {
  const item = pipelineFixture({
    queue: "all",
    page: 1,
    pageSize: 50,
  }).list.items.find(r => r.customerPhone === phone);
  return item
    ? {
        id: 10000000 + item.id,
        name: item.customerName || t("unknownName"),
        ref: item.customerPhone,
        needs: item.id === 100,
        messages: [
          { text: item.preview || "رسالة توضيحية", me: false, time: "12:00" },
        ],
      }
    : null;
}
export function snapshot() {
  const d = pipelineFixture({ ...selection });
  if (mode === "empty") {
    d.total = 0;
    for (const stage of d.stages) stage.count = 0;
    for (const key of Object.keys(d.queues) as Array<keyof typeof d.queues>)
      d.queues[key] = 0;
    d.outcomes = {
      paid: 0,
      lost: 0,
      paidStageShare: null,
      currentWeekPaid: 0,
      previousWeekPaid: 0,
    };
    d.losses = [];
    for (const value of d.values) {
      value.count = 0;
      value.totalMinor = 0;
      value.excludedAmounts = 0;
    }
    d.list = {
      items: [],
      total: 0,
      page: 1,
      pageSize: selection.pageSize,
      totalPages: 0,
    };
  }
  return d;
}
const modes = {
  normal: "بيانات توضيحية",
  empty: "متجر بلا محادثات",
  loading: "جارٍ التحميل",
  error: "فشل القراءة",
  offline: "انقطاع الاتصال",
  forbidden: "دون صلاحية",
};
export function render() {
  const controls = `<div class="ov-tools"><label for="plp-mode">حالة المثال<select id="plp-mode">${Object.entries(
    modes
  )
    .map(
      ([key, label]) =>
        `<option value="${key}" ${key === mode ? "selected" : ""}>${label}</option>`
    )
    .join(
      ""
    )}</select></label><a class="button" href="#/page/merchant/sales-hub">${e(t("quotes"))}</a></div>`;
  const recover =
    '<button class="button" type="button" data-plp-recover>استعادة المثال</button>';
  let body: string;
  if (pending || mode === "loading")
    body = `<section class="ov-panel" aria-busy="true"><p role="status">جارٍ تجهيز قائمة المتابعة…</p>${recover}</section>`;
  else if (["error", "offline", "forbidden"].includes(mode))
    body = `<section class="ov-panel" role="alert"><h2>${mode === "forbidden" ? "تحتاج صلاحية لهذا القسم" : mode === "offline" ? "تعذّر الاتصال" : "تعذّر عرض البيانات"}</h2><p>هذه محاكاة محلية؛ لا تُعرض نتيجة قديمة أو أصفار بدل فشل المصدر.</p>${recover}</section>`;
  else
    body = renderToStaticMarkup(
      <PipelineReport data={snapshot()} t={t} href={path => "#/page" + path} />
    );
  return `<div class="ov-workspace ov-preview pl-preview" dir="rtl"><p class="ov-note">التاريخ المرجعي 30 سبتمبر 2026. أمثلة محلية؛ لا يُرسل تذكير ولا تُغيّر حالة عميل حقيقي.</p>${controls}${body}</div>`;
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
function choose(value: string) {
  const [queue, stage] = value.split(":");
  const parsed = pipelineInput.safeParse({
    queue,
    ...(stage ? { stage } : {}),
    page: 1,
    pageSize: 20,
  });
  if (!parsed.success) return;
  selection = parsed.data;
  pending = false;
  version++;
  window.render();
}
document.addEventListener("change", event => {
  const el = event.target as HTMLSelectElement;
  if (el.id === "plp-mode") {
    mode = el.value;
    selection = { ...selection, page: 1 };
    pending = false;
    version++;
    window.render();
    document.getElementById(el.id)?.focus();
  } else if (el.id === "pl-queue" && current()) {
    choose(el.value);
    document.getElementById(el.id)?.focus();
  }
});
document.addEventListener("click", event => {
  if (!current()) return;
  const el = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-pipeline-queue],[data-pipeline-page],[data-plp-recover]"
  );
  if (!el || el.disabled) return;
  if (el.hasAttribute("data-plp-recover")) {
    mode = "normal";
    pending = false;
    version++;
    void primary();
  } else if (el.dataset.pipelineQueue) choose(el.dataset.pipelineQueue);
  else {
    const page = Number(el.dataset.pipelinePage),
      d = snapshot();
    if (!Number.isInteger(page) || page < 1 || page > d.list.totalPages) return;
    selection = { ...selection, page };
    version++;
    pending = false;
    window.render();
  }
});
window.addEventListener("hashchange", () => {
  pending = false;
  version++;
});
