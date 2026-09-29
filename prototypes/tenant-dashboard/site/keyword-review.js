// Session-only review simulation. No API, provider, messages, or tenant storage.
window.KeywordReviewPreview = (() => {
  let state = null,
    generation = 0;
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
  const statuses = {
    new: "جديد",
    reviewed: "مراجع",
    ignored: "متجاهل",
    response_created: "معلّم بإنشاء رد",
  };
  const categories = {
    product: "منتجات",
    price: "أسعار",
    shipping: "شحن",
    complaint: "شكاوى",
    question: "أسئلة",
    other: "أخرى",
  };
  const date = value =>
    value
      ? new Intl.DateTimeFormat("ar-SA", {
          dateStyle: "medium",
          timeStyle: "short",
          calendar: "gregory",
        }).format(new Date(value))
      : "غير متاح";
  const button = (label, action, disabled = false, primary = false) =>
    `<button type='button' class='button ${primary ? "primary" : ""}' data-kr-action='${action}' ${disabled ? "disabled" : ""}>${e(label)}</button>`;
  const dirty = () => state?.base && state.draft !== state.base.status;
  const divergent = () =>
    state?.latest &&
    dirty() &&
    state.latest.status !== state.base.status &&
    state.draft !== state.latest.status;
  function record(row) {
    return `<section class='in-review-record'><h3>${e(row.keyword)}</h3><dl class='in-samples'><div><dt>التصنيف</dt><dd>${categories[row.category]}</dd></div><div><dt>حالة السجل</dt><dd>${statuses[row.status]}</dd></div><div><dt>التكرار التراكمي</dt><dd>${row.frequency}</dd></div><div><dt>آخر مراجعة</dt><dd>${date(row.reviewedAt)}</dd></div></dl><p class='hint'>أول ظهور: ${date(row.firstSeenAt)} · آخر ظهور: ${date(row.lastSeenAt)}</p><h4>مراجعة النص المقترح</h4><p class='in-text'>${e(row.suggestedResponse?.trim() || "لا يوجد نص مقترح محفوظ لهذا السجل.")}</p><p class='hint'>اقتراح محفوظ يحتاج مراجعة المصادر والحقائق. لم يُنشأ أو يُفعّل رد من هذه الشاشة.</p><h4>أمثلة الرسائل المحفوظة</h4>${row.sampleMessages.length ? `<ul>${row.sampleMessages.map(value => `<li class='in-text'>${e(value)}</li>`).join("")}</ul>` : "<p>لا توجد أمثلة محفوظة.</p>"}<p class='hint'>هذه أمثلة قد تكون مختصرة؛ ليست جميع رسائل العملاء أو دليلًا على صحة الاقتراح.</p></section>`;
  }
  function show() {
    if (!state) return;
    const s = state,
      d = document.getElementById("dialog"),
      scroll = d.querySelector(".in-review-scroll")?.scrollTop || 0,
      focused = d.contains(document.activeElement)
        ? document.activeElement.id
        : "";
    openDialog(
      "مراجعة سجل الكلمة",
      `<div class='in-review-scroll'><p class='hint'>راجع الاقتراح والأمثلة ثم حدّث علامة المراجعة. لا تُرسل هذه الشاشة ردًا للعميل.</p>${s.closing ? `<section role='alert' class='panel panel-pad'><p>لديك تغيير في الحالة لم يُحفظ.</p><div class='in-actions'>${button("متابعة المراجعة", "continue")}${button("إغلاق وتجاهل التغيير", "discard")}</div></section>` : ""}${s.busy ? '<p role="status">جارٍ التحميل…</p>' : ""}${s.failure ? `<p role='alert'>${e(s.failure)}</p>` : ""}${!s.base && !s.busy && !s.missing ? button("إعادة المحاولة", "retry") : ""}${
        s.base
          ? `${record(s.base)}${!s.base.canManage ? "<p>يمكنك مراجعة السجل. تغيير الحالة والحذف يحتاجان صلاحية إدارة المساعد.</p>" : ""}${
              s.base.canManage && !s.missing
                ? `<div class='field'><label for='kr-status'>حالة السجل</label><select id='kr-status' ${s.busy || s.latest ? "disabled" : ""}>${Object.entries(
                    statuses
                  )
                    .map(
                      ([value, label]) =>
                        `<option value='${value}' ${s.draft === value ? "selected" : ""}>${label}</option>`
                    )
                    .join(
                      ""
                    )}</select><small>الحالة علامة لتنظيم المراجعة فقط. «معلّم بإنشاء رد» لا ينشئ أو يفعل ردًا سريعًا ولا يثبت البيع.</small></div>${s.deleting ? `<section class='panel panel-pad'><h3>مراجعة الحذف</h3><p>سيُحذف سجل التحليل وأمثلته واقتراحه. لا يُحذف أي رد سريع أو رسالة محادثة. قد تظهر الكلمة مجددًا من رسائل جديدة؛ لا توجد استعادة لهذا السجل من هذه الشاشة.</p><label class='check-label'><input id='kr-reviewed' type='checkbox' ${s.reviewed ? "checked" : ""} ${s.busy || s.conflict || s.failure ? "disabled" : ""}>راجعت السجل المعروض وأريد حذفه.</label></section>` : ""}`
                : ""
            }${(s.conflict || s.failure) && !s.missing && !s.latest ? button("قراءة النسخة الحالية ومراجعتها", "review", s.busy) : ""}${s.latest ? `<section class='panel panel-pad in-review-latest'><h3>النسخة الحالية</h3><p>قارن النص والأمثلة والعدادات مع السجل أعلاه. اعتماد هذه النسخة للمراجعة لا يحفظ اختيارك ولا يحذف السجل.</p>${record(s.latest)}${divergent() ? `<fieldset><legend>تغيّرت الحالة أيضًا؛ اختر الحالة التي تريد حفظها</legend>${["mine", "latest"].map(value => `<label class='check-label'><input id='kr-choice-${value}' type='radio' name='kr-choice' value='${value}' ${s.choice === value ? "checked" : ""}>${value === "mine" ? "اختياري" : "الحالة الحالية"}: ${statuses[value === "mine" ? s.draft : s.latest.status]}</label>`).join("")}</fieldset>` : ""}${button("اعتماد هذه النسخة للمراجعة", "accept", s.busy || (divergent() && !s.choice), true)}</section>` : ""}`
          : ""
      }<details><summary>حالات مراجعة السجل لتجربة التصميم</summary><div class='in-actions'>${button("محاكاة تغيير من نافذة أخرى", "external", s.busy)}${button("محاكاة حذف من نافذة أخرى", "external-delete", s.busy)}${button("محاكاة فشل القراءة", "fail-read", s.busy)}${button("استعادة القراءة", "restore", s.busy)}${button("محاكاة فقدان صلاحية الإدارة", "revoke", s.busy)}</div></details></div><div class='in-review-foot'>${s.base?.canManage && !s.missing && !s.closing ? (s.deleting ? `${button("حذف سجل الكلمة", "delete", s.busy || s.conflict || !!s.failure || !s.reviewed, true)}${button("إلغاء الحذف", "cancel-delete", s.busy)}` : `${button("حفظ الحالة", "save", s.busy || s.conflict || !!s.failure || !dirty(), true)}${button("حذف سجل الكلمة", "begin-delete", s.busy || s.conflict || !!s.failure)}`) : ""}${button("إغلاق", "close", s.writing)}</div>`
    );
    d.classList.add("in-review-dialog");
    d.querySelector(".in-review-scroll").scrollTop = scroll;
    const closer = d.querySelector("[data-action=close]");
    closer.disabled = s.writing;
    if (focused)
      document.getElementById(focused)?.focus({ preventScroll: true });
  }
  function finish() {
    state = null;
    generation++;
    document.getElementById("dialog").close();
    window.render();
  }
  function close() {
    if (!state || state.writing) return;
    if (dirty()) {
      state.closing = true;
      show();
    } else finish();
  }
  async function load(review = false) {
    if (!state || state.busy) return;
    const s = state,
      token = ++generation;
    s.busy = true;
    s.failure = "";
    s.latest = null;
    s.choice = "";
    s.reviewed = false;
    show();
    try {
      if (s.readFailure) throw Error("read failure");
      const row = await s.read();
      if (state !== s || generation !== token) return;
      if (review) {
        s.latest = row;
        s.conflict = true;
      } else {
        s.base = row;
        s.draft = row.status;
        s.conflict = false;
      }
      s.missing = false;
    } catch (error) {
      if (state !== s || generation !== token) return;
      s.missing = error.code === "NOT_FOUND";
      s.failure = s.missing
        ? "السجل غير متاح لهذا المتجر أو حُذف. لن نعيد إنشاءه."
        : "تعذّر قراءة النسخة الحالية. حاول مرة أخرى؛ لم نعتمد بيانات قديمة.";
    } finally {
      if (state === s && generation === token) {
        s.busy = false;
        show();
      }
    }
  }
  async function save(kind) {
    if (
      !state ||
      state.busy ||
      !state.base?.canManage ||
      state.conflict ||
      state.failure ||
      state.missing ||
      (kind === "delete" && !state.reviewed) ||
      (kind === "status" && !dirty())
    )
      return;
    const s = state,
      token = ++generation;
    s.busy = true;
    s.writing = true;
    show();
    try {
      const result = await s.write({
        kind,
        status: s.draft,
        revision: s.base.revision,
      });
      if (state !== s || generation !== token) return;
      if (kind === "status") {
        s.base = result.row;
        s.draft = result.row.status;
        s.reviewed = false;
      } else {
        finish();
      }
      window.render();
      toast(
        kind === "status"
          ? "حُفظت حالة السجل محليًا."
          : "حُذف سجل الكلمة المحلي."
      );
    } catch (error) {
      if (state !== s || generation !== token) return;
      s.reviewed = false;
      s.conflict = ["CONFLICT", "NOT_FOUND"].includes(error.code);
      s.missing = error.code === "NOT_FOUND";
      s.latest = null;
      s.failure = s.missing
        ? "السجل غير متاح لهذا المتجر أو حُذف. لن نعيد إنشاءه."
        : s.conflict
          ? "تغيّر السجل منذ فتحه. بقي اختيارك؛ راجع النسخة الحالية قبل الحفظ أو الحذف."
          : "تعذّر تأكيد العملية. اقرأ النسخة الحالية قبل المحاولة مجددًا.";
    } finally {
      if (state === s && generation === token) {
        s.busy = false;
        s.writing = false;
        show();
      }
    }
  }
  document.addEventListener("change", event => {
    if (!state) return;
    if (event.target.id === "kr-status") {
      state.draft = event.target.value;
      state.reviewed = false;
      show();
    }
    if (event.target.id === "kr-reviewed") {
      state.reviewed = event.target.checked;
      show();
    }
    if (event.target.name === "kr-choice") {
      state.choice = event.target.value;
      show();
    }
  });
  document.addEventListener("click", event => {
    if (!state) return;
    const el = event.target.closest("[data-kr-action]");
    if (!el || el.disabled) return;
    const action = el.dataset.krAction;
    if (action === "close") close();
    if (action === "discard") finish();
    if (action === "continue") {
      state.closing = false;
      show();
    }
    if (action === "retry") void load();
    if (action === "review") void load(true);
    if (action === "save") void save("status");
    if (action === "delete") void save("delete");
    if (action === "begin-delete") {
      state.deleting = true;
      state.reviewed = false;
      show();
    }
    if (action === "cancel-delete") {
      state.deleting = false;
      state.reviewed = false;
      show();
    }
    if (action === "accept" && state.latest && (!divergent() || state.choice)) {
      state.draft = divergent()
        ? state.choice === "mine"
          ? state.draft
          : state.latest.status
        : dirty()
          ? state.draft
          : state.latest.status;
      state.base = state.latest;
      state.latest = null;
      state.conflict = false;
      state.failure = "";
      state.reviewed = false;
      state.choice = "";
      show();
    }
    if (["external", "external-delete", "revoke"].includes(action)) {
      state.simulate(action);
      toast("تغيّر مصدر المثال المحلي. تبقى نسختك حتى تراجع الحالية.");
    }
    if (action === "fail-read") {
      state.readFailure = true;
      toast("ستفشل قراءة النسخة الحالية في هذه المحاكاة.");
    }
    if (action === "restore") {
      state.readFailure = false;
      toast("عادت قراءة المصدر المحلي.");
    }
  });
  document.addEventListener(
    "click",
    event => {
      if (state && event.target.closest("#dialog [data-action=close]")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    },
    true
  );
  document.addEventListener(
    "cancel",
    event => {
      if (state && event.target.id === "dialog") {
        event.preventDefault();
        close();
      }
    },
    true
  );
  document.addEventListener(
    "close",
    event => {
      if (
        event.target.id === "dialog" &&
        event.target.classList.contains("in-review-dialog")
      ) {
        event.target.classList.remove("in-review-dialog");
        state = null;
        generation++;
      }
    },
    true
  );
  return {
    open(callbacks) {
      state = {
        ...callbacks,
        base: null,
        latest: null,
        draft: "new",
        busy: false,
        writing: false,
        failure: "",
        conflict: false,
        missing: false,
        deleting: false,
        reviewed: false,
        closing: false,
        choice: "",
        readFailure: false,
      };
      void load();
    },
  };
})();
