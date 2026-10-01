import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MerchantToolsDirectory } from "../../../client/src/components/merchant/MerchantToolsDirectory";
import {
  readToolFilters,
  toolsLocation,
  searchMerchantTools,
  toolTranslationKey,
  type ToolFilters,
} from "../../../client/src/lib/merchant-tools-search";
import { setToolsPreviewLanguage, translateToolsPreview } from "./tools-preview-i18n";
import { navigableMerchantTools } from '../../../client/src/components/merchant/navigation';

export function discovery(query: string, lang: 'ar' | 'en' = 'ar') {
  const label = (path: string, lng: 'ar' | 'en') => translateToolsPreview(toolTranslationKey(path), { lng });
  const section = (id: string, lng: 'ar' | 'en') => translateToolsPreview(`merchantNavigationUx.sections.${id}`, { lng });
  const matches = searchMerchantTools({ query: query.slice(0,100), section: 'all' }, label, section);
  const copy = (key: string) => translateToolsPreview('merchantShellUx.' + key, { lng: lang });
  return { title: copy('searchTitle'), help: copy('searchHelp'), label: copy('searchLabel'), placeholder: copy('searchPlaceholder'), empty: copy('searchEmpty'), clear: copy('clearSearch'), close: copy('close'),
    count: translateToolsPreview('merchantToolsUx.results', { lng: lang, shown: matches.length, total: navigableMerchantTools.length }),
    resultsLabel: translateToolsPreview('merchantToolsUx.resultsLabel', { lng: lang }),
    matches: matches.map(tool => ({ path: tool.path, group: tool.section, title: label(tool.paths[0], lang), section: section(tool.section, lang) })) };
}
declare global {
  interface Window {
    render(keep?: boolean): void;
  }
}

const route = "/merchant/tools";
export const handles = (page: { route: string }) => page?.route === route;
const current = () => window.location.hash.split("?")[0] === "#/page" + route;
const search = () => window.location.hash.split("?").slice(1).join("?");
const language = () =>
  new URLSearchParams(search()).get("lang") === "en" ? "en" : "ar";
export function render() {
  const lang = language(),
    ar = lang === "ar",
    filters = readToolFilters(search());
  setToolsPreviewLanguage(lang);
  return renderToStaticMarkup(
    <div className="tools-prototype" lang={lang} dir={ar ? "rtl" : "ltr"}>
      <aside className="tools-prototype-note">
        <p>
          {ar
            ? "دليل التطبيق الفعلي. الروابط تفتح صفحات الموك أب المحلية؛ وجود الأداة هنا لا يثبت صلاحيتها أو اكتمالها أو اتصال مزودها."
            : "Actual application directory. Links open local prototype pages; a listed tool does not prove access, completion or a connected provider."}
        </p>
        <label htmlFor="tools-preview-language">
          {ar ? "لغة العرض" : "Display language"}
        </label>
        <select id="tools-preview-language" defaultValue={lang}>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </aside>
      <MerchantToolsDirectory
        filters={filters}
        unknownSection={filters.unknownSection}
        onChange={() => {}}
      />
    </div>
  );
}
function update(filters: ToolFilters, replace: boolean, lang = language()) {
  const next = new URL(toolsLocation(filters), window.location.origin);
  if (lang === "en") next.searchParams.set("lang", "en");
  window.history[replace ? "replaceState" : "pushState"](
    null,
    "",
    "#/page" + next.pathname + next.search
  );
  window.render();
}
let composing = false;
function textChange(input: HTMLInputElement) {
  const caret = input.selectionStart;
  update({ ...readToolFilters(search()), query: input.value }, true);
  const replacement = document.querySelector<HTMLInputElement>(
    ".tools-prototype input"
  );
  replacement?.focus();
  if (caret !== null) replacement?.setSelectionRange(caret, caret);
}
document.addEventListener("compositionstart", event => {
  if (
    current() &&
    (event.target as HTMLElement).matches(".tools-prototype input")
  )
    composing = true;
});
document.addEventListener("compositionend", event => {
  if (
    current() &&
    (event.target as HTMLElement).matches(".tools-prototype input")
  ) {
    composing = false;
    textChange(event.target as HTMLInputElement);
  }
});
document.addEventListener("input", event => {
  const input = event.target as HTMLInputElement;
  if (
    current() &&
    input.matches(".tools-prototype input") &&
    !composing &&
    !(event as InputEvent).isComposing
  )
    textChange(input);
});
document.addEventListener("change", event => {
  if (!current()) return;
  const select = event.target as HTMLSelectElement;
  if (select.id === "tools-preview-language") {
    update(
      readToolFilters(search()),
      true,
      select.value === "en" ? "en" : "ar"
    );
    document.getElementById(select.id)?.focus();
  } else if (select.matches(".tools-prototype .mw-tools-section select")) {
    update({ ...readToolFilters(search()), section: select.value }, false);
    document
      .querySelector<HTMLSelectElement>(
        ".tools-prototype .mw-tools-section select"
      )
      ?.focus();
  }
});
document.addEventListener("click", event => {
  if (
    current() &&
    (event.target as HTMLElement).closest(".tools-prototype .mw-tools-reset")
  ) {
    update({ query: "", section: "all" }, true);
    document.querySelector<HTMLInputElement>(".tools-prototype input")?.focus();
  }
});
window.addEventListener("hashchange", () => {
  composing = false;
});
