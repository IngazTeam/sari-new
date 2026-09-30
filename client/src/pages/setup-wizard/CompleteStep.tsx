import { Button } from "@/components/ui/button";
import { Loader2, Pencil, ArrowRight } from "lucide-react";
import PreviewChat from "@/components/PreviewChat";
import { useTranslation } from "react-i18next";
import { setupCatalogDraft } from "@shared/setup-catalog";
import { setupFieldsFromDraft } from "@/lib/setup-completion-workspace";
import type { SetupCompletionFields } from "@shared/setup-completion";
import type { reviewSetupCompletion } from "../../../../server/setup-completion";
import {
  setupProfileIssues,
  setupAssistantIssues,
} from "@/lib/setup-field-validation";

interface CompleteStepProps {
  wizardData: Record<string, any>;
  goToStep: (step: number, field?: string) => void;
  completeSetup: () => void;
  isLoading: boolean;
  review?: Awaited<ReturnType<typeof reviewSetupCompletion>> | null;
  error?: string;
  blocked?: boolean;
  currency?: "SAR" | "USD";
  updateWizardData?: (data: Record<string, unknown>) => void;
}
const text = (value: unknown) => (typeof value === "string" ? value : "");
export default function CompleteStep({
  wizardData,
  goToStep,
  completeSetup,
  isLoading,
  review,
  error,
  blocked,
  currency = "SAR",
  updateWizardData,
}: CompleteStepProps) {
  const { t, i18n } = useTranslation();
  let fields: SetupCompletionFields | null = null;
  try {
    fields = setupFieldsFromDraft(wizardData);
  } catch {
    /* Original draft stays editable. */
  }
  const catalog = setupCatalogDraft.safeParse(wizardData);
  const profileIssues = Array.from(new Set(setupProfileIssues(wizardData)));
  const assistantIssues = Array.from(new Set(setupAssistantIssues(wizardData)));
  const issueLabels: Record<string, string> = {
    businessType: t("setupWorkspace.businessType"),
    businessName: t("setupWorkspace.nameLabel"),
    phone: t("setupWorkspace.phoneLabel"),
    address: t("setupApprovalUx.address"),
    description: t("setupApprovalUx.description"),
    workingHoursType: t("setupApprovalUx.hours"),
    workingHours: t("setupApprovalUx.hours"),
    botTone: t("setupWorkspace.toneLabel"),
    botLanguage: t("setupWorkspace.languageLabel"),
    welcomeMessage: t("setupApprovalUx.welcome"),
  };
  const hasValidProfile =
    typeof wizardData.businessName === "string" &&
    wizardData.businessName.trim().length >= 2 &&
    wizardData.businessName.length <= 255 &&
    typeof wizardData.phone === "string" &&
    /^[+0-9][0-9\s()\-]{6,19}$/.test(wizardData.phone.trim());
  const tone =
    wizardData.botTone === "professional"
      ? t("setupWorkspace.toneProfessional")
      : wizardData.botTone === "casual"
        ? t("setupWorkspace.toneCasual")
        : wizardData.botTone == null || wizardData.botTone === "friendly"
          ? t("setupWorkspace.toneFriendly")
          : t("setupFieldUx.toneError");
  const language =
    (
      {
        ar: "العربية",
        en: "English",
        both: t("setupApprovalUx.bothLanguages"),
        fr: "Français",
        tr: "Türkçe",
        es: "Español",
        it: "Italiano",
      } as Record<string, string>
    )[wizardData.botLanguage || "ar"] || t("setupWorkspace.notProvided");
  const money = (minor: number, unit: string) =>
    new Intl.NumberFormat(i18n?.language?.startsWith("ar") ? "ar-SA" : "en", {
      style: "currency",
      currency: unit,
    }).format(minor / 100);
  const dayNames: Record<string, string> = {
    saturday: t("setupTemplateUx.saturday"),
    sunday: t("setupTemplateUx.sunday"),
    monday: t("setupTemplateUx.monday"),
    tuesday: t("setupTemplateUx.tuesday"),
    wednesday: t("setupTemplateUx.wednesday"),
    thursday: t("setupTemplateUx.thursday"),
    friday: t("setupTemplateUx.friday"),
  };
  const edit = (name: string, step: number) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => goToStep(step)}
      disabled={isLoading}
      aria-label={t("setupWorkspace.editNamed", { name })}
    >
      <Pencil aria-hidden="true" />
      {t("setupWorkspace.edit")}
    </Button>
  );
  const value = (v: unknown) => text(v) || t("setupWorkspace.notProvided");
  return (
    <div className="space-y-5">
      <div className="ms-review-list">
        {(profileIssues.length > 0 || assistantIssues.length > 0) && (
          <div role="alert" className="space-y-2">
            <p>{t("setupFieldUx.reviewErrors")}</p>
            <ul>
              {profileIssues.map(key => (
                <li key={key}>
                  <button type="button" onClick={() => goToStep(3, key)}>
                    {t("setupWorkspace.editNamed", { name: issueLabels[key] })}
                  </button>
                </li>
              ))}
              {assistantIssues.map(key => (
                <li key={key}>
                  <button type="button" onClick={() => goToStep(7, key)}>
                    {t("setupWorkspace.editNamed", { name: issueLabels[key] })}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <section>
          <header>
            <h2>{t("setupWorkspace.reviewBusiness")}</h2>
            {edit(t("setupWorkspace.reviewBusiness"), 3)}
          </header>
          <dl>
            <div>
              <dt>{t("setupWorkspace.businessType")}</dt>
              <dd>
                {t(
                  wizardData.businessType === "services"
                    ? "setupWorkspace.servicesTitle"
                    : wizardData.businessType === "both"
                      ? "setupWorkspace.bothTitle"
                      : wizardData.businessType == null ||
                          wizardData.businessType === "store"
                        ? "setupWorkspace.storeTitle"
                        : "setupFieldUx.businessTypeError"
                )}
              </dd>
            </div>
            <div>
              <dt>{t("setupWorkspace.nameLabel")}</dt>
              <dd>{value(wizardData.businessName)}</dd>
            </div>
            <div>
              <dt>{t("setupWorkspace.phoneLabel")}</dt>
              <dd>
                <bdi>{value(wizardData.phone)}</bdi>
              </dd>
            </div>
            <div>
              <dt>{t("setupApprovalUx.address")}</dt>
              <dd>{value(wizardData.address)}</dd>
            </div>
            <div>
              <dt>{t("setupApprovalUx.description")}</dt>
              <dd>{value(wizardData.description)}</dd>
            </div>
            <div>
              <dt>{t("setupApprovalUx.hours")}</dt>
              <dd>
                {t(
                  wizardData.workingHoursType === "custom"
                    ? "setupApprovalUx.customHours"
                    : wizardData.workingHoursType === "weekdays"
                      ? "setupApprovalUx.weekdays"
                      : wizardData.workingHoursType == null ||
                          wizardData.workingHoursType === "24_7"
                        ? "setupApprovalUx.alwaysOpen"
                        : "setupFieldUx.hoursTypeError"
                )}
              </dd>
            </div>
          </dl>
          {fields?.workingHoursType === "custom" &&
            (fields.workingHours && Object.keys(fields.workingHours).length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {Object.entries(fields.workingHours).map(
                  ([day, hours]) =>
                    hours && (
                      <li key={day}>
                        {dayNames[day]} ·{" "}
                        {hours.isOpen ? (
                          <bdi>
                            {hours.open}–{hours.close}
                          </bdi>
                        ) : (
                          t("setupTemplateUx.closed")
                        )}
                      </li>
                    )
                )}
              </ul>
            ) : (
              <p>{t("setupApprovalUx.hoursLater")}</p>
            ))}
        </section>
        <section>
          <header>
            <h2>{t("setupWorkspace.reviewCatalog")}</h2>
            {edit(t("setupWorkspace.reviewCatalog"), 6)}
          </header>
          {!catalog.success ? (
            <p role="alert">{t("setupCatalogUx.reviewInvalid")}</p>
          ) : (
            <>
              <p>
                {t("setupWorkspace.catalogCount", {
                  products: catalog.data.products.length,
                  services: catalog.data.services.length,
                })}
              </p>
              {catalog.data.products.length > 0 && (
                <p>{t("setupApprovalUx.stockUnknown")}</p>
              )}
              {(["products", "services"] as const).map(
                kind =>
                  catalog.data[kind].length > 0 && (
                    <details className="ms-details" key={kind} open>
                      <summary>
                        {t(
                          kind === "products"
                            ? "setupApprovalUx.products"
                            : "setupApprovalUx.services"
                        )}
                      </summary>
                      <ol className="ms-approval-items">
                        {catalog.data[kind].map((row, index) => (
                          <li key={index}>
                            <div>
                              <strong>{row.name}</strong>
                              <bdi>
                                {money(
                                  row.priceMinor,
                                  "currency" in row
                                    ? row.currency
                                    : review?.currency || currency
                                )}
                              </bdi>
                            </div>
                            {row.description && <p>{row.description}</p>}
                            {row.category && (
                              <p>
                                {t("setupApprovalUx.category")}: {row.category}
                              </p>
                            )}
                            {"durationMinutes" in row && (
                              <p>
                                {t("setupApprovalUx.duration", {
                                  minutes: row.durationMinutes,
                                })}
                              </p>
                            )}
                            {"productUrl" in row && row.productUrl && (
                              <a
                                href={row.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all"
                              >
                                {row.productUrl}
                              </a>
                            )}
                            {"imageUrl" in row && row.imageUrl && (
                              <a
                                href={row.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {t("setupApprovalUx.viewImage")}
                              </a>
                            )}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )
              )}
            </>
          )}
        </section>
        <section>
          <header>
            <h2>{t("setupWorkspace.reviewAssistant")}</h2>
            {edit(t("setupWorkspace.reviewAssistant"), 8)}
          </header>
          <dl>
            <div>
              <dt>{t("setupWorkspace.toneLabel")}</dt>
              <dd>{tone}</dd>
            </div>
            <div>
              <dt>{t("setupWorkspace.languageLabel")}</dt>
              <dd>{language}</dd>
            </div>
            <div>
              <dt>{t("setupApprovalUx.welcome")}</dt>
              <dd>{value(wizardData.welcomeMessage)}</dd>
            </div>
          </dl>
          <small>{t("setupApprovalUx.replyUnchanged")}</small>
        </section>
        {fields?.websiteAnalysis && (
          <section>
            <header>
              <h2>{t("setupWorkspace.reviewWebsite")}</h2>
              {edit(t("setupWorkspace.reviewWebsite"), 4)}
            </header>
            <p className="break-all" dir="ltr">
              {fields.websiteAnalysis.websiteUrl}
            </p>
            <small>{t("setupApprovalUx.websiteAttribution")}</small>
          </section>
        )}
        {wizardData.templateId !== undefined && (
          <section>
            <h2>{t("setupApprovalUx.template")}</h2>
            <p>{t("setupApprovalUx.templateUse")}</p>
            {updateWizardData && (
              <Button
                variant="outline"
                onClick={() => updateWizardData({ templateId: undefined })}
              >
                {t("setupFieldUx.clearTemplate")}
              </Button>
            )}
            <p>{t("setupFieldUx.keepItems")}</p>
          </section>
        )}
        {wizardData.websiteAnalysis !== undefined && updateWizardData && (
          <section>
            <Button
              variant="outline"
              onClick={() =>
                updateWizardData({ websiteAnalysis: undefined, websiteUrl: "" })
              }
            >
              {t("setupFieldUx.clearWebsite")}
            </Button>
            <p>{t("setupFieldUx.keepItems")}</p>
          </section>
        )}
      </div>
      {fields &&
        (fields.botLanguage === "ar" ||
          fields.botLanguage === "en" ||
          fields.botLanguage === "both") && (
          <details className="ms-details">
            <summary>{t("setupWorkspace.previewTitle")}</summary>
            <PreviewChat
              businessName={fields.businessName}
              botTone={fields.botTone}
              botLanguage={fields.botLanguage}
              products={fields.products.map(row => ({
                ...row,
                price: row.priceMinor / 100,
              }))}
              services={fields.services.map(row => ({
                ...row,
                price: row.priceMinor / 100,
              }))}
              welcomeMessage={fields.welcomeMessage}
              useAI={false}
              className="max-w-md mx-auto"
            />
          </details>
        )}
      {!hasValidProfile && (
        <p role="alert">{t("setupWorkspace.invalidProfile")}</p>
      )}
      {!fields && hasValidProfile && catalog.success && (
        <p role="alert">{t("setupApprovalUx.invalidFields")}</p>
      )}
      {error && <p role="alert">{error}</p>}
      {review && (
        <div
          role={review.canComplete ? "status" : "alert"}
          className="ms-approval-status"
        >
          <p>
            {t(
              review.canComplete
                ? "setupApprovalUx.ready"
                : "setupApprovalUx.needsReview"
            )}
          </p>
          {review.alreadyCompleted && (
            <p>{t("setupApprovalUx.alreadyCompleted")}</p>
          )}
          {review.catalogLocked && <p>{t("setupApprovalUx.catalogLocked")}</p>}
          {!review.templateAvailable && (
            <p>{t("setupApprovalUx.templateUnavailable")}</p>
          )}
          {review.conflicts.length > 0 && (
            <ul>
              {review.conflicts.map((conflict, i) => (
                <li key={i}>
                  {review.fields[conflict.kind][conflict.index]?.name} ·{" "}
                  {t(
                    conflict.reason === "existing_name"
                      ? "setupApprovalUx.existingName"
                      : "setupApprovalUx.duplicateName"
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="ms-actions">
        <Button
          size="lg"
          onClick={completeSetup}
          disabled={
            isLoading ||
            !hasValidProfile ||
            !catalog.success ||
            !fields ||
            blocked ||
            Boolean(review && !review.canComplete)
          }
        >
          {isLoading ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight aria-hidden="true" />
          )}
          {t(review ? "setupWorkspace.reviewConfirm" : "setupApprovalUx.check")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t("setupApprovalUx.confirmHelp")}
      </p>
    </div>
  );
}
