import { useId } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Search, SearchX } from "lucide-react";
import { merchantSections, navigableMerchantTools } from "./navigation";
import {
  searchMerchantTools,
  toolTranslationKey,
  type ToolFilters,
} from "@/lib/merchant-tools-search";

export function MerchantToolsDirectory({
  filters,
  onChange,
  unknownSection = false,
}: {
  filters: ToolFilters;
  onChange: (value: ToolFilters, replace: boolean) => void;
  unknownSection?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const rtl = i18n.dir() === "rtl",
    Arrow = rtl ? ArrowLeft : ArrowRight;
  const label = (path: string, language: "ar" | "en") =>
    t(toolTranslationKey(path), { lng: language });
  const sectionLabel = (section: string, language: "ar" | "en") =>
    t(`merchantNavigationUx.sections.${section}`, { lng: language });
  const tools = searchMerchantTools(filters, label, sectionLabel);
  const filtered = !!filters.query || filters.section !== "all";
  const reset = () => onChange({ query: "", section: "all" }, true);
  return (
    <section
      className="mw-tools-directory space-y-6"
      dir={rtl ? "rtl" : "ltr"}
      aria-labelledby={id + "-title"}
    >
      <header className="mw-page-heading">
        <div>
          <p className="mw-eyebrow">{t("merchantToolsUx.eyebrow")}</p>
          <h1 id={id + "-title"}>{t("merchantToolsUx.title")}</h1>
          <p>{t("merchantToolsUx.description")}</p>
        </div>
      </header>
      <div className="mw-tools-toolbar">
        <div className="mw-search-field">
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor={id + "-search"}>
            {t("merchantToolsUx.search")}
          </label>
          <input
            id={id + "-search"}
            type="search"
            value={filters.query}
            maxLength={100}
            onChange={(e) =>
              onChange({ ...filters, query: e.target.value }, true)
            }
            placeholder={t("merchantToolsUx.placeholder")}
            aria-controls={id + "-results"}
          />
        </div>
        <div className="mw-tools-section">
          <label htmlFor={id + "-section"}>{t("merchantToolsUx.section")}</label>
          <select
            id={id + "-section"}
            value={filters.section}
            onChange={(e) =>
              onChange({ ...filters, section: e.target.value }, false)
            }
            aria-controls={id + "-results"}
          >
            <option value="all">{t("merchantToolsUx.all")}</option>
            {merchantSections.map((section) => (
              <option key={section.id} value={section.id}>
                {t(`merchantNavigationUx.sections.${section.id}`)}
              </option>
            ))}
          </select>
        </div>
        {filtered && (
          <button className="mw-tools-reset" type="button" onClick={reset}>
            {t("merchantToolsUx.reset")}
          </button>
        )}
      </div>
      {unknownSection && (
        <p className="text-sm text-muted-foreground" role="status">
          {t("merchantToolsUx.unknownSection")}
        </p>
      )}
      <p
        className="text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {t("merchantToolsUx.results", {
          shown: tools.length,
          total: navigableMerchantTools.length,
        })}
      </p>
      <nav
        id={id + "-results"}
        className="mw-tools-grid"
        aria-label={t("merchantToolsUx.resultsLabel")}
      >
        {tools.map((tool) => {
          const group = merchantSections.find(
            (section) => section.id === tool.section,
          )!;
          return (
            <Link key={tool.path} href={tool.path} className="mw-tool-card">
              <group.icon aria-hidden="true" />
              <span>
                <strong>{t(toolTranslationKey(tool.paths[0]))}</strong>
                <small>{t(`merchantNavigationUx.sections.${group.id}`)}</small>
              </span>
              <Arrow aria-hidden="true" />
            </Link>
          );
        })}
      </nav>
      {!tools.length && (
        <div className="mw-tools-empty">
          <SearchX aria-hidden="true" />
          <h2>{t("merchantToolsUx.emptyTitle")}</h2>
          <p>{t("merchantToolsUx.emptyHelp")}</p>
          <button className="mw-tools-reset" type="button" onClick={reset}>
            {t("merchantToolsUx.reset")}
          </button>
        </div>
      )}
    </section>
  );
}
