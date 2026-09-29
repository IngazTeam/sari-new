import { evaluationDriver } from "../scripts/testing/fixtures/brain-evaluation-driver";
import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const base = "prototypes/tenant-dashboard/site/",
  key = "sary-brain-workbench-v1";
let dom: JSDOM, w: any, errors: Error[];
function boot(stored?: string, sectionDraft?: string) {
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
  w.TextEncoder = TextEncoder;
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
  if (sectionDraft) w.sessionStorage.setItem('sary-demo-section-draft-v1',sectionDraft);
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
const cr = (action: string, id?: number) => node(`[data-cr-action="${action}"]${id ? `[data-id="${id}"]` : ''}`).click();
const crChoice = (value: string) => { const el=node('[data-cr-decision]');el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true})); };
const crAck = () => { const el=node('[data-cr-ack]');el.checked=true;el.dispatchEvent(new w.Event('change',{bubbles:true})); };
it('reviews conflict text and replaces only the linked record after consent',()=>{tab('knowledge','conflicts');cr('review',1);expect(main()).toContain('السجل الحالي المرتبط فقط');crChoice('approve');expect(node('[data-cr-action="save"]').disabled).toBe(true);crAck();cr('save');expect(data().conflicts[0]).toMatchObject({closed:true,currentEnabled:false,proposalEnabled:true});expect(data().conflicts[1].closed).toBe(false);});
it('closes a proposal without removing it or disabling the original',()=>{tab('knowledge','conflicts');cr('review',1);crChoice('reject');crAck();cr('save');expect(data().conflicts).toHaveLength(10);expect(data().conflicts[0]).toMatchObject({closed:true,currentEnabled:true,proposalEnabled:false});});
it('shows unlinked consequences and does not retire a guessed current record',()=>{tab('knowledge','conflicts');cr('review',2);expect(main()).toContain('لا يوجد ربط موثوق');crChoice('approve');crAck();cr('save');expect(data().conflicts[1]).toMatchObject({closed:true,currentEnabled:true,proposalEnabled:true});});
it('blocks activation when the source link is unavailable',()=>{tab('knowledge','conflicts');cr('review',3);expect(node('[data-cr-decision] option[value="approve"]').disabled).toBe(true);crChoice('approve');crAck();cr('save');expect(main()).toContain('تعذر التحقق');expect(w.localStorage.getItem(key)).toBeNull();});
it('invalidates consent on a simulated concurrent change',()=>{tab('knowledge','conflicts');cr('review',1);crChoice('approve');crAck();cr('change');expect(node('[data-cr-ack]').checked).toBe(false);crAck();cr('save');expect(main()).toContain('تغيّر الاقتراح');expect(w.localStorage.getItem(key)).toBeNull();cr('refresh');expect(node('[data-cr-ack]').checked).toBe(false);});
it('retains proposal review on simulated save failure',()=>{tab('knowledge','conflicts');cr('review',1);crChoice('reject');crAck();lab('mode','failure');cr('save');expect(main()).toContain('تعذّر الحفظ');expect(node('[data-cr-review]')).toBeTruthy();expect(w.localStorage.getItem(key)).toBeNull();});
it('paginates past eight proposals and separates read error from empty',()=>{tab('knowledge','conflicts');cr('next');expect(main()).toContain('مثال 9');const el=node('[data-cr-read]');el.value='failure';el.dispatchEvent(new w.Event('change',{bubbles:true}));expect(main()).toContain('تعذر قراءة الاقتراحات');expect(main()).not.toContain('لا توجد اقتراحات تنتظر');});
it('does not allow a read-only actor to decide a conflict',()=>{tab('knowledge','conflicts');lab('role','viewer');cr('review',1);expect(w.document.querySelector('[data-cr-decision]')).toBeNull();expect(node('[data-cr-action="save"]').disabled).toBe(true);});
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
  const d = evaluationDriver(w);
  d.completeRun();
  d.click("review");
  d.fillReview();
  d.consent("attest");
  d.click("save-review");
  d.click("close");
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

const sw = (a: string,id?:number)=>node('[data-sw-action="'+a+'"]'+(id?'[data-id="'+id+'"]':'')).click();
const swInput=(key:string,value:string)=>{const el=node('[data-sw-field="'+key+'"]');el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));};
const swCheck=(key='ack')=>{const el=node('[data-sw-'+key+']');el.checked=!el.checked;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
const rebootSection = (stored=w.localStorage.getItem(key),draft=w.sessionStorage.getItem('sary-demo-section-draft-v1')) => {
  expect(errors).toEqual([]);expect(w.fetch).not.toHaveBeenCalled();dom.window.close();boot(stored||undefined,draft||undefined);
};
it('restores a local section draft after reload without restoring consent',()=>{
  sw('new');swInput('title','Draft title');swInput('content','Text before reload');swCheck();
  rebootSection();expect(main()).toContain('مسودة قسم محفوظة');sw('restore');
  expect(node('[data-sw-field="content"]').value).toBe('Text before reload');
  expect(node('[data-sw-ack]').checked).toBe(false);expect(data()).toBeNull();
});
it('reconciles a deleted creation from a separate mock receipt after reload',()=>{
  sw('new');swInput('title','New synthetic');swInput('content','Synthetic text');swCheck();
  lab('mode','failure');sw('save');
  const uncertain=w.sessionStorage.getItem('sary-demo-section-draft-v1');
  lab('mode','success');swCheck();sw('save');
  const id=data().sections.at(-1).id;
  sw('open',id);sw('delete');swCheck();sw('save');
  const saved=w.localStorage.getItem(key);expect(data().sectionReceipts).toHaveLength(1);
  rebootSection(saved,uncertain);sw('restore');sw('receipt');
  expect(main()).toContain('حُذف');expect(data().sections).toHaveLength(2);
});
it('compares a restored mock edit with current content before accepting a fresh review',()=>{
  sw('open',1);swInput('content','Local draft');swCheck();
  const cached=w.sessionStorage.getItem('sary-demo-section-draft-v1');
  sw('change');sw('refresh');swInput('content','Concurrent saved text');swCheck();sw('save');
  rebootSection(w.localStorage.getItem(key),cached);sw('restore');
  expect(main()).toContain('Concurrent saved text');expect(node('[data-sw-action="save"]').disabled).toBe(true);
  sw('rebase');expect(node('[data-sw-ack]').checked).toBe(false);
  swCheck();sw('save');expect(data().sections[0].content).toBe('Local draft');
});
it("validates manual sections, escapes markup and prevents bypassing pending review",()=>{
 sw('new');swCheck();sw('save');expect(main()).toContain('أدخل العنوان');
 expect(node('[data-sw-field="content"]').maxLength).toBe(50000);
 swInput('title','<img src=x onerror=alert(1)>');swInput('content',reason);swCheck();swInput('type','policies');expect(node('[data-sw-ack]').checked).toBe(false);swCheck();sw('save');
 expect(data().sections.at(-1)).toMatchObject({approved:true,useInBot:false});expect(node('#main').querySelector('img[src=x]')).toBeNull();
 tab('knowledge','intake');click('intake');input('title','سياسة جديدة');input('content',reason);check('attest');submit();const id=data().sections[0].id;expect(data().sections[0].approved).toBe(false);
 tab('knowledge','sections');sw('open',id);expect(main()).toContain('احسم الاقتراح');expect(node('[data-sw-action="save"]').disabled).toBe(true);
});

const pi=(a:string)=>node('[data-pi-action="'+a+'"]').click();
const piUrl=(url:string)=>{const e=node('[data-pi-url]');e.value=url;e.dispatchEvent(new w.Event('input',{bubbles:true}));node('[data-pi-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
it('previews safe website URLs locally and saves the reviewed page and section paused',()=>{tab('knowledge','website');piUrl('javascript:alert(1)');expect(main()).toContain('أدخل رابط HTTPS');piUrl('https://user:password@example.test');expect(main()).toContain('أدخل رابط HTTPS');piUrl('https://example.test/review');expect(dialog()).toContain('نص مثال ثابت');expect(node('[data-pi-action="save"]').disabled).toBe(true);node('[data-pi-ack]').click();pi('save');expect(data().pages[0]).toMatchObject({read:true,active:false});expect(data().sections[0].content).toBe(data().pages[0].content);expect(data().sections[0].useInBot).toBe(false);expect(data().pageReceipts).toHaveLength(1);expect(dialog()).toContain('تم حفظ الصفحة');});
it('resets mock preview consent and blocks expired or read-only saves',()=>{tab('knowledge','website');piUrl('https://example.test/review');node('[data-pi-ack]').click();pi('close');pi('open');expect(node('[data-pi-action="save"]').disabled).toBe(true);pi('close');pi('expire');expect(main()).toContain('انتهت المعاينة');});
it('recovers the same mock save once after an unknown result',()=>{tab('knowledge','website');piUrl('https://example.test/review');node('[data-pi-ack]').click();lab('mode','unknown');pi('save');pi('close');click('reconcile');expect(data().pageReceipts).toHaveLength(1);pi('recover');expect(main()).toContain('تم حفظ الصفحة');expect(data().pages).toHaveLength(3);});

const pw=(a:string,id?:number)=>node(`[data-pw-action="${a}"]${id?`[data-id="${id}"]`:''}`).click();
const pwChoose=(v:string)=>{const el=node('[data-pw-choice]');el.value=v;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
it('separates mock website read errors from an empty result',()=>{
 tab('knowledge','website');const el=node('[data-pw-read]');el.value='error';el.dispatchEvent(new w.Event('change',{bubbles:true}));
 expect(main()).toContain('تعذر تحميل الصفحات');expect(main()).not.toContain('لا توجد صفحات محفوظة تطابق');pw('retry');expect(main()).toContain('سياسة الشحن');
});
it('reviews full linked page records and renews consent after selecting another action',()=>{
 dom.window.close();boot(JSON.stringify({version:1,protocols:[],history:[],sections:[{id:3,type:'policies',title:'Linked section',content:'Full linked text',approved:true,source:'website',sourceUrl:'https://example.test/shipping'}],faqs:[{id:4,pageId:1,question:'Linked question',answer:'Full linked answer'}]}));
 tab('knowledge','website');pw('open',1);expect(dialog()).toContain('Full linked text');expect(dialog()).toContain('Full linked answer');
 pwChoose('pause');node('[data-pw-ack]').click();pwChoose('enable');expect(node('[data-pw-ack]').checked).toBe(false);expect(node('[data-pw-action="apply"]').disabled).toBe(true);
 pwChoose('pause');node('[data-pw-ack]').click();pw('apply');expect(data().pages[0].active).toBe(false);expect(data().sections[0].useInBot).toBe(false);expect(data().faqs[0].useInBot).toBe(false);
});
it('does not bypass website action review in read-only mode',()=>{
 tab('knowledge','website');lab('role','viewer');pw('open',1);expect(dialog()).toContain('صلاحيتك تتيح مراجعة');expect(node('[data-pw-choice]').disabled).toBe(true);expect(node('[data-pw-action="apply"]').disabled).toBe(true);
});
it('keeps a failed website change unconfirmed and requires another review',()=>{
 tab('knowledge','website');lab('mode','failure');pw('open',1);pwChoose('pause');node('[data-pw-ack]').click();pw('apply');expect(dialog()).toContain('تعذر تأكيد التغيير');expect(node('[data-pw-action="apply"]').disabled).toBe(true);pw('refresh');expect(node('[data-pw-ack]').checked).toBe(false);expect(node('[data-pw-choice]').value).toBe('');
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

it('edits an FAQ, requires fresh activation approval and can pause it again in the mockup',()=>{
  tab('knowledge','faq');click('edit-faq','[data-id="1"]');input('answer','إجابة محلية محدثة');submit();
  expect(dialog()).toContain('أكمل الموافقة');check('attest');submit();
  expect(data().faqs[0]).toMatchObject({answer:'إجابة محلية محدثة',isActive:true,useInBot:true});
  click('edit-faq','[data-id="1"]');input('useInBot','false');submit();expect(data().faqs[0].useInBot).toBe(false);expect(main()).toContain('غير مفعّل للردود');
});
it('separates FAQ read failures, empty filters and loading without changing saved examples',()=>{
  tab('knowledge','faq');const before=w.localStorage.getItem(key);
  const select=(s:string,v:string)=>{const e=node(s);e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}));};
  select('[data-faq-read]','failure');expect(main()).toContain('تعذر تحميل الأسئلة');expect(main()).not.toContain('لا توجد أسئلة بعد');expect(node('[data-bw-action="new-faq"]').disabled).toBe(true);
  node('[data-faq-action="reload"]').click();select('[data-faq-filter]','paused');expect(main()).toContain('لا توجد أسئلة مطابقة');
  select('[data-faq-read]','loading');expect(main()).toContain('جارٍ تحميل الأسئلة');expect(w.localStorage.getItem(key)).toEqual(before);
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

it("keeps failed section drafts, clears consent and reconciles an uncertain save once",()=>{
 lab('mode','failure');sw('new');swInput('title','مسودة تحت الاختبار');swInput('content',reason);swCheck();sw('save');expect(data()).toBeNull();expect(node('[data-sw-field="title"]').value).toBe('مسودة تحت الاختبار');expect(main()).toContain('تعذّر الحفظ');expect(node('[data-sw-ack]').checked).toBe(false);
 lab('mode','stale');swCheck();sw('save');expect(node('[data-sw-ack]').checked).toBe(false);click('refresh-basis');swCheck();sw('save');expect(data().sections).toHaveLength(3);
 lab('mode','unknown');sw('new');swInput('title','نتيجة غير مؤكدة');swInput('content',reason);swCheck();sw('save');expect(data().sections).toHaveLength(3);expect(node('[data-sw-action="save"]').disabled).toBe(true);click('reconcile');expect(data().sections).toHaveLength(4);expect(data().history).toHaveLength(2);
});

it("blocks editing in read-only mode and preserves the session when browser storage fails", () => {
  lab("role", "viewer");
  expect(node('[data-sw-action="new"]').disabled).toBe(true);
  sw('new');
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
  evaluationDriver(w).click("create");
  evaluationDriver(w).click("close");
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

it('shows section eligibility, parentage and an explicit coverage formula',()=>{expect(main()).toContain('تغطية أقسام المعرفة');expect(main()).not.toContain('50%');expect(main()).toContain('17%');sw('open',1);expect(node('[data-sw-field="content"]').value).toContain('للقهوة');});
it('requires renewed consent after section text changes',()=>{sw('open',1);swCheck();swInput('content','Changed draft');expect(node('[data-sw-action="save"]').disabled).toBe(true);swCheck();sw('save');expect(data().sections[0].content).toBe('Changed draft');});
it('rejects a stale section after a simulated concurrent edit',()=>{sw('open',1);swInput('content','Draft');swCheck();sw('change');swCheck();sw('save');expect(main()).toContain('تغيّرت المعرفة');expect(data()).toBeNull();sw('refresh');expect(node('[data-sw-field="content"]').value).toContain('تغيّر');expect(node('[data-sw-ack]').checked).toBe(false);});
it('preserves the draft until discard is explicitly selected',()=>{sw('new');swInput('title','Unsaved');sw('close');expect(main()).toContain('مغادرة المراجعة');sw('keep');expect(node('[data-sw-field="title"]').value).toBe('Unsaved');});
it('filters paused knowledge separately from pending knowledge',()=>{sw('new');swInput('title','Paused');swInput('content',reason);swCheck();sw('save');const el=node('[data-sw-state]');el.value='paused';el.dispatchEvent(new w.Event('change',{bubbles:true}));expect(main()).toContain('Paused');expect(main()).not.toContain('عن متجر نواة');});
it('does not turn a section read failure into empty knowledge or a score',()=>{const el=node('[data-sw-read]');el.value='failure';el.dispatchEvent(new w.Event('change',{bubbles:true}));expect(main()).toContain('تعذّر قراءة');expect(main()).not.toContain('لا توجد أقسام');expect(w.document.querySelector('[data-section-coverage]')).toBeNull();});
it('shows descendant deletion and leaves unrelated sections',()=>{sw('open',1);sw('child');swInput('title','Child');swInput('content','Child content');swCheck();sw('save');sw('open',1);sw('delete');expect(main()).toContain('Child');expect(node('[data-sw-action="save"]').disabled).toBe(true);swCheck();sw('save');expect(data().sections.map((r:any)=>r.id)).toEqual([2]);});
