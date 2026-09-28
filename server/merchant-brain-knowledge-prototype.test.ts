import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { learningStates } from "../prototypes/tenant-dashboard/src/brain-knowledge";

let dom: JSDOM, w: any, errors: Error[];
const base = "prototypes/tenant-dashboard/site/",
  content =
    "سياسة الاختبار المحلية: المعلومة تحتاج مصدرًا معتمدًا ومراجعة بشرية قبل استخدامها.";
function boot(saved: Record<string, string> = {}) {
  errors = [];
  const c = new VirtualConsole();
  c.on("jsdomError", e => errors.push(e));
  dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
    url: "http://127.0.0.1:4329/#/page/merchant/sari-brain",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: c,
  });
  w = dom.window;
  w.structuredClone = structuredClone;
  w.scrollTo = () => {};
  w.fetch = vi.fn(() => {
    throw Error("No provider requests in mockup");
  });
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new w.Event("close"));
  };
  Object.entries(saved).forEach(([k, v]) => w.localStorage.setItem(k, v));
  for (const s of [...w.document.querySelectorAll("script[src]")] as any[])
    runInContext(
      readFileSync(base + s.getAttribute("src"), "utf8"),
      dom.getInternalVMContext()
    );
}
beforeEach(() => boot());
afterEach(() => {
  expect(errors).toEqual([]);
  expect(w.fetch).not.toHaveBeenCalled();
  dom.window.close();
});
const node = (s: string): any => {
  const e = w.document.querySelector(s);
  expect(e, s).toBeTruthy();
  return e;
};
const click = (a: string, extra = "") =>
  node(`[data-bk-action="${a}"]${extra}`).click();
const bw = (a: string, extra = "") =>
  node(`[data-bw-action="${a}"]${extra}`).click();
const nav = (s: string) =>
  node(`[data-brain-action="navigate"][data-id="${s}"]`).click();
it('explores the independent file library, text pages, literal search, and failed reads without external calls', () => {
  sources();
  const action = (name: string) => node(`[data-kl-action="${name}"]`).click();
  expect(node('[data-kl-library]').textContent).toContain('14 ملفات مطابقة');
  action('next'); expect(node('[data-kl-library]').textContent).toContain('صفحة 2 من 2');
  set('[data-kl-search]', 'تجريبية 13'); action('search'); expect(node('[data-kl-library]').textContent).toContain('1 ملفات مطابقة');
  action('read'); action('text-next'); expect(node('[data-kl-text]').textContent).toContain('نهاية النص المحفوظ.'); action('close');
  set('[data-kl-state]', 'failure', 'change'); expect(node('[data-kl-library]').textContent).toContain('تعذر تحميل مكتبة الملفات');
  expect(w.document.querySelector('[data-kl-action="read"]')).toBeNull(); action('retry');
  set('[data-kl-search]', '<img src=x>'); action('search'); expect(node('[data-kl-library]').textContent).toContain('لا توجد ملفات مطابقة');
  expect(node('[data-kl-library]').querySelector('img')).toBeNull();
});
const set = (s: string, v: string, event = "input") => {
  const e = node(s);
  e.value = v;
  e.dispatchEvent(new w.Event(event, { bubbles: true }));
};
const option = (s: string, v: string) =>
  set(`[data-bk-option="${s}"]`, v, "change");
const field = (s: string, v: string) => set(`[data-bk-field="${s}"]`, v);
const check = () => {
  const e = node("[data-bk-check]");
  expect(e.disabled).toBe(false);
  e.checked = true;
  e.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const state = () =>
  JSON.parse(w.localStorage.getItem("sary-brain-knowledge-v1"));
const parent = () =>
  JSON.parse(w.localStorage.getItem("sary-brain-workbench-v1"));
const body = () => node("#dialog").textContent;
const snapshot = () =>
  Object.fromEntries(
    Object.keys(w.localStorage).map(k => [k, w.localStorage.getItem(k)])
  ) as Record<string, string>;
function openIntake() {
  nav("knowledge");
  bw("knowledge-tab", '[data-value="intake"]');
  click("intake");
}
function sources() {
  nav("knowledge");
  bw("knowledge-tab", '[data-value="sources"]');
}
function status() {
  nav("knowledge");
  bw("knowledge-tab", '[data-value="status"]');
}
function web() {
  nav("knowledge");
  bw("knowledge-tab", '[data-value="website"]');
  click("website");
}
const mode = (v: string) => set('[data-bw-lab="mode"]', v, "change");
async function file(
  name: string,
  text: string,
  type = "text/plain",
  size = text.length
) {
  const e = node("[data-bk-file]");
  Object.defineProperty(e, "files", {
    value: [{ name, type, size, text: async () => text }],
    configurable: true,
  });
  e.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
}

it("shows all eleven analysis states without treating refresh as a new provider request", () => {
  status();
  expect(node("[data-bk-state]").dataset.bkState).toBe("idle");
  expect(Object.keys(learningStates)).toHaveLength(11);
  for (const [key, [title]] of Object.entries(learningStates)) {
    option("status", key);
    expect(node("[data-bk-state]").textContent).toContain(title);
  }
  option("status", "applied");
  option("proposals", "0");
  expect(node("[data-bk-proposals]").textContent).toContain("0");
  option("status-read", "failure");
  expect(w.document.querySelector("[data-bk-state]")).toBeNull();
  expect(node("#main").textContent).toContain("تعذر جلب");
  click("status-ready");
  click("status-refresh");
  expect(w.document.querySelector("[data-bk-state]")).toBeNull();
  click("status-ready");
  nav("learning");
  expect(node("[data-bk-state]").dataset.bkState).toBe("applied");
});
it("validates fields inline, stores raw text safely, requires renewed consent and never approves intake automatically", () => {
  openIntake();
  check();
  click("ingest");
  expect(node("#bk-name").getAttribute("aria-invalid")).toBe("true");
  expect(w.document.activeElement.id).toBe("bk-name");
  field("name", "<img src=x onerror=alert(1)>");
  field("content", content);
  check();
  field("content", content + " تعديل");
  expect(node('[data-bk-action="ingest"]').disabled).toBe(true);
  check();
  click("ingest");
  expect(parent().sections[0]).toMatchObject({
    approved: false,
    source: "document",
    title: "<img src=x onerror=alert(1)>",
  });
  expect(node('[data-bk-action="ingest"]').disabled).toBe(true);
  click("close");
  bw("knowledge-tab", '[data-value="sections"]');
  expect(w.document.querySelector("img[src=x]")).toBeNull();
  expect(node("#main").textContent).toContain("<img src=x onerror=alert(1)>");
});
it("uses the shared TXT/CSV reader and preserves the current draft on unsupported, empty or oversized files", async () => {
  openIntake();
  await file("policy.csv", "المنتج,السعر\nقهوة,64", "text/csv");
  expect(node("#bk-content").value).toBe("المنتج,السعر\nقهوة,64");
  await file("bad.pdf", "PDF", "application/pdf");
  expect(body()).toContain("اختر TXT");
  expect(node("#bk-name").value).toBe("policy.csv");
  await file("empty.txt", "  ");
  expect(body()).toContain("الملف فارغ");
  await file("long.txt", "a".repeat(30001));
  expect(body()).toContain("لم نقتطع");
  expect(node("#bk-name").value).toBe("policy.csv");
  const saved = snapshot();
  dom.window.close();
  boot(saved);
  openIntake();
  expect(node("#bk-content").value).toContain("قهوة,64");
  expect(node("[data-bk-check]").checked).toBe(false);
});
it("ignores a file read completed after its dialog was closed", async () => {
  openIntake();
  field("name", "مسودتي");
  field("content", content);
  let done: (v: string) => void = () => {};
  const e = node("[data-bk-file]");
  Object.defineProperty(e, "files", {
    value: [
      {
        name: "late.txt",
        size: 20,
        type: "text/plain",
        text: () =>
          new Promise(resolve => {
            done = resolve;
          }),
      },
    ],
  });
  e.dispatchEvent(new w.Event("change", { bubbles: true }));
  click("close");
  done("نص متأخر لا يبدل المسودة");
  await new Promise(resolve => setTimeout(resolve, 0));
  openIntake();
  expect(node("#bk-name").value).toBe("مسودتي");
});
it("restricts the analysis report to its sample and invalidates it after editing the input", () => {
  openIntake();
  field("content", content);
  expect(node('[data-bk-action="analyze"]').disabled).toBe(true);
  click("sample");
  click("analyze");
  expect(node("[data-bk-analysis]").textContent).toContain("14 يومًا");
  check();
  field("content", content);
  expect(w.document.querySelector("[data-bk-analysis]")).toBeNull();
  expect(node("[data-bk-check]").checked).toBe(false);
  expect(node('[data-bk-action="analyze"]').disabled).toBe(true);
});
it.each(["success", "partial", "conflict", "empty", "unchanged"])(
  "distinguishes %s intake receipt from activation and permits no duplicate save",
  kind => {
    openIntake();
    field("name", "مصدر مثال");
    field("content", content);
    option("result", kind);
    check();
    click("ingest");
    expect(state().receipt.mode).toBe(kind);
    expect(node('[data-bk-action="ingest"]').disabled).toBe(true);
    const rows = parent().sections.filter((s: any) => s.title === "مصدر مثال");
    expect(rows).toHaveLength(["empty", "unchanged"].includes(kind) ? 0 : 1);
    if (rows.length) expect(rows[0].approved).toBe(false);
    if (kind === "partial") expect(body()).toContain("الفهرسة غير مكتملة");
    if (kind === "empty") expect(body()).toContain("لم تُضف معرفة");
  }
);
it("keeps the intake draft on failure, refreshes its own stale editor and reconciles unknown saves once", () => {
  openIntake();
  field("name", "اختبار حالات الحفظ");
  field("content", content);
  click("close");
  mode("failure");
  click("intake");
  check();
  click("ingest");
  expect(parent()).toBeNull();
  expect(body()).toContain("تعذّر الحفظ");
  click("close");
  mode("stale");
  click("intake");
  check();
  click("ingest");
  bw("refresh-basis");
  expect(node("#bk-content").value).toBe(content);
  click("close");
  mode("unknown");
  click("intake");
  check();
  click("ingest");
  expect(node('[data-bk-action="ingest"]').disabled).toBe(true);
  bw("reconcile");
  expect(
    parent().sections.filter((r: any) => r.title === "اختبار حالات الحفظ")
  ).toHaveLength(1);
  click("intake");
  expect(node('[data-bk-action="ingest"]').disabled).toBe(true);
});
it("explains that product deletion deletes the catalogue and invalidates sourced answers without crashing", () => {
  sources();
  click("remove", '[data-kind="products"]');
  expect(body()).toContain("جميع سجلات منتجات التاجر");
  set("[data-bk-phrase]", "قائمة المنتجات");
  check();
  set("[data-bk-phrase]", "قائمة المنتجات");
  expect(node("[data-bk-check]").checked).toBe(false);
  check();
  click("confirm-remove");
  expect(w.SaryBrainPreview.sourceCounts().products).toBe(0);
  click("close");
  nav("results");
  node('[data-brain-action="test"]').click();
  set("#brain-question", "كم سعر كولومبيا؟");
  node('[data-brain-form="test"]').dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true })
  );
  expect(body()).toContain("نحتاج معلومة مؤكدة");
});
it("resets only knowledge examples, retains experiment history and settings, and requires a new candidate", () => {
  openIntake();
  field("name", "قسم جديد");
  field("content", content);
  check();
  click("ingest");
  click("close");
  const saved = snapshot(),
    p = JSON.parse(saved["sary-brain-workbench-v1"]);
  p.protocols = [
    {
      id: 7,
      state: "withdrawn",
      design: { title: "سجل سابق", sample: { minimumCustomersPerArm: 100 } },
    },
  ];
  p.candidate = true;
  p.run = { id: "evaluation:1", status: "reviewed" };
  saved["sary-brain-workbench-v1"] = JSON.stringify(p);
  dom.window.close();
  boot(saved);
  sources();
  click("reset");
  expect(body()).toContain("المحادثات والطلبات والإعدادات");
  set("[data-bk-phrase]", "عقل ساري");
  check();
  click("confirm-remove");
  expect(parent()).toMatchObject({
    sections: [],
    pages: [],
    faqs: [],
    candidate: false,
    run: null,
  });
  expect(parent().protocols).toHaveLength(1);
  expect(parent().followup).toEqual(p.followup);
  expect(w.SaryBrainPreview.sourceCounts()).toEqual({
    document: 0,
    products: 0,
  });
  expect(state()).toMatchObject({
    state: "stale",
    receipt: null,
    draft: { content: "" },
  });
  click("close");
  nav("results");
  expect(node("#main").textContent).toContain("لا توجد معلومات مفعّلة");
});
it("blocks destructive actions on unread sources and for read-only users", () => {
  sources();
  option("sources-read", "failure");
  click("reset");
  expect(w.document.querySelector(".bk-workspace")).toBeNull();
  option("sources-read", "success");
  set('[data-bw-lab="role"]', "viewer", "change");
  expect(node('[data-bk-action="reset"]').disabled).toBe(true);
  expect(node('[data-bk-action="remove"]').disabled).toBe(true);
  bw("knowledge-tab", '[data-value="intake"]');
  expect(node('[data-bk-action="intake"]').disabled).toBe(true);
});
it("keeps website progress on close, disallows parallel start and distinguishes read failure from job failure", () => {
  web();
  check();
  click("website-start");
  expect(state().website).toMatchObject({ state: "running", step: 0 });
  expect(node('[data-bk-action="website-start"]').disabled).toBe(true);
  click("website-next");
  click("close");
  web();
  expect(state().website.step).toBe(1);
  option("website-read", "failure");
  expect(body()).toContain("لا تبدأ طلبًا بديلًا");
  expect(
    w.document.querySelector('[data-bk-action="website-start"]')
  ).toBeNull();
  option("website-read", "success");
  option("website-fault", "failure");
  click("website-next");
  expect(state().website.state).toBe("error");
  option("website-fault", "success");
  check();
  click("website-start");
  for (let i = 0; i < 4; i++) click("website-next");
  expect(state().website.state).toBe("completed");
  expect(body()).toContain("لا يعني حل كل الفجوات");
});
