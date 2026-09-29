import { knowledgeSourcesAr as c } from "../../../client/src/locales/knowledge-sources";
export function createSourceInventory(host: {
  esc: (s: unknown) => string;
  refresh: () => void;
  open: (kind: string) => void;
}) {
  let state = "success";
  const samples = [
    {
      kind: "documents",
      title: c.documents,
      help: c.documentHelp,
      action: c.openDocuments,
      total: 5,
      values: [
        [c.textReady, 1],
        [c.emptyExtraction, 1],
        [c.pending, 1],
        [c.processing, 1],
        [c.failed, 1],
      ],
    },
    {
      kind: "products",
      title: c.products,
      help: c.productHelp,
      action: c.openProducts,
      total: 4,
      values: [[c.active, 2]],
    },
    {
      kind: "faqs",
      title: c.faqs,
      help: c.faqHelp,
      action: c.openFaqs,
      total: 3,
      values: [
        [c.enabled, 1],
        [c.archived, 1],
      ],
    },
    {
      kind: "pages",
      title: c.pages,
      help: c.pageHelp,
      action: c.openPages,
      total: 2,
      values: [
        [c.enabled, 1],
        [c.withText, 1],
      ],
    },
  ];
  document.addEventListener("change", e => {
    const input = e.target as HTMLSelectElement;
    if (!input.matches("[data-si-state]")) return;
    state = input.value;
    host.refresh();
  });
  document.addEventListener("click", e => {
    const button = (e.target as Element).closest<HTMLButtonElement>(
      "[data-si-action]"
    );
    if (!button || button.disabled) return;
    if (button.dataset.siAction === "retry") {
      state = "success";
      host.refresh();
    } else host.open(button.dataset.siAction!);
  });
  return {
    reset() {
      state = "success";
    },
    render() {
      return `<section class="panel panel-pad" data-source-inventory-preview><div class="panel-head"><div><h2>${c.title}</h2><p>${c.help}</p></div><button class="button" data-si-action="retry">${c.retry}</button></div><p>مثال مستقل لشرح العدادات؛ لا تُجمع أرقامه مع أمثلة الملفات أو نسب المبيعات الأخرى.</p><label class="field">محاكاة قراءة أعداد المصادر<select data-si-state>${[
        ["success", "بيانات محفوظة"],
        ["empty", "لا توجد سجلات"],
        ["loading", "جاري القراءة"],
        ["error", "تعذرت القراءة"],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${state === v ? "selected" : ""}>${l}</option>`
        )
        .join(
          ""
        )}</select></label>${state === "error" ? `<p role="alert">${c.error}</p>` : state === "loading" ? `<p role="status">${c.loading}</p>` : `<div class="bw-cards">${samples.map(r => `<article class="bw-card" data-source-inventory="${r.kind}"><h3>${r.title}</h3><p>${r.help}</p><p><strong>${state === "empty" ? 0 : r.total}</strong> ${c.saved}</p><dl>${r.values.map(([label, count]) => `<div class="brain-summary-row"><dt>${host.esc(label)}</dt><dd>${state === "empty" ? 0 : count}</dd></div>`).join("")}</dl><button class="button" data-si-action="${r.kind}">${r.action}</button></article>`).join("")}</div>`}</section>`;
    },
  };
}
