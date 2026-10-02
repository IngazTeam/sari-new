// Local, deterministic UX examples. No model, network, WhatsApp, or real sales.
window.TestingPreview = (() => {
  const key = "sary-testing-preview-v1";
  const routes = ["/merchant/sari-playground", "/merchant/test-sari"];
  const handles = page => routes.includes(page?.route);
  const e = value =>
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
  const quick = [
    "السلام عليكم",
    "عندك جوالات؟",
    "أبغى هدية لأمي",
    "كم سعر المنتج؟",
    "شكراً لك",
  ];
  const scenarios = [
    [
      "price",
      "سؤال عن السعر",
      "مرحباً، كم سعر الساعة الذكية؟",
      "أي ساعة تقصد؟ أحتاج اسم المنتج أو رابطه لأراجع السعر من مصدره.",
    ],
    [
      "search",
      "البحث عن منتج",
      "عندك عطور رجالية؟",
      "ما الروائح التي تفضّلها وما ميزانيتك؟ نحتاج كتالوجًا مؤكّدًا قبل اقتراح منتج متوفر.",
    ],
    [
      "order",
      "الطلب والتوصيل",
      "كيف أطلب؟ وكم يستغرق التوصيل؟",
      "ما مدينة التوصيل؟ نراجع سياسة الشحن قبل إعطاء مدة أو تكلفة.",
    ],
    [
      "greeting",
      "أول زيارة",
      "السلام عليكم، أول مرة أتعامل معكم",
      "وعليكم السلام، أهلًا بك! ما الذي تبحث عنه اليوم؟",
    ],
    [
      "gift",
      "اقتراح هدية",
      "أبغى هدية لصديقي، شو تقترح؟",
      "ما المناسبة وما الميزانية المناسبة؟ يساعدني ذلك في تضييق الخيارات.",
    ],
    [
      "complaint",
      "شكوى وتأخر طلب",
      "المنتج اللي طلبته ما وصل، شو السالفة؟",
      "أتفهم انزعاجك. أرسل رقم الطلب ليراجع الفريق حالة التوصيل؛ لن أؤكد موعدًا دون تتبع.",
    ],
    [
      "multi",
      "محادثة متعددة الرسائل",
      "عندك ساعات ذكية؟",
      "ما أهم استخدام للساعة وما ميزانيتك؟ نراجع الخيارات المتاحة من الكتالوج.",
    ],
  ];
  const responses = new Map([
    ...scenarios.map(s => [s[2], s[3]]),
    ["السلام عليكم", "وعليكم السلام! كيف أقدر أساعدك اليوم؟"],
    [
      "عندك جوالات؟",
      "ما الاستخدام والميزانية؟ يلزم الرجوع إلى كتالوج المتجر قبل تأكيد التوفر.",
    ],
    [
      "أبغى هدية لأمي",
      "ما المناسبة وما اهتماماتها؟ يمكننا بعدها تضييق الاختيارات.",
    ],
    [
      "كم سعر المنتج؟",
      "ما اسم المنتج أو رابطه؟ لا أملك سعرًا موثّقًا لهذا السؤال وحده.",
    ],
    ["شكراً لك", "على الرحب والسعة، يسعدني مساعدتك."],
  ]);
  const fresh = (id = 1) => ({
    id,
    startedAt: Date.now(),
    messages: [],
    draft: "",
    pending: null,
    deal: null,
    dealDraft: "",
    history: [],
    notice: "",
    visibleFrom: 0,
  });
  let data = {
    version: 1,
    sessions: Object.fromEntries(routes.map(r => [r, fresh()])),
  };
  let storageError = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (
      saved?.version === 1 &&
      routes.every(
        r =>
          Array.isArray(saved.sessions?.[r]?.messages) &&
          typeof saved.sessions[r].draft === "string"
      )
    ) {
      data = saved;
      for (const [route, session] of Object.entries(data.sessions)) {
        if (route === routes[1]) {
          session.draft = "";
          session.dealDraft = "";
          session.history = [];
          session.visibleFrom = Math.max(0, session.messages.length - 30);
          if (session.pending) {
            session.pending = null;
            session.notice =
              "استُعيد المحفوظ فقط. لا تُستعاد المسودة أو العملية غير المؤكدة ولا يُعاد إرسالها تلقائيًا.";
          }
        } else if (session.pending?.state === "waiting")
          session.pending.state = "uncertain";
      }
      for (const archived of data.archive?.[routes[1]] || []) {
        archived.draft = "";
        archived.dealDraft = "";
      }
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch {
    storageError = true;
  }
  data.archive ??= Object.fromEntries(routes.map(route => [route, []]));
  let historyLimit = 20,
    restoreFault = "success",
    historyFault = "success",
    ratingFault = "success";
  let current = routes[0],
    role = "owner",
    read = "ready",
    fault = "sample",
    saveFault = "success",
    sessionFault = "success";
  let dialog = "",
    dialogRoute = "",
    selected = null,
    error = "",
    dealError = "",
    attested = false;
  const s = () => data.sessions[current];
  const detailed = () => current === routes[1];
  const locked = () => role !== "owner" || read !== "ready" || !!s().pending;
  const off = b => (b ? "disabled" : "");
  const btn = (text, action, attrs = "", primary = false) =>
    `<button type="button" class="button ${primary ? "primary" : ""}" data-tp-action="${action}" ${attrs}>${e(text)}</button>`;
  const option = (name, label, values, value) =>
    `<label class="field">${label}<select data-tp-option="${name}">${Object.entries(
      values
    )
      .map(
        ([id, text]) =>
          `<option value="${id}" ${id === value ? "selected" : ""}>${text}</option>`
      )
      .join("")}</select></label>`;
  const persist = () => {
    try {
      if (detailed() && (s().messages.length || s().created)) {
        const stored = structuredClone(s());
        stored.draft = "";
        stored.dealDraft = "";
        stored.pending = null;
        stored.history = [];
        stored.visibleFrom = 0;
        data.archive[current] = [
          ...data.archive[current].filter(item => item.id !== stored.id),
          stored,
        ].sort((a, b) => b.id - a.id);
      }
      const persisted = structuredClone(data);
      persisted.sessions[routes[1]].draft = "";
      persisted.sessions[routes[1]].dealDraft = "";
      for (const archived of persisted.archive[routes[1]]) {
        archived.draft = "";
        archived.dealDraft = "";
      }
      localStorage.setItem(key, JSON.stringify(persisted));
      storageError = false;
    } catch {
      storageError = true;
    }
  };
  const active = () => location.hash === "#/page" + current;
  function refresh(focus, tail = false) {
    if (!active()) return;
    const scroll = document.querySelector(".tp-messages")?.scrollTop || 0;
    const examplesOpen = document.querySelector(".tp-scenarios")?.open;
    const focused = document.activeElement;
    const buttonSelector = focused?.dataset.tpAction
      ? '[data-tp-action="' +
        focused.dataset.tpAction +
        '"]' +
        ["id", "value", "index"]
          .filter(k => focused.dataset[k])
          .map(k => "[data-" + k + '="' + focused.dataset[k] + '"]')
          .join("")
      : "";
    window.render(true);
    if (examplesOpen && document.querySelector(".tp-scenarios"))
      document.querySelector(".tp-scenarios").open = true;
    const messages = document.querySelector(".tp-messages");
    if (messages) messages.scrollTop = tail ? messages.scrollHeight : scroll;
    if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
    else if (buttonSelector)
      document.querySelector(buttonSelector)?.focus({ preventScroll: true });
  }
  function lab() {
    return `<details class="tp-lab"><summary>حالات تجربة التصميم</summary><div class="tp-controls">${option("role", "الصلاحية", { owner: "مالك", viewer: "قراءة فقط" }, role)}${option("read", "قراءة الجلسة", { ready: "متاحة", loading: "جارٍ التحميل", error: "تعذرت القراءة" }, read)}${option("fault", "نتيجة الرد التالي", { sample: "رد المثال", failure: "فشل مؤكد", uncertain: "نتيجة غير مؤكدة", rate: "حد الاستخدام" }, fault)}${option("save", "حفظ الصفقة", { success: "نجاح محلي", failure: "فشل الحفظ", uncertain: "نتيجة غير مؤكدة" }, saveFault)}${option("session", "إنشاء جلسة بديلة", { success: "نجاح محلي", failure: "فشل التهيئة" }, sessionFault)}${detailed() ? option("feedback", "حفظ التقييم", { success: "إقرار الحفظ", failure: "فشل الإقرار", conflict: "نسخة تغيّرت", uncertain: "إقرار مفقود", superseded: "إيصال تجاوزته نسخة أحدث" }, ratingFault) + option("history", "قراءة السجل", { success: "متاح", failure: "تعذر التحميل", forbidden: "دون صلاحية" }, historyFault) + option("restore", "فتح جلسة مختارة", { success: "متاح", failure: "تعذر الفتح", forbidden: "فقدان الصلاحية" }, restoreFault) + btn("إضافة مثال سجل طويل", "seed-history") : ""}</div><p>اختيارات لفحص التصميم؛ لا تغيّر إعدادات المساعد الفعلي.</p></details>`;
  }
  const visibleMessages = () => s().messages.slice(s().visibleFrom || 0);
  function ratingStats() {
    const positive = visibleMessages().filter(
      m => m.rating === "positive"
    ).length;
    const negative = visibleMessages().filter(
      m => m.rating === "negative"
    ).length;
    const total = positive + negative;
    return {
      positive,
      negative,
      total,
      rate: total ? Math.round((positive / total) * 100) : null,
    };
  }
  function metrics() {
    const user = s().messages.filter(m => m.role === "user").length,
      replies = s().messages.filter(
        m => m.role === "assistant" && !m.seed
      ).length;
    const stats = ratingStats();
    return `<section class="panel panel-pad tp-metrics"><h2>${detailed() ? "تقييمك لهذه الجلسة" : "ملخص التجربة"}</h2><div class="tp-counts"><div><strong>${user}</strong><span>رسائل العميل</span></div><div><strong>${replies}</strong><span>ردود المثال</span></div><div><strong>${s().messages.length}</strong><span>كل الرسائل</span></div></div>${
      detailed()
        ? `<div class="tp-rating-summary"><strong>${stats.rate === null ? "لا توجد تقييمات" : stats.rate + "% ردود مفيدة"}</strong><p>${stats.positive} مفيد · ${stats.negative} يحتاج تحسينًا · ${stats.total} ردود مقيّمة</p>${stats.rate === null ? "" : `<progress max="100" value="${stats.rate}" aria-label="نسبة الردود التي قيّمتها كمفيدة"></progress>`}<p>تقييمات فريقك للردود المحمّلة فقط. لا تقيس التحويل أو احتراف المبيعات. حمّل الرسائل الأقدم لإدراج تقييماتها.</p></div><details><summary>تغييرات تقييمك في هذه الزيارة</summary>${
            s().history.length
              ? `<ol class="tp-history">${s()
                  .history.map(
                    (h, i) =>
                      `<li>تعديل ${i + 1}: ${h.total === 0 ? "لا توجد تقييمات" : h.rate + "%"} <span>· ${h.total} ردود مقيّمة</span></li>`
                  )
                  .join("")}</ol>`
              : "<p>قيّم ردًا ليظهر السجل.</p>"
          }</details><div class="tp-deal-summary"><h3>نتيجة البيع التجريبية</h3>${s().deal ? `<p role="status">صفقة مثال مسجلة: <b>${e(s().deal.value)}</b></p><p>${s().deal.messageCount} رسائل · ${s().deal.seconds} ثانية منذ بداية الجلسة</p>` : "<p>لم تُسجّل صفقة لهذه الجلسة.</p>"}${btn("تسجيل صفقة تجريبية", "deal", off(locked() || !!s().deal || replies === 0))}<p>ليست طلبًا أو تحصيلًا ولا تُضاف إلى مبيعات التاجر.</p></div>`
        : "<p>كل سؤال في هذه الساحة يُراجع منفردًا. ترتيب الرسائل وحده لا يثبت ذاكرة محادثة.</p>"
    }<a href="#/page/merchant/sari-brain">راجع المعرفة والفجوات ←</a>${detailed() ? '<a href="#/page/merchant/try-sari-analytics">افتح مقاييس المساعد ←</a>' : ""}</section>`;
  }
  function pendingView() {
    const p = s().pending;
    if (!p) return "";
    if (p.type === "rating") {
      const conflict = p.state === "conflict",
        failed = p.state === "failed",
        uncertain = p.state === "uncertain";
      return (
        '<div class="tp-notice" role="status"><strong>' +
        (conflict
          ? "غيّر عضو آخر التقييم؛ راجع النسخة الحالية أولًا."
          : failed || uncertain
            ? "لم يتأكد حفظ التقييم. لم نغيّر الزر إلى حالة النجاح."
            : "بانتظار إقرار حفظ التقييم") +
        "</strong><p>محاكاة محلية؛ لا تتصل بخادم التاجر.</p>" +
        btn(
          conflict
            ? "مراجعة التقييم الحالي"
            : failed || uncertain
              ? "إعادة محاولة الإيصال نفسه"
              : "إكمال الخطوة التجريبية",
          conflict
            ? "review-rating"
            : failed || uncertain
              ? "retry-rating"
              : "finish",
          off(role !== "owner" || read !== "ready")
        ) +
        "</div>"
      );
    }
    const uncertain = p.state === "uncertain";
    return `<div class="tp-notice" role="status"><strong>${uncertain ? "النتيجة غير مؤكدة" : p.type === "chat" ? "بانتظار رد المثال" : "بانتظار تأكيد حفظ الصفقة"}</strong><p>${uncertain ? "لم نُظهر نجاحًا ولم نكرر العملية. افحص نتيجتها أولًا." : "خطوة انتظار يدوية لفحص الواجهة؛ لا يوجد طلب خارجي."}</p>${btn(uncertain ? "تحقق من نتيجة العملية" : "إكمال الخطوة التجريبية", uncertain ? "reconcile" : "finish", off(role !== "owner" || read !== "ready"), true)}</div>`;
  }
  function messages() {
    return (
      visibleMessages()
        .map(
          m =>
            `<article class="tp-message ${m.role === "user" ? "tp-customer" : ""}" data-tp-message="${m.id}"><header><b>${m.role === "user" ? "العميل التجريبي" : m.seed ? "تمهيد السيناريو" : "رد توضيحي محفوظ"}</b><time>${e(new Date(m.at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }))}</time></header><p>${e(m.content)}</p>${m.seed ? "<small>تمهيد ثابت للسيناريو، لا يدخل في تقييم الردود.</small>" : ""}${m.failed ? `<div class="tp-warning">${m.failed === "rate" ? "تعذر الإكمال بسبب حد الاستخدام في المثال." : "لم يكتمل الرد؛ نص السؤال محفوظ."} ${btn("إعادة المحاولة", "retry", `data-id="${m.id}" ${off(locked() || m.id !== s().messages.at(-1)?.id)}`)}</div>` : ""}${m.role === "assistant" && !m.seed ? `<small>${m.example ? "صياغة تعليمية؛ لا تستند إلى سعر أو مخزون حقيقي." : "لم يُحلّل هذا النص آليًا."}</small>${detailed() && m.example ? `<div class="tp-ratings" role="group" aria-label="تقييم الرد ${m.id}">${btn("مفيد", "rate", `data-id="${m.id}" data-value="positive" aria-pressed="${m.rating === "positive"}" ${off(locked())}`)}${btn("يحتاج تحسينًا", "rate", `data-id="${m.id}" data-value="negative" aria-pressed="${m.rating === "negative"}" ${off(locked())}`)}</div>` : ""}` : ""}</article>`
        )
        .join("") ||
      '<div class="tp-empty"><span class="eyebrow">ابدأ بسؤال واحد</span><h2>جرّب، ثم راجع الإجابة</h2><p>اختر مثالًا أو اكتب سؤال العميل. لن تُرسل رسالة إلى عميل حقيقي.</p></div>'
    );
  }
  function renderPage(page) {
    current = page.route;
    const body =
      read !== "ready"
        ? `<section class="panel panel-pad tp-read" ${read === "loading" ? 'aria-busy="true"' : ""}><h2>${read === "loading" ? "جارٍ قراءة الجلسة" : "تعذرت قراءة الجلسة"}</h2><p>لا نعرض الأرقام كصفر ولا نستبدل المسودة. أعد قراءة البيانات المحلية.</p>${btn("إعادة قراءة الجلسة", "read-ready")}</section>`
        : `<section class="tp-workspace"><div class="tp-main"><details class="panel panel-pad tp-scenarios"><summary>جرّب أمثلة جاهزة</summary><div class="panel-head"><h2>${detailed() ? "اختر موقفًا لتجربته" : "أسئلة سريعة"}</h2>${!detailed() ? btn("جلسة جديدة", "reset", off(locked())) : ""}</div>${detailed() ? `<label class="field" for="tp-scenario">سيناريو المحادثة<select id="tp-scenario" ${off(locked())}><option value="">اختر سيناريو…</option>${scenarios.map(r => `<option value="${r[0]}">${r[1]}</option>`).join("")}</select></label><p>يُراجع السيناريو قبل استبدال الجلسة. لن يبدأ الرد تلقائيًا.</p>` : `<div class="tp-chips">${quick.map((q, i) => btn(q, "quick", `data-index="${i}" ${off(locked())}`)).join("")}</div>`}</details><section class="panel tp-chat"><header class="tp-chat-head"><div><h2>${detailed() ? "محادثة التجربة" : "سؤال وإجابة"}</h2><p>جلسة محلية ${s().id} · أمثلة ثابتة دون اتصال بالنموذج</p></div><a href="#/page${detailed() ? routes[0] : routes[1]}">${detailed() ? "اختبار سريع" : "تجربة محادثة"} ←</a></header><div class="tp-messages" tabindex="0" aria-label="رسائل التجربة">${s().visibleFrom ? btn("تحميل الرسائل الأقدم", "older", off(read !== "ready" || !!s().pending)) : ""}${s().restored ? `<p class="tp-loaded">المعروض ${visibleMessages().length} من ${s().messages.length} رسالة محفوظة.</p>` : ""}${messages()}</div>${pendingView()}${s().notice ? `<p class="tp-notice" role="status">${e(s().notice)}</p>` : ""}<form class="tp-composer" data-tp-form="chat" novalidate><label for="tp-question">سؤال العميل</label><textarea id="tp-question" rows="2" maxlength="2000" ${off(locked())} aria-describedby="tp-input-help${error ? " tp-input-error" : ""}" ${error ? 'aria-invalid="true"' : ""}>${e(s().draft)}</textarea><div class="tp-compose-foot"><small id="tp-input-help"><span id="tp-counter">${s().draft.length}</span> / 2000 · Enter للتجربة، Shift+Enter لسطر جديد</small><button class="button primary" type="submit" ${off(locked())}>جرّب الرد محليًا</button></div>${error ? `<p id="tp-input-error" role="alert" class="tp-warning">${e(error)}</p>` : ""}</form></section></div>${detailed() ? `<details class="panel panel-pad tp-context"><summary>عن التجربة وحدودها</summary><p>هذه جلسة اختبار؛ الصفقات المسجّلة هنا تجريبية ولا تنشئ طلبًا أو دفعة مالية.</p><p>يستخدم الرد معرفة المتجر وما يصل إلى 20 رسالة سابقة من جلسة الاختبار (بحد 16 ألف حرف). المثال تمهيد للقراءة فقط؛ لا يُرسل تلقائيًا.</p><p>هذه المحاكاة تستخدم أمثلة محلية؛ لا يوجد نموذج أو مصدر خارجي. بعد إعادة التحميل يُستعاد المحفوظ فقط دون المسودة أو الطلب غير المؤكد.</p></details>` : ""}${metrics()}</section>`;
    return `<div class="tp-preview ${detailed() ? "tp-detailed" : ""}">${detailed() ? `<div class="tp-toolbar">${btn("الجلسات المحفوظة", "history", off(read !== "ready" || !!s().pending))}${btn("جلسة جديدة", "reset", off(locked()))}</div>` : ""}<p class="tp-scope">${detailed() ? "اختبر التسلسل والتقييم، ثم عدّل معرفة المساعد." : "سؤال واحد لتراجع أسلوب الإجابة بسرعة."} ${role !== "owner" ? "الصلاحية الحالية: قراءة فقط." : ""}</p>${storageError ? '<p role="alert" class="tp-warning">تعذر التخزين المحلي؛ لا نضمن استعادة التغييرات بعد إغلاق المتصفح.</p>' : ""}${!detailed() ? '<p><a class="button" href="./brain-preview.html?screen=playground">معاينة صفحة التطبيق المطابقة · 6 حالات</a></p>' : ""}${detailed() ? `<p class="tp-draft-hint">تُحفظ مسودتك مؤقتًا عند التنقل والعودة في هذا التبويب. إعادة التحميل أو إغلاق الصفحة يمسح المسودة. لن تُرسل تلقائيًا.</p>` : ""}${body}${lab()}</div>`;
  }
  function showDialog() {
    if (dialog === "history") return showHistory();
    if (dialog === "restore")
      return window.openDialog(
        "فتح جلسة محفوظة؟",
        '<form class="tp-editor" data-tp-form="dialog" novalidate><div class="tp-editor-scroll"><p>تبقى الرسائل المحفوظة في السجل. تُستبدل المحادثة والمسودة بعد نجاح التحميل فقط.</p>' +
          (error
            ? '<p class="tp-warning" role="alert">' + e(error) + "</p>"
            : "") +
          '</div><footer class="tp-savebar">' +
          btn("إلغاء", "close") +
          '<button type="submit" class="button primary">فتح الجلسة</button></footer></form>'
      );
    const replacing = dialog === "reset" || dialog === "scenario";
    const scenario = scenarios.find(x => x[0] === selected);
    const body = replacing
      ? `<p>تبدأ جلسة جديدة برقم مختلف. تبقى الرسائل المحفوظة وتقييماتها وصفقتها في سجل هذه الصفحة؛ تُستبدل المسودة بعد نجاح الإنشاء. تبقى تجربة الصفحة الأخرى مستقلة.</p>${scenario ? `<div class="summary-box"><h3>${e(scenario[1])}</h3><p>${e(scenario[2])}</p>${selected === "multi" ? "<p>التمهيد: «مرحباً» ثم ترحيب ثابت من المساعد.</p>" : ""}</div>` : ""}<label class="tp-check"><input type="checkbox" id="tp-confirm" ${attested ? "checked" : ""}>راجعت أثر استبدال الجلسة الحالية</label>`
      : `<p>قيمة توضيحية للجلسة ${s().id}. لا ينشأ طلب ولا تتغير مبيعات المتجر.</p><label class="field" for="tp-value">قيمة الصفقة التجريبية (العملة غير مسجلة)<input id="tp-value" inputmode="decimal" maxlength="16" value="${e(s().dealDraft)}" ${dealError ? 'aria-invalid="true" aria-describedby="tp-deal-error"' : ""}></label>${dealError ? `<p class="tp-warning" id="tp-deal-error" role="alert">${e(dealError)}</p>` : ""}<label class="tp-check"><input type="checkbox" id="tp-confirm" ${attested ? "checked" : ""}>أفهم أنها نتيجة اختبار وليست عملية بيع فعلية</label>`;
    window.openDialog(
      replacing
        ? scenario
          ? "مراجعة السيناريو"
          : "بدء جلسة جديدة"
        : "تسجيل نتيجة بيع تجريبية",
      `<form class="tp-editor" data-tp-form="dialog" novalidate><div class="tp-editor-scroll">${body}${error ? `<p role="alert" class="tp-warning">${e(error)}</p>` : ""}</div><footer class="tp-savebar">${btn("إلغاء", "close")}<button type="submit" class="button primary" ${off(locked())}>${replacing ? "بدء الجلسة المحلية" : "حفظ الصفقة التجريبية"}</button></footer></form>`
    );
  }
  function open(type) {
    if (!["scenario", "restore"].includes(type)) selected = null;
    dialog = type;
    dialogRoute = current;
    attested = false;
    error = "";
    dealError = "";
    showDialog();
  }
  function showHistory() {
    const items = data.archive[current].slice(0, historyLimit);
    window.openDialog(
      "الجلسات المحفوظة",
      '<div class="tp-editor"><div class="tp-editor-scroll">' +
        (historyFault !== "success"
          ? '<p role="alert" class="tp-warning">' +
            (historyFault === "forbidden"
              ? "لا تملك صلاحية قراءة الجلسات."
              : "تعذر تحميل السجل؛ ليست قائمة فارغة.") +
            "</p>" +
            btn("إعادة قراءة السجل", "history-retry")
          : '<p>بيانات تصميم مصطنعة محفوظة في هذا المتصفح فقط.</p><ul class="tp-session-list">' +
            items
              .map(
                item =>
                  "<li>" +
                  btn(
                    "جلسة #" +
                      item.id +
                      " · " +
                      item.messages.length +
                      " رسالة" +
                      (item.deal ? " · اتفاق تجريبي مسجل" : ""),
                    "open-session",
                    'data-id="' + item.id + '" ' + off(item.id === s().id)
                  ) +
                  "</li>"
              )
              .join("") +
            "</ul>" +
            (!items.length ? "<p>لا توجد جلسات محفوظة بعد.</p>" : "") +
            (items.length < data.archive[current].length
              ? btn("جلسات أقدم", "history-more")
              : "")) +
        '</div><footer class="tp-savebar">' +
        btn("إغلاق", "close") +
        "</footer></div>"
    );
  }
  function restoreSession(id) {
    if (restoreFault !== "success") {
      error =
        restoreFault === "forbidden"
          ? "لا تملك صلاحية قراءة الجلسة."
          : "تعذر تحميل الجلسة. لم نستبدل المحادثة أو المسودة الحالية.";
      showDialog();
      return;
    }
    const stored = data.archive[current].find(item => item.id === id);
    if (!stored) {
      error = "لم تعد الجلسة موجودة في السجل.";
      showDialog();
      return;
    }
    data.sessions[current] = structuredClone(stored);
    s().restored = true;
    s().visibleFrom = Math.max(0, s().messages.length - 30);
    s().history = [];
    s().draft = "";
    s().pending = null;
    s().notice = "استُعيد المحفوظ فقط؛ لم نُرسل أي رسالة أو ننشئ ردًا.";
    persist();
    close();
    refresh();
  }
  function close() {
    document.getElementById("dialog").close();
    dialog = "";
    attested = false;
    error = "";
    dealError = "";
  }
  function start(message, retryId) {
    if (locked()) return;
    const value = message.trim();
    if (!value || value.length > 2000) {
      error = "اكتب سؤالًا من حرف واحد إلى 2000 حرف.";
      refresh("tp-question");
      return;
    }
    const session = s();
    let row = session.messages.find(m => m.id === retryId);
    if (!row) {
      row = {
        id: Math.max(0, ...session.messages.map(m => m.id)) + 1,
        role: "user",
        content: value,
        at: Date.now(),
      };
      session.messages.push(row);
    }
    delete row.failed;
    session.pending = {
      type: "chat",
      state: "waiting",
      messageId: row.id,
      mode: fault,
    };
    session.draft = "";
    session.notice = "";
    error = "";
    persist();
    refresh(undefined, true);
  }
  function settle(reconcile) {
    const session = s(),
      p = session.pending;
    if (
      role !== "owner" ||
      read !== "ready" ||
      !p ||
      (reconcile ? p.state !== "uncertain" : p.state !== "waiting")
    )
      return;
    if (!reconcile && p.mode === "uncertain") {
      p.state = "uncertain";
      persist();
      refresh();
      return;
    }
    if (p.type === "rating") {
      if (p.mode === "failure" && !reconcile) {
        p.state = "failed";
        persist();
        refresh();
        return;
      }
      if (p.mode === "conflict") {
        p.state = "conflict";
        persist();
        refresh();
        return;
      }
      const row = session.messages.find(item => item.id === p.messageId);
      if (!row) return;
      row.rating =
        p.mode === "superseded"
          ? p.rating === "positive"
            ? "negative"
            : "positive"
          : p.rating;
      row.revision = p.expectedRevision + (p.mode === "superseded" ? 2 : 1);
      if (p.mode !== "superseded") {
        const stats = ratingStats();
        session.history.push({ rate: stats.rate, total: stats.total });
      }
      session.notice =
        p.mode === "superseded"
          ? "أُظهر التقييم الأحدث؛ إيصالك السابق تجاوزته نسخة أخرى."
          : "تم حفظ تقييم الرد في المثال المحلي.";
    } else if (p.type === "chat") {
      const row = session.messages.find(m => m.id === p.messageId);
      if (!row) {
        session.pending = null;
        persist();
        refresh();
        return;
      }
      if (!reconcile && ["failure", "rate"].includes(p.mode)) {
        row.failed = p.mode;
        session.draft = row.content;
      } else {
        const reply = responses.get(row.content);
        session.messages.push({
          id: Math.max(0, ...session.messages.map(m => m.id)) + 1,
          role: "assistant",
          content:
            reply ||
            "هذا نص خارج الأمثلة الجاهزة. حُفظ سؤالك فقط؛ جرّبه مع المساعد المرتبط بمتجرك للحصول على تحليل فعلي.",
          example: !!reply,
          at: Date.now(),
        });
      }
    } else if (p.mode === "failure" && !reconcile)
      session.notice = "تعذر حفظ الصفقة. بقيت القيمة مسودة؛ لم نُظهر نجاحًا.";
    else {
      session.deal = {
        value: p.value,
        messageCount: p.messageCount,
        seconds: p.seconds,
      };
      session.notice = "تم حفظ صفقة المثال محليًا، دون تسجيل مبيعات حقيقية.";
      session.dealDraft = "";
    }
    session.pending = null;
    persist();
    refresh(undefined, true);
  }
  document.addEventListener("click", event => {
    const el = event.target.closest("[data-tp-action]");
    if (!el || el.disabled || !active()) return;
    const a = el.dataset.tpAction;
    if (a === "close") return close();
    if (a === "read-ready") {
      read = "ready";
      return refresh();
    }
    if (a === "finish" || a === "reconcile") return settle(a === "reconcile");
    if (a === "history" && read === "ready" && !s().pending) {
      historyLimit = 20;
      return open("history");
    }
    if (a === "history-retry") {
      historyFault = "success";
      return showHistory();
    }
    if (a === "history-more") {
      historyLimit += 20;
      return showHistory();
    }
    if (a === "open-session" && dialog === "history") {
      selected = Number(el.dataset.id);
      return open("restore");
    }
    if (
      a === "review-rating" &&
      role === "owner" &&
      s().pending?.type === "rating" &&
      s().pending.state === "conflict"
    ) {
      const pending = s().pending,
        row = s().messages.find(item => item.id === pending.messageId);
      if (row) {
        row.rating = pending.rating === "positive" ? "negative" : "positive";
        row.revision = pending.expectedRevision + 1;
      }
      s().pending = null;
      s().notice = "راجعنا التقييم الحالي؛ اختر تقييمك مجددًا لحفظ قرار جديد.";
      persist();
      return refresh();
    }
    if (
      a === "retry-rating" &&
      role === "owner" &&
      s().pending?.type === "rating" &&
      ["failed", "uncertain"].includes(s().pending.state)
    ) {
      s().pending.state = "waiting";
      s().pending.mode = ratingFault === "failure" ? "failure" : "success";
      persist();
      return refresh();
    }
    if (a === "older" && read === "ready" && !s().pending) {
      if (historyFault !== "success") {
        s().notice = "تعذر تحميل الرسائل الأقدم؛ المعروض والمسودة لم يتغيرا.";
        return refresh();
      }
      s().visibleFrom = Math.max(0, (s().visibleFrom || 0) - 30);
      s().notice = "";
      return refresh();
    }
    if (locked()) return;
    if (a === "seed-history" && detailed()) {
      for (let id = 100; id < 125; id++)
        if (!data.archive[current].some(item => item.id === id)) {
          const sample = fresh(id);
          sample.messages = Array.from({ length: 36 }, (_, i) => ({
            id: i + 1,
            role: i % 2 ? "assistant" : "user",
            content:
              i % 2
                ? "رد توضيحي محفوظ لمراجعة سياسة المتجر."
                : "سؤال تجريبي محفوظ رقم " + (i + 1),
            example: i % 2 === 1,
            at: Date.now(),
            revision: 0,
          }));
          data.archive[current].push(sample);
        }
      data.archive[current].sort((a, b) => b.id - a.id);
      persist();
      s().notice = "أضيفت 25 جلسة مصطنعة لفحص الترقيم.";
      return refresh();
    }
    if (a === "quick") {
      s().draft = quick[Number(el.dataset.index)] || "";
      error = "";
      persist();
      return refresh("tp-question");
    }
    if (a === "reset") return open("reset");
    if (
      a === "deal" &&
      detailed() &&
      !s().deal &&
      s().messages.some(m => m.role === "assistant" && !m.seed)
    )
      return open("deal");
    if (a === "retry") {
      const row = s().messages.at(-1);
      if (row?.failed && s().draft.trim() !== row.content) {
        error =
          "عدّلت مسودة السؤال. استخدم «جرّب الرد محليًا» لإرسال النص المعدّل؛ لم نستبدله بالسؤال السابق.";
        refresh("tp-question");
        return;
      }
      if (row?.failed && row.id === Number(el.dataset.id))
        start(row.content, row.id);
      return;
    }
    if (a === "rate" && detailed()) {
      const row = s().messages.find(m => m.id === Number(el.dataset.id));
      const value = el.dataset.value;
      if (!row?.example || !["positive", "negative"].includes(value)) return;
      s().pending = {
        type: "rating",
        state: "waiting",
        mode: ratingFault,
        messageId: row.id,
        rating: row.rating === value ? undefined : value,
        expectedRevision: row.revision || 0,
        receipt: crypto.randomUUID(),
      };
      s().notice = "";
      persist();
      refresh();
    }
  });
  document.addEventListener("input", event => {
    if (!active()) return;
    if (event.target.id === "tp-question" && !locked()) {
      s().draft = event.target.value;
      persist();
      const c = document.getElementById("tp-counter");
      if (c) c.textContent = String(s().draft.length);
    }
    if (event.target.id === "tp-value" && !locked()) {
      s().dealDraft = event.target.value;
      attested = false;
      const c = document.getElementById("tp-confirm");
      if (c) c.checked = false;
      persist();
    }
  });
  document.addEventListener("change", event => {
    if (!active()) return;
    const el = event.target;
    if (el.dataset.tpOption) {
      const details = el.closest("details"),
        wasOpen = details?.open;
      const fields = {
        role: v => (role = v),
        read: v => (read = v),
        fault: v => (fault = v),
        save: v => (saveFault = v),
        session: v => (sessionFault = v),
        feedback: v => (ratingFault = v),
        history: v => (historyFault = v),
        restore: v => (restoreFault = v),
      };
      fields[el.dataset.tpOption]?.(el.value);
      refresh();
      const lab = document.querySelector(".tp-lab");
      if (lab) lab.open = wasOpen;
      return;
    }
    if (el.id === "tp-confirm") attested = el.checked;
    if (
      el.id === "tp-scenario" &&
      !locked() &&
      scenarios.some(x => x[0] === el.value)
    ) {
      selected = el.value;
      el.value = "";
      open("scenario");
    }
  });
  document.addEventListener("keydown", event => {
    if (
      event.target.id === "tp-question" &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      start(s().draft);
    }
  });
  document.addEventListener("submit", event => {
    const form = event.target.closest("[data-tp-form]");
    if (!form) return;
    event.preventDefault();
    if (!active()) return;
    if (
      dialog === "restore" &&
      form.dataset.tpForm === "dialog" &&
      read === "ready" &&
      !s().pending &&
      dialogRoute === current
    )
      return restoreSession(selected);
    if (locked()) return;
    if (form.dataset.tpForm === "chat") return start(s().draft);
    if (!dialog || dialogRoute !== current) return;
    error = "";
    dealError = "";
    if (dialog === "deal" && !/^\d+(?:\.\d{1,2})?$/.test(s().dealDraft.trim()))
      dealError = "اكتب مبلغًا موجبًا برقمين عشريين كحد أقصى، مثل 149.50.";
    if (
      dialog === "deal" &&
      (!Number.isFinite(Number(s().dealDraft)) ||
        Number(s().dealDraft) <= 0 ||
        Number(s().dealDraft) > 9999999999.99)
    )
      dealError = "القيمة يجب أن تكون أكبر من صفر.";
    if (!attested) error = "أكّد مراجعتك قبل المتابعة.";
    if (dealError || error) {
      showDialog();
      document.getElementById(dealError ? "tp-value" : "tp-confirm")?.focus();
      return;
    }
    if (dialog === "deal") {
      if (s().deal) return;
      s().pending = {
        type: "deal",
        state: "waiting",
        mode: saveFault,
        value: Number(s().dealDraft).toFixed(2),
        messageCount: s().messages.length,
        seconds: Math.max(0, Math.floor((Date.now() - s().startedAt) / 1000)),
      };
      s().notice = "";
    } else {
      if (sessionFault === "failure") {
        error =
          "تعذرت تهيئة الجلسة البديلة. احتفظنا بالمحادثة والتقييم والصفقة الحالية.";
        showDialog();
        return;
      }
      const replacement = fresh(
          Math.max(s().id, ...data.archive[current].map(item => item.id)) + 1
        ),
        scenario = scenarios.find(x => x[0] === selected);
      replacement.created = true;
      if (dialog === "scenario" && scenario) {
        replacement.draft = scenario[2];
        if (selected === "multi")
          replacement.notice =
            "تمهيد للقراءة فقط: مرحباً، ثم ترحيب ثابت. لا يدخل في سياق الجلسة المحفوظة.";
      }
      data.sessions[current] = replacement;
    }
    persist();
    close();
    refresh("tp-question");
  });
  window.addEventListener("hashchange", () => {
    if (dialog && location.hash !== "#/page" + dialogRoute) close();
  });
  window.addEventListener("beforeunload", event => {
    const session = data.sessions[routes[1]];
    if (!session.draft.trim() && !session.dealDraft.trim()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  document.addEventListener(
    "close",
    event => {
      if (event.target.id !== "dialog" || !dialog) return;
      dialog = "";
      attested = false;
      error = "";
      dealError = "";
    },
    true
  );
  return {
    handles,
    render: renderPage,
    primary() {
      document.getElementById("tp-question")?.focus();
    },
    reset() {
      data = {
        version: 1,
        sessions: Object.fromEntries(routes.map(r => [r, fresh()])),
      };
      data.archive = Object.fromEntries(routes.map(route => [route, []]));
      historyLimit = 20;
      restoreFault = "success";
      historyFault = "success";
      ratingFault = "success";
      role = "owner";
      read = "ready";
      fault = "sample";
      saveFault = "success";
      sessionFault = "success";
      dialog = "";
      selected = null;
      error = "";
      dealError = "";
      attested = false;
      persist();
    },
  };
})();
