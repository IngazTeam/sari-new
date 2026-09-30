import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "react-i18next";
import {
  setupTemplatePatch,
  type SetupTemplateChoices,
} from "@shared/setup-template";

interface TemplatesStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
  skipStep: () => void;
  currency?: "SAR" | "USD";
}
export default function TemplatesStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  skipStep,
  currency = "SAR",
}: TemplatesStepProps) {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState<"ar" | "en">(
    i18n?.language?.startsWith("en") ? "en" : "ar"
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [choices, setChoices] = useState<SetupTemplateChoices>({
    catalog: "merge",
    assistant: false,
    workingHours: false,
  });
  const [error, setError] = useState("");
  const businessType = ["store", "services", "both"].includes(
    wizardData.businessType
  )
    ? (wizardData.businessType as "store" | "services" | "both")
    : undefined;
  const list = trpc.setupWizard.getTemplates.useQuery(
    { businessType, language },
    { refetchOnWindowFocus: false }
  );
  const preview = trpc.setupWizard.previewTemplate.useQuery(
    { templateId: selected || 1, language },
    { enabled: selected !== null, refetchOnWindowFocus: false }
  );
  const choose = (id: number) => {
    setSelected(id);
    setError("");
    setChoices({ catalog: "merge", assistant: false, workingHours: false });
  };
  const ready =
    selected !== null &&
    !list.isError &&
    !list.isFetching &&
    list.data?.some(row => row.id === selected) &&
    preview.data?.id === selected &&
    !preview.isFetching &&
    !preview.isError;
  const apply = () => {
    if (!ready || !preview.data) return;
    try {
      updateWizardData(setupTemplatePatch(wizardData, preview.data, choices));
      goToNextStep();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === "SETUP_TEMPLATE_LIMIT"
          ? t("setupTemplateUx.limit")
          : t("setupTemplateUx.invalidDraft")
      );
    }
  };
  return (
    <div className="ms-template-entry space-y-5">
      <p>{t("setupTemplateUx.intro")}</p>
      <label className="ms-catalog-field">
        {t("setupTemplateUx.language")}
        <select
          value={language}
          onChange={event => {
            setLanguage(event.target.value as "ar" | "en");
            setSelected(null);
            setError("");
          }}
        >
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </label>
      {list.isLoading || list.isFetching ? (
        <p role="status">{t("setupTemplateUx.loading")}</p>
      ) : list.isError ? (
        <div role="alert">
          <p>{t("setupTemplateUx.loadFailed")}</p>
          <Button variant="outline" onClick={() => list.refetch()}>
            {t("setupWorkspace.retry")}
          </Button>
        </div>
      ) : !list.data?.length ? (
        <p>{t("setupTemplateUx.empty")}</p>
      ) : (
        <div className="ms-template-grid">
          {list.data.map(template => {
            const title =
              "templateName" in template
                ? template.templateName
                : template.template_name;
            return (
              <button
                key={template.id}
                type="button"
                className="ms-choice"
                aria-pressed={selected === template.id}
                onClick={() => choose(template.id)}
              >
                <span>
                  <strong>
                    {template.icon} {title}
                  </strong>
                  <small>{template.description}</small>
                  {("suitableFor" in template
                    ? template.suitableFor
                    : template.suitable_for) && (
                    <small>
                      {t("setupTemplateUx.suitableFor")}:{" "}
                      {"suitableFor" in template
                        ? template.suitableFor
                        : template.suitable_for}
                    </small>
                  )}
                  {typeof template.usage_count === "number" && (
                    <small>
                      {t("setupTemplateUx.uses", {
                        count: template.usage_count,
                      })}
                    </small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selected !== null && (
        <section
          className="ms-catalog-item"
          aria-label={t("setupTemplateUx.preview")}
        >
          {preview.isLoading || preview.isFetching ? (
            <p role="status">{t("setupTemplateUx.loading")}</p>
          ) : preview.isError ? (
            <div role="alert">
              <p>{t("setupTemplateUx.previewFailed")}</p>
              <Button variant="outline" onClick={() => preview.refetch()}>
                {t("setupWorkspace.retry")}
              </Button>
            </div>
          ) : (
            ready &&
            preview.data && (
              <>
                <h2 className="ms-field-title">{preview.data.title}</h2>
                <p>{preview.data.description}</p>
                <p className="text-sm text-muted-foreground">
                  {t("setupTemplateUx.samples")}
                </p>
                <div className="ms-review-list">
                  {[
                    ...preview.data.products.map(row => ({
                      ...row,
                      kind: "product",
                    })),
                    ...preview.data.services.map(row => ({
                      ...row,
                      currency,
                      kind: "service",
                    })),
                  ].map(row => (
                    <section key={row.id}>
                      <header>
                        <h3>{row.name}</h3>
                        <bdi>
                          {row.price} {row.currency}
                        </bdi>
                      </header>
                      <p>{row.description}</p>
                      {row.category && <small>{row.category}</small>}
                      {"durationMinutes" in row && (
                        <small>
                          {t("setupTemplateUx.duration", {
                            minutes: row.durationMinutes,
                          })}
                        </small>
                      )}
                    </section>
                  ))}
                </div>
                {preview.data.services.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("setupPreviewUx.templateCurrency", { currency })}
                  </p>
                )}
                <label className="ms-catalog-field">
                  {t("setupTemplateUx.catalogAction")}
                  <select
                    value={choices.catalog}
                    onChange={event => {
                      setError("");
                      setChoices(previous => ({
                        ...previous,
                        catalog: event.target
                          .value as SetupTemplateChoices["catalog"],
                      }));
                    }}
                  >
                    <option value="merge">{t("setupTemplateUx.merge")}</option>
                    <option value="replace">
                      {t("setupTemplateUx.replace")}
                    </option>
                    <option value="skip">
                      {t("setupTemplateUx.skipCatalog")}
                    </option>
                  </select>
                </label>
                {choices.catalog === "replace" && (
                  <p className="ms-catalog-error">
                    {t("setupTemplateUx.replaceHint")}
                  </p>
                )}
                {Object.keys(preview.data.assistant).length > 0 && (
                  <details className="ms-details" open>
                    <summary>{t("setupWorkspace.reviewAssistant")}</summary>
                    <p>
                      {preview.data.assistant.tone === "professional"
                        ? t("setupWorkspace.toneProfessional")
                        : preview.data.assistant.tone === "casual"
                          ? t("setupWorkspace.toneCasual")
                          : preview.data.assistant.tone === "friendly"
                            ? t("setupWorkspace.toneFriendly")
                            : ""}{" "}
                      <bdi>
                        {
                          (
                            {
                              ar: "العربية",
                              en: "English",
                              both: t("setupTemplateUx.bothLanguages"),
                              fr: "Français",
                              tr: "Türkçe",
                              es: "Español",
                              it: "Italiano",
                            } as Record<string, string>
                          )[preview.data.assistant.language || ""]
                        }
                      </bdi>
                    </p>
                    <p>{preview.data.assistant.welcomeMessage}</p>
                    <label className="ms-template-check">
                      <input
                        type="checkbox"
                        checked={choices.assistant}
                        onChange={event =>
                          setChoices(previous => ({
                            ...previous,
                            assistant: event.target.checked,
                          }))
                        }
                      />
                      {t("setupTemplateUx.applyAssistant")}
                    </label>
                  </details>
                )}
                {Object.keys(preview.data.workingHours).length > 0 && (
                  <details className="ms-details">
                    <summary>{t("setupTemplateUx.hours")}</summary>
                    <p className="text-sm text-muted-foreground">
                      {t("setupHoursUx.businessScope")}
                    </p>
                    <dl>
                      {Object.entries(preview.data.workingHours).map(
                        ([name, value]) => (
                          <div className="ms-template-hours" key={name}>
                            <dt>
                              {
                                {
                                  saturday: t("setupTemplateUx.saturday"),
                                  sunday: t("setupTemplateUx.sunday"),
                                  monday: t("setupTemplateUx.monday"),
                                  tuesday: t("setupTemplateUx.tuesday"),
                                  wednesday: t("setupTemplateUx.wednesday"),
                                  thursday: t("setupTemplateUx.thursday"),
                                  friday: t("setupTemplateUx.friday"),
                                }[
                                  name as keyof typeof preview.data.workingHours
                                ]
                              }
                            </dt>
                            <dd>
                              <bdi>
                                {value.isOpen
                                  ? `${value.open} – ${value.close}`
                                  : t("setupTemplateUx.closed")}
                              </bdi>
                            </dd>
                          </div>
                        )
                      )}
                    </dl>
                    <label className="ms-template-check">
                      <input
                        type="checkbox"
                        checked={choices.workingHours}
                        onChange={event =>
                          setChoices(previous => ({
                            ...previous,
                            workingHours: event.target.checked,
                          }))
                        }
                      />
                      {t("setupTemplateUx.applyHours")}
                    </label>
                  </details>
                )}
              </>
            )
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="ms-catalog-error">
          {error}
        </p>
      )}
      <div className="ms-actions">
        <Button variant="ghost" onClick={skipStep}>
          {t("setupTemplateUx.back")}
        </Button>
        <Button onClick={apply} disabled={!ready}>
          {t("setupTemplateUx.addDraft")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("setupTemplateUx.draftOnly")}
      </p>
    </div>
  );
}
