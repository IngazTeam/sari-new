// @ts-nocheck
// Local UX simulation. Reads TXT/CSV locally; never sends content or requests a model.
import { createKnowledgeLibrary } from './knowledge-library';
import {
  readKnowledgePreview,
  KNOWLEDGE_PREVIEW_LIMIT,
} from "../../../shared/knowledge-preview";
import type { LearningAnalysisStatus } from "../../../shared/learning-analysis-status";

export const learningStates: Record<
  LearningAnalysisStatus["state"],
  [string, string]
> = {
  idle: [
    "لا توجد مهمة محفوظة",
    "عدم وجود مهمة لا يعني اكتمال التعلم. تُجمع الإشارات من المحادثات.",
  ],
  preparing: ["مهمة محجوزة للتحليل", "الحجز لا يثبت إرسال طلب إلى المزود."],
  budget_wait: [
    "مؤجّل بسبب حدود الاستخدام",
    "لم يُرسل الطلب. موعد الأهلية لا يضمن تشغيل محاولة جديدة.",
  ],
  awaiting_result: [
    "بانتظار نتيجة الطلب",
    "ثُبتت محاولة الإرسال؛ لا تنشئ طلبًا بديلًا لمجرد تأخر النتيجة.",
  ],
  uncertain: [
    "نتيجة الطلب غير مؤكدة",
    "تحتاج فحصًا تشغيليًا. مرور الوقت لا يؤكد النجاح ولا يبرر تكرار التكلفة.",
  ],
  saved: [
    "نتيجة محفوظة تنتظر المعالجة",
    "استكمال الحفظ يستخدم النتيجة الموجودة دون طلب جديد من النموذج.",
  ],
  recovering: [
    "جارٍ استكمال حفظ النتيجة",
    "لا تُعد المقترحات مكتملة قبل نجاح حفظها.",
  ],
  retry_scheduled: [
    "استكمال الحفظ مؤجّل",
    "تُعاد محاولة حفظ النتيجة الموجودة بعد التأجيل؛ لا يُعاد طلب النموذج.",
  ],
  applied: [
    "اكتمل حفظ نتيجة التحليل",
    "المقترحات جاهزة للمراجعة وليست سياسات بيع معتمدة. قد تنتهي الدورة دون مقترح.",
  ],
  stale: [
    "تغيّرت مصادر التحليل",
    "لم تُستخدم النتيجة بعد تغير مصادرها أو حذفها أو سبق معالجتها.",
  ],
  invalid: [
    "النتيجة غير صالحة كمقترح",
    "تعذر قبول النتيجة أو ربطها بمقترح قابل للمراجعة. لم تُفعّل سياسة بيع.",
  ],
};
const sample =
  "سياسة متجر نواة التجريبي: يمكن استرجاع المنتج غير المفتوح خلال 7 أيام من الاستلام. مدة تجهيز الطلب يوم عمل واحد. يجب مراجعة حالة المنتج قبل قبول الاسترجاع.";
const clone = x => JSON.parse(JSON.stringify(x));
const sourceNames = {
  document: "الملفات التعريفية",
  products: "قائمة المنتجات",
  website: "معرفة الموقع",
  faqs: "الأسئلة الشائعة",
  all: "عقل ساري",
};
const impacts = {
  document:
    "في التطبيق يُحذف مصدر الملف النشط والملفات السابقة وأقسام معرفة المستند وفروعها وسجل تغييراتها. لا يعود ملف قديم تلقائيًا.",
  products:
    "في التطبيق تُحذف جميع سجلات منتجات التاجر نفسها، وليس استخدامها في الردود فقط. راجع نسخة الكتالوج قبل تنفيذ ذلك.",
  website:
    "في التطبيق تُحذف تحليلات الموقع وصفحاته وأقسام معرفة الموقع وفروعها وسجل تغييراتها، وتعود حالة تحليل الموقع إلى الانتظار.",
  faqs: "في التطبيق تُحذف جميع الأسئلة الشائعة المستخرجة والمخصصة لهذه المجموعة.",
  all: "في التطبيق تُحذف الملفات والمنتجات وتحليلات الموقع وصفحاته والأسئلة الشائعة وجميع أقسام المعرفة وسجلات تغييراتها. تبقى الحسابات والمحادثات والطلبات والإعدادات خارج نطاق إعادة الضبط.",
};
export function createBrainKnowledge(host) {
  const library = createKnowledgeLibrary(host);
  const key = "sary-brain-knowledge-v1",
    esc = host.esc;
  const initial = () => ({
    version: 1,
    draft: { name: "", content: "", type: "document" },
    receipt: null,
    state: "idle",
    proposals: 0,
    website: { step: -1, state: "idle" },
  });
  let data = initial();
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (
      saved?.version === 1 &&
      typeof saved.draft?.content === "string" &&
      learningStates[saved.state]
    )
      data = { ...initial(), ...saved };
  } catch {}
  let view = "",
    issue = "",
    fields = {},
    attested = false,
    phrase = "",
    target = null,
    sourceSnapshot = "",
    read = "success",
    analysis = "none",
    resultMode = "success",
    statusRead = "success",
    websiteRead = "success",
    websiteFault = "success",
    busy = false,
    readToken = 0,
    generation = 0,
    storageFailed = false;
  const locked = () => !host.owner() || host.blocked();
  const plannedText = (text, mode, archived = false) => `<section data-bk-plan class="bw-summary"><h3>${archived ? "الخطة التي وافقت عليها · مثال" : "التغييرات التي ستُحفظ · مثال"}</h3><p>${archived ? "نسخة وقت الموافقة، وليست حالة المعرفة الحالية." : "الخطة محفوظة للمراجعة. تغيّر أقسام المعرفة يتطلب فحصًا جديدًا قبل الإضافة."}</p>${['empty', 'unchanged'].includes(mode) ? '<p>لا توجد تغييرات على الأقسام في هذا السيناريو.</p>' : `<details open><summary>${mode === 'conflict' ? 'اقتراح متعارض' : 'إضافة معلّقة للمراجعة'} · سياسة المثال</summary><h4>المحتوى الحالي</h4><p>يمكن استرجاع المنتج غير المفتوح خلال 14 يومًا.</p><h4>المحتوى المقترح</h4><p>${esc(text)}</p><p>لن يُفعّل هذا الاقتراح في ردود العملاء. هذه محاكاة محلية.</p></details>`}</section>`;
  const off = value => (value ? "disabled" : "");
  const btn = (label, action, attrs = "", primary = false) =>
    `<button type="button" class="button ${primary ? "primary" : ""}" data-bk-action="${action}" ${attrs}>${esc(label)}</button>`;
  const select = (name, label, options, value, disabled = false) =>
    `<label class="field">${esc(label)}<select data-bk-option="${name}" ${off(disabled)}>${Object.entries(
      options
    )
      .map(
        ([k, v]) =>
          `<option value="${esc(k)}" ${String(value) === k ? "selected" : ""}>${esc(v)}</option>`
      )
      .join("")}</select></label>`;
  const check = label =>
    `<label class="bw-check"><input type="checkbox" data-bk-check ${attested ? "checked" : ""} ${off(locked() || busy)}><span>${esc(label)}</span></label>`;
  const note =
    '<p class="bw-note">معاينة محلية: قراءة النص في هذا المتصفح فقط. لا تحليل آلي أو طلب مزود أو تغيير بيانات التيننت.</p>';
  const fingerprint = () => JSON.stringify(data.draft);
  const counts = () => host.sources();
  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      storageFailed = false;
    } catch {
      storageFailed = true;
    }
  }
  function clearConsent() {
    attested = false;
    document
      .querySelectorAll("[data-bk-check]")
      .forEach(e => (e.checked = false));
  }
  function close() {
    clearConsent();
    readToken++;
    busy = false;
    document.getElementById("dialog").close();
    host.refresh();
  }
  function modal(title, body, footer = "") {
    const root = document.querySelector(".bk-workspace"),
      scroll = root?.querySelector(".bw-scroll")?.scrollTop || 0;
    const opened = Array.from(root?.querySelectorAll("details") || []).map(
      e => e.open
    );
    const active = document.activeElement,
      focusKey = active?.dataset.bkOption;
    window.openDialog(
      title,
      `<section class="bk-workspace bw-editor"><div class="bw-scroll">${note}${host.alert()}${issue ? `<p role="alert" class="bw-warning">${esc(issue)}</p>` : ""}${storageFailed ? '<p role="alert">التخزين غير متاح؛ التغييرات باقية في هذه الجلسة فقط.</p>' : ""}${body}</div><footer class="bw-savebar">${btn(view === "intake" ? "إغلاق مع حفظ المسودة" : "إغلاق", "close")}${footer}</footer></section>`
    );
    document.querySelectorAll(".bk-workspace details").forEach((e, i) => {
      if (opened[i]) e.open = true;
    });
    if (focusKey)
      document
        .querySelector(`[data-bk-option="${focusKey}"]`)
        ?.focus({ preventScroll: true });
    document.querySelector(".bk-workspace .bw-scroll").scrollTop = scroll;
  }
  function write(change, label) {
    const ok = host.commit(
      () => {
        change();
        persist();
      },
      label,
      "knowledge"
    );
    paint();
    host.refresh();
    return ok;
  }
  function field(name, label, textarea = false, max = 255) {
    const id = "bk-" + name,
      val = data.draft[name];
    const attrs = `id="${id}" data-bk-field="${name}" maxlength="${max}" ${off(locked() || busy)} ${fields[name] ? `aria-invalid="true" aria-describedby="${id}-error"` : ""}`;
    return `<div class="field"><label for="${id}">${label}</label>${textarea ? `<textarea ${attrs} rows="6">${esc(val)}</textarea>` : `<input ${attrs} value="${esc(val)}">`}${fields[name] ? `<small id="${id}-error" class="bw-field-error">${fields[name]}</small>` : ""}</div>`;
  }
  function intake() {
    const isSample = data.draft.content === sample;
    const saved = data.receipt?.input === fingerprint();
    const report =
      analysis === "loading"
        ? '<p role="status">جارٍ عرض نتيجة المثال…</p>'
        : analysis === "failure"
          ? '<p role="alert" class="bw-warning">تعذر فحص المثال؛ لا توجد نتيجة يعتمد عليها. النص محفوظ للمراجعة اليدوية.</p>'
          : analysis === "ready" && isSample
            ? `<section class="bw-summary" data-bk-analysis><h3>نتيجة فحص توضيحية · سياسة</h3><p>الملخص: شروط الاسترجاع والتجهيز في المثال.</p><p>عنصران · خطورة مرتفعة · التوصية: مراجعة</p><p>تعارض: سياسة المثال السابقة تذكر 14 يومًا، والجديدة 7 أيام.</p><p>الأثر: قد يتلقى العميل وعدًا مخالفًا. احسم المصدر الساري قبل التفعيل.</p><details><summary>أسئلة وإجابات للمراجعة</summary><p>هل يمكن الإرجاع بعد 10 أيام؟ المدة في النص الجديد 7 أيام؛ يلزم حسم التعارض.</p><p>هل يشمل المفتوح؟ النص يشترط عدم فتح المنتج.</p><p>متى يجهز الطلب؟ يذكر المثال يوم عمل واحد، دون تحديد مدة النقل.</p></details></section>`
            : analysis === 'stale' ? '<p role="alert">تغيّرت المعرفة بعد الفحص. النص محفوظ؛ افحصه مجددًا قبل الإضافة.</p>' : analysis === 'expired' ? '<p role="alert">انتهت صلاحية فحص المثال. النص محفوظ؛ افحصه مجددًا قبل الإضافة.</p>'
            : '<p class="bw-warning">لم يُحلّل النص بالذكاء الاصطناعي. الحفظ اليدوي هنا محاكاة محلية منفصلة؛ الإضافة في التطبيق تتطلب تقرير فحص محفوظًا من الخادم.</p>';
    modal(
      "مراجعة محتوى المعرفة",
      `<ol class="bk-steps"><li>1. أدخل النص</li><li>2. راجع الأثر</li><li>3. احفظ للمراجعة</li></ol>${field("name", "اسم المصدر", false)}${select("type", "نوع المصدر", { document: "مستند", products: "منتجات", custom: "محتوى مخصص" }, data.draft.type, locked() || busy)}<label class="field">اختر ملف TXT أو CSV<input type="file" data-bk-file accept=".txt,.csv,text/plain,text/csv" ${off(locked() || busy)}></label><p>يُقرأ الملف محليًا حتى 30,000 حرف. CSV يعرض نصه الأصلي؛ لا يُستورد كمنتجات تلقائيًا.</p><p class="bw-note">تقرير الفحص والحفظ لا يثبتان دقة الردود أو نسبة احتراف المبيعات. تبقى النتائج أمثلة محلية تحتاج مراجعة.</p>${busy ? '<p role="status">جارٍ قراءة الملف محليًا…</p>' : ""}${field("content", "النص المراد مراجعته", true, KNOWLEDGE_PREVIEW_LIMIT)}<p role="status" data-bk-count>${data.draft.content.length} / ${KNOWLEDGE_PREVIEW_LIMIT} حرف</p><div class="bw-actions">${btn("تحميل نص المثال", "sample", off(locked() || busy))}${btn("فحص المثال المحفوظ", "analyze", off(locked() || busy || !isSample))}</div><details><summary>حالات تجربة الفحص والإضافة</summary>${select("analysis", "نتيجة فحص المثال", { none: "لم يبدأ", loading: "تحميل", failure: "تعذر الفحص", ready: "عرض النتيجة" }, analysis, locked() || busy || !isSample)}${select("result", "نتيجة الإضافة التوضيحية", { success: "حفظ بانتظار المراجعة", partial: "حفظ مع فهرسة غير مكتملة", conflict: "تعارض يحتاج مراجعة", empty: "لم يستخرج أقسامًا", unchanged: "لا تغيير" }, resultMode, locked() || busy)}</details>${report}${analysis === "ready" && isSample ? plannedText(data.draft.content, resultMode) : ""}${analysis === "ready" && isSample && !saved ? btn("محاكاة انتهاء صلاحية الفحص", "expire-review") + btn("محاكاة تغيّر المعرفة", "change-basis") + "<p>الفحص في التطبيق صالح لإضافة واحدة خلال 30 دقيقة، ويتغير بعد تعديل النص أو الاسم أو النوع.</p>" : ""}${saved ? receipt() : ""}${check("راجعت النص ومصدره؛ الحفظ محلي وبانتظار المراجعة ولا يفعّل معرفة في ردود العملاء.")}`,
      btn(
        "حفظ للمراجعة",
        "ingest",
        off(locked() || busy || !attested || saved || (isSample && analysis !== 'ready')),
        true
      )
    );
  }
  function receipt() {
    const r = data.receipt;
    return `<section role="status" class="bw-summary" data-bk-receipt><h3>${r.mode === "empty" ? "لم تُضف معرفة" : r.mode === "unchanged" ? "لا تغيير في المثال" : "حُفظ للمراجعة محليًا"}</h3><p>${r.mode === "empty" ? "لم يُستخرج قسم. راجع المحتوى قبل محاولة أخرى؛ لا نعرض نجاحًا وهميًا." : r.mode === "unchanged" ? "المحتوى لا يضيف تغييرًا في هذا السيناريو؛ لم نكرر القسم." : r.mode === "partial" ? "القسم محفوظ، لكن الفهرسة غير مكتملة. لا تعني هذه النتيجة جاهزية الرد." : r.mode === "conflict" ? "تعارض يحتاج قرارًا بشريًا؛ لم يُفعّل النص." : "قسم محلي معلّق؛ راجعه من أقسام المعرفة."}</p><p>جديد: ${r.added} · تطوير: 0 · تعارض: ${r.conflicts} · دون تغيير: ${r.mode === "unchanged" ? 1 : 0}</p><p>نتيجة مثال فقط؛ لا فهرسة فعلية ولا تغيير في نسبة احتراف المبيعات.</p>${r.review ? `<details data-bk-saved-review><summary>تقرير الفحص الذي راجعته</summary><p>نسخة المثال والخطة وقت الموافقة؛ ليست إثباتًا لجودة الردود.</p>${r.review.mode ? plannedText(r.review.content, r.review.mode, true) : "<p>تقرير قديم دون خطة محفوظة.</p>"}<p>${esc(r.review.name)}</p><p>${esc(r.review.content)}</p><p>التعارض في المثال: 14 يومًا في السياسة السابقة، و7 أيام في النص الجديد.</p></details>` : ""}</section>`;
  }
  function statusCard() {
    const [title, hint] = learningStates[data.state];
    const next = ["budget_wait", "retry_scheduled"].includes(data.state);
    return `<section class="panel panel-pad bk-status"><div class="panel-head"><div><h2>حالة تحليل التعلّم</h2><p>افهم ما حُفظ وما يحتاج متابعة قبل الاعتماد عليه.</p></div>${btn("تحديث الحالة", "status-refresh", off(statusRead === "loading"))}</div>${statusRead === "loading" ? `<p role="status">جارٍ تحميل الحالة…</p>${btn("إكمال قراءة المثال", "status-ready")}` : statusRead === "failure" ? `<p role="alert" class="bw-warning">تعذر جلب الحالة الحالية. لا نعرض آخر نجاح بوصفه الحالة الحالية.</p>${btn("إعادة قراءة الحالة", "status-ready")}` : `<div role="status" data-bk-state="${data.state}"><h3>${title}</h3><p>${hint}</p></div>${data.state !== "idle" ? '<p>آخر تحديث توضيحي: <time datetime="2026-09-28T09:00:00Z">28 سبتمبر 2026، 12:00 بتوقيت الرياض</time></p>' : ""}${next ? "<p>أهلية المحاولة التالية في المثال: 12:30 بتوقيت الرياض؛ ليست وعدًا بالتنفيذ.</p>" : ""}${data.state === "applied" ? `<p data-bk-proposals>مقترحات الدورة: ${data.proposals}</p>` : ""}`}<p class="bw-note">تحديث الحالة للقراءة فقط؛ لا يبدأ تحليلًا أو يعيد طلب النموذج. جميع الحالات والتواريخ هنا أمثلة.</p><details><summary>جرّب حالات التحليل</summary>${select("status", "الحالة التوضيحية", Object.fromEntries(Object.entries(learningStates).map(([k, v]) => [k, v[0]])), data.state)}${select("status-read", "قراءة الحالة", { success: "بيانات", loading: "تحميل", failure: "تعذر القراءة" }, statusRead)}${select("proposals", "عدد المقترحات في المثال", { "0": "صفر — دورة صحيحة دون مقترحات", "3": "3 مقترحات للمراجعة" }, data.proposals)}</details></section>`;
  }
  function sources() {
    const rows = counts();
    return `<section class="panel panel-pad"><div class="panel-head"><div><h2>مصادر المعرفة وأثر حذفها</h2><p>حذف المصدر يختلف عن إيقاف استخدام ملف في الردود.</p></div>${btn("مراجعة إعادة ضبط العقل", "reset", off(locked() || read !== "success"), false)}</div>${select("sources-read", "حالة قراءة المصادر", { success: "بيانات", loading: "تحميل", failure: "تعذر القراءة", empty: "لا توجد مصادر" }, read)}${
      read === "failure"
        ? '<p role="alert">تعذر جلب المصادر. الحذف غير متاح حتى إعادة القراءة.</p>'
        : read === "loading"
          ? '<p role="status">جارٍ قراءة مصادر المثال…</p>'
          : `<div class="bw-cards">${
              read === "empty"
                ? "<p>لا توجد مصادر ضمن هذا المثال.</p>"
                : Object.keys(sourceNames)
                    .filter(k => k !== "all" && rows[k] > 0)
                    .map(
                      k =>
                        `<article class="bw-card"><h3>${sourceNames[k]}</h3><p>${rows[k]} عنصرًا محليًا</p><p>${impacts[k]}</p>${btn("مراجعة حذف المصدر", "remove", `data-kind="${k}" ${off(locked())}`)}</article>`
                    )
                    .join("") ||
                  "<p>لا توجد مصادر محتوى؛ أضف معرفة من مصدر موثوق.</p>"
            }<article class="bw-card"><h3>إعدادات المتجر</h3><p>تبقى محفوظة؛ لا تُحذف من شاشة المصادر.</p></article></div>`
    }<p>الحذف في الموك أب يزيل أمثلة هذا القسم فقط، ولا يغيّر كتالوج صفحات الموك أب الأخرى أو التيننت.</p></section>${library.render()}`;
  }
  function destructive() {
    const stale = sourceSnapshot !== JSON.stringify(counts());
    modal(
      target === "all" ? "راجع أثر إعادة ضبط العقل" : "راجع أثر حذف المصدر",
      `<h3>${sourceNames[target]}</h3><p class="bw-warning">${impacts[target]}</p><div class="bk-counts">${Object.entries(
        counts()
      )
        .map(
          ([k, n]) =>
            `<span>${sourceNames[k] || "أقسام المعرفة"}: <strong>${n}</strong></span>`
        )
        .join(
          ""
        )}</div><p>الإجراء الحقيقي نهائي. هذه المعاينة تخص بيانات المثال فقط ويمكن استعادتها من «إعادة ضبط بيانات الموك أب».</p>${stale ? '<p role="alert">تغيرت المصادر منذ فتح التأكيد. أغلق النافذة وراجع الأعداد من جديد.</p>' : ""}<label class="field">اكتب «${sourceNames[target]}» للتأكيد<input data-bk-phrase value="${esc(phrase)}" autocomplete="off" ${off(locked())}></label>${check("فهمت العناصر التي ستُحذف وأثر ذلك، وأوافق على تطبيقه في بيانات المثال فقط.")}`,
      btn(
        target === "all" ? "إعادة ضبط المثال" : "حذف مصدر المثال",
        "confirm-remove",
        off(locked() || stale || !attested || phrase !== sourceNames[target]),
        true
      )
    );
  }
  const webSteps = [
    "قراءة الموقع",
    "معالجة المحتوى",
    "بناء المعرفة",
    "الفهرسة",
    "اكتمال المعالجة",
  ];
  function website() {
    const s = data.website;
    modal(
      "متابعة تحليل الموقع",
      `<p>الرابط في المثال: <bdi>https://example.test</bdi> — لا يُطلب فعليًا.</p>${select("website-read", "قراءة حالة الموقع", { success: "بيانات", failure: "تعذر جلب الحالة", missing: "رابط الموقع غير مسجل" }, websiteRead)}${websiteRead === "missing" ? '<p role="alert">أضف رابط الموقع في إعدادات المتجر قبل بدء التحليل الفعلي.</p><a href="#/page/merchant/settings">فتح إعدادات المتجر</a>' : websiteRead === "failure" ? '<p role="alert">تعذر التحقق من تقدم التحليل. لا تعتبره متوقفًا ولا تبدأ طلبًا بديلًا.</p>' : `<ol class="bk-progress">${webSteps.map((label, i) => `<li ${i === s.step ? 'aria-current="step"' : ""}>${i + 1}. ${label}${s.step > i || s.state === "completed" ? " · اكتملت في المثال" : ""}</li>`).join("")}</ol><p role="status">${s.state === "completed" ? "انتهت المعالجة التوضيحية؛ راجع النتيجة والمصادر." : s.state === "error" ? "تعثر المثال. بقي آخر تقدم محفوظًا." : s.state === "running" ? `المرحلة الحالية: ${webSteps[s.step]}. التقدم هنا يدوي.` : "لم يبدأ مثال المعالجة."}</p>${s.state === "completed" ? '<div class="bw-summary"><p>نتيجة مثال: صفحتان، قسم واحد جديد، وتعارض واحد للمراجعة.</p><p>الاكتمال لا يعني حل كل الفجوات أو زيادة المبيعات. لا تُعدّل بطاقات المصادر تلقائيًا في هذه المحاكاة.</p></div>' : ""}<details><summary>حالات المعالجة التوضيحية</summary>${select("website-fault", "الخطوة التالية", { success: "المرحلة التالية", failure: "تعذر المعالجة" }, websiteFault, locked())}</details>${check("راجعت أن البدء أو إعادة المحاولة في التطبيق يتطلب اتصالًا وتكلفة؛ هنا مثال محلي فقط.")}<div class="bw-actions">${btn(s.state === "error" ? "إعادة محاولة المثال" : "بدء مثال المعالجة", "website-start", off(locked() || !attested || ["running", "completed"].includes(s.state)), true)}${btn("عرض المرحلة التالية", "website-next", off(locked() || s.state !== "running"))}${btn("تحديث حالة المثال", "website-refresh")}</div>`}<p>إغلاق النافذة لا يلغي المهمة. افتحها مجددًا لمتابعة آخر حالة محفوظة؛ لا يوجد مؤقت أو تقدم مختلق للخادم.</p>`
    );
  }
  function paint() {
    if (view === "intake") intake();
    if (view === "remove") destructive();
    if (view === "website") website();
  }
  function validate() {
    fields = {};
    if (!data.draft.name.trim() || data.draft.name.length > 255)
      fields.name = "اكتب اسمًا من 1 إلى 255 حرفًا.";
    if (
      data.draft.content.trim().length < 10 ||
      data.draft.content.length > KNOWLEDGE_PREVIEW_LIMIT
    )
      fields.content = "أدخل نصًا من 10 إلى 30,000 حرف دون اقتطاع.";
    return !Object.keys(fields).length;
  }
  function syncButtons() {
    const b = document.querySelector('[data-bk-action="ingest"]');
    if (b)
      b.disabled =
        locked() || busy || !attested || data.receipt?.input === fingerprint() || (data.draft.content === sample && analysis !== 'ready');
    const d = document.querySelector('[data-bk-action="confirm-remove"]');
    if (d)
      d.disabled =
        locked() ||
        !attested ||
        phrase !== sourceNames[target] ||
        sourceSnapshot !== JSON.stringify(counts());
    const start = document.querySelector('[data-bk-action="website-start"]');
    if (start)
      start.disabled =
        locked() ||
        !attested ||
        ["running", "completed"].includes(data.website.state);
  }
  document.addEventListener("input", event => {
    const el = event.target;
    if (el.dataset.bkField && !locked() && !busy) {
      data.draft[el.dataset.bkField] = el.value;
      analysis = "none";
      clearConsent();
      persist();
      document.querySelector("[data-bk-analysis]")?.remove();
      document.querySelector("[data-bk-receipt]")?.remove();
      const count = document.querySelector("[data-bk-count]");
      if (count)
        count.textContent = `${data.draft.content.length} / ${KNOWLEDGE_PREVIEW_LIMIT} حرف`;
      const analyze = document.querySelector('[data-bk-action="analyze"]');
      if (analyze) analyze.disabled = data.draft.content !== sample;
      syncButtons();
    }
    if (el.hasAttribute("data-bk-phrase")) {
      phrase = el.value;
      clearConsent();
      syncButtons();
    }
  });
  document.addEventListener("change", async event => {
    const el = event.target;
    if (el.hasAttribute("data-bk-file")) {
      const file = el.files?.[0];
      el.value = "";
      if (!file || locked() || busy) return;
      const token = ++readToken,
        epoch = generation;
      busy = true;
      clearConsent();
      issue = "";
      paint();
      const result = await readKnowledgePreview(file);
      if (token !== readToken || epoch !== generation) return;
      busy = false;
      if ("error" in result)
        issue = {
          unsupported: "اختر TXT أو CSV. استخراج PDF وDOCX غير متاح هنا.",
          tooLong: "الملف يتجاوز 30,000 حرف أو الحجم المسموح؛ لم نقتطع محتواه.",
          empty: "الملف فارغ؛ لم يتغير النص الحالي.",
          unreadable: "تعذرت قراءة الملف؛ لم يتغير النص الحالي.",
        }[result.error];
      else {
        data.draft = {
          ...data.draft,
          name: result.name,
          content: result.content,
        };
        analysis = "none";
        fields = {};
        persist();
      }
      paint();
      return;
    }
    if (el.hasAttribute("data-bk-check")) {
      attested = el.checked;
      syncButtons();
    }
    if (!el.dataset.bkOption || host.blocked()) return;
    const name = el.dataset.bkOption,
      v = el.value;
    if (name === "status") {
      data.state = v;
      statusRead = "success";
      persist();
    }
    if (name === "status-read") statusRead = v;
    if (name === "proposals") {
      data.proposals = Number(v);
      persist();
    }
    if (name === "sources-read") read = v;
    if (["status", "status-read", "proposals", "sources-read"].includes(name)) {
      host.refresh();
      return;
    }
    if (locked() || busy) return;
    clearConsent();
    if (name === "type") {
      data.draft.type = v;
      analysis = "none";
      persist();
    }
    if (name === "analysis") analysis = v;
    if (name === "result") resultMode = v;
    if (name === "website-read") websiteRead = v;
    if (name === "website-fault") websiteFault = v;
    paint();
  });
  document.addEventListener("click", event => {
    const el = event.target.closest("[data-bk-action]");
    if (!el || el.disabled) return;
    const a = el.dataset.bkAction;
    if (a === "close") return close();
    if (a === "status-refresh") {
      statusRead = "loading";
      host.refresh();
      return;
    }
    if (a === "status-ready") {
      statusRead = "success";
      host.refresh();
      return;
    }
    if (a === "intake") {
      view = "intake";
      clearConsent();
      issue = "";
      paint();
      return;
    }
    if (a === "website") {
      view = "website";
      clearConsent();
      issue = "";
      paint();
      return;
    }
    if (host.blocked() || locked() || busy) return;
    if (a === "remove" || a === "reset") {
      if (read !== "success") return;
      target = a === "reset" ? "all" : el.dataset.kind;
      if (!sourceNames[target]) return;
      sourceSnapshot = JSON.stringify(counts());
      phrase = "";
      clearConsent();
      issue = "";
      view = "remove";
      paint();
      return;
    }
    if (
      a === "confirm-remove" &&
      attested &&
      phrase === sourceNames[target] &&
      sourceSnapshot === JSON.stringify(counts())
    ) {
      const selected = target;
      clearConsent();
      return write(() => {
        host.remove(selected);
        data.state = "stale";
        data.receipt = null;
        if (selected === "all") {
          data.draft = initial().draft;
          data.website = initial().website;
        }
        issue =
          "أُزيلت بيانات المثال المطلوبة. سجل التقييم والإعدادات محفوظان؛ يحتاج المرشح مراجعة جديدة.";
        phrase = "";
        sourceSnapshot = "";
      }, "حذف محلي: " + sourceNames[selected]);
    }
    if (a === "sample") {
      data.draft = {
        name: "سياسة متجر نواة — مثال.txt",
        type: "document",
        content: sample,
      };
      analysis = "none";
      fields = {};
      clearConsent();
      persist();
    }
    if (a === "analyze" && data.draft.content === sample) {
      analysis = "ready";
      clearConsent();
    }
    if (a === 'expire-review' && analysis === 'ready') { analysis = 'expired'; clearConsent(); }
    if (a === 'change-basis' && analysis === 'ready') { analysis = 'stale'; clearConsent(); }
    if (a === "ingest" && attested && data.receipt?.input !== fingerprint()) {
      if (data.draft.content === sample && analysis !== 'ready') return;
      if (!validate()) {
        paint();
        document.querySelector('.bk-workspace [aria-invalid="true"]')?.focus();
        return;
      }
      const input = fingerprint(),
        d = clone(data.draft),
        mode = resultMode,
        review = d.content === sample && analysis === 'ready' ? { name: d.name, content: d.content, mode } : null;
      clearConsent();
      return write(() => {
        const add = !["empty", "unchanged"].includes(mode);
        if (add) host.ingest(d, mode);
        data.receipt = {
          input,
          mode,
          added: add && mode !== "conflict" ? 1 : 0,
          conflicts: mode === "conflict" ? 1 : 0,
          review,
        };
      }, "مراجعة وإضافة محتوى محلي");
    }
    if (
      a === "website-start" &&
      attested &&
      !["running", "completed"].includes(data.website.state)
    ) {
      clearConsent();
      return write(() => {
        data.website = { step: 0, state: "running" };
      }, "بدء مثال معالجة الموقع");
    }
    if (a === "website-next" && data.website.state === "running") {
      const fault = websiteFault;
      return write(() => {
        if (fault === "failure") data.website.state = "error";
        else {
          data.website.step++;
          if (data.website.step === 4) data.website.state = "completed";
        }
      }, "تقدم مثال معالجة الموقع");
    }
    if (a === "website-refresh") websiteRead = "success";
    paint();
  });
  document.getElementById("dialog")?.addEventListener("close", () => {
    readToken++;
    busy = false;
    clearConsent();
  });
  return {
    status: statusCard,
    sources,
    intakeSummary: () =>
      `<section class="panel panel-pad"><h2>محتوى واضح قبل اعتماده</h2><p>اقرأ TXT/CSV محليًا أو الصق النص، راجع المحتوى والأثر ثم احفظ قسمًا معلّقًا للمراجعة.</p>${btn(data.draft.content ? "استئناف مراجعة المحتوى" : "فحص محتوى جديد", "intake", off(locked()), true)}${host.manualButton()}<p>الفحص الآلي معروض بأمثلة محددة؛ النص الذي تدخله لا يُرسل لأي خدمة.</p></section>`,
    websiteButton: () => btn("متابعة تحليل الموقع", "website"),
    refreshBasis() {
      clearConsent();
      paint();
    },
    reset() {
      generation++;
      readToken++;
      data = initial();
      view = "";
      issue = "";
      busy = false;
      read = "success";
      statusRead = "success";
      analysis = "none";
      websiteRead = "success";
      websiteFault = "success";
      resultMode = "success";
      persist();
    },
  };
}
