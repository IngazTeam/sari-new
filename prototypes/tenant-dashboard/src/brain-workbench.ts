import {createPageIntake} from './page-intake';
import {createPageWorkspace} from './page-workspace';
import { createSourceInventory } from './source-inventory';
import {createSectionWorkspace} from './section-workspace';
// @ts-nocheck
// Design preview only. No network, provider, message dispatch or experiment assignment.
import {
  emptyProtocolDraft,
  validateProtocolDraft,
  protocolStepFields,
  protocolSamplePreview,
} from "../../../client/src/lib/sales-experiment-form";
import {
  defaultFollowupPolicy,
  followupPolicySchema,
  suggestedFollowupTimezones,
} from "../../../shared/followup-policy";
import { salesSectorPlaybooks } from "../../../shared/sales-sector-playbooks";
import { salesCohortRules } from "../../../shared/sales-experiment-cohort";
import { replyReviewCriteria } from "../../../shared/sales-reply-review";

import { createBrainEvaluation } from "./brain-evaluation";
import { createConflictReview, conflictExamples } from './conflict-review';
import { createFaqList } from "./faq-list";
import { createBrainKnowledge } from "./brain-knowledge";

window.SaryBrainWorkbench = (() => {
  const key = "sary-brain-workbench-v1",
    clone = value => JSON.parse(JSON.stringify(value));
  const esc = value =>
    String(value ?? "").replace(
      /[&<>"']/g,
      c =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]
    );
  const typeNames = {
    identity: "هوية النشاط",
    services: "الخدمات والمنتجات",
    policies: "السياسات",
    faq: "الأسئلة الشائعة",
    contact: "التواصل",
    team: "فريق العمل",
    achievements: "الإنجازات",
    custom: "مخصص",
  };
  const sectorNames = {
    general: "عام",
    training: "التدريب",
    recruitment: "الاستقدام",
    store: "المتاجر",
  };
  const stages = {
    new: "جديد",
    interested: "مهتم",
    qualified: "مؤهّل",
    ready: "جاهز",
    payment_link_sent: "أُرسل رابط الدفع",
    payment_failed: "تعذّر الدفع",
    stalled: "متوقف",
  };
  const criteria = {
    answersQuestion: "يجيب عن السؤال",
    groundedInBusiness: "يستند إلى معرفة النشاط",
    appropriateNextStep: "خطوة تالية مناسبة",
    respectsCustomerDecision: "يحترم قرار العميل",
    noUnverifiedCommitment: "لا يتضمن وعدًا غير موثق",
    languageAndClarity: "لغة واضحة",
  };
  const initial = () => ({
    version: 1,
    conflicts: conflictExamples(),
    sector: "store",
    sectorRevision: 1,
    followup: clone(defaultFollowupPolicy),
    followupRevision: 1,
    sections: [
      {
        id: 1,
        type: "identity",
        title: "عن متجر نواة",
        content: "متجر توضيحي للقهوة المختصة وخيارات التحضير المنزلي.",
        approved: true,
      },
      {
        id: 2,
        type: "policies",
        title: "مراجعة مدة تجهيز الطلب",
        content: "يُجهّز الطلب خلال يوم عمل واحد وفق سياسة المثال.",
        approved: false,
      },
    ],
    sectionReceipts: [],
    pageReceipts: [],
    faqs: [
      {
        id: 1,
        question: "هل يتوفر طحن للتقطير؟",
        answer:
          "توجد خيارات طحن في كتالوج المثال. نراجع أداة التحضير قبل التوصية.",
      },
    ],
    pages: [
      {
        id: 1,
        title: "سياسة الشحن",
        url: "https://example.test/shipping",
        type: "shipping",
        content:
          "محتوى مثال: تجهيز الطلب خلال يوم عمل. مدة النقل تحتاج تحققًا بحسب المدينة.",
        active: true,
        read: true,
      },
      {
        id: 2,
        title: "صفحة بانتظار القراءة",
        url: "https://example.test/new",
        type: "other",
        content: "",
        active: false,
        read: false,
      },
    ],
    protocols: [],
    replyReviews: [],
    sends: [],
    history: [],
    candidate: false,
    run: null,
  });
  let data = initial();
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (
      saved?.version === 1 &&
      Array.isArray(saved.sections) &&
      Array.isArray(saved.protocols) &&
      Array.isArray(saved.history)
    )
      data = { ...initial(), ...saved };
  } catch {}
  let active = "knowledge",
    knowledgeTab = "sections",
    opsTab = "sector",
    role = "owner",
    mode = "success",
    error = "",
    historyFilter = "all",
    historyPage = 0;
  let draft = null,
    editorKind = "",
    errors = {},
    step = 0,
    selectedId = null,
    pending = null,
    attested = false,
    acknowledged = false,
    labOpen = false,
    baseRevision = null;
  const owner = () => role === "owner",
    btn = (label, action, attrs = "", primary = false) =>
      `<button type="button" class="button ${primary ? "primary" : ""}" data-bw-action="${action}" ${attrs}>${esc(label)}</button>`;
  const idAttr = id => `data-id="${esc(id)}"`,
    dis = () => (owner() && !pending ? "" : "disabled");
  const badge = text => `<span class="status gray">${esc(text)}</span>`;
  const note =
    '<p class="bw-note">تجربة محلية ببيانات مثال. لا تُرسل رسائل ولا تُشغّل تجارب ولا تُغيّر أداء ساري الفعلي.</p>';
  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }
  function log(category, label) {
    data.history.unshift({
      id: Date.now() + "-" + data.history.length,
      category,
      label,
      at: new Date().toISOString(),
    });
  }
  function refresh() {
    window.SaryBrainPreview.refresh();
  }
  function close() {
    document.getElementById("dialog").close();
  }
  function message(text) {
    window.toast(text);
  }
  function commit(change, label, category = "settings") {
    if (!owner() || pending) return false;
    if (mode === "failure") {
      error = "تعذّر الحفظ التجريبي. بقيت المسودة دون تغيير السجل المحفوظ.";
      return false;
    }
    if (mode === "stale") {
      error =
        "تغيّر الإصدار في هذه المحاكاة. حدّث المرجع وراجع المسودة من جديد.";
      attested = false;
      acknowledged = false;
      return false;
    }
    if (mode === "unknown") {
      pending = { change, label, category };
      error =
        "نتيجة الحفظ غير مؤكدة في هذه المحاكاة. تحقّق من نفس العملية قبل تعديلها أو تكرارها.";
      return false;
    }
    change();
    log(category, label);
    const saved = persist();
    error = "";
    message(
      saved
        ? "حُفظت النتيجة محليًا فقط."
        : "حُفظت في الجلسة فقط؛ التخزين في المتصفح غير متاح."
    );
    return true;
  }
  function lab() {
    return `<details class="bw-lab" ${labOpen ? "open" : ""}><summary>حالات تجربة التصميم</summary><div class="bw-grid"><label>الصلاحية<select data-bw-lab="role" ${pending ? "disabled" : ""}><option value="owner" ${owner() ? "selected" : ""}>مالك تجريبي</option><option value="viewer" ${!owner() ? "selected" : ""}>قراءة فقط</option></select></label><label>نتيجة العملية<select data-bw-lab="mode" ${pending ? "disabled" : ""}>${[
      ["success", "نجاح"],
      ["failure", "فشل الحفظ"],
      ["stale", "تغيّر الإصدار"],
      ["unknown", "نتيجة غير مؤكدة"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${mode === v ? "selected" : ""}>${t}</option>`
      )
      .join(
        ""
      )}</select></label></div><p>تخص هذه الخيارات الموك أب فقط؛ صلاحيات الخادم لا تُختبر هنا.</p></details>${!owner() ? '<p class="bw-warning">قراءة فقط: التعديل غير متاح لهذا الدور التجريبي.</p>' : ""}`;
  }
  function alert() {
    return error
      ? `<div class="bw-warning" role="alert"><p>${esc(error)}</p>${pending ? btn("التحقق من نفس العملية", "reconcile") : mode === "stale" ? btn("تحديث المرجع مع إبقاء المسودة", "refresh-basis") : ""}</div>`
      : "";
  }
  function tabs(items, current, action) {
    return `<nav class="bw-tabs" aria-label="الأقسام الفرعية">${items.map(([v, t]) => btn(t, action, `data-value="${v}" aria-pressed="${current === v}"`)).join("")}</nav>`;
  }
  function field(
    name,
    label,
    {
      type = "text",
      options,
      required = true,
      min,
      max,
      maxlength = 3000,
      help = "",
    } = {}
  ) {
    const id = "bw-" + name,
      value = draft?.[name] ?? "",
      attrs = `id="${id}" name="${name}" data-bw-field ${required ? "required" : ""} ${pending || !owner() ? "disabled" : ""} ${errors[name] ? `aria-invalid="true" aria-describedby="${id}-error"` : help ? `aria-describedby="${id}-help"` : ""}`;
    const input = options
      ? `<select ${attrs}>${Object.entries(options)
          .map(
            ([v, t]) =>
              `<option value="${esc(v)}" ${String(value) === v ? "selected" : ""}>${esc(t)}</option>`
          )
          .join("")}</select>`
      : type === "textarea"
        ? `<textarea ${attrs} rows="4" maxlength="${maxlength}">${esc(value)}</textarea>`
        : `<input ${attrs} type="${type}" value="${esc(value)}" maxlength="${maxlength}" ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""} ${["number", "datetime-local", "url"].includes(type) ? 'dir="ltr"' : ""}>`;
    return `<div class="field"><label for="${id}">${esc(label)}${required ? " *" : ""}</label>${input}${help ? `<small id="${id}-help">${esc(help)}</small>` : ""}${errors[name] ? `<p class="bw-field-error" id="${id}-error">${esc(errors[name])}</p>` : ""}</div>`;
  }
  function check(name, label, checked = false) {
    return `<label class="bw-check"><input type="checkbox" data-bw-check="${name}" ${checked ? "checked" : ""} ${dis()}><span>${esc(label)}</span></label>`;
  }
  function editor(title, body, submit = "حفظ محلي") {
    window.openDialog(
      title,
      `<form data-bw-form class="bw-editor" novalidate><div class="bw-scroll">${note}${alert()}${body}</div><footer class="bw-savebar">${btn(pending ? "إخفاء النافذة مع إبقاء العملية" : "إلغاء", "close")}<button type="submit" class="button primary" ${dis()}>${submit}</button></footer></form>`
    );
  }
  function start(kind, values = {}, id = null) {
    if (!owner() || pending) return;
    editorKind = kind;
    draft = clone(values);
    selectedId = id;
    errors = {};
    error = "";
    attested = false;
    acknowledged = false;
    step = 0;
    baseRevision = data.sectorRevision;
    showEditor();
  }
  function knowledge() {
    return (
      tabs(
        [
          ["sections", "أقسام المعرفة"],
          ["faq", "الأسئلة الشائعة"],
          ["conflicts", "مراجعة التعارضات"],
          ["website", "صفحات الموقع"],
        ],
        knowledgeTab,
        "knowledge-tab"
      ) +
      (knowledgeTab === "conflicts" ? conflictWorkspace.render() : knowledgeTab === "status"
        ? knowledgeWorkbench.status()
        : knowledgeTab === "sources"
          ? knowledgeWorkbench.sources()
          : knowledgeTab === "sections"
            ? sectionWorkspace.render()
            : knowledgeTab === "faq"
              ? faqList.render()
              : knowledgeTab === "website"
                ? pageWorkspace.render()+pageIntake.render()+`<section class="panel panel-pad">${knowledgeWorkbench.websiteButton()}</section>`
                : knowledgeWorkbench.intakeSummary())
    );
  }
  function operations() {
    return (
      tabs(
        [
          ["sector", "دليل القطاع"],
          ["followup", "المتابعة"],
          ["experiments", "تجارب البيع"],
          ["replies", "مراجعة الردود"],
          ["evaluation", "التقييم والأرشيف"],
        ],
        opsTab,
        "ops-tab"
      ) +
      (opsTab === "sector"
        ? sector()
        : opsTab === "followup"
          ? followup()
          : opsTab === "experiments"
            ? experiments()
            : opsTab === "evaluation"
              ? evaluationWorkbench.summary()
              : replies())
    );
  }
  function sector() {
    const p = salesSectorPlaybooks.find(p => p.id === data.sector);
    return `<section class="panel panel-pad"><div class="panel-head"><div><h2>دليل البيع حسب القطاع</h2><p>أسلوب الحوار منفصل عن الكتالوج وصلاحيات الخصم والحجز.</p></div>${btn("تغيير القطاع", "sector", dis(), true)}</div><h3>${sectorNames[data.sector]}</h3><p>الإصدار المحلي ${data.sectorRevision}</p><div class="bw-grid"><article class="bw-card"><h3>أسئلة فهم الاحتياج</h3><ul>${p.qualification.map(q => `<li>${esc(q.question)}</li>`).join("")}</ul></article><article class="bw-card"><h3>الترشيح وحدوده</h3><ul>${[...p.recommendation, ...p.boundaries].map(v => `<li>${esc(v)}</li>`).join("")}</ul></article></div><details><summary>التعامل مع الاعتراضات</summary>${p.objections.map(o => `<p>${esc(o.response)}</p>`).join("")}</details></section>`;
  }
  function followup() {
    const p = data.followup;
    return `<section class="panel panel-pad"><div class="panel-head"><div><h2>سياسة المتابعة</h2><p>وقت التواصل وعدد المحاولات، مع احترام رفض العميل.</p></div>${btn("تعديل السياسة", "followup", dis(), true)}</div><div class="bw-facts"><p>الحالة: <strong>${p.enabled ? "مفعّلة في الإعداد التوضيحي" : "متوقفة"}</strong></p><p>المنطقة: <bdi>${esc(p.timeZone)}</bdi></p><p>النافذة: <bdi>${p.startHour}:00 – ${p.endHour}:00</bdi></p><p>الحد الأسبوعي: ${p.weeklyLimit}</p></div><p>هذه إعدادات محلية. لا تنشئ جدولة أو رسالة ولا تتجاوز موافقة العميل أو التدخل البشري.</p><a class="button" href="#/page/merchant/bot-settings">سياسات الخصم والهامش وإعدادات الرد</a></section>`;
  }
  const activeProtocol = () =>
    data.protocols.some(p => p.state === "registered");
  const reviewedLearning = () => {
    const r = window.SaryBrainPreview.reviewResult();
    return r?.cases?.length === 8 &&
      r.cases.every(c => c.candidateVerdict === "pass")
      ? JSON.stringify(r)
      : null;
  };
  const candidateReady = () =>
    Boolean(data.candidate && data.candidateReview === reviewedLearning());
  const sentReview = () =>
    data.sends.some(s => s.reviewId === data.replyReviews[0]?.id);
  const evaluatedOutputs = () =>
    candidateReady() &&
    String(data.run?.id).startsWith("evaluation:") &&
    data.run?.candidate === data.candidateReview &&
    data.run?.status === "reviewed" &&
    Boolean(data.run?.reviewSnapshot);
  const canAuthorize = p =>
    p?.review?.verdict === "approved" &&
    evaluatedOutputs() &&
    p.review.runId === data.run?.id &&
    Boolean(data.run?.reviewSnapshot) &&
    p.review.resultSnapshot === data.run.reviewSnapshot;
  const protocol = () => data.protocols.find(p => p.id === Number(selectedId));
  const experimentDisabled = () =>
    dis() + (evaluationWorkbench.hasDraft() ? " disabled" : "");
  const evaluationDraftNotice = () =>
    evaluationWorkbench.hasDraft()
      ? '<p class="bw-warning">لديك مسودة مراجعة مخرجات. أكملها أو ألغها صراحة قبل تعديل التجربة.</p><button class="button" data-be-action="open">استئناف مراجعة المخرجات</button>'
      : "";
  function experiments() {
    return `${evaluationDraftNotice()}<section class="panel panel-pad"><div class="panel-head"><div><h2>تجربة بيع بخطوات قابلة للمراجعة</h2><p>تجهيز المرشح ← التصميم ← التأهيل ← مراجعة مستقلة ← إذن التشغيل.</p></div>${btn("تصميم تجربة جديدة", "new-protocol", `${experimentDisabled()} ${!candidateReady() || activeProtocol() ? "disabled" : ""}`, true)}</div><article class="bw-card"><h3>المرشح التوضيحي</h3><p>تحسين سؤال احتياج العميل قبل اقتراح المنتج. تجهيز المرشح لا يفعّل سياسة جديدة.</p>${badge(candidateReady() ? "مرشح محلي محفوظ" : "لم يُجهّز المرشح أو تغيّرت مراجعته")}${btn("تجهيز مرشح من مراجعة التعلم", "prepare-candidate", experimentDisabled())}</article><div class="bw-cards">${data.protocols.map(p => `<article class="bw-card"><h3>${esc(p.design.title)}</h3>${badge(p.state === "withdrawn" ? "مسحوبة دون فائز" : p.launch === "revoked" ? "إذن التشغيل مسحوب" : p.launch === "authorized" ? "إذن محلي فقط" : p.review?.verdict === "approved" ? (canAuthorize(p) ? "خطة مراجَعة" : "المراجعة تحتاج تحديثًا") : "خطة مسجلة")}<p>قطاع ${sectorNames[p.sector]} · ${p.design.sample.minimumCustomersPerArm} عميل لكل مجموعة</p>${btn("تفاصيل وخطوات التجربة", "protocol", idAttr(p.id))}</article>`).join("") || '<p class="bw-empty">لا توجد تجارب مسجلة. ابدأ بمراجعة التعلم ثم جهّز المرشح.</p>'}</div></section>`;
  }
  const replyText =
    "بن كولومبيا في كتالوج المثال بسعر 64 ريالًا. ما طريقة التحضير التي تفضلها لأراجع خيار الطحن المناسب؟";
  function replies() {
    return `<section class="panel panel-pad"><h2>مراجعة الرد قبل الإرسال</h2><p>الحكم على الرد لا يرسل رسالة. راجع السياق والمصدر ثم إجراءات الإرسال منفصلة.</p><article class="bw-card"><h3>العميل في المثال</h3><blockquote>كم سعر بن كولومبيا، وأي طحن يناسبني؟</blockquote><h3>رد ساري المراد مراجعته</h3><p>${replyText}</p><p>المصدر: كتالوج المثال · 64 ريالًا. وقت المراجعة في المعاينة مستقل عن بيانات المتجر.</p><div class="bw-actions">${btn("مراجعة الرد", "reply-review", dis(), true)}${btn("مراجعة الإرسال", "send-review", `${dis()} ${data.replyReviews[0]?.outcome !== "approved" || sentReview() ? "disabled" : ""}`)}</div></article><details><summary>سجل مراجعات الرد (${data.replyReviews.length})</summary>${
      data.replyReviews
        .map(
          r =>
            `<article class="bw-card"><h3>${r.outcome === "approved" ? "اجتاز المراجعة" : "رُفض الرد"}</h3><blockquote>${esc(r.quote)}</blockquote><p>${esc(r.rationale)}</p><ul>${Object.entries(
              r.checks
            )
              .map(
                ([k, v]) =>
                  `<li>${criteria[k]}: ${v === "pass" ? "اجتاز" : "لم يجتز"}</li>`
              )
              .join("")}</ul></article>`
        )
        .join("") || "<p>لا توجد مراجعات محفوظة.</p>"
    }</details>${data.sends.map(r => `<p class="bw-warning">${esc(r.label ?? r)} · محاكاة محلية، لم تُرسل رسالة.</p>`).join("")}</section>`;
  }
  function history() {
    const rows = data.history.filter(
        r => historyFilter === "all" || r.category === historyFilter
      ),
      slice = rows.slice(historyPage * 10, historyPage * 10 + 10);
    return `<section class="panel panel-pad"><h2>سجل المراجعات والتغييرات المحلية</h2><label class="bw-filter">نوع النشاط<select data-bw-history>${Object.entries(
      {
        all: "الكل",
        knowledge: "المعرفة",
        settings: "الإعدادات",
        experiment: "التجارب",
        reply: "الردود",
      }
    )
      .map(
        ([k, t]) =>
          `<option value="${k}" ${historyFilter === k ? "selected" : ""}>${t}</option>`
      )
      .join(
        ""
      )}</select></label>${slice.map(r => `<article class="bw-card"><h3>${esc(r.label)}</h3><time dir="ltr">${esc(r.at)}</time>${badge("سجل الموك أب")}</article>`).join("") || '<p class="bw-empty">لا يوجد نشاط في هذه الفئة.</p>'}<div class="bw-actions">${btn("الأحدث", "history-prev", historyPage === 0 ? "disabled" : "")}<span>صفحة ${historyPage + 1}</span>${btn("الأقدم", "history-next", (historyPage + 1) * 10 >= rows.length ? "disabled" : "")}</div></section>`;
  }
  function render(section, pane) {
    if (section === 'knowledge' && pane) knowledgeTab = pane === 'pages' ? 'website' : pane;
    active = section;
    return `<div class="bw-workbench">${lab()}${alert()}${{ knowledge, operations, history, sources: () => knowledgeWorkbench.sources()+knowledgeWorkbench.intakeSummary() }[section]()}${note}</div>`;
  }
  const nextId = rows => Math.max(0, ...rows.map(r => r.id)) + 1;
  const protocolLabels = {
    title: "اسم التجربة",
    hypothesis: "الفرضية",
    population: "الجمهور",
    qualificationRule: "تعريف التأهيل",
    exclusions: "الاستبعادات",
    minimumCustomersPerArm: "العملاء لكل مجموعة",
    baselinePercent: "التحويل الأساسي %",
    liftPercentagePoints: "الزيادة المطلقة المستهدفة بالنقاط المئوية",
    calculationReference: "مرجع حساب حجم العينة",
    enrollmentStartsAt: "بداية التسجيل UTC",
    enrollmentEndsAt: "نهاية التسجيل UTC",
    observationDays: "أيام متابعة العميل",
    decisionNotBefore: "أول وقت لاتخاذ القرار UTC",
    safetyTriggers: "أسباب إيقاف التجربة",
  };
  function protocolSummary(p) {
    return `<div class="bw-summary"><h3>${esc(p.title)}</h3><p>${esc(p.hypothesis)}</p><p>الجمهور: ${{ all: "الجميع", new: "جدد", returning: "عائدون" }[p.cohort.population]}</p><p>التأهيل: ${esc(p.cohort.qualificationRule)}</p><p>الاستبعاد: ${esc(p.cohort.exclusions)}</p><p>توزيع ثابت 50/50 لكل عميل داخل المتجر. القياس: تحويل الدفع المؤكد؛ المرتجعات تخصم من صافي الإيراد، والعملات والمساعدة البشرية تعرض منفصلة.</p><p>${p.sample.minimumCustomersPerArm} عميل لكل مجموعة · خط أساس ${p.sample.baselineConversionBps / 100}% · زيادة مطلقة ${p.sample.minimumAbsoluteLiftBps / 100} نقطة</p><p>مرجع الحساب: ${esc(p.sample.calculationReference)}</p><p dir="ltr">${esc(p.window.enrollmentStartsAt)} → ${esc(p.window.enrollmentEndsAt)}</p><p>المتابعة ${p.window.observationDays} يومًا · القرار بعد <bdi>${esc(p.window.decisionNotBefore)}</bdi></p><p>إيقاف السلامة: ${esc(p.stopping.safetyTriggers)}</p><p>إذا لم تكتمل العينة لا نعلن فائزًا ولا نمدد النافذة تلقائيًا.</p></div>`;
  }
  function showEditor() {
    if (editorKind === "approve") {
      const row = data.sections.find(s => s.id === Number(selectedId));
      return editor(
        "اعتماد قسم المعرفة",
        `<blockquote>${esc(row?.content)}</blockquote>${check("attest", "راجعت هذا النص وأوافق على اعتماده في المثال.", attested)}`,
        "اعتماد محلي"
      );
    }
    if (editorKind === "delete")
      return editor(
        "حذف سجل المعرفة",
        `${draft?.kind === "faqs" ? `<blockquote>${esc(data.faqs.find(r => r.id === Number(selectedId))?.question || "")}</blockquote><p>يُحذف سجل السؤال المحلي فقط. تبقى نسخه في مصادر أخرى ورسائل المحادثات السابقة.</p>` : ""}<p>سيُحذف هذا السجل المحلي. لا يتأثر مصدر في متجر حقيقي.</p>${check("attest", "راجعت السجل وأوافق على حذفه من المثال.", attested)}`,
        "تأكيد الحذف المحلي"
      );
    if (editorKind === "section")
      return editor(
        "قسم معرفة جديد",
        field("type", "نوع القسم", { options: typeNames }) +
          field("title", "عنوان القسم", { maxlength: 500 }) +
          field("content", "المحتوى", { type: "textarea", maxlength: 50000 }) +
          check(
            "attest",
            "راجعت المعلومة ومصدرها؛ ستُضاف كمعرفة يدوية في المثال.",
            attested
          )
      );
    if (editorKind === "faq")
      return editor(
        selectedId ? "مراجعة السؤال" : "سؤال شائع جديد",
        field("question", "السؤال", { maxlength: 500 }) +
          field("answer", "الإجابة", { type: "textarea", maxlength: 2000 }) + field("category", "التصنيف", {required:false,maxlength:100}) + field("isActive", "إبقاء السؤال متاحًا", {options:{true:"نعم",false:"لا"}}) + field("useInBot", "السماح باستخدامه في ردود العملاء", {options:{false:"غير مفعّل",true:"مفعّل"}}) + check("attest","راجعت الإجابة وأوافق على استخدامها في الردود عند تفعيلها.",attested) + "<p>الحفظ وحده لا يثبت دقة الردود. تفعيل الاستخدام يتطلب مراجعتك.</p>"
      );
    if (editorKind === "intake")
      return editor(
        "مراجعة نص قبل الحفظ",
        field("title", "عنوان المصدر", { maxlength: 200 }) +
          field("content", "النص المراد مراجعته", {
            type: "textarea",
            maxlength: 10000,
          }) +
          check(
            "attest",
            "راجعت النص بنفسي؛ لا توجد نتيجة تحليل آلي لهذا النص.",
            attested
          ),
        "حفظ كقسم يحتاج مراجعة"
      );
    if (editorKind === "sector")
      return editor(
        "اختيار دليل القطاع",
        field("sector", "القطاع", { options: sectorNames }) +
          "<p>تغيير القطاع يغيّر مرجع التجارب الجديدة، ولا يعدّل تصميم تجربة مسجلة.</p>"
      );
    if (editorKind === "followup")
      return editor(
        "تعديل سياسة المتابعة",
        check("enabled", "تفعيل المتابعة في الإعداد التوضيحي", draft.enabled) +
          `<div class="bw-grid">${field("timeZone", "المنطقة الزمنية", { maxlength: 64, help: suggestedFollowupTimezones.join(" · ") })}${field("weeklyLimit", "الحد الأسبوعي", { type: "number", min: 1, max: 3 })}${field("startHour", "بداية التواصل (ساعة)", { type: "number", min: 0, max: 23 })}${field("endHour", "نهاية التواصل (ساعة)", { type: "number", min: 1, max: 24 })}</div><p>النهاية بعد البداية في اليوم نفسه؛ إيقاف المتابعة لا يرسل أي رسالة.</p>`
      );
    if (editorKind === "protocol") {
      const validation = validateProtocolDraft(draft),
        sample = protocolSamplePreview(draft),
        steps = ["الجمهور", "العينة", "الموعد", "المراجعة"];
      const body =
        step === 3
          ? validation.design
            ? protocolSummary(validation.design) +
              check(
                "attest",
                "راجعت التصميم وأفهم أن التسجيل لا يبدأ تجربة.",
                attested
              )
            : '<p role="alert">راجع الحقول والخطوات السابقة.</p>'
          : protocolStepFields[step]
              .map(name =>
                field(
                  name,
                  protocolLabels[name],
                  name === "population"
                    ? {
                        options: {
                          all: "كل العملاء المؤهلين",
                          new: "عملاء جدد",
                          returning: "عملاء عائدون",
                        },
                      }
                    : name.includes("At") || name === "decisionNotBefore"
                      ? {
                          type: "datetime-local",
                          help: "الوقت مدخل بتوقيت UTC، دون تحويل تلقائي لتوقيت المتصفح.",
                        }
                      : ["minimumCustomersPerArm", "observationDays"].includes(
                            name
                          )
                        ? { type: "number" }
                        : ["baselinePercent", "liftPercentagePoints"].includes(
                              name
                            )
                          ? {
                              help: "نسبة، مثل 10 أو 2.5. تدعم الأرقام العربية.",
                            }
                          : name === "title"
                            ? { maxlength: 160 }
                            : { type: "textarea", help: "30 حرفًا على الأقل." }
                )
              )
              .join("");
      return editor(
        "تصميم تجربة بيع",
        `<ol class="bw-steps">${steps.map((s, i) => `<li ${step === i ? 'aria-current="step"' : ""}>${i + 1}. ${s}</li>`).join("")}</ol>${body}${step === 1 && sample ? `<p class="bw-warning">الحد المحسوب لكل مجموعة: ${sample.requiredPerArm ?? "راجع المدخلات"} · ${sample.status === "meets_calculated_floor" ? "العدد يحقق الحد المحسوب، ويحتاج مراجعة مستقلة." : "العينة المقترحة لا تحقق الحد المحسوب."}</p>` : ""}<div class="bw-actions">${btn("السابق", "step-back", step === 0 || pending ? "disabled" : "")}${step < 3 ? btn("التالي", "step-next", pending ? "disabled" : "") : ""}</div>`,
        step === 3 ? "تسجيل التصميم محليًا" : "متابعة إلى الخطوة التالية"
      );
    }
    if (editorKind === "cohort")
      return editor(
        "تأهيل جمهور التجربة",
        `<div class="bw-grid">${field("minimumCharacters", "أقل عدد أحرف", { type: "number", min: 1, max: 4000 })}${field("maximumCharacters", "أكبر عدد أحرف", { type: "number", min: 1, max: 4000 })}</div>${field("requiredAnyTerms", "كلمات يكفي وجود إحداها", { type: "textarea", required: false, help: "كلمة أو عبارة في كل سطر؛ حتى 20، من 2 إلى 80 حرفًا." })}<fieldset><legend>مراحل البيع المسموحة</legend>${errors.allowedDealStages ? '<p class="bw-field-error" role="alert">اختر مرحلة واحدة على الأقل.</p>' : ""}${Object.entries(
          stages
        )
          .map(([k, t]) =>
            check("stage-" + k, t, draft.allowedDealStages.includes(k))
          )
          .join(
            ""
          )}</fieldset>${field("excludedPhones", "أرقام مستبعدة", { type: "textarea", required: false, help: "حتى 200 رقم مع رمز الدولة، رقم في كل سطر. استخدم بيانات مثال فقط." })}${field("mappingReview", "كيف تطابق هذه الشروط التعريف المسجّل؟", { type: "textarea", help: "30 حرفًا على الأقل." })}<p>الشروط الثابتة: رسالة نصية حديثة، محادثة نشطة، دون تدخل بشري، وبعد حد التحويل. التجميد لا يوزّع العملاء.</p>${check("attest", "راجعت مطابقة الشروط لتعريف الجمهور المسجّل.", attested)}`,
        "تجميد شروط المثال"
      );
    if (editorKind === "experiment-review")
      return editor(
        "مراجعة خطة التجربة",
        field("verdict", "القرار", {
          options: { "": "اختر القرار", approved: "موافقة", rejected: "رفض" },
        }) +
          Object.entries({
            baselineAndSample: "خط الأساس والعينة",
            recruitmentFeasibility: "إمكانية جمع العينة",
            qualificationMapping: "مطابقة التأهيل",
            safetyAndMeasurement: "السلامة والقياس",
          })
            .map(([k, t]) =>
              field(k, t, {
                type: "textarea",
                help: "30 حرفًا على الأقل لكل محور.",
              })
            )
            .join("") +
          check(
            "attest",
            "راجعت التصميم ونتائج المثال؛ الحساب هنا محاكاة لمراجع مستقل.",
            attested
          ) +
          check(
            "ack",
            "الحفظ لا يفعّل التجربة ولا يثبت استقلالية مراجع حقيقي.",
            acknowledged
          )
      );
    if (["withdraw", "authorize", "revoke"].includes(editorKind))
      return editor(
        {
          withdraw: "سحب تصميم التجربة",
          authorize: "مراجعة إذن التشغيل",
          revoke: "سحب إذن التشغيل",
        }[editorKind],
        `<p>${editorKind === "authorize" ? "إذن التشغيل منفصل عن تسجيل التصميم والمراجعة. هذه المحاكاة لا تنشئ عملاء أو رسائل." : "يُحتفظ بالسجل ولا يُعلن فائز."}</p>` +
          field("reason", "سبب القرار", {
            type: "textarea",
            help: "30 حرفًا على الأقل.",
          }) +
          check("attest", "راجعت التصميم والحالة وأثر القرار.", attested) +
          (editorKind === "authorize"
            ? check(
                "ack",
                "أفهم أن هذا إذن محلي فقط، دون إرسال أو توزيع عملاء.",
                acknowledged
              )
            : "")
      );
    if (editorKind === "reply")
      return editor(
        "مراجعة رد ساري",
        `<blockquote>${replyText}</blockquote><div class="bw-grid">${replyReviewCriteria.map(k => field(k, criteria[k], { options: { "": "اختر الحكم", pass: "اجتاز", fail: "لم يجتز" } })).join("")}</div>${field("quote", "اقتباس من الرد", { type: "textarea", maxlength: 2000, help: "انسخ جزءًا مطابقًا من الرد أعلاه." })}${field("rationale", "سبب الحكم", { type: "textarea", help: "30 حرفًا على الأقل." })}${check("attest", "راجعت الرد كاملًا وفق المحاور الستة.", attested)}${check("ack", "أفهم أن اعتماد المراجعة لا يرسل الرسالة.", acknowledged)}`
      );
    if (editorKind === "send")
      return editor(
        "راجع قبل محاكاة الإرسال",
        field("account", "قناة الإرسال", {
          options: {
            "": "اختر قناة المثال",
            demo: "واتساب نواة · حساب توضيحي",
          },
        }) +
          `<div class="bw-summary"><h3>المستلم في المثال</h3><p dir="ltr">+966500000000</p><h3>النص الذي ستراجعه</h3><p>${replyText}</p></div>${field("reason", "سبب الإرسال", { type: "textarea", maxlength: 1200, help: "30 حرفًا على الأقل؛ لا تُدخل معلومات عميل حقيقية." })}${check("attest", "راجعت رقم المثال والنص والقناة.", attested)}${check("ack", "أوافق على محاكاة النتيجة فقط، دون اتصال بواتساب.", acknowledged)}`,
        "محاكاة قبول المزود"
      );
  }
  function protocolView(id) {
    selectedId = Number(id);
    const p = protocol();
    if (!p) return;
    window.openDialog(
      "تفاصيل تجربة البيع",
      `<div class="bw-detail">${note}${alert()}${evaluationDraftNotice()}${protocolSummary(p.design)}<p>القطاع عند التسجيل: ${sectorNames[p.sector]} · الإصدار ${p.sectorRevision}</p><ol class="bw-stages"><li>التصميم: ${p.state === "withdrawn" ? "مسحوب" : "مسجل"}</li><li>التأهيل: ${p.cohort ? "مجمّد" : "لم يُجهّز"}</li><li>مراجعة الخطة: ${p.review ? (p.review.verdict === "approved" ? (canAuthorize(p) ? "موافقة توضيحية" : "المراجعة تحتاج تحديثًا") : "مرفوضة") : "غير مراجَعة"}</li><li>التشغيل: ${p.launch === "authorized" ? "إذن محلي محفوظ" : p.launch === "revoked" ? "الإذن مسحوب" : "غير مأذون"}</li></ol>${p.withdrawal ? `<p>سبب السحب: ${esc(p.withdrawal)}</p>` : ""}${p.cohort ? `<details><summary>شروط التأهيل المحفوظة</summary><p>من ${p.cohort.minimumCharacters} إلى ${p.cohort.maximumCharacters} حرف · المراحل ${p.cohort.allowedDealStages.map(k => stages[k]).join("، ")}</p><p>${esc(p.mappingReview)}</p></details>` : ""}<div class="bw-actions">${btn("تأهيل الجمهور", "cohort", `${experimentDisabled()} ${p.state !== "registered" || p.cohort ? "disabled" : ""}`)}${btn("فحص حالة تأهيل توضيحية", "inspect", !p.cohort ? "disabled" : "")}${btn("مراجعة مستقلة للخطة", "experiment-review", `${experimentDisabled()} ${p.state !== "registered" || !p.cohort || !evaluatedOutputs() ? "disabled" : ""}`)}${btn("إذن التشغيل", "authorize", `${experimentDisabled()} ${p.state !== "registered" || !canAuthorize(p) || p.launch ? "disabled" : ""}`)}${btn("سحب الإذن", "revoke", `${experimentDisabled()} ${p.launch !== "authorized" ? "disabled" : ""}`)}${btn("سحب التصميم", "withdraw", `${experimentDisabled()} ${p.state !== "registered" ? "disabled" : ""}`)}</div><p>مراجعة الخطة تتطلب شروط تأهيل مجمّدة ونتائج تجربة ردود مراجَعة. السحب لا يحذف السجل ولا يعلن نجاحًا.</p>${btn("عرض تجربة الردود التوضيحية", "evaluation")}</div>`
    );
  }
  function errorsForForm() {
    errors = {};
    const required = (k, min = 1, max = 3000) => {
      if (
        String(draft[k] ?? "").trim().length < min ||
        String(draft[k]).length > max
      )
        errors[k] = `أدخل من ${min} إلى ${max} حرفًا.`;
    };
    if (editorKind === "section") {
      required("title", 1, 500);
      required("content", 1, 50000);
      if (!typeNames[draft.type]) errors.type = "اختر نوع القسم.";
    }
    if (editorKind === "faq") {
      required("question", 3, 500);
      required("answer", 3, 2000);
      if (!selectedId && data.faqs.length >= 50)
        errors.question = "وصلت إلى الحد الأقصى 50 سؤالًا.";
    }
    if (editorKind === "intake") {
      required("title", 1, 200);
      required("content", 1, 10000);
    }
    if (editorKind === "sector" && !sectorNames[draft.sector])
      errors.sector = "اختر قطاعًا من القائمة.";
    if (editorKind === "followup") {
      const p = {
        ...draft,
        startHour: draft.startHour === "" ? NaN : Number(draft.startHour),
        endHour: draft.endHour === "" ? NaN : Number(draft.endHour),
        weeklyLimit: draft.weeklyLimit === "" ? NaN : Number(draft.weeklyLimit),
      };
      const result = followupPolicySchema.safeParse(p);
      if (!result.success)
        for (const issue of result.error.issues) {
          const name = issue.path[0] || "endHour";
          errors[name] =
            {
              timeZone: "أدخل منطقة زمنية صحيحة، مثل Asia/Riyadh.",
              startHour: "اختر ساعة من 0 إلى 23.",
              endHour: "اختر ساعة من 1 إلى 24، بعد ساعة البداية.",
              weeklyLimit: "اختر حدًا أسبوعيًا من 1 إلى 3.",
            }[name] || "راجع قيمة هذا الحقل.";
        }
    }
    if (editorKind === "protocol") {
      const v = validateProtocolDraft(draft);
      for (const k of v.invalid)
        errors[k] = "راجع هذا الحقل وحدوده وارتباطه ببقية الخطة.";
    }
    if (editorKind === "cohort") {
      const parsed = cohortPayload();
      if (!parsed.success)
        for (const issue of parsed.error.issues)
          errors[issue.path[0] || "maximumCharacters"] =
            "راجع الحدود والخيارات لهذه الشروط.";
      required("mappingReview", 30);
    }
    if (editorKind === "experiment-review") {
      if (!["approved", "rejected"].includes(draft.verdict))
        errors.verdict = "اختر قرارًا صريحًا.";
      [
        "baselineAndSample",
        "recruitmentFeasibility",
        "qualificationMapping",
        "safetyAndMeasurement",
      ].forEach(k => required(k, 30));
    }
    if (["withdraw", "revoke", "authorize", "send"].includes(editorKind))
      required("reason", 30, editorKind === "send" ? 1200 : 3000);
    if (editorKind === "reply") {
      replyReviewCriteria.forEach(k => {
        if (!["pass", "fail"].includes(draft[k]))
          errors[k] = "اختر حكمًا لكل محور.";
      });
      required("rationale", 30);
      required("quote", 1, 2000);
      if (!replyText.includes(draft.quote))
        errors.quote = "يجب أن يطابق الاقتباس جزءًا من الرد الذي تراجعه.";
    }
    if (editorKind === "send" && draft.account !== "demo")
      errors.account = "اختر قناة المثال.";
    return !Object.keys(errors).length;
  }
  function cohortPayload() {
    return salesCohortRules.safeParse({
      version: "sales-cohort-rules.v1",
      historyDefinition: "owned_inbound_before_enrollment",
      messageType: "text",
      minimumCharacters: Number(draft.minimumCharacters),
      maximumCharacters: Number(draft.maximumCharacters),
      requiredAnyTerms: draft.requiredAnyTerms
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean),
      allowedDealStages: draft.allowedDealStages,
      excludedPhones: draft.excludedPhones
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean),
      requireActiveConversation: true,
      excludeHumanTakeover: true,
      requireLatestInbound: true,
      requirePostHandoffInbound: true,
    });
  }
  function save() {
    if (!owner() || pending || !draft) return;
    if (editorKind === "protocol" && step < 3) {
      errorsForForm();
      const keys = protocolStepFields[step];
      errors = Object.fromEntries(
        Object.entries(errors).filter(([k]) => keys.includes(k))
      );
      if (!Object.keys(errors).length) step++;
      showEditor();
      return;
    }
    if (!errorsForForm()) {
      showEditor();
      document.querySelector("[data-bw-form] [aria-invalid=true]")?.focus();
      return;
    }
    if (
      [
        "section",
        "intake",
        "protocol",
        "cohort",
        "experiment-review",
        "withdraw",
        "authorize",
        "revoke",
        "reply",
        "send",
      ].includes(editorKind) &&
      (!attested ||
        (["experiment-review", "authorize", "reply", "send"].includes(
          editorKind
        ) &&
          !acknowledged))
    ) {
      error = "أكمل إقرار المراجعة بعد التحقق من التفاصيل.";
      showEditor();
      return;
    }
    if (
      [
        "protocol",
        "cohort",
        "experiment-review",
        "authorize",
        "withdraw",
        "revoke",
      ].includes(editorKind) &&
      evaluationWorkbench.hasDraft()
    )
      return;
    if (editorKind === "faq" && String(draft.isActive) === "true" && String(draft.useInBot) === "true" && !attested) { error="راجع الإجابة وأكمل الموافقة قبل التفعيل."; showEditor(); return; }
    const v = clone(draft),
      kind = editorKind,
      p = protocol();
    if (
      ["sector", "protocol"].includes(kind) &&
      baseRevision !== data.sectorRevision
    ) {
      error = "تغيّر مرجع القطاع. حدّث المرجع وراجع المسودة.";
      showEditor();
      return;
    }
    if (
      [
        "cohort",
        "experiment-review",
        "authorize",
        "withdraw",
        "revoke",
      ].includes(kind) &&
      (!p || p.state !== "registered")
    )
      return;
    if (kind === "experiment-review" && (!p.cohort || !evaluatedOutputs()))
      return;
    if (kind === "authorize" && (!canAuthorize(p) || p.launch)) return;
    if (kind === "revoke" && p.launch !== "authorized") return;
    if (kind === "cohort" && p.cohort) return;
    if (
      kind === "send" &&
      (data.replyReviews[0]?.outcome !== "approved" || sentReview())
    )
      return;
    if (kind === "protocol" && (!candidateReady() || activeProtocol())) return;
    if (kind === "followup" && baseRevision !== data.followupRevision) {
      error = "تغيّر مرجع المتابعة. حدّث المرجع وراجع المسودة.";
      showEditor();
      return;
    }
    const design =
        kind === "protocol" ? validateProtocolDraft(draft).design : null,
      cohort = kind === "cohort" ? cohortPayload().data : null;
    const operations = {
      section: () =>
        data.sections.unshift({
          id: nextId(data.sections),
          ...v,
          approved: true,
        }),
      faq: () => { const values={...v,isActive:String(v.isActive)==="true",useInBot:String(v.useInBot)==="true"}; if(selectedId) Object.assign(data.faqs.find(r=>r.id===Number(selectedId)),values);else data.faqs.unshift({id:nextId(data.faqs),...values}); },
      intake: () =>
        data.sections.unshift({
          id: nextId(data.sections),
          type: "custom",
          ...v,
          approved: false,
        }),
      sector: () => {
        data.sector = v.sector;
        data.sectorRevision++;
      },
      followup: () => {
        data.followup = {
          ...v,
          startHour: Number(v.startHour),
          endHour: Number(v.endHour),
          weeklyLimit: Number(v.weeklyLimit),
        };
        data.followupRevision++;
      },
      protocol: () =>
        data.protocols.unshift({
          id: nextId(data.protocols),
          design,
          sector: data.sector,
          sectorRevision: data.sectorRevision,
          state: "registered",
          cohort: null,
          review: null,
          launch: null,
        }),
      cohort: () => {
        p.cohort = cohort;
        p.mappingReview = v.mappingReview;
      },
      "experiment-review": () => {
        p.review = {
          ...v,
          runId: data.run.id,
          resultSnapshot: data.run.reviewSnapshot,
        };
      },
      authorize: () => {
        p.launch = "authorized";
        p.authorizationReason = v.reason;
      },
      revoke: () => {
        p.launch = "revoked";
        p.revocationReason = v.reason;
      },
      withdraw: () => {
        p.state = "withdrawn";
        p.withdrawal = v.reason;
        if (p.launch === "authorized") p.launch = "revoked";
      },
      reply: () =>
        data.replyReviews.unshift({
          id: nextId(data.replyReviews),
          checks: Object.fromEntries(replyReviewCriteria.map(k => [k, v[k]])),
          quote: v.quote,
          rationale: v.rationale,
          outcome: replyReviewCriteria.every(k => v[k] === "pass")
            ? "approved"
            : "rejected",
        }),
      send: () =>
        data.sends.push({
          reviewId: data.replyReviews[0].id,
          label:
            "قبل المزود الطلب في سيناريو المثال؛ لا يوجد دليل تسليم أو قراءة",
        }),
    };
    const category = ["section", "faq", "intake"].includes(kind)
      ? "knowledge"
      : ["reply", "send"].includes(kind)
        ? "reply"
        : ["sector", "followup"].includes(kind)
          ? "settings"
          : "experiment";
    if (
      commit(
        operations[kind],
        {
          section: "إضافة قسم معرفة",
          faq: selectedId ? "تعديل سؤال شائع" : "إضافة سؤال شائع",
          intake: "حفظ محتوى للمراجعة",
          sector: "تغيير القطاع",
          followup: "تعديل سياسة المتابعة",
          protocol: "تسجيل تصميم تجربة",
          cohort: "تجميد شروط التأهيل",
          "experiment-review": "مراجعة خطة تجربة",
          authorize: "حفظ إذن تشغيل توضيحي",
          revoke: "سحب إذن التشغيل",
          withdraw: "سحب التصميم",
          reply: "حفظ مراجعة رد",
          send: "محاكاة قبول طلب إرسال",
        }[kind],
        category
      )
    ) {
      draft = null;
      close();
      refresh();
    } else showEditor();
  }
  function evaluation() {
    evaluationWorkbench.open();
  }
  document.addEventListener("click", event => {
    const el = event.target.closest("[data-bw-action]");
    if (!el || el.disabled) return;
    const { bwAction: a, id, value, kind } = el.dataset;
    if (a === "close") return close();
    if (a === "knowledge-tab" || a === "ops-tab") {
      if (a === "knowledge-tab") { conflictWorkspace.leave(); sectionWorkspace.leave(); knowledgeTab = value; return window.SaryBrainPreview.navigate('knowledge',value === 'website' ? 'pages' : value); }
      else opsTab = value;
      if (!pending) error = "";
      return refresh();
    }
    if (a === "history-prev" || a === "history-next") {
      historyPage = Math.max(0, historyPage + (a === "history-prev" ? -1 : 1));
      return refresh();
    }
    if (a === "protocol") return protocolView(id);
    if (a === "evaluation") return evaluation();
    if (a === "inspect" && protocol()?.cohort)
      return evaluationWorkbench.inspect(protocol());
    if (!owner()) return;
    if (a === "reconcile" && pending) {
      const item = pending;
      pending = null;
      mode = "success";
      item.change();
      log(item.category, item.label);
      const saved = persist();
      error = "";
      draft = null;
      close();
      refresh();
      message(
        saved
          ? "تم التحقق من العملية المحلية وحفظها مرة واحدة."
          : "تحققت العملية في الجلسة فقط؛ تعذّر التخزين."
      );
      return;
    }
    if (a === "refresh-basis" && !pending) {
      mode = "success";
      baseRevision =
        editorKind === "followup" ? data.followupRevision : data.sectorRevision;
      error = "";
      attested = false;
      acknowledged = false;
      if (document.querySelector(".be-workspace"))
        evaluationWorkbench.refreshBasis();
      else if (document.querySelector(".bk-workspace"))
        knowledgeWorkbench.refreshBasis();
      else if (draft) showEditor();
      else refresh();
      return;
    }
    if (pending) return;
    if (
      [
        "prepare-candidate",
        "new-protocol",
        "cohort",
        "experiment-review",
        "authorize",
        "withdraw",
        "revoke",
      ].includes(a) &&
      evaluationWorkbench.hasDraft()
    )
      return;
    if (a === "new-section")
      start("section", { type: "custom", title: "", content: "" });
    if (a === "new-faq") start("faq", { question: "", answer: "",category:"",isActive:"true",useInBot:"false" });
    if (a === "edit-faq") { const row=data.faqs.find(r=>r.id===Number(id));if(row)start("faq",{question:row.question,answer:row.answer,category:row.category||"",isActive:String(row.isActive??true),useInBot:String(row.useInBot??true)},Number(id)); }

    if (a === "intake") start("intake", { title: "", content: "" });
    if (a === "sector") start("sector", { sector: data.sector });
    if (a === "followup") {
      start("followup", data.followup);
      baseRevision = data.followupRevision;
    }
    if (a === "prepare-candidate") {
      const review = reviewedLearning();
      if (!review) {
        error =
          "أكمل مراجعة التعلم للحالات الثماني بنتيجة اجتياز قبل تجهيز المرشح.";
        return refresh();
      }
      if (
        commit(
          () => {
            data.candidate = true;
            data.candidateReview = review;
          },
          "تجهيز مرشح توضيحي",
          "experiment"
        )
      )
        refresh();
      else refresh();
    }
    if (a === "new-protocol" && candidateReady() && !activeProtocol())
      start("protocol", emptyProtocolDraft());
    if (a === "step-next") {
      errorsForForm();
      errors = Object.fromEntries(
        Object.entries(errors).filter(([k]) =>
          protocolStepFields[step].includes(k)
        )
      );
      if (!Object.keys(errors).length) step = Math.min(3, step + 1);
      showEditor();
    }
    if (a === "step-back") {
      step = Math.max(0, step - 1);
      attested = false;
      showEditor();
    }
    if (
      a === "cohort" &&
      protocol()?.state === "registered" &&
      !protocol().cohort
    )
      start(
        "cohort",
        {
          minimumCharacters: 1,
          maximumCharacters: 4000,
          requiredAnyTerms: "",
          allowedDealStages: ["new", "interested", "qualified"],
          excludedPhones: "",
          mappingReview: "",
        },
        selectedId
      );
    if (a === "experiment-review" && protocol()?.cohort && evaluatedOutputs())
      start(
        "experiment-review",
        {
          verdict: "",
          baselineAndSample: "",
          recruitmentFeasibility: "",
          qualificationMapping: "",
          safetyAndMeasurement: "",
        },
        selectedId
      );
    if (["authorize", "withdraw", "revoke"].includes(a))
      start(a, { reason: "" }, selectedId);
    if (a === "reply-review")
      start("reply", {
        ...Object.fromEntries(replyReviewCriteria.map(k => [k, ""])),
        quote: "",
        rationale: "",
      });
    if (
      a === "send-review" &&
      data.replyReviews[0]?.outcome === "approved" &&
      !sentReview()
    )
      start("send", { account: "", reason: "" });
    if (a === "approve-section") {
      const r = data.sections.find(s => s.id === Number(id));
      if (r) {
        start("approve", { title: r.title }, r.id);
        editor(
          "اعتماد قسم المعرفة",
          `<blockquote>${esc(r.content)}</blockquote>${check("attest", "راجعت هذا النص وأوافق على اعتماده في المثال.", attested)}`,
          "اعتماد محلي"
        );
      }
    }
    if (a === "delete" && ["sections", "faqs"].includes(kind)) {
      selectedId = Number(id);
      editorKind = "delete";
      draft = { kind };
      attested = false;
      errors = {};
      error = "";
      editor(
        "حذف سجل المعرفة",
        `${draft?.kind === "faqs" ? `<blockquote>${esc(data.faqs.find(r => r.id === Number(selectedId))?.question || "")}</blockquote><p>يُحذف سجل السؤال المحلي فقط. تبقى نسخه في مصادر أخرى ورسائل المحادثات السابقة.</p>` : ""}<p>سيُحذف هذا السجل المحلي. لا يتأثر مصدر في متجر حقيقي.</p>${check("attest", "راجعت السجل وأوافق على حذفه من المثال.", attested)}`,
        "تأكيد الحذف المحلي"
      );
    }
  });
  document.addEventListener("input", event => {
    const el = event.target;
    if (!el.hasAttribute("data-bw-field") || !draft || pending || !owner())
      return;
    draft[el.name] = el.value;
    attested = false;
    acknowledged = false;
    document
      .querySelectorAll('[data-bw-check="attest"],[data-bw-check="ack"]')
      .forEach(input => (input.checked = false));
  });
  document.addEventListener("change", event => {
    const el = event.target;
    if (el.dataset.bwLab) {
      if (pending) return;
      labOpen = true;
      if (el.dataset.bwLab === "role") role = el.value;
      else mode = el.value;
      error = "";
      return refresh();
    }
    if (el.hasAttribute("data-bw-history")) {
      historyFilter = el.value;
      historyPage = 0;
      return refresh();
    }
    if (!draft || pending || !owner()) return;
    if (el.hasAttribute("data-bw-field")) {
      draft[el.name] = el.value;
      attested = false;
      acknowledged = false;
      document
        .querySelectorAll('[data-bw-check="attest"],[data-bw-check="ack"]')
        .forEach(input => (input.checked = false));
    }
    if (el.dataset.bwCheck) {
      const k = el.dataset.bwCheck;
      if (k === "attest") attested = el.checked;
      else if (k === "ack") acknowledged = el.checked;
      else if (k === "enabled") draft.enabled = el.checked;
      else if (k.startsWith("stage-")) {
        const s = k.slice(6);
        draft.allowedDealStages = el.checked
          ? [...new Set([...draft.allowedDealStages, s])]
          : draft.allowedDealStages.filter(v => v !== s);
      }
      if (!["attest", "ack"].includes(k)) {
        attested = false;
        acknowledged = false;
        document
          .querySelectorAll('[data-bw-check="attest"],[data-bw-check="ack"]')
          .forEach(input => (input.checked = false));
      }
    }
  });
  document.addEventListener("submit", event => {
    if (!event.target.hasAttribute("data-bw-form")) return;
    event.preventDefault();
    if (["approve", "delete"].includes(editorKind)) {
      if (!owner() || pending || !attested) {
        error = "أكمل إقرار المراجعة.";
        const p = document.createElement("p");
        p.setAttribute("role", "alert");
        p.textContent = error;
        event.target.querySelector(".bw-scroll").append(p);
        return;
      }
      const id = selectedId,
        kind = draft.kind;
      const change =
        editorKind === "approve"
          ? () => {
              data.sections.find(s => s.id === id).approved = true;
            }
          : () => {
              data[kind] = data[kind].filter(r => r.id !== id);
            };
      if (
        commit(
          change,
          editorKind === "approve" ? "اعتماد قسم معرفة" : "حذف سجل معرفة",
          "knowledge"
        )
      ) {
        draft = null;
        close();
        refresh();
      } else {
        showEditor();
      }
      return;
    }
    save();
  });
  const evaluationWorkbench = createBrainEvaluation({
    esc,
    owner,
    blocked: () => !!pending,
    commit,
    alert,
    refresh,
    candidate: () => (candidateReady() ? data.candidateReview : null),
    assessment: value => {
      data.run = value;
      persist();
    },
  });
  const pageIntake = createPageIntake({esc,owner,blocked:()=>!!pending,pages:()=>data.pages,sections:()=>data.sections,receipts:()=>data.pageReceipts,commit,refresh,nextId});
  const pageWorkspace = createPageWorkspace({esc,owner,blocked:()=>!!pending,rows:()=>data.pages,sections:()=>data.sections,faqs:()=>data.faqs,commit,refresh,remove(id,sections,faqs){data.pages=data.pages.filter(r=>r.id!==id);data.sections=data.sections.filter(r=>!sections.includes(r.id));data.faqs=data.faqs.filter(r=>!faqs.includes(r.id));}});
  const sectionWorkspace = createSectionWorkspace({esc,owner,blocked:()=>!!pending,rows:()=>data.sections,receipts:()=>data.sectionReceipts,commit,refresh,alert});
  const conflictWorkspace = createConflictReview({esc,owner,blocked:()=>!!pending,rows:()=>data.conflicts,commit,refresh,alert});
  const faqList = createFaqList({esc,owner,blocked:()=>!!pending,rows:()=>data.faqs,refresh});
  const knowledgeWorkbench = createBrainKnowledge({
    esc,
    owner,
    blocked: () => !!pending,
    commit,
    alert,
    refresh,
    manualButton: () => btn("مراجعة يدوية مختصرة", "intake", dis()),
    sources: () => ({
      ...window.SaryBrainPreview.sourceCounts(),
      website: data.pages.length,
      faqs: data.faqs.length,
      sections: data.sections.length,
    }),
    ingest(d, mode) {
      data.sections.unshift({
        id: Math.max(0, ...data.sections.map(s => s.id)) + 1,
        type: d.type === "products" ? "services" : "custom",
        title: d.name.trim(),
        content: d.content.trim(),
        approved: false,
        source: d.type === "document" ? "document" : "manual",
        intakeState: mode,
      });
      data.candidate = false;
      data.run = null;
    },
    remove(kind) {
      window.SaryBrainPreview.removeSourceExamples(kind);
      if (kind === "all") {
        data.sections = [];
        data.pages = [];
        data.faqs = [];
      } else {
        if (kind === "website") data.pages = [];
        if (kind === "faqs") data.faqs = [];
        if (["document", "website"].includes(kind))
          data.sections = data.sections.filter(s => s.source !== kind);
      }
      data.candidate = false;
      data.run = null;
    },
  });
  const sourceInventory = createSourceInventory({esc,refresh,open(kind) {
    if (kind === 'products') { window.location.hash = '#/page/merchant/products'; return; }
    if (kind === 'documents') window.SaryBrainPreview.navigate('sources');
    else window.SaryBrainPreview.navigate('knowledge',kind === 'faqs' ? 'faq' : 'pages');
  }});
  return {
    renderSourceInventory: () => sourceInventory.render(),
    render,
    learningStatus: () => knowledgeWorkbench.status(),
    reset() {
      sourceInventory.reset();
      faqList.reset();
      conflictWorkspace.reset();
      sectionWorkspace.reset();
      pageWorkspace.reset();
      pageIntake.reset();
      data = initial();
      evaluationWorkbench.reset();
      knowledgeWorkbench.reset();
      draft = null;
      pending = null;
      role = "owner";
      mode = "success";
      error = "";
      knowledgeTab = "sections";
      opsTab = "sector";
      historyPage = 0;
      historyFilter = "all";
      selectedId = null;
      baseRevision = null;
      labOpen = false;
      persist();
    },
    // The eight-case proposal review never approves the 32-case output review.
    reviewSaved() {},
  };
})();
