import { knowledgeSectionsAr as c } from "../../../client/src/locales/knowledge-sections";
import {
  sectionState,
  sectionContentFits,
  sectionStates,
  summarizeSectionReadiness,
} from "../../../shared/knowledge-sections";
type Row = {
  id: number;
  type: string;
  title: string;
  content: string;
  approved: boolean;
  parentId?: number | null;
  useInBot?: boolean;
  status?: string;
  injectAs?: string;
  expired?: boolean;
  revision?: number;
  manualRequestId?: string;
};
export type DemoSectionReceipt = {
  requestId: string;
  sectionId: number;
  input: string;
};
export function createSectionWorkspace(host: {
  rows: () => Row[];
  esc: (v: unknown) => string;
  owner: () => boolean;
  blocked: () => boolean;
  commit: (fn: () => void, label: string, category: string) => boolean;
  refresh: () => void;
  alert: () => string;
  receipts: () => DemoSectionReceipt[];
}) {
  const storageKey = "sary-demo-section-draft-v1";
  type Cached = {
    savedAt: number;
    row: Row;
    baseline: string;
    uncertain: boolean;
  };
  let restorable: Cached | null = null,
    uncertain = false,
    rebase: Row | null = null,
    storageError = false,
    notice = "";
  try {
    const cached = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (
      cached &&
      Date.now() - cached.savedAt >= 0 &&
      Date.now() - cached.savedAt < 86400000 &&
      typeof cached.row?.content === "string" &&
      typeof cached.row?.title === "string" &&
      typeof cached.baseline === "string"
    )
      restorable = cached;
    else sessionStorage.removeItem(storageKey);
  } catch {
    storageError = true;
  }
  let selected: Row | null = null,
    baseline = "",
    treeBaseline = "",
    ack = false,
    deleting = false,
    discard = false,
    search = "",
    applied = "",
    state = "all",
    type = "all",
    page = 1,
    read = "success",
    error = "";
  const normalized = (r: Row) => ({
    ...r,
    sectionType: r.type,
    status: r.status ?? (r.approved ? "approved" : "pending_review"),
    useInBot: r.useInBot ?? r.approved,
    injectAs: r.injectAs ?? (r.type === "opportunities" ? "none" : "fact"),
    expired: !!r.expired,
  });
  const tree = (id: number) => {
    const ids = new Set([id]);
    for (let i = 0; i < host.rows().length; i++) {
      const before = ids.size;
      for (const r of host.rows())
        if (r.parentId && ids.has(r.parentId)) ids.add(r.id);
      if (ids.size === before) break;
    }
    return host.rows().filter(r => ids.has(r.id));
  };
  const fingerprint = (r: unknown) => JSON.stringify(r),
    name = (s: string) => c[s as keyof typeof c] || s;
  const creationInput = (r: Row) =>
    fingerprint([r.title, r.content, r.type, !!r.useInBot, r.parentId || null]);
  function retain() {
    if (!selected || !host.owner()) return true;
    try {
      const raw = JSON.stringify({
        savedAt: Date.now(),
        row: selected,
        baseline,
        uncertain,
      });
      sessionStorage.setItem(storageKey, raw);
      if (sessionStorage.getItem(storageKey) !== raw)
        throw Error("Unavailable");
      storageError = false;
      return true;
    } catch {
      storageError = true;
      return false;
    }
  }
  function clearDraft() {
    try {
      sessionStorage.removeItem(storageKey);
      restorable = null;
    } catch {
      storageError = true;
    }
  }
  function receiptState(receipt: DemoSectionReceipt) {
    const row = host.rows().find(r => r.id === receipt.sectionId);
    return !row
      ? c.creationDeleted
      : creationInput(row) !== receipt.input
        ? c.creationChanged
        : c.creationSaved;
  }
  const button = (label: string, a: string, extra = "") =>
    `<button class="button" data-sw-action="${a}" ${extra}>${label}</button>`;
  const options = (values: string[], value: string) =>
    values
      .map(
        v =>
          `<option value="${v}" ${v === value ? "selected" : ""}>${name(v)}</option>`
      )
      .join("");
  function leave() {
    clearDraft();
    uncertain = false;
    rebase = null;
    selected = null;
    ack = false;
    deleting = false;
    discard = false;
    error = "";
  }
  function open(id: number) {
    const row = host.rows().find(r => r.id === id);
    if (!row) {
      error = c.denied;
      return;
    }
    selected = structuredClone(row);
    baseline = fingerprint(row);
    treeBaseline = fingerprint(tree(id));
    ack = false;
    deleting = false;
    error = "";
    uncertain = false;
    rebase = null;
    retain();
  }
  function render() {
    if (!host.owner()) {
      ack = false;
      clearDraft();
    }
    const all = host
        .rows()
        .map(r => ({ ...normalized(r), state: sectionState(normalized(r)) })),
      coverage = summarizeSectionReadiness(all);
    const matches = all.filter(
      r =>
        (state === "all" || r.state === state) &&
        (type === "all" || r.type === type) &&
        (!applied ||
          r.title.toLocaleLowerCase().includes(applied.toLocaleLowerCase()) ||
          String(r.id) === applied)
    );
    const pages = Math.max(1, Math.ceil(matches.length / 8));
    page = Math.min(page, pages);
    const dis = host.blocked() ? "disabled" : "",
      row = selected && normalized(selected),
      pending = row?.status === "pending_review";
    return `<section class="panel panel-pad" data-section-prototype><h2>${c.title}</h2><p>${c.help}</p>${host.alert()}${notice ? `<p role="status">${host.esc(notice)}</p>` : ""}${storageError ? `<p role="alert">${c.draftStorageError}</p>` : ""}${restorable && host.owner() && !selected ? `<section class="bw-card"><h3>${c.draftAvailable}</h3><p>${c.draftPolicy}</p><div class="bw-actions">${button(c.restoreDraft, "restore")}${button(c.discardDraft, "discard-draft")}</div></section>` : ""}<label class="field">حالة القراءة<select data-sw-read>${[
      ["success", "بيانات"],
      ["loading", "تحميل"],
      ["failure", "تعذر القراءة"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${v === read ? "selected" : ""}>${l}</option>`
      )
      .join("")}</select></label>${
      read === "failure"
        ? `<p role="alert">${c.loadError}</p>${button(c.retry, "retry")}`
        : read === "loading"
          ? `<p role="status">${c.loading}</p>`
          : !selected
            ? `
  <details data-section-coverage><summary>${c.coverageTitle}: ${coverage.total}%</summary><p>${c.coverageHelp}</p><p>${coverage.covered} من ${coverage.areas} مجالات · ${coverage.saved} قسم محفوظ</p><div class="bw-grid">${sectionStates.map(s => `<p>${name(s)}: ${coverage.counts[s]}</p>`).join("")}</div>${coverage.breakdown.map(a => `<p>${name(a.key)}: ${a.count}</p>`).join("")}</details>
  <form data-sw-search-form class="bw-grid"><label class="field">${c.search}<input data-sw-search value="${host.esc(search)}" maxlength="200"></label><label class="field">${c.state}<select data-sw-state>${options(["all", ...sectionStates], state)}</select></label><label class="field">${c.type}<select data-sw-type>${options(["all", "identity", "services", "policies", "faq", "contact", "team", "achievements", "sales_intel", "opportunities", "custom"], type)}</select></label><button class="button">${c.searchAction}</button></form>
  ${button(c.new, "new", !host.owner() || restorable ? "disabled" : dis)}<p>${matches.length} قسم · صفحة ${page} من ${pages}</p><div class="bw-cards">${
    matches
      .slice((page - 1) * 8, page * 8)
      .map(
        r =>
          `<article class="bw-card"><h3>${host.esc(r.title)}</h3><p>${name(r.type)} · #${r.id}</p><p>${name(r.state)}</p>${r.parentId ? `<p>${c.parent}: #${r.parentId}</p>` : ""}${button(c.open, "open", `data-id="${r.id}" ${restorable ? "disabled" : dis}`)}</article>`
      )
      .join("") || `<p>${c.empty}</p>`
  }</div><div class="bw-actions">${button(c.previous, "previous", page <= 1 ? "disabled" : "")}${button(c.next, "next", page >= pages ? "disabled" : "")}</div>`
            : ""
    }
  ${
    selected
      ? `<section data-sw-editor><p>${c.draftPolicy}</p>${rebase ? `<section class="bw-card"><p role="alert">${c.restoreChanged}</p><h4>${c.currentText}</h4><p>${host.esc(rebase.title)}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">${host.esc(rebase.content)}</p>${button(c.useDraft, "rebase", dis)}</section>` : ""}<h3>${deleting ? c.deleteTitle : c.reviewTitle}</h3>${selected.id ? `<p>${name(sectionState(row!))} · #${selected.id}</p>` : `<p>${c.newHelp}</p>`}${selected.parentId ? `<p>${c.parent}: #${selected.parentId}</p>` : ""}${
          deleting
            ? `<p>${c.deleteHelp}</p><h4>${host.esc(selected.title)}</h4><p style="white-space:pre-wrap;overflow-wrap:anywhere">${host.esc(selected.content)}</p><h4>${c.children}</h4><ul>${JSON.parse(
                treeBaseline
              )
                .filter((r: Row) => r.id !== selected!.id)
                .map((r: Row) => `<li>#${r.id} · ${host.esc(r.title)}</li>`)
                .join("")}</ul>`
            : `<fieldset style="border:0;padding:0;margin:0;min-inline-size:0;display:grid;gap:16px" ${!host.owner() || host.blocked() || pending || uncertain || rebase ? "disabled" : ""}>
  ${!selected.id ? `<label class="field">${c.type}<select data-sw-field="type">${options(["identity", "services", "policies", "faq", "contact", "team", "achievements", "custom"], selected.type)}</select></label>` : ""}
  <label class="field">${c.sectionTitle}<input data-sw-field="title" value="${host.esc(selected.title)}" maxlength="500"></label><label class="field">${c.content}<textarea data-sw-field="content" maxlength="50000" style="min-height:16rem">${host.esc(selected.content)}</textarea></label><label class="bw-check"><input type="checkbox" data-sw-use ${row!.useInBot ? "checked" : ""}>${c.use}</label></fieldset><p>${c.useHelp}</p>${pending ? `<p>${c.pendingHelp}</p>` : ""}`
        }
  <label class="bw-check"><input type="checkbox" data-sw-ack ${ack ? "checked" : ""} ${!host.owner() || host.blocked() || rebase || (uncertain && selected.id) ? "disabled" : ""}>${c.ack}</label>${error ? `<p role="alert">${error}</p>` : ""}<div class="bw-actions">${button(deleting ? c.deleteConfirm : uncertain && !selected.id ? c.retrySame : c.save, "save", !ack || !host.owner() || host.blocked() || rebase || (uncertain && selected.id) || read !== "success" || (pending && !deleting) ? "disabled" : "")}${!selected.id && uncertain ? button(c.checkCreation, "receipt", dis) : ""}${selected.id ? button(c.refreshReview, "refresh", dis) + button(c.remove, "delete", !host.owner() || rebase || uncertain ? "disabled" : dis) + button(c.child, "child", !host.owner() || rebase || uncertain ? "disabled" : dis) + button("محاكاة تعديل متزامن", "change", dis) : ""}${button(c.close, "close", dis)}</div>${discard ? `<div role="alert"><h4>${c.discardTitle}</h4><p>${c.discardHelp}</p>${button(c.keep, "keep")}${button(c.leave, "leave")}</div>` : ""}</section>`
      : ""
  }</section>`;
  }
  document.addEventListener("input", e => {
    const el = e.target as HTMLInputElement;
    if (el.hasAttribute("data-sw-search")) search = el.value;
    const key = el.dataset.swField;
    if (
      key &&
      selected &&
      host.owner() &&
      !host.blocked() &&
      ["title", "content"].includes(key)
    ) {
      (selected as any)[key] = el.value;
      ack = false;
      const checkbox =
        document.querySelector<HTMLInputElement>("[data-sw-ack]");
      if (checkbox) checkbox.checked = false;
      const save = document.querySelector<HTMLButtonElement>(
        '[data-sw-action="save"]'
      );
      if (save) save.disabled = true;
      retain();
    }
  });
  document.addEventListener("change", e => {
    const el = e.target as HTMLInputElement;
    if (el.hasAttribute("data-sw-read")) {
      read = el.value;
      ack = false;
    }
    if (el.hasAttribute("data-sw-state")) {
      state = el.value;
      page = 1;
    }
    if (el.hasAttribute("data-sw-type")) {
      type = el.value;
      page = 1;
    }
    if (el.dataset.swField === "type" && selected) {
      selected.type = el.value;
      ack = false;
    }
    if (el.hasAttribute("data-sw-use") && selected && host.owner()) {
      selected.useInBot = el.checked;
      ack = false;
    }
    if (selected) retain();
    if (el.hasAttribute("data-sw-ack"))
      ack = el.checked && host.owner() && !host.blocked();
    if (
      el.matches(
        '[data-sw-read],[data-sw-state],[data-sw-type],[data-sw-field="type"],[data-sw-use],[data-sw-ack]'
      )
    )
      host.refresh();
  });
  document.addEventListener("submit", e => {
    if ((e.target as Element).hasAttribute("data-sw-search-form")) {
      e.preventDefault();
      applied = search;
      page = 1;
      host.refresh();
    }
  });
  document.addEventListener("click", e => {
    const el = (e.target as Element).closest<HTMLButtonElement>(
      "[data-sw-action]"
    );
    if (!el || el.disabled || host.blocked()) return;
    const a = el.dataset.swAction,
      id = Number(el.dataset.id);
    if (a === "retry") read = "success";
    if (a === "discard-draft") clearDraft();
    if (a === "restore" && restorable && host.owner()) {
      const current = host.rows().find(r => r.id === restorable!.row.id);
      if (restorable.row.id && !current) error = c.denied;
      else {
        selected = structuredClone(restorable.row);
        baseline = restorable.baseline;
        treeBaseline = fingerprint(tree(selected.id));
        uncertain = restorable.uncertain;
        rebase =
          current && (fingerprint(current) !== baseline || uncertain)
            ? structuredClone(current)
            : null;
        restorable = null;
        ack = false;
        deleting = false;
        notice = c.draftRestored;
        retain();
      }
    }
    if (a === "rebase" && rebase && selected && host.owner()) {
      baseline = fingerprint(rebase);
      selected.revision = rebase.revision;
      treeBaseline = fingerprint(tree(selected.id));
      rebase = null;
      uncertain = false;
      ack = false;
      error = "";
      retain();
    }
    if (a === "receipt" && selected && !selected.id && host.owner()) {
      const receipt = host
        .receipts()
        .find(r => r.requestId === selected!.manualRequestId);
      ack = false;
      if (receipt) {
        notice = receiptState(receipt);
        leave();
      } else notice = c.creationMissing;
    }
    if (a === "previous") page--;
    if (a === "next") page++;
    if (a === "open") open(id);
    if ((a === "new" || a === "child") && host.owner()) {
      const parentId = a === "child" ? selected?.id : null;
      selected = {
        id: 0,
        type: "custom",
        title: "",
        content: "",
        approved: true,
        useInBot: false,
        parentId,
        manualRequestId: crypto.randomUUID(),
      };
      baseline = fingerprint(selected);
      treeBaseline = "[]";
      deleting = false;
      ack = false;
      error = "";
      uncertain = false;
      rebase = null;
      retain();
    }
    if (a === "refresh" && selected?.id) open(selected.id);
    if (a === "delete" && selected && host.owner()) {
      selected = JSON.parse(baseline);
      deleting = true;
      ack = false;
    }
    if (a === "change" && selected?.id) {
      const r = host.rows().find(r => r.id === selected!.id)!;
      r.content += " · نص تغيّر في المحاكاة";
      r.revision = (r.revision || 0) + 1;
      ack = false;
      error = c.changed;
    }
    if (a === "close") {
      if (selected && (fingerprint(selected) !== baseline || ack))
        discard = true;
      else leave();
    }
    if (a === "keep") discard = false;
    if (a === "leave") leave();
    if (
      a === "save" &&
      selected &&
      host.owner() &&
      ack &&
      !rebase &&
      !(uncertain && selected.id) &&
      read === "success"
    ) {
      const current = host.rows().find(r => r.id === selected!.id),
        r = normalized(selected);
      if (
        selected.id &&
        (deleting ? fingerprint(tree(selected.id)) : fingerprint(current)) !==
          (deleting ? treeBaseline : baseline)
      ) {
        error = c.changed;
        ack = false;
      } else if (
        !deleting &&
        (!selected.title.trim() ||
          !selected.content.trim() ||
          selected.title.length > 500 ||
          selected.content.length > 50000 ||
          !sectionContentFits(selected.content.trim()))
      ) {
        error = c.required;
        ack = false;
      } else if (
        !deleting &&
        (r.status === "pending_review" ||
          (r.useInBot && sectionState(r) !== "eligible"))
      ) {
        error = c.blocked;
        ack = false;
      } else {
        const saved = structuredClone(selected),
          ids = new Set(deleting ? tree(saved.id).map(r => r.id) : []);
        const receipt =
          !saved.id &&
          host.receipts().find(r => r.requestId === saved.manualRequestId);
        if (receipt) {
          if (receipt.input !== creationInput(saved)) {
            error = c.changed;
            ack = false;
          } else {
            notice = receiptState(receipt);
            leave();
          }
          host.refresh();
          return;
        }
        uncertain = true;
        if (!retain()) {
          uncertain = false;
          ack = false;
          host.refresh();
          return;
        }
        if (
          host.commit(
            () => {
              if (deleting) {
                for (let i = host.rows().length - 1; i >= 0; i--)
                  if (ids.has(host.rows()[i].id)) host.rows().splice(i, 1);
              } else if (saved.id) {
                const at = host.rows().findIndex(r => r.id === saved.id);
                host.rows()[at] = {
                  ...saved,
                  revision: (saved.revision || 0) + 1,
                };
              } else {
                const id =
                  Math.max(
                    0,
                    ...host.rows().map(r => r.id),
                    ...host.receipts().map(r => r.sectionId)
                  ) + 1;
                host.rows().push({ ...saved, id });
                host
                  .receipts()
                  .push({
                    requestId: saved.manualRequestId!,
                    sectionId: id,
                    input: creationInput(saved),
                  });
              }
            },
            deleting ? "حذف أقسام راجعتها" : "حفظ قسم راجعته",
            "knowledge"
          )
        )
          leave();
        else ack = false;
      }
    }
    host.refresh();
  });
  return {
    render,
    leave,
    reset() {
      leave();
      search = "";
      applied = "";
      state = "all";
      type = "all";
      page = 1;
      read = "success";
    },
  };
}
