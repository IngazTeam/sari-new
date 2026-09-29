import { knowledgeConflictsAr as c } from "../../../client/src/locales/knowledge-conflicts";
export const conflictExamples = () =>
  Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    title: `مراجعة سياسة الاسترجاع · مثال ${index + 1}`,
    proposal:
      "يمكن استرجاع المنتج غير المفتوح خلال 10 أيام وفق هذا الاقتراح التوضيحي.",
    current:
      "يمكن استرجاع المنتج غير المفتوح خلال 7 أيام وفق السجل الحالي التوضيحي.",
    link: index === 1 ? "unlinked" : index === 2 ? "unavailable" : "verified",
    revision: 1,
    closed: false,
    proposalEnabled: false,
    currentEnabled: true,
  }));
export function createConflictReview(host: {
  esc: (v: unknown) => string;
  owner: () => boolean;
  blocked: () => boolean;
  rows: () => ReturnType<typeof conflictExamples>;
  commit: (fn: () => void, label: string, category: string) => boolean;
  refresh: () => void;
  alert: () => string;
}) {
  let selected: ReturnType<typeof conflictExamples>[number] | null = null,
    page = 1,
    action = "",
    ack = false,
    error = "",
    read = "success",
    discard = false;
  const button = (label: string, action: string, extra = "") =>
    `<button class="button" data-cr-action="${action}" ${extra}>${label}</button>`;
  function reset() {
    selected = null;
    page = 1;
    action = "";
    ack = false;
    error = "";
    read = "success";
    discard = false;
  }
  function render() {
    if (!host.owner()) ack = false;
    const rows = host.rows().filter(r => !r.closed),
      pages = Math.max(1, Math.ceil(rows.length / 8));
    page = Math.min(page, pages);
    const disabled = host.blocked() ? "disabled" : "";
    return `<section class="panel panel-pad" data-conflict-prototype><h2>${c.title}</h2><p>${c.description}</p>${host.alert()}<label class="field">حالة قراءة الاقتراحات<select data-cr-read><option value="success" ${read === "success" ? "selected" : ""}>بيانات</option><option value="loading" ${read === "loading" ? "selected" : ""}>تحميل</option><option value="failure" ${read === "failure" ? "selected" : ""}>تعذر القراءة</option></select></label>${
      read === "failure"
        ? `<p role="alert">${c.loadError}</p>${button(c.retry, "retry")}`
        : read === "loading"
          ? `<p role="status">${c.loading}</p>`
          : `<p>${rows.length} اقتراح · صفحة ${page} من ${pages}</p><div ${selected ? "hidden" : ""}><div class="bw-cards">${
              rows
                .slice((page - 1) * 8, page * 8)
                .map(
                  r =>
                    `<article class="bw-card"><h3>${host.esc(r.title)}</h3>${button(c.review, "review", `data-id="${r.id}" ${selected || host.blocked() ? "disabled" : ""}`)}</article>`
                )
                .join("") || `<p>${c.empty}</p>`
            }</div><div class="bw-actions">${button(c.previous, "previous", page <= 1 ? "disabled" : "")}${button(c.next, "next", page >= pages ? "disabled" : "")}</div></div>`
    }
  ${selected ? `<section data-cr-review class="panel panel-pad"><h3>${c.reviewTitle}</h3><p>${selected.link === "verified" ? c.linked : selected.link === "unavailable" ? c.unavailable : c.unlinked}</p><div class="bw-grid"><article class="bw-card"><h4>${c.proposal}</h4><p>${host.esc(selected.proposal)}</p></article>${selected.link === "verified" ? `<article class="bw-card"><h4>${c.current}</h4><p>${host.esc(selected.current)}</p></article>` : ""}</div><p>${c.indexing}</p>${host.owner() ? `<label class="field">${c.choose}<select data-cr-decision ${disabled}><option value="">اختر</option><option value="approve" ${action === "approve" ? "selected" : ""} ${selected.link === "unavailable" ? "disabled" : ""}>${selected.link === "verified" ? c.replace : c.approve}</option><option value="reject" ${action === "reject" ? "selected" : ""}>${c.reject}</option></select></label><p>${c.rejectHelp}</p><label class="bw-check"><input data-cr-ack type="checkbox" ${ack ? "checked" : ""} ${disabled}>${c.ack}</label>` : `<p>${c.readOnly}</p>`}${error ? `<p role="alert">${error}</p>` : ""}<div class="bw-actions">${button(c.save, "save", !host.owner() || !action || !ack || host.blocked() || read !== "success" ? "disabled" : "")}${button(c.reloadReview, "refresh", disabled)}${button(c.close, "close", disabled)}${button("محاكاة تغيّر النص الحالي", "change", disabled)}</div>${discard ? `<div role="alert"><h4>${c.retained}</h4><p>${c.retainedHelp}</p>${button(c.keep, "keep")}${button(c.discard, "discard")}</div>` : ""}</section>` : ""}</section>`;
  }
  document.addEventListener("change", e => {
    const el = e.target as HTMLInputElement;
    if (el.hasAttribute("data-cr-read")) {
      read = el.value;
      ack = false;
      host.refresh();
    }
    if (el.hasAttribute("data-cr-decision")) {
      action = el.value;
      ack = false;
      host.refresh();
    }
    if (el.hasAttribute("data-cr-ack")) {
      ack = el.checked;
      host.refresh();
    }
  });
  document.addEventListener("click", e => {
    const el = (e.target as Element).closest<HTMLButtonElement>(
      "[data-cr-action]"
    );
    if (!el || el.disabled) return;
    const task = el.dataset.crAction;
    if (task === "review") {
      selected = structuredClone(
        host.rows().find(r => r.id === Number(el.dataset.id))!
      );
      action = "";
      ack = false;
      error = "";
    }
    if (task === "next") page++;
    if (task === "previous") page--;
    if (task === "retry") read = "success";
    if (task === "close") {
      if (action || ack) discard = true;
      else selected = null;
    }
    if (task === "keep") discard = false;
    if (task === "discard") {
      selected = null;
      discard = false;
      action = "";
      ack = false;
    }
    if (task === "refresh" && selected) {
      selected = structuredClone(host.rows().find(r => r.id === selected!.id)!);
      ack = false;
      action = "";
      error = "";
    }
    if (task === "change" && selected) {
      const row = host.rows().find(r => r.id === selected!.id)!;
      row.current += " تغيرت المعلومة في محاكاة الاختبار.";
      row.revision++;
      error = c.changed;
      ack = false;
    }
    if (
      task === "save" &&
      selected &&
      host.owner() &&
      ack &&
      action &&
      !host.blocked() &&
      read === "success"
    ) {
      const row = host.rows().find(r => r.id === selected!.id)!;
      if (row.revision !== selected.revision || row.closed) {
        error = c.changed;
        ack = false;
      } else if (action === "approve" && row.link === "unavailable") {
        error = c.unavailable;
        ack = false;
      } else {
        const choice = action;
        host.commit(
          () => {
            row.closed = true;
            row.proposalEnabled = choice === "approve";
            if (choice === "approve" && row.link === "verified")
              row.currentEnabled = false;
            row.revision++;
            selected = null;
            action = "";
            ack = false;
          },
          choice === "approve"
            ? "اعتماد اقتراح معرفة توضيحي"
            : "إغلاق اقتراح دون تفعيل",
          "knowledge"
        );
        ack = false;
      }
    }
    host.refresh();
  });
  return {
    render,
    reset,
    leave() {
      ack = false;
    },
  };
}
