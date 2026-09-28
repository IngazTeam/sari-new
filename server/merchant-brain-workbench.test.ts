import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const base = "prototypes/tenant-dashboard/site/",
  key = "sary-brain-workbench-v1";
let dom: JSDOM, w: any, errors: Error[];
function boot(stored?: string) {
  errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", e => errors.push(e));
  dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
    url: "http://127.0.0.1:4329/#/page/merchant/sari-brain",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  w = dom.window;
  w.structuredClone = structuredClone;
  w.scrollTo = () => {};
  w.fetch = vi.fn(() => {
    throw Error("No provider calls in design preview");
  });
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  if (stored) w.localStorage.setItem(key, stored);
  for (const script of [...w.document.querySelectorAll("script[src]")] as any[])
    runInContext(
      readFileSync(base + script.getAttribute("src"), "utf8"),
      dom.getInternalVMContext()
    );
  nav("knowledge");
}
beforeEach(() => boot());
afterEach(() => {
  expect(errors).toEqual([]);
  expect(w.fetch).not.toHaveBeenCalled();
  dom.window.close();
});
const node = (s: string): any => {
  const el = w.document.querySelector(s);
  expect(el, s).toBeTruthy();
  return el;
};
const nav = (v: string) =>
  node(`[data-brain-action="navigate"][data-id="${v}"]`).click();
const click = (a: string, extra = "") =>
  node(`[data-bw-action="${a}"]${extra}`).click();
const tab = (group: string, v: string) =>
  click(group + "-tab", `[data-value="${v}"]`);
const input = (name: string, value: string) => {
  const el = node("#bw-" + name);
  el.value = value;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const check = (name: string, value = true) => {
  const el = node(`[data-bw-check="${name}"]`);
  el.checked = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const lab = (name: string, value: string) => {
  const el = node(`[data-bw-lab="${name}"]`);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const submit = () =>
  node("[data-bw-form]").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true })
  );
const data = () => JSON.parse(w.localStorage.getItem(key));
const dialog = () => node("#dialog").textContent;
const main = () => node("#main").textContent;
const reason =
  "راجعت المعلومات والحدود والمصدر وتأكدت من وضوح القرار في هذا المثال المحلي.";
function reviewLearning(fail = false) {
  nav("learning");
  node('[data-brain-action="review-open"]').click();
  // The editor remembers the current step during navigation. Start at the first case.
  while (!node('[data-brain-action="review-prev"]').disabled)
    node('[data-brain-action="review-prev"]').click();
  for (let i = 0; i < 8; i++) {
    for (const [k, v] of Object.entries({
      baseline: "الرد الحالي للحالة " + i,
      candidate: "الرد المقترح للحالة " + i,
      reason,
      baselineVerdict: "pass",
      candidateVerdict: fail && i === 7 ? "fail" : "pass",
    })) {
      const el = node("#brain-review-" + k);
      el.value = v;
      el.dispatchEvent(
        new w.Event(k.endsWith("Verdict") ? "change" : "input", {
          bubbles: true,
        })
      );
    }
    if (i < 7) node('[data-brain-action="review-next"]').click();
  }
  node("#brain-review-attest").checked = true;
  node('[data-brain-form="review"]').dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true })
  );
}
function experiments() {
  nav("operations");
  tab("ops", "experiments");
}
function candidate() {
  reviewLearning();
  experiments();
  click("prepare-candidate");
}
function dates(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
}
function protocol() {
  candidate();
  click("new-protocol");
  for (const [k, v] of Object.entries({
    title: "تجربة فهم احتياج العميل",
    hypothesis: reason,
    qualificationRule: reason,
    exclusions: reason,
  }))
    input(k, v);
  click("step-next");
  for (const [k, v] of Object.entries({
    minimumCustomersPerArm: "100000",
    baselinePercent: "١٠",
    liftPercentagePoints: "٥",
    calculationReference: reason,
  }))
    input(k, v);
  click("step-next");
  for (const [k, v] of Object.entries({
    enrollmentStartsAt: dates(2),
    enrollmentEndsAt: dates(12),
    observationDays: "7",
    decisionNotBefore: dates(20),
    safetyTriggers: reason,
  }))
    input(k, v);
  click("step-next");
  check("attest");
  submit();
  expect(data().protocols).toHaveLength(1);
  click("protocol");
}
function cohort() {
  click("cohort");
  input("mappingReview", reason);
  input("requiredAnyTerms", "Coffee\ncoffee\nقهوة");
  check("attest");
  submit();
  click("protocol");
}
function evaluated() {
  click("evaluation");
  click("run-evaluation");
  click("review-evaluation");
  reviewLearning();
  experiments();
  click("protocol");
}
function planReview(verdict = "approved") {
  click("experiment-review");
  input("verdict", verdict);
  for (const k of [
    "baselineAndSample",
    "recruitmentFeasibility",
    "qualificationMapping",
    "safetyAndMeasurement",
  ])
    input(k, reason);
  check("attest");
  check("ack");
  submit();
  click("protocol");
}
const replyCriteria = [
  "answersQuestion",
  "groundedInBusiness",
  "appropriateNextStep",
  "respectsCustomerDecision",
  "noUnverifiedCommitment",
  "languageAndClarity",
];
function reply(fail = false) {
  nav("operations");
  tab("ops", "replies");
  click("reply-review");
  replyCriteria.forEach((k, i) => input(k, fail && i === 0 ? "fail" : "pass"));
  input("quote", "بن كولومبيا");
  input("rationale", reason);
  check("attest");
  check("ack");
  submit();
}

it("validates manual knowledge inline, escapes markup, keeps intake pending and requires approval again after changes", () => {
  click("new-section");
  submit();
  expect(node("#bw-title").getAttribute("aria-invalid")).toBe("true");
  expect(w.document.activeElement.id).toBe("bw-title");
  expect(node("#bw-content").maxLength).toBe(50000);
  expect(node("#bw-type").options).toHaveLength(8);
  input("title", "<img src=x onerror=alert(1)>");
  input("content", "معرفة يدوية من مصدر المثال");
  check("attest");
  input("type", "policies");
  expect(node('[data-bw-check="attest"]').checked).toBe(false);
  submit();
  expect(data()).toBeNull();
  check("attest");
  submit();
  expect(data().sections[0].approved).toBe(true);
  expect(node("#main").querySelector("img[src=x]")).toBeNull();
  tab("knowledge", "intake");
  click("intake");
  input("title", "سياسة جديدة");
  input("content", reason);
  check("attest");
  submit();
  expect(data().sections[0].approved).toBe(false);
  tab("knowledge", "sections");
  click("approve-section");
  submit();
  expect(data().sections[0].approved).toBe(false);
  check("attest");
  submit();
  expect(data().sections[0].approved).toBe(true);
});

it("rejects invalid website URLs and stores valid links as unread without fetching them", () => {
  tab("knowledge", "website");
  click("new-page");
  input("title", "صفحة اختبار");
  input("url", "javascript:alert(1)");
  submit();
  expect(node("#bw-url").getAttribute("aria-invalid")).toBe("true");
  input("url", "https://user:password@example.test");
  submit();
  expect(node("#bw-url").getAttribute("aria-invalid")).toBe("true");
  input("url", "https://example.test/review");
  submit();
  expect(data().pages[0]).toMatchObject({
    read: false,
    active: false,
    content: "",
  });
  click("page-view", '[data-id="3"]');
  expect(dialog()).toContain("لم نقرأ");
  node('[data-action="close"]').click();
  click("toggle-page", '[data-id="1"]');
  expect(data().pages.find((r: any) => r.id === 1).active).toBe(false);
});

it("honors FAQ bounds, confirms deletion and retains the audit trail", () => {
  tab("knowledge", "faq");
  click("new-faq");
  input("question", "س");
  input("answer", "ج");
  submit();
  expect(w.document.querySelectorAll("[aria-invalid=true]")).toHaveLength(2);
  input("question", "هل تتوفر القهوة؟");
  input("answer", "راجع الكتالوج الحالي للمثال.");
  submit();
  click("delete", '[data-id="2"]');
  submit();
  expect(data().faqs).toHaveLength(2);
  check("attest");
  submit();
  expect(data().faqs).toHaveLength(1);
  nav("history");
  expect(main()).toContain("حذف سجل معرفة");
  expect(data().history).toHaveLength(2);
});

it("validates followup timezone, time window and weekly limit while retaining false values after reload", () => {
  nav("operations");
  tab("ops", "followup");
  click("followup");
  input("timeZone", "Mars/Moon");
  input("startHour", "20");
  input("endHour", "8");
  input("weeklyLimit", "4");
  submit();
  expect(
    w.document.querySelectorAll("[aria-invalid=true]").length
  ).toBeGreaterThanOrEqual(2);
  input("timeZone", "Asia/Riyadh");
  input("endHour", "24");
  input("weeklyLimit", "");
  submit();
  expect(node("#bw-weeklyLimit").getAttribute("aria-invalid")).toBe("true");
  input("weeklyLimit", "1");
  check("enabled", false);
  submit();
  expect(data().followup).toMatchObject({
    enabled: false,
    startHour: 20,
    endHour: 24,
    weeklyLimit: 1,
  });
  const stored = w.localStorage.getItem(key);
  dom.window.close();
  boot(stored);
  nav("operations");
  tab("ops", "followup");
  click("followup");
  expect(node('[data-bw-check="enabled"]').checked).toBe(false);
});

it("keeps failed drafts, clears stale attestations, and reconciles an uncertain save exactly once", () => {
  lab("mode", "failure");
  click("new-section");
  input("title", "مسودة تحت الاختبار");
  input("content", reason);
  check("attest");
  submit();
  expect(data()).toBeNull();
  expect(node("#bw-title").value).toBe("مسودة تحت الاختبار");
  expect(dialog()).toContain("تعذّر الحفظ");
  click("close");
  lab("mode", "stale");
  click("new-section");
  input("title", "إصدار قديم");
  input("content", reason);
  check("attest");
  submit();
  expect(node('[data-bw-check="attest"]').checked).toBe(false);
  click("refresh-basis");
  expect(node("#bw-title").value).toBe("إصدار قديم");
  check("attest");
  submit();
  expect(data().sections).toHaveLength(3);
  lab("mode", "unknown");
  click("new-section");
  input("title", "نتيجة غير مؤكدة");
  input("content", reason);
  check("attest");
  submit();
  expect(data().sections).toHaveLength(3);
  expect(node("#bw-title").disabled).toBe(true);
  submit();
  click("close");
  nav("operations");
  tab("ops", "followup");
  expect(main()).toContain("التحقق من نفس العملية");
  click("reconcile");
  expect(data().sections).toHaveLength(4);
  expect(data().history).toHaveLength(2);
});

it("blocks editing in read-only mode and preserves the session when browser storage fails", () => {
  lab("role", "viewer");
  expect(node('[data-bw-action="new-section"]').disabled).toBe(true);
  click("new-section");
  expect(w.document.querySelector("[data-bw-form]")).toBeNull();
  nav("operations");
  tab("ops", "followup");
  expect(node('[data-bw-action="followup"]').disabled).toBe(true);
  lab("role", "owner");
  vi.spyOn(w.Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("quota");
  });
  click("followup");
  input("weeklyLimit", "1");
  submit();
  expect(main()).toContain("الحد الأسبوعي: 1");
  expect(w.document.body.textContent).toContain("في الجلسة فقط");
});

it("requires all eight learning cases to pass before preparing a candidate and invalidates it on a later failure", () => {
  experiments();
  click("prepare-candidate");
  expect(main()).toContain("للحالات الثماني");
  expect(node('[data-bw-action="new-protocol"]').disabled).toBe(true);
  candidate();
  expect(node('[data-bw-action="new-protocol"]').disabled).toBe(false);
  reviewLearning(true);
  experiments();
  expect(node('[data-bw-action="new-protocol"]').disabled).toBe(true);
});

it("keeps protocol drafts across steps, applies the actual sample floor and UTC window, and prevents duplicate active designs", () => {
  candidate();
  click("new-protocol");
  click("step-next");
  expect(node("#bw-title").getAttribute("aria-invalid")).toBe("true");
  for (const [k, v] of Object.entries({
    title: "تجربة أولى",
    hypothesis: reason,
    qualificationRule: reason,
    exclusions: reason,
  }))
    input(k, v);
  click("step-next");
  for (const [k, v] of Object.entries({
    minimumCustomersPerArm: "30",
    baselinePercent: "10",
    liftPercentagePoints: "1",
    calculationReference: reason,
  }))
    input(k, v);
  click("step-next");
  expect(node("#bw-minimumCustomersPerArm").getAttribute("aria-invalid")).toBe(
    "true"
  );
  expect(dialog()).not.toContain("راجع المدخلات");
  click("step-back");
  expect(node("#bw-title").value).toBe("تجربة أولى");
  click("close");
  protocol();
  expect(data().protocols[0].design.window.enrollmentStartsAt).toMatch(
    /:00\.000Z$/
  );
  expect(data().protocols[0].design.sample.baselineConversionBps).toBe(1000);
  expect(node('[data-bw-action="authorize"]').disabled).toBe(true);
  node('[data-action="close"]').click();
  expect(node('[data-bw-action="new-protocol"]').disabled).toBe(true);
  tab("ops", "sector");
  click("sector");
  input("sector", "training");
  submit();
  expect(data().protocols[0].sector).toBe("store");
  expect(data().sector).toBe("training");
});

it("requires bounded cohort rules and a matching review without assigning customers", () => {
  protocol();
  click("cohort");
  for (const s of ["new", "interested", "qualified"])
    check("stage-" + s, false);
  input("minimumCharacters", "300");
  input("maximumCharacters", "2");
  input("excludedPhones", "123");
  input("mappingReview", reason);
  check("attest");
  submit();
  expect(dialog()).toContain("اختر مرحلة واحدة");
  expect(node("#bw-excludedPhones").getAttribute("aria-invalid")).toBe("true");
  check("stage-qualified");
  input("minimumCharacters", "2");
  input("maximumCharacters", "300");
  input("excludedPhones", "+966500000000\n966500000000");
  input("requiredAnyTerms", "Coffee\ncoffee");
  check("attest");
  submit();
  expect(data().protocols[0].cohort).toMatchObject({
    requiredAnyTerms: ["coffee"],
    excludedPhones: ["966500000000"],
    allowedDealStages: ["qualified"],
    excludeHumanTakeover: true,
  });
  expect(data().protocols[0].launch).toBeNull();
});

it("separates evaluation, independent review, launch authorization and irreversible revocation within the local simulation", () => {
  protocol();
  cohort();
  expect(node('[data-bw-action="experiment-review"]').disabled).toBe(true);
  evaluated();
  planReview();
  click("authorize");
  input("reason", reason);
  check("attest");
  submit();
  expect(data().protocols[0].launch).toBeNull();
  check("ack");
  submit();
  expect(data().protocols[0].launch).toBe("authorized");
  click("protocol");
  click("revoke");
  input("reason", reason);
  check("attest");
  submit();
  click("protocol");
  expect(node('[data-bw-action="authorize"]').disabled).toBe(true);
  click("withdraw");
  input("reason", reason);
  check("attest");
  submit();
  expect(data().protocols[0]).toMatchObject({
    state: "withdrawn",
    launch: "revoked",
  });
  expect(data().history.some((r: any) => r.label === "سحب التصميم")).toBe(true);
});

it("does not authorize rejected plans or reuse an approved review after the evaluation is replaced", () => {
  protocol();
  cohort();
  evaluated();
  planReview("rejected");
  expect(node('[data-bw-action="authorize"]').disabled).toBe(true);
  planReview();
  expect(node('[data-bw-action="authorize"]').disabled).toBe(false);
  node('[data-action="close"]').click();
  reviewLearning(true);
  experiments();
  click("protocol");
  expect(node('[data-bw-action="authorize"]').disabled).toBe(true);
  expect(dialog()).toContain("المراجعة تحتاج تحديثًا");
  node('[data-action="close"]').click();
  reviewLearning();
  experiments();
  click("protocol");
  click("evaluation");
  click("run-evaluation");
  node('[data-action="close"]').click();
  click("protocol");
  expect(node('[data-bw-action="authorize"]').disabled).toBe(true);
});

it("requires a real quote from the displayed reply, all six verdicts and new attestations after edits", () => {
  nav("operations");
  tab("ops", "replies");
  click("reply-review");
  replyCriteria.forEach(k => input(k, "pass"));
  input("quote", "وعد غير موجود");
  input("rationale", reason);
  check("attest");
  check("ack");
  submit();
  expect(node("#bw-quote").getAttribute("aria-invalid")).toBe("true");
  input("quote", "بن كولومبيا");
  expect(node('[data-bw-check="attest"]').checked).toBe(false);
  check("attest");
  check("ack");
  submit();
  expect(data().replyReviews[0].outcome).toBe("approved");
  reply(true);
  expect(node('[data-bw-action="send-review"]').disabled).toBe(true);
});

it("keeps uncertain send simulations pending, distinguishes accepted from delivered and prevents duplicate attempts", () => {
  reply();
  lab("mode", "unknown");
  click("send-review");
  input("account", "demo");
  input("reason", reason);
  check("attest");
  check("ack");
  submit();
  expect(data().sends).toHaveLength(0);
  expect(node("[data-bw-form] button[type=submit]").disabled).toBe(true);
  click("reconcile");
  expect(data().sends).toHaveLength(1);
  expect(main()).toContain("لا يوجد دليل تسليم");
  expect(node('[data-bw-action="send-review"]').disabled).toBe(true);
  click("send-review");
  expect(data().sends).toHaveLength(1);
});

it("filters and paginates the local history and resets every specialized brain state through the global reset", () => {
  for (let i = 0; i < 11; i++) {
    tab("knowledge", "faq");
    click("new-faq");
    input("question", "سؤال اختبار " + i);
    input("answer", reason);
    submit();
  }
  nav("history");
  expect(w.document.querySelectorAll(".bw-workbench article")).toHaveLength(10);
  click("history-next");
  expect(w.document.querySelectorAll(".bw-workbench article")).toHaveLength(1);
  const filter = node("[data-bw-history]");
  filter.value = "reply";
  filter.dispatchEvent(new w.Event("change", { bubbles: true }));
  expect(main()).toContain("لا يوجد نشاط");
  node('[data-action="prototype"]').click();
  node('[data-action="reset-confirm"]').click();
  node('[data-action="reset"]').click();
  nav("knowledge");
  expect(data().faqs).toHaveLength(1);
  expect(data().protocols).toHaveLength(0);
  expect(data().history).toHaveLength(0);
});
