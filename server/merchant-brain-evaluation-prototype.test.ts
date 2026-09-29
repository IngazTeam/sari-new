import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { evaluationDriver } from "../scripts/testing/fixtures/brain-evaluation-driver";
import { scoreOutputReview } from "./ai/learning-policy-output-review-contract";
import {
  emptyProtocolDraft,
  validateProtocolDraft,
} from "../client/src/lib/sales-experiment-form";

const base = "prototypes/tenant-dashboard/site/",
  reason = "راجعت النص والسياق والمصدر وحدود الصلاحية في هذا المثال المحلي.";
let dom: JSDOM, w: any, errors: Error[], d: ReturnType<typeof evaluationDriver>;
function boot(saved?: Record<string, string>) {
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
    throw Error("A design preview must not call a provider");
  });
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new w.Event("close"));
  };
  for (const [k, v] of Object.entries(saved || {}))
    w.localStorage.setItem(k, v);
  for (const s of [...w.document.querySelectorAll("script[src]")] as any[])
    runInContext(
      readFileSync(base + s.getAttribute("src"), "utf8"),
      dom.getInternalVMContext()
    );
  d = evaluationDriver(w);
}
beforeEach(() => boot());
afterEach(() => {
  expect(errors).toEqual([]);
  expect(w.fetch).not.toHaveBeenCalled();
  dom.window.close();
});
const snapshot = () =>
  Object.fromEntries(
    Object.keys(w.localStorage).map(k => [k, w.localStorage.getItem(k)])
  ) as Record<string, string>;
const nav = (s: string) =>
  d.node(`[data-brain-action="navigate"][data-id="${s}"]`).click();
const bw = (a: string, extra = "") =>
  d.node(`[data-bw-action="${a}"]${extra}`).click();
const body = () => d.node("#dialog").textContent;
function open() {
  nav("operations");
  bw("ops-tab", '[data-value="evaluation"]');
  d.click("open");
}
function candidate() {
  nav("learning");
  d.node('[data-brain-action="review-open"]').click();
  for (let i = 0; i < 8; i++) {
    for (const [k, v] of Object.entries({
      baseline: "رد حالي",
      candidate: "رد مقترح",
      reason,
      baselineVerdict: "pass",
      candidateVerdict: "pass",
    })) {
      const e = d.node("#brain-review-" + k);
      e.value = v;
      e.dispatchEvent(
        new w.Event(k.endsWith("Verdict") ? "change" : "input", {
          bubbles: true,
        })
      );
    }
    if (i < 7) d.node('[data-brain-action="review-next"]').click();
  }
  d.node("#brain-review-attest").checked = true;
  d.node('[data-brain-form="review"]').dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true })
  );
  nav("operations");
  bw("ops-tab", '[data-value="experiments"]');
  bw("prepare-candidate");
}
function lab(key: string, value: string) {
  const el = d.node(`[data-bw-lab="${key}"]`);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}
function prepareInspection() {
  candidate();
  const stored = snapshot(),
    state = JSON.parse(stored["sary-brain-workbench-v1"]),
    time = (day: number) =>
      new Date(Date.now() + day * 86400000).toISOString().slice(0, 16);
  const design = validateProtocolDraft({
    ...emptyProtocolDraft(),
    title: "تجربة تأهيل توضيحية",
    hypothesis: reason,
    qualificationRule: reason,
    exclusions: reason,
    minimumCustomersPerArm: "100000",
    baselinePercent: "10",
    liftPercentagePoints: "5",
    calculationReference: reason,
    enrollmentStartsAt: time(2),
    enrollmentEndsAt: time(12),
    observationDays: "7",
    decisionNotBefore: time(20),
    safetyTriggers: reason,
  }).design;
  expect(design).toBeTruthy();
  state.protocols = [
    {
      id: 1,
      design,
      sector: "store",
      sectorRevision: 1,
      state: "registered",
      review: null,
      launch: null,
      mappingReview: reason,
      cohort: {
        version: "sales-cohort-rules.v1",
        historyDefinition: "owned_inbound_before_enrollment",
        messageType: "text",
        minimumCharacters: 1,
        maximumCharacters: 4000,
        requiredAnyTerms: [],
        allowedDealStages: ["qualified"],
        excludedPhones: [],
        requireActiveConversation: true,
        excludeHumanTakeover: true,
        requireLatestInbound: true,
        requirePostHandoffInbound: true,
      },
    },
  ];
  stored["sary-brain-workbench-v1"] = JSON.stringify(state);
  dom.window.close();
  boot(stored);
  nav("operations");
  bw("ops-tab", '[data-value="experiments"]');
  bw("protocol");
  bw("inspect");
}

it("requires a candidate and separate consent for each eight-response batch, without auto-approving the 32 cases", () => {
  open();
  expect(d.node('[data-be-action="create"]').disabled).toBe(true);
  d.click("close");
  candidate();
  open();
  d.click("create");
  expect(d.node("#be-progress").value).toBe(0);
  expect(d.node('[data-be-action="advance"]').disabled).toBe(true);
  d.consent("cost");
  d.click("advance");
  expect(d.data().runs[0].completed).toBe(8);
  expect(d.node('[data-be-action="advance"]').disabled).toBe(true);
  d.consent("cost");
  d.node('[data-action="close"]').click();
  open();
  d.click("run", '[data-id="1"]');
  expect(d.node('[data-be-consent="cost"]').checked).toBe(false);
  expect(body()).toContain("متوقفة مؤقتًا");
  for (let i = 0; i < 7; i++) {
    d.consent("cost");
    d.click("advance");
  }
  expect(
    d.data().runs[0].samples.filter((s: any) => s.state === "responded")
  ).toHaveLength(64);
  expect(d.data().reviews).toHaveLength(0);
  expect(
    JSON.parse(w.localStorage.getItem("sary-brain-workbench-v1")).run.status
  ).toBe("completed");
});

it.each(["budget", "invalid", "uncertain"])(
  "halts a %s sample without inventing a response or silently retrying it",
  fault => {
    candidate();
    open();
    d.click("create");
    d.consent("cost");
    d.click("advance");
    d.option("fault", fault);
    d.consent("cost");
    d.click("advance");
    expect(d.data().runs[0]).toMatchObject({
      state: "halted",
      completed: 8,
      blocker: fault,
    });
    expect(d.data().runs[0].samples[8].response).toBe("");
    expect(w.document.querySelector('[data-be-action="advance"]')).toBeNull();
    expect(w.document.querySelector('[data-be-action="review"]')).toBeNull();
    expect(body()).toContain("لا توجد تسوية مؤكدة");
  }
);

it("persists a 32-case draft through reload, validates both quotes, and clears consent after edits", () => {
  candidate();
  open();
  d.completeRun();
  d.click("review");
  d.field("baseline.verdict", "pass");
  d.field("candidate.verdict", "fail");
  d.field("baseline.quote", "نص غير موجود");
  d.field("candidate.quote", "نص غير موجود");
  d.field("baseline.reason", "قصير");
  d.option("preference", "candidate");
  d.click("validate");
  expect(body()).toContain("اقتبس من نفس الرد");
  expect(body()).toContain("توافق التفضيل");
  expect(d.node('[data-be-action="save-review"]').disabled).toBe(true);
  const saved = snapshot();
  dom.window.close();
  boot(saved);
  open();
  expect(d.node('[data-be-field="baseline.quote"]').value).toBe("نص غير موجود");
  d.fillReview();
  d.consent("attest");
  expect(d.node('[data-be-action="save-review"]').disabled).toBe(false);
  d.field("candidate.reason", reason);
  expect(d.node('[data-be-consent="attest"]').checked).toBe(false);
  expect(d.node('[data-be-action="save-review"]').disabled).toBe(true);
  d.click("close");
  bw("ops-tab", '[data-value="experiments"]');
  expect(d.node('[data-bw-action="prepare-candidate"]').disabled).toBe(true);
  expect(d.node('[data-bw-action="new-protocol"]').disabled).toBe(true);
  d.click("open");
  expect(d.node('[data-be-action="save-review"]').disabled).toBe(true);
});

it.each([
  ["candidate", -1, "passed"],
  ["tie", -1, "inconclusive"],
  ["candidate", 0, "failed"],
] as const)(
  "matches the server review scoring for preference %s and failed case %s",
  (preference, index, outcome) => {
    candidate();
    open();
    d.completeRun();
    d.click("review");
    d.fillReview(preference, index);
    d.consent("attest");
    d.click("save-review");
    const review = d.data().reviews[0];
    expect(review.score).toEqual(scoreOutputReview(review.cases));
    expect(review.score.outcome).toBe(outcome);
    expect(
      JSON.parse(w.localStorage.getItem("sary-brain-workbench-v1")).run.status
    ).toBe(outcome === "passed" ? "reviewed" : "completed");
    d.click("record");
    expect(body()).toContain("لا يبدّل النتيجة الحالية");
    expect(
      w.document.querySelector('[data-be-action="save-review"]')
    ).toBeNull();
  }
);

it("keeps archive pagination separate from read failure and explicit cancellation, with no loss of records", () => {
  candidate();
  open();
  for (let i = 0; i < 6; i++) {
    d.click("create");
    expect(w.document.querySelector('[data-be-action="create"]')).toBeNull();
    d.consent("cancel");
    d.click("cancel");
    d.click("archive");
  }
  expect(d.data().runs).toHaveLength(6);
  expect(w.document.querySelectorAll('[data-be-action="run"]')).toHaveLength(5);
  d.click("page-next");
  expect(w.document.querySelectorAll('[data-be-action="run"]')).toHaveLength(1);
  d.option("read", "failure");
  expect(body()).toContain("تعذرت قراءة السجل");
  expect(body()).not.toContain("لا توجد محاولات ضمن");
  d.click("read-refresh");
  expect(w.document.querySelectorAll('[data-be-action="run"]')).toHaveLength(5);
  d.option("filter", "completed");
  expect(body()).toContain("لا توجد محاولات ضمن");
  expect(d.data().runs).toHaveLength(6);
});

it("locks an uncertain creation until reconciliation and disables mutations for a read-only role", () => {
  candidate();
  lab("mode", "unknown");
  open();
  d.click("create");
  expect(d.data()).toBeNull();
  expect(body()).toContain("التحقق من نفس العملية");
  bw("reconcile");
  open();
  expect(d.data().runs).toHaveLength(1);
  d.click("run");
  d.consent("cancel");
  d.click("cancel");
  d.click("close");
  lab("role", "viewer");
  open();
  expect(d.node('[data-be-action="create"]').disabled).toBe(true);
  d.click("run");
  expect(w.document.querySelector('[data-be-action="review"]')).toBeNull();
});

it("evaluates selected synthetic inbound sources with shared rules, then invalidates results on search, paging and refresh", () => {
  prepareInspection();
  d.click("inspect-select", '[data-id="107"]');
  d.click("inspect-check");
  expect(d.node("[data-be-inspection-result]").textContent).toContain(
    "مؤهلة في لحظة المثال"
  );
  const search = d.node("[data-be-search]");
  search.value = "موظف";
  search.dispatchEvent(new w.Event("input", { bubbles: true }));
  expect(w.document.querySelector("[data-be-inspection-result]")).toBeNull();
  expect(d.node('[data-be-action="inspect-check"]').disabled).toBe(true);
  d.node("[data-be-search-form]").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true })
  );
  d.click("inspect-select");
  d.click("inspect-check");
  expect(d.node("[data-be-inspection-result]").textContent).toContain(
    "موظف يتابع"
  );
  d.click("inspect-refresh");
  expect(w.document.querySelector("[data-be-inspection-result]")).toBeNull();
  d.option("inspection-read", "failure");
  expect(body()).toContain("تعذرت قراءة المصادر");
  expect(
    w.document.querySelector('[data-be-action="inspect-select"]')
  ).toBeNull();
});

it("rejects media and out-of-window sources, clears stale results on time changes, and never creates an assignment", () => {
  prepareInspection();
  d.click("inspect-select", '[data-id="105"]');
  d.click("inspect-check");
  expect(d.node("[data-be-inspection-result]").textContent).toContain(
    "نوع الرسالة غير نصي"
  );
  d.click("inspect-select", '[data-id="107"]');
  d.option("inspection-time", "after");
  d.click("inspect-check");
  expect(d.node("[data-be-inspection-result]").textContent).toContain(
    "وقت الفحص خارج"
  );
  d.option("inspection-time", "inside");
  expect(w.document.querySelector("[data-be-inspection-result]")).toBeNull();
  d.click("inspect-next");
  expect(d.node('[data-be-action="inspect-check"]').disabled).toBe(true);
  d.click("inspect-select", '[data-id="104"]');
  d.click("inspect-check");
  expect(d.node("[data-be-inspection-result]").textContent).toContain(
    "توجد رسالة واردة أحدث"
  );
  expect(
    JSON.parse(w.localStorage.getItem("sary-brain-workbench-v1")).protocols[0]
      .launch
  ).toBeNull();
});

it("clears the evaluation archive and unfinished review on the global prototype reset", () => {
  candidate();
  open();
  d.completeRun();
  d.click("review");
  d.field("baseline.reason", reason);
  d.click("close");
  d.node('[data-action="prototype"]').click();
  d.node('[data-action="reset-confirm"]').click();
  d.node('[data-action="reset"]').click();
  expect(d.data()).toMatchObject({ runs: [], reviews: [], draft: null });
  open();
  expect(body()).toContain("لا توجد محاولات ضمن");
});

it("keeps the evaluation visible during stale recovery even after another editor left a draft", () => {
  nav("knowledge");
  bw("knowledge-tab", '[data-value="faq"]');
  bw("new-faq");
  bw("close");
  candidate();
  lab("mode", "stale");
  open();
  d.click("create");
  expect(body()).toContain("تغيّر الإصدار");
  bw("refresh-basis");
  expect(body()).toContain("محاولات التقييم ومراجعاتها");
  expect(w.document.querySelector("[data-bw-form]")).toBeNull();
  d.click("create");
  expect(d.data().runs).toHaveLength(1);
});

it("does not treat a legacy eight-case output receipt as a completed 32-case assessment", () => {
  prepareInspection();
  d.click("close");
  const saved = snapshot(),
    state = JSON.parse(saved["sary-brain-workbench-v1"]);
  state.run = {
    id: 1,
    status: "reviewed",
    reviewSnapshot: "legacy eight-case preview",
  };
  saved["sary-brain-workbench-v1"] = JSON.stringify(state);
  dom.window.close();
  boot(saved);
  nav("operations");
  bw("ops-tab", '[data-value="experiments"]');
  bw("protocol");
  expect(d.node('[data-bw-action="experiment-review"]').disabled).toBe(true);
  expect(d.node('[data-bw-action="authorize"]').disabled).toBe(true);
});
