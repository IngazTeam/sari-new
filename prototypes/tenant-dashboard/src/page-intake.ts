import { knowledgePageIntakeAr as c } from "../../../client/src/locales/knowledge-page-intake";
import { pageUrlInput } from "../../../shared/knowledge-page-intake";
export function createPageIntake(host: any) {
  let url = "",
    preview: any = null,
    ack = false,
    error = "",
    readFailure = false;
  const key = "sary-demo-page-preview-v1",
    esc = host.esc;
  try {
    const old = JSON.parse(sessionStorage.getItem(key) || "null");
    if (old?.id && old?.content) preview = old;
  } catch {}
  const persist = () => {
    try {
      if (preview) sessionStorage.setItem(key, JSON.stringify(preview));
      else sessionStorage.removeItem(key);
    } catch {
      error = c.storage;
    }
  };
  const btn = (label: string, action: string, disabled = false) =>
    `<button type="button" class="button ${action === 'save' ? 'primary' : ''}" data-pi-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
  const outcome = () => {
    if (!preview) return null;
    const receipt = host.receipts().find((r: any) => r.id === preview.id);
    if (!receipt) return null;
    const page = host.pages().find((r: any) => r.id === receipt.pageId),
      section = host.sections().find((r: any) => r.id === receipt.sectionId);
    return {
      ...receipt,
      state:
        !page && !section
          ? "deleted"
          : page?.content === preview.content &&
              section?.content === preview.content &&
              page.title === preview.title &&
              page.url === preview.url &&
              page.type === "other" &&
              page.isActive !== false &&
              section.title === preview.title &&
              section.sourceUrl === preview.url &&
              section.source === "website" &&
              !section.parentId &&
              section.type === "custom" &&
              section.status === "approved" &&
              section.injectAs === "fact" &&
              !section.validUntil &&
              !page.active &&
              !section.useInBot
            ? "saved"
            : "changed",
    };
  };
  function editor() {
    const receipt = outcome(),
      blocked =
        !host.owner() ||
        host.blocked() ||
        !!receipt ||
        readFailure ||
        preview?.expires < Date.now();
    (window as any).openDialog(
      c.review,
      `<div class="bw-editor"><div class="bw-scroll"><p>معاينة تصميم ببيانات مثال؛ لا يُطلب الرابط ولا يُستدعى مزود.</p><p>${c.effect}</p>${error ? `<p role="alert">${esc(error)}</p>` : ""}${receipt ? `<p role="status">${c[receipt.state as "saved"]}</p>` : preview ? `<h3>${esc(preview.title)}</h3><p dir="ltr" style="overflow-wrap:anywhere">${esc(preview.url)}</p><p>${c.expires}: ${esc(new Date(preview.expires).toLocaleString())}</p><h4>${c.fullText}</h4><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(preview.content)}</div><details><summary>${c.advisory}</summary><p>${c.advisoryHelp}</p><p>${c.noAnalysis}</p></details><label class="bw-check"><input type="checkbox" data-pi-ack ${ack ? "checked" : ""} ${blocked ? "disabled" : ""}><span>${c.acknowledge}</span></label>` : ""}</div><footer class="bw-savebar pw-savebar">${btn(c.close, "close")}${btn(c.recover, "recover")}${btn(c.save, "save", blocked || !ack)}</footer></div>`
    );
  }
  document.addEventListener("input", e => {
    const el = e.target as HTMLInputElement;
    if (el.matches("[data-pi-url]")) url = el.value;
  });
  document.addEventListener("change", e => {
    const el = e.target as HTMLInputElement;
    if (el.matches("[data-pi-ack]")) {
      ack = el.checked;
      editor();
    }
    if (el.matches("[data-pi-read]")) {
      readFailure = el.value === "failure";
      host.refresh();
    }
  });
  document.addEventListener("submit", e => {
    if (!(e.target as Element).matches("[data-pi-form]")) return;
    e.preventDefault();
    if (!host.owner() || host.blocked() || preview) return;
    const parsed = pageUrlInput.safeParse({ url });
    if (!parsed.success) {
      error = c.invalid;
      host.refresh();
      return;
    }
    if (
      host.pages().some((p: any) => p.url === parsed.data.url) ||
      host
        .sections()
        .some(
          (s: any) => s.source === "website" && s.sourceUrl === parsed.data.url
        )
    ) {
      error = c.exists;
      host.refresh();
      return;
    }
    preview = {
      id: crypto.randomUUID(),
      url: parsed.data.url,
      title: "صفحة موقع تجريبية",
      expires: Date.now() + 1800000,
      content:
        "نص مثال ثابت لمراجعة الصفحة: تجهيز الطلب خلال يوم عمل، ثم تُراجع مدة الشحن مع العميل حسب المدينة. هذا النص بيانات عرض محلية، وليس محتوى الموقع المدخل.",
    };
    ack = false;
    error = "";
    persist();
    host.refresh();
    editor();
  });
  document.addEventListener("click", e => {
    const el = (e.target as Element).closest<HTMLElement>("[data-pi-action]");
    if (!el || el.hasAttribute("disabled")) return;
    const a = el.dataset.piAction;
    if (a === "close") {
      ack = false;
      (document.getElementById("dialog") as HTMLDialogElement).close();
    }
    if (a === "open") {
      ack = false;
      editor();
    }
    if (a === "reset" && !host.blocked()) {
      preview = null;
      ack = false;
      error = "";
      persist();
      host.refresh();
    }
    if (a === "expire") {
      preview.expires = Date.now() - 1;
      ack = false;
      persist();
      host.refresh();
    }
    if (a === "recover") {
      ack = false;
      error = readFailure ? c.uncertain : "";
      host.refresh();
      if (document.getElementById("dialog")?.hasAttribute("open")) editor();
    }
    if (
      a === "save" &&
      preview &&
      ack &&
      host.owner() &&
      !host.blocked() &&
      !readFailure &&
      !outcome() &&
      preview.expires > Date.now()
    ) {
      const snapshot = structuredClone(preview);
      ack = false;
      const done = host.commit(
        () => {
          if (host.receipts().some((r: any) => r.id === snapshot.id)) return;
          const pageId = host.nextId(host.pages()),
            sectionId = host.nextId(host.sections());
          host.pages().unshift({
            id: pageId,
            title: snapshot.title,
            url: snapshot.url,
            content: snapshot.content,
            type: "other",
            read: true,
            active: false,
          });
          host.sections().unshift({
            id: sectionId,
            title: snapshot.title,
            content: snapshot.content,
            type: "custom",
            source: "website",
            sourceUrl: snapshot.url,
            status: "approved",
            approved: true,
            useInBot: false,
            injectAs: "fact",
          });
          host.receipts().push({ id: snapshot.id, pageId, sectionId });
        },
        "حفظ صفحة وقسم مرتبط بحالة متوقفة",
        "knowledge"
      );
      error = done ? "" : c.uncertain;
      host.refresh();
      editor();
    }
  });
  return {
    render() {
      const r = outcome();
      return `<section class="panel panel-pad"><h3>${c.title}</h3><p>${c.description}</p><p>محاكاة ببيانات مثال ثابتة، دون جلب مواقع.</p>${error ? `<p role="alert">${esc(error)}</p>` : ""}${preview ? `${r ? `<p role="status">${c[r.state as "saved"]} · ${c.pageId}: ${r.pageId} · ${c.sectionId}: ${r.sectionId}</p>` : preview.expires < Date.now() ? `<p>${c.expired}</p>` : btn(c.open, "open")}${btn(c.recover, "recover")}${!host.blocked() && !readFailure ? btn(c.another, "reset") : ""}<details><summary>محاكاة انتهاء المعاينة وفشل القراءة</summary>${btn("إنهاء المعاينة", "expire", !!r)}<select data-pi-read aria-label="قراءة إيصال الرابط"><option value="success">نجاح القراءة</option><option value="failure" ${readFailure ? "selected" : ""}>فشل القراءة</option></select></details>` : `<form data-pi-form novalidate class="bw-grid"><label class="field">${c.url}<input type="url" dir="ltr" data-pi-url maxlength="1000" value="${esc(url)}" ${!host.owner() || host.blocked() ? "disabled" : ""}></label><button type="submit" class="button" ${!host.owner() || host.blocked() ? "disabled" : ""}>${c.prepare}</button></form>`}</section>`;
    },
    reset() {
      preview = null;
      ack = false;
      error = "";
      persist();
    },
  };
}
