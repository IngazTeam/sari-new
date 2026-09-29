// Local UX simulation. No messages, provider calls or merchant data are sent.
window.QuickResponsePreview = (() => {
  const key = "sary-quick-response-workspace-v1";
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
  const names = [
    "مدة التوصيل",
    "أوقات العمل",
    "طرق الدفع",
    "متابعة الشحن",
    "مكان المتجر",
    "طريقة الطلب",
    "سياسة الاسترجاع",
    "تغليف الهدايا",
    "دليل المقاسات",
    "طلب فاتورة",
    "توفر المنتجات",
    "خدمة الشركات",
  ];
  const initial = () =>
    names.map((trigger, i) => ({
      id: i + 1,
      trigger,
      response:
        "مثال تصميم محلي: يمكننا توضيح " +
        trigger +
        " وفق معلومات المتجر المعتمدة.",
      keywords: i === 0 ? "توصيل، شحن" : "",
      priority: i === 0 ? 0 : 5,
      isActive: i < 8,
      useCount: i === 0 ? 4 : 0,
    }));
  let rows;
  try {
    rows = JSON.parse(localStorage.getItem(key) || "null");
  } catch {}
  if (!Array.isArray(rows)) rows = initial();
  let search = "",
    status = "all",
    page = 1,
    question = "",
    sample = null,
    editor = null,
    reader = false,
    loadError = false,
    failure = "";
  const fields = ["trigger", "response", "keywords", "priority", "isActive"];
  const labels = {
    trigger: "العبارة المحفزة",
    response: "الرد",
    keywords: "كلمات مفتاحية إضافية",
    priority: "الأولوية",
    isActive: "الحالة",
  };
  const blank = () => ({
    trigger: "",
    response: "",
    keywords: "",
    priority: 5,
    isActive: false,
  });
  const draft = row =>
    Object.fromEntries(fields.map(field => [field, row[field]]));
  const canonical = d => ({
    ...draft(d),
    trigger: d.trigger.trim(),
    response: d.response.trim(),
    keywords: terms(d.keywords).join("، "),
  });
  const revision = row => JSON.stringify({ id: row.id, ...draft(row) }),
    collection = () => JSON.stringify(rows.map(revision));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const terms = value => {
    let items;
    try {
      const parsed = JSON.parse(value);
      items = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "string"
          ? [parsed]
          : typeof parsed === "number" || typeof parsed === "boolean"
            ? [value]
            : [];
    } catch {
      items = String(value || "").split(/[,،\n]/);
    }
    return [
      ...new Set(
        items
          .filter(item => typeof item === "string")
          .map(item => item.trim())
          .filter(Boolean)
      ),
    ];
  };
  const sorted = list =>
    [...list].sort(
      (a, b) =>
        b.priority - a.priority || b.useCount - a.useCount || a.id - b.id
    );
  const match = text => {
    const value = text.toLowerCase().trim(),
      active = sorted(rows.filter(row => row.isActive));
    return value
      ? active.find(row => row.trigger.trim().toLowerCase() === value) ||
          active.find(row =>
            terms(row.keywords).some(term => value.includes(term.toLowerCase()))
          ) ||
          null
      : null;
  };
  const value = (field, v) =>
    field === "isActive"
      ? v
        ? "نشط"
        : "معطل"
      : String(v || v === 0 ? v : "غير محدد");
  const button = (label, action, extra = "", primary = false) =>
    `<button type='button' class='button ${primary ? "primary" : ""}' data-qr-action='${action}' ${extra}>${e(label)}</button>`;
  function latest() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(saved)) rows = saved;
    } catch {}
  }
  function persist(next) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      rows = next;
      sample = null;
      return true;
    } catch {
      failure = "تعذر حفظ المحاكاة في المتصفح. بقيت مسودتك.";
      return false;
    }
  }
  function close() {
    const current = editor;
    if (
      current &&
      (current.kind === "delete" || eq(current.draft, current.base))
    )
      editor = null;
    document.getElementById("dialog").close();
    window.render();
  }
  function begin(kind, row) {
    if (reader || loadError) return;
    if (editor) {
      editDialog();
      return;
    }
    const d = row ? draft(row) : blank();
    editor = {
      kind,
      id: row?.id,
      draft: structuredClone(d),
      base: structuredClone(d),
      revision: row ? revision(row) : collection(),
      conflict: false,
      latest: null,
      errors: {},
      reviewed: false,
    };
    failure = "";
    editDialog();
  }
  function input(field, type = "text", max) {
    const d = editor.draft,
      id = "qr-" + field;
    return `<div class='field'><label for='${id}'>${labels[field]}</label>${type === "textarea" ? `<textarea id='${id}' name='${field}' data-qr-field rows='5' maxlength='${max}' aria-invalid='${!!editor.errors[field]}' aria-describedby='${id}-help'>${e(d[field])}</textarea>` : `<input id='${id}' name='${field}' data-qr-field type='${type}' value='${e(Number.isNaN(d[field]) ? "" : d[field])}' ${max ? `maxlength='${max}'` : ""} ${type === "number" ? `min='0' max='10' step='1'` : ""} aria-invalid='${!!editor.errors[field]}' aria-describedby='${id}-help'>`}<small id='${id}-help'>${editor.errors[field] || { trigger: "عبارة واحدة تطابق الرسالة كاملة بعد تجاهل المسافات الطرفية وحالة الحروف.", response: "من حرف إلى 2000 حرف. لا تؤكد إجراء لم ينفذ.", keywords: "افصل بفاصلة عربية أو إنجليزية. قد تطابق الكلمة داخل النفي؛ لا تثبت نية العميل.", priority: "عدد صحيح من 0 إلى 10." }[field]}</small></div>`;
  }
  function editDialog() {
    if (!editor) return;
    const d = editor.draft;
    openDialog(
      editor.kind === "delete"
        ? "راجع حذف الرد"
        : editor.kind === "edit"
          ? "تعديل الرد السريع"
          : "إضافة رد سريع جديد",
      `<form class='qr-form form-stack' data-qr-form='editor' novalidate><p class='hint'>${editor.kind === "delete" ? "الحذف نهائي للرد المحلي. راجع النص والحالة؛ المحادثات السابقة لا تتغير." : "اكتب الرد وحدد مطابقته. الرد الجديد متوقف حتى تختار تفعيله."}</p>${editor.kind === "delete" ? `<section class='panel panel-pad'><h3>${e(d.trigger)}</h3><p class='qr-text'>${e(d.response)}</p><p>${e(d.keywords || "بدون كلمات إضافية")}</p><p>الأولوية ${d.priority} · ${d.isActive ? "نشط" : "معطل"}</p></section>` : `<fieldset ${reader ? "disabled" : ""}>${input("trigger", "text", 255)}${input("response", "textarea", 2000)}${input("keywords", "text", 2000)}${input("priority", "number")}<label class='check-label'><input type='checkbox' name='isActive' data-qr-field ${d.isActive ? "checked" : ""}>مفعّل للمطابقة</label><p class='hint'>لا يغيّر الرد التلقائي أو الدوام أو صلاحيات ساري.</p></fieldset>`}${editor.conflict ? `<section role='alert' class='panel panel-pad'><p>تغيّر الرد أو السجل. مسودتك باقية؛ راجع المحفوظ قبل الحفظ.</p>${button("عرض التغييرات الجديدة", "review")}</section>` : ""}${failure ? `<p role='alert'>${e(failure)}</p>` : ""}<details><summary>حالات لتجربة التصميم</summary><div class='qr-actions'>${button("محاكاة تغيير من نافذة أخرى", "external")}${editor.kind !== "create" ? button("محاكاة حذف من نافذة أخرى", "external-delete") : ""}${button("محاكاة تعذر الحفظ", "fail")}</div></details>${editor.kind === "delete" && !editor.conflict ? `<label class='check-label'><input id='qr-reviewed' type='checkbox' ${editor.reviewed ? "checked" : ""}>راجعت النص وأريد حذف الرد نهائيًا.</label>` : ""}<div class='qr-actions'>${button(editor.kind === "delete" ? "إلغاء" : "إغلاق والاحتفاظ بالمسودة", "close")}<button type='submit' class='button primary' ${reader || editor.conflict || (editor.kind === "delete" && !editor.reviewed) ? "disabled" : ""}>${editor.kind === "delete" ? "حذف الرد المراجع" : editor.kind === "create" ? "إضافة" : "حفظ التغييرات"}</button></div></form>`
    );
  }
  function reviewDialog() {
    latest();
    editor.latest = structuredClone(rows);
    const found = rows.find(row => row.id === editor.id),
      same =
        editor.kind === "create"
          ? rows.find(row => eq(canonical(row), canonical(editor.draft)))
          : null;
    const reviewFields = found
      ? fields
          .map(
            field =>
              `<fieldset class='panel panel-pad'><legend>${labels[field]}</legend><p class='qr-text'>المحفوظ الآن: ${e(value(field, found[field]))}</p><p class='qr-text'>مسودتي: ${e(value(field, editor.draft[field]))}</p>${!eq(editor.draft[field], editor.base[field]) && !eq(found[field], editor.base[field]) && !eq(found[field], editor.draft[field]) ? ["mine", "saved"].map(choice => `<label class='check-label'><input type='radio' name='${field}' value='${choice}' required>${choice === "mine" ? "الاحتفاظ بتعديلي" : "استخدام المحفوظ"}</label>`).join("") : ""}</fieldset>`
          )
          .join("")
      : "";
    openDialog(
      "راجع النسخة المحفوظة",
      `<form class='qr-form form-stack' data-qr-form='review'><p>اعتماد المراجعة يغيّر المسودة فقط؛ احفظ بعدها.</p>${editor.kind === "create" ? `<p>القائمة الحالية: ${rows.length} رد.</p><details><summary>قائمة الردود السريعة</summary>${rows.map(row => `<section class='panel panel-pad'><h3>${e(row.trigger)}</h3><p class='qr-text'>${e(row.response)}</p><p>${e(row.keywords)} · الأولوية ${row.priority} · ${row.isActive ? "نشط" : "معطل"}</p></section>`).join("")}</details>${same ? `<p>يوجد رد مطابق لمسودتك؛ افتحه بدل إنشاء نسخة أخرى.</p>${button("فتح الرد المحفوظ", "open-saved", `data-id='${same.id}'`)}` : ""}` : found ? reviewFields : '<p role="alert">حُذف الرد. المسودة باقية للنسخ ولن نعيد إنشاءه.</p>'}<div class='qr-actions'>${button("العودة للمسودة", "back")}${(editor.kind === "create" && !same) || found ? `<button type='submit' class='button primary'>اعتماد المراجعة والعودة للمسودة</button>` : ""}</div></form>`
    );
  }
  function render() {
    const filtered = sorted(
        rows.filter(
          row =>
            (status === "all" || (status === "active") === row.isActive) &&
            [row.trigger, row.response, row.keywords].some(text =>
              text.toLowerCase().includes(search.trim().toLowerCase())
            )
        )
      ),
      pages = Math.max(1, Math.ceil(filtered.length / 10));
    page = Math.min(page, pages);
    const disabled = reader || loadError || !!editor;
    return `<div class='qr-workspace'><p class='hint'>قواعد مطابقة محفوظة. فهم سياق المحادثة له الأولوية؛ التفعيل لا يضمن استخدامها في كل محادثة.</p><details><summary>حالات لتجربة التصميم</summary><div class='qr-actions'>${button(reader ? "العودة لمدير المتجر" : "محاكاة قارئ فقط", "reader")}${button(loadError ? "إعادة محاولة التحميل" : "محاكاة فشل التحميل", "load")}</div></details>${reader ? '<p role="note">قراءة فقط. تغيير قواعد المساعد يحتاج صلاحية الإدارة.</p>' : ""}${failure ? `<p role='alert'>${e(failure)}</p>` : ""}${
      loadError
        ? `<section class='panel panel-pad' role='alert'><h2>تعذر تحميل القائمة</h2><p>هذه ليست قائمة فارغة.</p>${button("إعادة المحاولة", "load")}</section>`
        : `<div class='qr-stats'>${[
            ["إجمالي الردود", rows.length],
            ["نشط", rows.filter(row => row.isActive).length],
            ["معطل", rows.filter(row => !row.isActive).length],
          ]
            .map(
              ([label, count]) =>
                `<div class='panel panel-pad'><small>${label}</small><strong>${count}</strong></div>`
            )
            .join(
              ""
            )}</div>${editor ? `<section class='panel panel-pad'><p>مسودة لم تحفظ. أكملها أو تخلّ عنها قبل فتح رد آخر. تبقى حتى إعادة تحميل الموك أب.</p><div class='qr-actions'>${button("متابعة المسودة", "resume", "", true)}${button("التخلّي عن المسودة", "discard")}</div></section>` : ""}<section class='panel panel-pad'><div class='qr-toolbar'><div class='field'><label for='qr-search'>ابحث في العبارة والرد والكلمات</label><input id='qr-search' value='${e(search)}'></div><div class='field'><label for='qr-status'>الحالة</label><select id='qr-status'>${[
            ["all", "جميع الحالات"],
            ["active", "نشط"],
            ["inactive", "معطل"],
          ]
            .map(
              ([id, label]) =>
                `<option value='${id}' ${status === id ? "selected" : ""}>${label}</option>`
            )
            .join(
              ""
            )}</select></div>${button("تحديث القائمة", "refresh")}</div><p class='hint'>المطابقة الكاملة أولًا، ثم الكلمات داخل النص. الأولوية الأعلى، ثم الأكثر استخدامًا، ثم الأقدم عند التعادل.</p><div class='form-stack'>${
            filtered
              .slice((page - 1) * 10, page * 10)
              .map(
                row =>
                  `<article class='panel panel-pad'><div class='panel-head'><h2>${e(row.trigger)}</h2><span class='status gray'>${row.isActive ? "نشط" : "معطل"}</span></div><p class='qr-preview'>${e(row.response)}</p><details><summary>عرض الرد كاملًا والكلمات</summary><p class='qr-text'>${e(row.response)}</p><p class='qr-text'>كلمات مفتاحية: ${e(row.keywords || "غير محدد")}</p><p class='hint'>اختيار النص لا يثبت إرساله أو تسليمه أو نجاح البيع.</p></details><p class='hint'>الأولوية ${row.priority} · اختيار النص ${row.useCount} مرة</p><div class='qr-actions'>${button("تعديل", "edit", `data-id='${row.id}' ${disabled ? "disabled" : ""}`)}${button(row.isActive ? "إيقاف" : "تفعيل", "toggle", `data-id='${row.id}' ${disabled ? "disabled" : ""}`)}${button("حذف", "delete", `data-id='${row.id}' ${disabled ? "disabled" : ""}`)}</div></article>`
              )
              .join("") || "<p>لا توجد نتائج مطابقة. عدّل البحث أو الحالة.</p>"
          }</div><div class='qr-pagination'>${button("السابق", "previous", page <= 1 ? "disabled" : "")}<span>صفحة ${page} من ${pages} · ${filtered.length} رد</span>${button("التالي", "next", page >= pages ? "disabled" : "")}</div></section><details class='panel panel-pad'><summary>اختبر مطابقة القواعد المحفوظة</summary><p class='hint'>تجربة محلية على الردود المفعّلة فقط. لا رسالة ولا ذكاء ولا زيادة في عداد الاستخدام.</p><div class='field'><label for='qr-question'>رسالة لتجربة المطابقة</label><textarea id='qr-question' maxlength='2000' rows='3'>${e(question)}</textarea></div>${button("عرض المطابقة", "test")}<div id='qr-result' role='status'>${sample ? (sample.row ? `<h3>${e(sample.row.trigger)}</h3><p>${sample.row.trigger.trim().toLowerCase() === sample.question.trim().toLowerCase() ? "تطابق كامل مع العبارة" : "تطابق كلمة داخل الرسالة"}</p><p class='qr-text'>${e(sample.row.response)}</p>` : "<p>لا توجد قاعدة مفعّلة مطابقة. لا تختبر هذه النتيجة رد ساري الفعلي.</p>") : ""}</div></details>`
    }</div>`;
  }
  function validate() {
    const d = editor.draft;
    editor.errors = {};
    if (!d.trigger.trim() || d.trigger.trim().length > 255)
      editor.errors.trigger = "اكتب عبارة من حرف إلى 255 حرفًا.";
    if (!d.response.trim() || d.response.trim().length > 2000)
      editor.errors.response = "اكتب ردًا من حرف إلى 2000 حرف.";
    if (d.keywords.length > 2000) editor.errors.keywords = "الحد 2000 حرف.";
    if (!Number.isInteger(d.priority) || d.priority < 0 || d.priority > 10)
      editor.errors.priority = "أدخل عددًا صحيحًا من 0 إلى 10.";
    return !Object.keys(editor.errors).length;
  }
  document.addEventListener("input", event => {
    const input = event.target;
    if (input.matches("[data-qr-field]")) {
      editor.draft[input.name] =
        input.type === "checkbox"
          ? input.checked
          : input.type === "number"
            ? input.value === ""
              ? NaN
              : Number(input.value)
            : input.value;
      delete editor.errors[input.name];
    }
    if (input.id === "qr-question") {
      question = input.value;
      sample = null;
      document.getElementById("qr-result")?.replaceChildren();
    }
    if (input.id === "qr-search") {
      search = input.value;
      page = 1;
      const position = input.selectionStart;
      window.render();
      const next = document.getElementById("qr-search");
      next.focus();
      next.setSelectionRange(position, position);
    }
  });
  document.addEventListener("change", event => {
    if (event.target.id === "qr-status") {
      status = event.target.value;
      page = 1;
      window.render();
    }
    if (event.target.id === "qr-reviewed") {
      editor.reviewed = event.target.checked;
      event.target.form.querySelector('button[type="submit"]').disabled =
        reader || editor.conflict || !editor.reviewed;
    }
  });
  document.addEventListener("click", event => {
    const node = event.target.closest("[data-qr-action]");
    if (!node) return;
    const action = node.dataset.qrAction,
      row = rows.find(row => row.id === Number(node.dataset.id));
    if (action === "edit" || action === "delete") begin(action, row);
    if (action === "resume" || action === "back") editDialog();
    if (action === "close") close();
    if (action === "discard") {
      editor = null;
      failure = "";
      window.render();
    }
    if (action === "reader") {
      reader = !reader;
      sample = null;
      window.render();
    }
    if (action === "load") {
      loadError = !loadError;
      sample = null;
      window.render();
    }
    if (action === "refresh") {
      latest();
      sample = null;
      failure = "";
      window.render();
    }
    if (action === "previous") {
      page--;
      window.render();
    }
    if (action === "next") {
      page++;
      window.render();
    }
    if (action === "test") {
      if (!question.trim()) return toast("اكتب رسالة للتجربة.");
      sample = { question, row: match(question) };
      window.render();
    }
    if (action === "toggle" && !reader && !editor && row) {
      if (
        persist(
          rows.map(item =>
            item.id === row.id ? { ...item, isActive: !item.isActive } : item
          )
        )
      )
        toast("حُفظت الحالة محليًا.");
      window.render();
    }
    if (action === "fail") {
      failure = "تعذر الحفظ في المحاكاة. مسودتك باقية؛ حاول مجددًا.";
      editDialog();
    }
    if (action === "external" || action === "external-delete") {
      latest();
      let next;
      if (editor.kind === "create")
        next = [
          ...rows,
          {
            ...blank(),
            id: Math.max(0, ...rows.map(row => row.id)) + 1,
            trigger: "رد من نافذة أخرى",
            response: "نص محفوظ جديد",
            useCount: 0,
          },
        ];
      else
        next =
          action === "external-delete"
            ? rows.filter(row => row.id !== editor.id)
            : rows.map(row =>
                row.id === editor.id
                  ? { ...row, response: "رد محفوظ من نافذة أخرى", priority: 10 }
                  : row
              );
      persist(next);
      toast("تغيّرت النسخة المحفوظة؛ بقيت مسودتك.");
    }
    if (action === "review") reviewDialog();
    if (action === "open-saved" && row) {
      const d = draft(row);
      editor = {
        kind: "edit",
        id: row.id,
        draft: structuredClone(d),
        base: structuredClone(d),
        revision: revision(row),
        conflict: false,
        latest: null,
        errors: {},
        reviewed: false,
      };
      editDialog();
    }
  });
  document.addEventListener("submit", event => {
    const type = event.target.dataset.qrForm;
    if (!type) return;
    event.preventDefault();
    if (reader || loadError || !editor) return;
    if (type === "review") {
      if (!event.target.reportValidity()) return;
      const found = editor.latest.find(row => row.id === editor.id);
      if (editor.kind !== "create" && !found) return;
      const merged = found ? draft(found) : structuredClone(editor.draft);
      if (found)
        for (const field of fields)
          if (
            !eq(editor.draft[field], editor.base[field]) &&
            event.target.querySelector(`input[name='${field}']:checked`)
              ?.value !== "saved"
          )
            merged[field] = editor.draft[field];
      editor = {
        ...editor,
        base: found ? draft(found) : editor.base,
        draft: merged,
        revision: found
          ? revision(found)
          : JSON.stringify(editor.latest.map(revision)),
        conflict: false,
        latest: null,
        reviewed: false,
      };
      failure = "";
      editDialog();
      return;
    }
    if (editor.conflict) return;
    if (editor.kind !== "delete" && !validate()) {
      editDialog();
      document.querySelector("[data-qr-field][aria-invalid=true]")?.focus();
      return;
    }
    if (editor.kind === "delete" && !editor.reviewed)
      return toast("راجع الحذف وحدد الموافقة.");
    latest();
    const found = rows.find(row => row.id === editor.id);
    if (
      editor.revision !==
      (editor.kind === "create" ? collection() : found ? revision(found) : "")
    ) {
      editor.conflict = true;
      editDialog();
      return;
    }
    const d = {
      ...editor.draft,
      trigger: editor.draft.trigger.trim(),
      response: editor.draft.response.trim(),
      keywords: terms(editor.draft.keywords).join("، "),
    };
    const next =
      editor.kind === "delete"
        ? rows.filter(row => row.id !== editor.id)
        : editor.kind === "create"
          ? [
              ...rows,
              {
                ...d,
                id: Math.max(0, ...rows.map(row => row.id)) + 1,
                useCount: 0,
              },
            ]
          : rows.map(row => (row.id === editor.id ? { ...row, ...d } : row));
    if (!persist(next)) {
      editDialog();
      return;
    }
    editor = null;
    failure = "";
    document.getElementById("dialog").close();
    window.render();
    toast("حُفظ التغيير محليًا.");
  });
  document.addEventListener(
    "close",
    event => {
      if (
        event.target.id === "dialog" &&
        event.target.querySelector("[data-qr-form]")
      ) {
        if (
          editor &&
          (editor.kind === "delete" || eq(editor.draft, editor.base))
        )
          editor = null;
        window.render();
      }
    },
    true
  );
  return {
    handles: p => p.route === "/merchant/quick-responses",
    render,
    primary: () => (editor ? editDialog() : begin("create")),
    canPrimary: () => !reader && !loadError,
    primaryLabel: () => (editor ? "متابعة المسودة" : "رد سريع جديد"),
    reset() {
      rows = initial();
      editor = null;
      search = "";
      status = "all";
      page = 1;
      question = "";
      sample = null;
      reader = false;
      loadError = false;
      failure = "";
      persist(rows);
    },
  };
})();
