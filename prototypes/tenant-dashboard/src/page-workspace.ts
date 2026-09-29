import { knowledgePagesAr as c } from "../../../client/src/locales/knowledge-pages";
import { pageState, safePageUrl } from "../../../shared/knowledge-pages";
import { sectionState } from "../../../shared/knowledge-sections";
type Row = {
  id: number;
  title: string;
  url: string;
  content: string;
  active: boolean;
  read: boolean;
  isActive?: boolean;
};
export function createPageWorkspace(host: any) {
  let selected: Row | null = null,
    baseline = "",
    action = "",
    ack = false,
    error = "",
    read = "success",
    search = "",
    applied = "",
    state = "all",
    page = 1;
  const esc = host.esc;
  const status = (r: Row) =>
    pageState({
      isActive: r.isActive !== false,
      useInBot: r.active,
      hasContent: !!r.content?.trim(),
    });
  const affected = (r: Row) => {
    const ids = new Set<number>(
      host
        .sections()
        .filter((s: any) => s.source === "website" && s.sourceUrl === r.url)
        .map((s: any) => s.id)
    );
    for (let i = 0; i < host.sections().length; i++) {
      const size = ids.size;
      for (const s of host.sections()) if (ids.has(s.parentId)) ids.add(s.id);
      if (size === ids.size) break;
    }
    return {
      sections: host.sections().filter((s: any) => ids.has(s.id)),
      faqs: host.faqs().filter((f: any) => f.pageId === r.id),
      duplicates: host
        .rows()
        .filter((p: Row) => p.url === r.url)
        .map((p: Row) => p.id),
    };
  };
  const sstate = (s: any) =>
    sectionState({
      status: s.status ?? (s.approved ? "approved" : "pending_review"),
      useInBot: s.useInBot ?? s.approved,
      injectAs: s.injectAs ?? "fact",
      expired: !!s.expired,
    });
  const fingerprint = (r: Row) => JSON.stringify([r, affected(r)]);
  const button = (label: string, a: string, disabled = false, id?: number) =>
    `<button type="button" class="button" data-pw-action="${a}" ${id ? `data-id="${id}"` : ""} ${disabled ? "disabled" : ""}>${label}</button>`;
  const text = (v: string) =>
    `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(v || c.empty)}</div>`;
  const link = (v: string) =>
    safePageUrl(v)
      ? `<a href="${esc(safePageUrl(v))}" target="_blank" rel="noopener noreferrer" dir="ltr" style="overflow-wrap:anywhere">${esc(v)}</a>`
      : text(v);
  const eligible = (r: Row) =>
    !!r.content?.trim() &&
    r.isActive !== false &&
    affected(r).sections.every(
      (s: any) =>
        !!s.content?.trim() && sstate({ ...s, useInBot: true }) === "eligible"
    ) &&
    affected(r).faqs.every(
      (f: any) =>
        f.isActive !== false &&
        f.sourceStatus !== "archived" &&
        !!f.answer?.trim() &&
        !!f.question?.trim()
    );
  function editor() {
    if (!selected) return;
    const r = selected,
      linked = affected(r),
      blocked =
        !host.owner() ||
        host.blocked() ||
        linked.duplicates.length > 1 ||
        !!error;
    (window as any).openDialog(
      c.reviewTitle,
      `<div class="bw-editor"><div class="bw-scroll"><p>${c.scopeWarning}</p>${error ? `<p role="alert">${error}</p>` : ""}<h3>${esc(r.title)}</h3>${link(r.url)}<p>#${r.id} · ${c[status(r)]}</p><h3>${c.content}</h3>${text(r.content)}<h3>${c.linked}</h3><p>${c.linksHelp}</p><h4>${c.sections} (${linked.sections.length})</h4>${linked.sections.map((s: any) => `<article class="bw-card"><h4>${esc(s.title)} · #${s.id}</h4><p>${c[sstate(s)]}</p>${text(s.content)}</article>`).join("") || `<p>${c.noLinked}</p>`}<h4>${c.faqs} (${linked.faqs.length})</h4>${linked.faqs.map((f: any) => `<article class="bw-card"><h4>${esc(f.question)} · #${f.id}</h4>${text(f.answer)}</article>`).join("") || `<p>${c.noLinked}</p>`}${linked.duplicates.length > 1 ? `<p role="alert">${c.duplicates}</p>` : ""}${!eligible(r) ? `<p>${c.blocked}</p>` : ""}${!host.owner() ? `<p>${c.readOnly}</p>` : ""}<label class="field">${c.action}<select data-pw-choice ${blocked ? "disabled" : ""}>${[
        ["", c.choose],
        ["enable", c.enable],
        ["pause", c.pause],
        ["delete", c.delete],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${action === v ? "selected" : ""} ${v === "enable" && !eligible(r) ? "disabled" : ""}>${l}</option>`
        )
        .join(
          ""
        )}</select></label><label class="bw-check"><input type="checkbox" data-pw-ack ${ack ? "checked" : ""} ${blocked || !action ? "disabled" : ""}><span>${c.acknowledge}</span></label></div><footer class="bw-savebar pw-savebar">${button(c.close, "close")}${button(c.refreshReview, "refresh")}${button(c.apply, "apply", blocked || !action || !ack)}</footer></div>`
    );
  }
  document.addEventListener("input", e => {
    const el = e.target as HTMLInputElement;
    if (el.matches("[data-pw-search]")) search = el.value;
  });
  document.addEventListener("submit", e => {
    if ((e.target as Element).matches("[data-pw-search-form]")) {
      e.preventDefault();
      applied = search;
      page = 1;
      host.refresh();
    }
  });
  document.addEventListener("change", e => {
    const el = e.target as HTMLInputElement;
    if (el.matches("[data-pw-state]")) {
      state = el.value;
      page = 1;
      host.refresh();
    }
    if (el.matches("[data-pw-read]")) {
      read = el.value;
      selected = null;
      host.refresh();
    }
    if (el.matches("[data-pw-choice]")) {
      action = el.value;
      ack = false;
      editor();
    }
    if (el.matches("[data-pw-ack]")) {
      ack = el.checked && host.owner();
      editor();
    }
  });
  document.addEventListener("click", e => {
    const el = (e.target as Element).closest<HTMLButtonElement>(
      "[data-pw-action]"
    );
    if (
      !el ||
      el.disabled ||
      (host.blocked() && el.dataset.pwAction !== "close")
    )
      return;
    const a = el.dataset.pwAction;
    if (a === "retry") {
      read = "success";
      host.refresh();
    }
    if (a === "previous" || a === "next") {
      page += a === "next" ? 1 : -1;
      host.refresh();
    }
    if (a === "open" || a === "refresh") {
      const r = host
        .rows()
        .find(
          (r: Row) =>
            r.id === (a === "open" ? Number(el.dataset.id) : selected?.id)
        );
      if (!r) {
        error = c.missing;
        ack = false;
        editor();
        return;
      }
      selected = structuredClone(r);
      baseline = fingerprint(r);
      action = "";
      ack = false;
      error = "";
      editor();
    }
    if (a === "close") {
      selected = null;
      (document.getElementById("dialog") as HTMLDialogElement).close();
    }
    if (a === "apply" && selected && ack && action && host.owner()) {
      const r = host.rows().find((p: Row) => p.id === selected!.id);
      if (!r || fingerprint(r) !== baseline) {
        error = c.conflict;
        ack = false;
        editor();
        return;
      }
      const linked = affected(r);
      if (linked.duplicates.length > 1 || (action === "enable" && !eligible(r)))
        return;
      const decision = action;
      const ok = host.commit(
        () => {
          if (decision === "delete")
            host.remove(
              r.id,
              linked.sections.map((s: any) => s.id),
              linked.faqs.map((f: any) => f.id)
            );
          else {
            r.active = decision === "enable";
            for (const s of linked.sections) s.useInBot = r.active;
            for (const f of linked.faqs) f.useInBot = r.active;
          }
        },
        "تغيير صفحة موقع بعد المراجعة",
        "knowledge"
      );
      ack = false;
      if (ok) {
        selected = null;
        (document.getElementById("dialog") as HTMLDialogElement).close();
        host.refresh();
      } else {
        error = c.uncertain;
        host.refresh();
        editor();
      }
    }
  });
  return {
    reset() {
      selected = null;
      search = applied = error = "";
      state = "all";
      read = "success";
      page = 1;
    },
    render() {
      const rows = read === "empty" ? [] : host.rows(),
        matches = rows.filter(
          (r: Row) =>
            (state === "all" || status(r) === state) &&
            (!applied ||
              `${r.title} ${r.url} ${r.id}`
                .toLocaleLowerCase()
                .includes(applied.toLocaleLowerCase()))
        );
      const pages = Math.max(1, Math.ceil(matches.length / 8));
      page = Math.min(page, pages);
      return `<section class="panel panel-pad" data-page-workspace><h2>${c.title}</h2><p>${c.description}</p><p>${c.scope}</p><details><summary>حالات العرض التوضيحية</summary><label>قراءة الصفحات<select data-pw-read>${[
        ["success", "بيانات محفوظة"],
        ["empty", "لا توجد صفحات"],
        ["error", "فشل القراءة"],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${read === v ? "selected" : ""}>${l}</option>`
        )
        .join(
          ""
        )}</select></label></details><form data-pw-search-form class="bw-grid"><label class="field">${c.search}<input data-pw-search value="${esc(search)}" maxlength="200"></label><label class="field">${c.filter}<select data-pw-state>${["all", "enabled", "paused", "inactive", "empty"].map(v => `<option value="${v}" ${state === v ? "selected" : ""}>${c[v]}</option>`).join("")}</select></label><button class="button" type="submit">${c.searchButton}</button></form>${
        read === "error"
          ? `<p role="alert">${c.loadFailed}</p>${button(c.retry, "retry")}`
          : `<div class="bw-grid"><p>${c.saved}: ${rows.length}</p><p>${c.enabledCount}: ${rows.filter((r: Row) => status(r) === "enabled").length}</p></div><div class="bw-cards">${
              matches
                .slice((page - 1) * 8, page * 8)
                .map(
                  (r: Row) =>
                    `<article class="bw-card"><h3>${esc(r.title)}</h3>${link(r.url)}<p>#${r.id} · ${c[status(r)]}</p>${button(c.review, "open", false, r.id)}</article>`
                )
                .join("") || `<p>${c.noPages}</p>`
            }</div><footer class="bw-inline">${button(c.previous, "previous", page <= 1)}<span>${c.pagination.replace("{{page}}", String(page)).replace("{{pages}}", String(pages)).replace("{{total}}", String(matches.length))}</span>${button(c.next, "next", page >= pages)}</footer>`
      }</section>`;
    },
  };
}
