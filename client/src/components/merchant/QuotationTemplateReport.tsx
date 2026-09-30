import { useTranslation } from "react-i18next";
import type {
  TemplateFields,
  TemplateRecord,
  TemplateWorkspace,
} from "@shared/quotation-templates";
export function TemplatePreview({
  value,
  truncated = false,
}: {
  value: TemplateFields;
  truncated?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="tt-preview"
      aria-label={t("quotationTemplates.preview")}
    >
      <p className="qt-eyebrow">{t("quotationTemplates.previewHint")}</p>
      <h3>{value.name || t("quotationTemplates.untitled")}</h3>
      {truncated && (
        <p role="alert" className="qt-note">
          {t("quotationTemplates.truncated")}
        </p>
      )}
      <h4>{t("quotationTemplates.image")}</h4>
      <p dir="auto">
        {value.headerImageUrl || t("quotationTemplates.noImage")}
      </p>
      {value.headerImageUrl && (
        <small>{t("quotationTemplates.imageHint")}</small>
      )}
      <h4>{t("quotationTemplates.terms")}</h4>
      <p className="tt-fulltext" dir="auto">
        {value.termsText || t("quotationTemplates.noTerms")}
      </p>
      <h4>{t("quotationTemplates.footer")}</h4>
      <p className="tt-fulltext" dir="auto">
        {value.footerText || t("quotationTemplates.noFooter")}
      </p>
      <p className="tt-selection-note">
        {t(
          value.isDefault
            ? "quotationTemplates.defaultHint"
            : "quotationTemplates.explicitHint"
        )}
      </p>
    </section>
  );
}
export function TemplateList({
  data,
  onOpen,
  onPage,
}: {
  data: TemplateWorkspace;
  onOpen: (row: TemplateRecord) => void;
  onPage: (page: number) => void;
}) {
  const { t, i18n } = useTranslation(),
    n = (value: number) =>
      new Intl.NumberFormat(
        i18n.language.startsWith("en") ? "en" : "ar"
      ).format(value);
  return (
    <>
      <p className="qt-number">
        {t("quotationTemplates.count", {
          count: data.filtered,
          total: data.total,
          limit: data.limit,
        })}
      </p>
      {data.items.length ? (
        <ul className="qt-list">
          {data.items.map(row => (
            <li className="qt-row" key={row.id}>
              <div className="qt-row-main">
                <div className="qt-row-title">
                  <h3 dir="auto">{row.name}</h3>
                  {row.isDefault && (
                    <span className="tt-badge">
                      {t("quotationTemplates.preferred")}
                    </span>
                  )}
                </div>
                <p className="qt-number">
                  {t(
                    row.termsText
                      ? "quotationTemplates.withTerms"
                      : "quotationTemplates.noTerms"
                  )}{" "}
                  ·{" "}
                  {t(
                    row.footerText
                      ? "quotationTemplates.withFooter"
                      : "quotationTemplates.noFooter"
                  )}
                </p>
                {!row.editable && <p>{t("quotationTemplates.legacy")}</p>}
              </div>
              <button
                type="button"
                onClick={() => onOpen(row)}
                aria-label={t("quotationTemplates.openNamed", {
                  name: row.name,
                })}
              >
                {t("quotationTemplates.open")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="tt-empty">
          <h3>
            {t(
              data.selection.search
                ? "quotationTemplates.noMatches"
                : "quotationTemplates.empty"
            )}
          </h3>
          <p>{t("quotationTemplates.emptyHint")}</p>
        </div>
      )}
      <nav className="qt-pagination" aria-label={t("quotationTemplates.pages")}>
        <button
          type="button"
          disabled={data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          {t("quotationTemplates.previous")}
        </button>
        <span>
          {t("quotationTemplates.page", {
            page: n(data.page),
            pages: n(data.pages),
          })}
        </span>
        <button
          type="button"
          disabled={data.page >= data.pages}
          onClick={() => onPage(data.page + 1)}
        >
          {t("quotationTemplates.next")}
        </button>
      </nav>
    </>
  );
}
