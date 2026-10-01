import {
  merchantSections,
  navigableMerchantTools,
} from "@/components/merchant/navigation";
// Search vocabulary is available even when the English UI locale is not enabled.
// A named JSON export keeps the rest of the candidate catalogue out of this chunk.
import { merchantNavigationUx as englishNavigation } from "@/locales/en.json";
export type ToolFilters = { query: string; section: string };
export const toolTranslationKey = (path: string) =>
  `merchantNavigationUx.tools.${path.replace(/^\/merchant\//, "").replace(/[^a-zA-Z0-9_]/g, "_")}`;
export function readToolFilters(
  search: string,
): ToolFilters & { unknownSection: boolean } {
  const params = new URLSearchParams(search);
  const selected = params.get("section") || "all";
  const valid =
    selected === "all" ||
    merchantSections.some((section) => section.id === selected);
  return {
    query: (params.get("q") || "").slice(0, 100),
    section: valid ? selected : "all",
    unknownSection: !valid,
  };
}
export function toolsLocation(filters: ToolFilters) {
  const params = new URLSearchParams();
  if (
    filters.section !== "all" &&
    merchantSections.some((s) => s.id === filters.section)
  )
    params.set("section", filters.section);
  if (filters.query) params.set("q", filters.query.slice(0, 100));
  return "/merchant/tools" + (params.size ? "?" + params.toString() : "");
}
export const normalizeToolSearch = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();
export function searchMerchantTools(
  filters: ToolFilters,
  label: (path: string, language: "ar" | "en") => string,
  sectionLabel: (section: string, language: "ar" | "en") => string,
) {
  const tokens = normalizeToolSearch(filters.query)
    .split(/\s+/)
    .filter(Boolean);
  return navigableMerchantTools.filter((tool) => {
    if (filters.section !== "all" && filters.section !== tool.section)
      return false;
    const terms = normalizeToolSearch(
      [
        tool.title,
        ...tool.paths,
        label(tool.paths[0], "ar"),
        label(tool.paths[0], "en"),
        sectionLabel(tool.section, "ar"),
        sectionLabel(tool.section, "en"),
        englishNavigation.tools[toolTranslationKey(tool.paths[0]).split('.').pop() as keyof typeof englishNavigation.tools],
        englishNavigation.sections[tool.section],
      ].join(" "),
    );
    return tokens.every((token) => terms.includes(token));
  });
}
