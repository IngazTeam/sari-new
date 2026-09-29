// Explicit local preview. Reading or filtering never changes saved examples.
export function createFaqList(host: {
  esc: (v: unknown) => string;
  rows: () => any[];
  owner: () => boolean;
  blocked: () => boolean;
  refresh: () => void;
}) {
  let search = "",
    applied = "",
    status = "all",
    page = 1,
    read = "success";
  function render() {
    const rows = host
      .rows()
      .filter(
        r =>
          (r.question + " " + r.answer)
            .toLocaleLowerCase()
            .includes(applied.toLocaleLowerCase()) &&
          (status === "all" ||
            (status === "enabled") ===
              ((r.isActive ?? true) && (r.useInBot ?? true)))
      );
    const pages = Math.max(1, Math.ceil(rows.length / 12));
    page = Math.min(page, pages);
    const disable = host.blocked() || read !== "success" ? "disabled" : "";
    return `<section class="panel panel-pad" data-faq-list><div class="panel-head"><h2>الأسئلة الشائعة</h2>${host.owner() ? `<button class="button primary" data-bw-action="new-faq" ${disable}>إضافة سؤال</button>` : ""}</div><p>راجع الإجابة وحدد استخدامها في الردود. أمثلة محلية لا تثبت جودة الإجابة أو احتراف المبيعات.</p><label class="field">حالة قراءة المثال<select data-faq-read>${Object.entries(
      { success: "بيانات", loading: "تحميل", failure: "تعذر القراءة" }
    )
      .map(
        ([v, l]) =>
          `<option value="${v}" ${read === v ? "selected" : ""}>${l}</option>`
      )
      .join("")}</select></label>${
      read === "loading"
        ? '<p role="status">جارٍ تحميل الأسئلة…</p>'
        : read === "failure"
          ? '<p role="alert">تعذر تحميل الأسئلة. هذا لا يعني أن القائمة فارغة.</p><button class="button" data-faq-action="reload">إعادة تحميل الأسئلة</button>'
          : `<form data-faq-search-form class="bw-actions"><label class="field">بحث في الأسئلة والإجابات<input data-faq-search value="${host.esc(search)}" maxlength="100"></label><label class="field">حالة الاستخدام<select data-faq-filter>${Object.entries(
              {
                all: "كل الأسئلة",
                enabled: "مفعّل للردود",
                paused: "غير مفعّل للردود",
              }
            )
              .map(
                ([v, l]) =>
                  `<option value="${v}" ${status === v ? "selected" : ""}>${l}</option>`
              )
              .join(
                ""
              )}</select></label><button class="button">بحث</button></form><p role="status">${rows.length} سؤال · صفحة ${page} من ${pages}</p><div class="bw-cards">${
              rows
                .slice((page - 1) * 12, page * 12)
                .map(
                  r =>
                    `<article class="bw-card"><h3>${host.esc(r.question)}</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">${host.esc(r.answer)}</p><p>${(r.isActive ?? true) && (r.useInBot ?? true) ? "مفعّل للردود" : "غير مفعّل للردود"}</p><p>${host.esc(r.category || "")}</p>${host.owner() ? `<div class="bw-actions"><button class="button" data-bw-action="edit-faq" data-id="${Number(r.id)}" ${disable}>تعديل</button><button class="button" data-bw-action="delete" data-kind="faqs" data-id="${Number(r.id)}" ${disable}>حذف السؤال</button></div>` : ""}</article>`
                )
                .join("") ||
              `<p>${applied || status !== "all" ? "لا توجد أسئلة مطابقة." : "لا توجد أسئلة بعد."}</p>`
            }</div><div class="bw-actions"><button class="button" data-faq-action="previous" ${page <= 1 ? "disabled" : ""}>السابق</button><button class="button" data-faq-action="next" ${page >= pages ? "disabled" : ""}>التالي</button></div>`
    }</section>`;
  }
  document.addEventListener("input", e => {
    const el = e.target as HTMLInputElement;
    if (el.hasAttribute("data-faq-search")) search = el.value;
  });
  document.addEventListener("change", e => {
    const el = e.target as HTMLSelectElement;
    if (el.hasAttribute("data-faq-filter")) {
      status = el.value;
      page = 1;
      host.refresh();
    }
    if (el.hasAttribute("data-faq-read")) {
      read = el.value;
      host.refresh();
    }
  });
  document.addEventListener("submit", e => {
    if ((e.target as Element).hasAttribute("data-faq-search-form")) {
      e.preventDefault();
      applied = search;
      page = 1;
      host.refresh();
    }
  });
  document.addEventListener("click", e => {
    const el = (e.target as Element).closest<HTMLButtonElement>(
      "[data-faq-action]"
    );
    if (!el || el.disabled) return;
    const action = el.dataset.faqAction;
    if (action === "reload") read = "success";
    if (action === "previous") page--;
    if (action === "next") page++;
    host.refresh();
  });
  return {
    render,
    reset() {
      search = "";
      applied = "";
      status = "all";
      page = 1;
      read = "success";
    },
  };
}
