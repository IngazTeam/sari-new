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
      for (const s of Object.values(data.sessions))
        if (s.pending?.state === "waiting") s.pending.state = "uncertain";
    }
  } catch {
    storageError = true;
  }
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
      localStorage.setItem(key, JSON.stringify(data));
      storageError = false;
    } catch {
      storageError = true;
    }
  };
  const active = () => location.hash === "#/page" + current;
  function refresh(focus, tail = false) {
    if (!active()) return;
    const scroll = document.querySelector(".tp-messages")?.scrollTop || 0;
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
    const messages = document.querySelector(".tp-messages");
    if (messages) messages.scrollTop = tail ? messages.scrollHeight : scroll;
    if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
    else if (buttonSelector)
      document.querySelector(buttonSelector)?.focus({ preventScroll: true });
  }
  function lab() {
    return `<details class="tp-lab"><summary>حالات تجربة التصميم</summary><div class="tp-controls">${option("role", "الصلاحية", { owner: "مالك", viewer: "قراءة فقط" }, role)}${option("read", "قراءة الجلسة", { ready: "متاحة", loading: "جارٍ التحميل", error: "تعذرت القراءة" }, read)}${option("fault", "نتيجة الرد التالي", { sample: "رد المثال", failure: "فشل مؤكد", uncertain: "نتيجة غير مؤكدة", rate: "حد الاستخدام" }, fault)}${option("save", "حفظ الصفقة", { success: "نجاح محلي", failure: "فشل الحفظ", uncertain: "نتيجة غير مؤكدة" }, saveFault)}${option("session", "إنشاء جلسة بديلة", { success: "نجاح محلي", failure: "فشل التهيئة" }, sessionFault)}</div><p>اختيارات لفحص التصميم؛ لا تغيّر إعدادات المساعد الفعلي.</p></details>`;
  }
  function ratingStats() {
    const positive = s().messages.filter(m => m.rating === "positive").length;
    const negative = s().messages.filter(m => m.rating === "negative").length;
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
        ? `<div class="tp-rating-summary"><strong>${stats.rate === null ? "لا توجد تقييمات" : stats.rate + "% ردود مفيدة"}</strong><p>${stats.positive} مفيد · ${stats.negative} يحتاج تحسينًا · ${stats.total} ردود مقيّمة</p>${stats.rate === null ? "" : `<progress max="100" value="${stats.rate}" aria-label="نسبة الردود التي قيّمتها كمفيدة"></progress>`}<p>نسبة من تقييمك اليدوي لهذه الأمثلة فقط. لا تقيس التحويل أو احتراف المبيعات.</p></div><details><summary>تغيّر تقييمك خلال الجلسة</summary>${
            s().history.length
              ? `<ol class="tp-history">${s()
                  .history.map(
                    (h, i) =>
                      `<li>تعديل ${i + 1}: ${h.total === 0 ? "لا توجد تقييمات" : h.rate + "%"} <span>· ${h.total} ردود مقيّمة</span></li>`
                  )
                  .join("")}</ol>`
              : "<p>قيّم ردًا ليظهر السجل.</p>"
          }</details><div class="tp-deal-summary"><h3>نتيجة البيع التجريبية</h3>${s().deal ? `<p role="status">صفقة مثال مسجلة: <b>${e(s().deal.value)} ر.س</b></p><p>${s().deal.messageCount} رسائل · ${s().deal.seconds} ثانية منذ بداية الجلسة</p>` : "<p>لم تُسجّل صفقة لهذه الجلسة.</p>"}${btn("تسجيل صفقة تجريبية", "deal", off(locked() || !!s().deal || replies === 0))}<p>ليست طلبًا أو تحصيلًا ولا تُضاف إلى مبيعات التاجر.</p></div>`
        : "<p>كل سؤال في هذه الساحة يُراجع منفردًا. ترتيب الرسائل وحده لا يثبت ذاكرة محادثة.</p>"
    }<a href="#/page/merchant/sari-brain">راجع المعرفة والفجوات ←</a>${detailed() ? '<a href="#/page/merchant/try-sari-analytics">افتح مقاييس المساعد ←</a>' : ""}</section>`;
  }
  function pendingView() {
    const p = s().pending;
    if (!p) return "";
    const uncertain = p.state === "uncertain";
    return `<div class="tp-notice" role="status"><strong>${uncertain ? "النتيجة غير مؤكدة" : p.type === "chat" ? "بانتظار رد المثال" : "بانتظار تأكيد حفظ الصفقة"}</strong><p>${uncertain ? "لم نُظهر نجاحًا ولم نكرر العملية. افحص نتيجتها أولًا." : "خطوة انتظار يدوية لفحص الواجهة؛ لا يوجد طلب خارجي."}</p>${btn(uncertain ? "تحقق من نتيجة العملية" : "إكمال الخطوة التجريبية", uncertain ? "reconcile" : "finish", off(role !== "owner" || read !== "ready"), true)}</div>`;
  }
  function messages() {
    return (
      s()
        .messages.map(
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
        : `<section class="tp-workspace"><div class="tp-main"><section class="panel panel-pad tp-scenarios"><div class="panel-head"><h2>${detailed() ? "اختر موقفًا لتجربته" : "أسئلة سريعة"}</h2>${btn("جلسة جديدة", "reset", off(locked()))}</div>${detailed() ? `<label class="field" for="tp-scenario">سيناريو المحادثة<select id="tp-scenario" ${off(locked())}><option value="">اختر سيناريو…</option>${scenarios.map(r => `<option value="${r[0]}">${r[1]}</option>`).join("")}</select></label><p>يُراجع السيناريو قبل استبدال الجلسة. لن يبدأ الرد تلقائيًا.</p>` : `<div class="tp-chips">${quick.map((q, i) => btn(q, "quick", `data-index="${i}" ${off(locked())}`)).join("")}</div>`}</section><section class="panel tp-chat"><header class="tp-chat-head"><div><h2>${detailed() ? "محادثة التجربة" : "سؤال وإجابة"}</h2><p>جلسة محلية ${s().id} · أمثلة ثابتة دون اتصال بالنموذج</p></div><a href="#/page${detailed() ? routes[0] : routes[1]}">${detailed() ? "اختبار سريع" : "تجربة محادثة"} ←</a></header><div class="tp-messages" tabindex="0" aria-label="رسائل التجربة">${messages()}</div>${pendingView()}${s().notice ? `<p class="tp-notice" role="status">${e(s().notice)}</p>` : ""}<form class="tp-composer" data-tp-form="chat" novalidate><label for="tp-question">سؤال العميل</label><textarea id="tp-question" rows="2" maxlength="2000" ${off(locked())} aria-describedby="tp-input-help${error ? " tp-input-error" : ""}" ${error ? 'aria-invalid="true"' : ""}>${e(s().draft)}</textarea><div class="tp-compose-foot"><small id="tp-input-help"><span id="tp-counter">${s().draft.length}</span> / 2000 · Enter للتجربة، Shift+Enter لسطر جديد</small><button class="button primary" type="submit" ${off(locked())}>جرّب الرد محليًا</button></div>${error ? `<p id="tp-input-error" role="alert" class="tp-warning">${e(error)}</p>` : ""}</form></section></div>${metrics()}</section>`;
    return `<div class="tp-preview"><p class="tp-scope">${detailed() ? "اختبر التسلسل والتقييم، ثم عدّل معرفة المساعد." : "سؤال واحد لتراجع أسلوب الإجابة بسرعة."} ${role !== "owner" ? "الصلاحية الحالية: قراءة فقط." : ""}</p>${storageError ? '<p role="alert" class="tp-warning">تعذر التخزين المحلي؛ لا نضمن استعادة التغييرات بعد إغلاق المتصفح.</p>' : ""}${body}${lab()}</div>`;
  }
  function showDialog() {
    const replacing = dialog === "reset" || dialog === "scenario";
    const scenario = scenarios.find(x => x[0] === selected);
    const body = replacing
      ? `<p>تبدأ جلسة جديدة برقم مختلف. تُمسح رسائل هذه الصفحة وتقييماتها وصفقتها التجريبية؛ تبقى تجربة الصفحة الأخرى مستقلة.</p>${scenario ? `<div class="summary-box"><h3>${e(scenario[1])}</h3><p>${e(scenario[2])}</p>${selected === "multi" ? "<p>التمهيد: «مرحباً» ثم ترحيب ثابت من المساعد.</p>" : ""}</div>` : ""}<label class="tp-check"><input type="checkbox" id="tp-confirm" ${attested ? "checked" : ""}>راجعت أثر استبدال الجلسة الحالية</label>`
      : `<p>قيمة توضيحية للجلسة ${s().id}. لا ينشأ طلب ولا تتغير مبيعات المتجر.</p><label class="field" for="tp-value">قيمة الصفقة التجريبية (ر.س)<input id="tp-value" inputmode="decimal" maxlength="16" value="${e(s().dealDraft)}" ${dealError ? 'aria-invalid="true" aria-describedby="tp-deal-error"' : ""}></label>${dealError ? `<p class="tp-warning" id="tp-deal-error" role="alert">${e(dealError)}</p>` : ""}<label class="tp-check"><input type="checkbox" id="tp-confirm" ${attested ? "checked" : ""}>أفهم أنها نتيجة اختبار وليست عملية بيع فعلية</label>`;
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
    if (type !== "scenario") selected = null;
    dialog = type;
    dialogRoute = current;
    attested = false;
    error = "";
    dealError = "";
    showDialog();
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
    if (p.type === "chat") {
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
    if (locked()) return;
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
      row.rating = row.rating === value ? undefined : value;
      const stats = ratingStats();
      s().history.push({ rate: stats.rate, total: stats.total });
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
    if (!active() || locked()) return;
    if (form.dataset.tpForm === "chat") return start(s().draft);
    if (!dialog || dialogRoute !== current) return;
    error = "";
    dealError = "";
    if (dialog === "deal" && !/^\d+(?:\.\d{1,2})?$/.test(s().dealDraft.trim()))
      dealError = "اكتب مبلغًا موجبًا برقمين عشريين كحد أقصى، مثل 149.50.";
    if (
      dialog === "deal" &&
      (!Number.isFinite(Number(s().dealDraft)) || Number(s().dealDraft) <= 0)
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
      const replacement = fresh(s().id + 1),
        scenario = scenarios.find(x => x[0] === selected);
      if (dialog === "scenario" && scenario) {
        replacement.draft = scenario[2];
        if (selected === "multi")
          replacement.messages = [
            {
              id: 1,
              role: "user",
              content: "مرحباً",
              at: Date.now(),
              seed: true,
            },
            {
              id: 2,
              role: "assistant",
              content: "أهلًا وسهلًا! كيف أقدر أساعدك اليوم؟",
              at: Date.now(),
              seed: true,
            },
          ];
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
