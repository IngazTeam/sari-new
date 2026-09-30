import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import type { SetupDraftPayload } from "@/lib/setup-draft-cache";
import type { readSetupProgress } from "../../../../server/setup-progress";
import { setupStageForStep } from "@/lib/merchant-setup-navigation";
type Progress = Awaited<ReturnType<typeof readSetupProgress>>;
const text = (raw: unknown): string =>
  raw == null
    ? ""
    : typeof raw === "object"
      ? JSON.stringify(raw)
      : String(raw);
function DraftPreview({ draft }: { draft: SetupDraftPayload }) {
  const { t } = useTranslation(),
    data = draft.wizardData;
  const fields = [
    ["businessName", t("setupWorkspace.nameLabel")],
    ["phone", t("setupWorkspace.phoneLabel")],
    ["address", t("setupApprovalUx.address")],
    ["description", t("setupApprovalUx.description")],
    ["welcomeMessage", t("setupApprovalUx.welcome")],
    ["websiteUrl", t("setupWorkspace.reviewWebsite")],
  ];
  const labels: Record<string, string> = {
    store: t("setupWorkspace.storeTitle"),
    services: t("setupWorkspace.servicesTitle"),
    both: t("setupWorkspace.bothTitle"),
    friendly: t("setupWorkspace.toneFriendly"),
    professional: t("setupWorkspace.toneProfessional"),
    casual: t("setupWorkspace.toneCasual"),
    "24_7": t("setupApprovalUx.alwaysOpen"),
    weekdays: t("setupApprovalUx.weekdays"),
    custom: t("setupApprovalUx.customHours"),
    ar: "العربية",
    en: "English",
    fr: "Français",
    tr: "Türkçe",
    es: "Español",
    it: "Italiano",
  };
  const choices = [
    ["businessType", t("setupWorkspace.businessType")],
    ["botTone", t("setupWorkspace.toneLabel")],
    ["botLanguage", t("setupWorkspace.languageLabel")],
    ["workingHoursType", t("setupApprovalUx.hours")],
  ];
  const dayNames: Record<string, string> = {
    saturday: t("setupTemplateUx.saturday"),
    sunday: t("setupTemplateUx.sunday"),
    monday: t("setupTemplateUx.monday"),
    tuesday: t("setupTemplateUx.tuesday"),
    wednesday: t("setupTemplateUx.wednesday"),
    thursday: t("setupTemplateUx.thursday"),
    friday: t("setupTemplateUx.friday"),
  };
  return (
    <div className="ms-draft-preview">
      <dl>
        {fields.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{text(data[key]) || t("setupWorkspace.notProvided")}</dd>
          </div>
        ))}
        {choices.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              {key === "botLanguage" && data[key] === "both"
                ? t("setupApprovalUx.bothLanguages")
                : labels[text(data[key])] ||
                  text(data[key]) ||
                  t("setupWorkspace.notProvided")}
            </dd>
          </div>
        ))}
        <div>
          <dt>{t("setupDraftUx.stage")}</dt>
          <dd>{setupStageForStep(draft.currentStep) + 1} / 4</dd>
        </div>
        <div>
          <dt>{t("setupDraftUx.template")}</dt>
          <dd>{text(data.templateId) || t("setupWorkspace.notProvided")}</dd>
        </div>
      </dl>
      {data.workingHours != null && typeof data.workingHours === "object" && (
        <ul>
          {Object.entries(data.workingHours).map(([day, hours]) => (
            <li key={day}>
              {dayNames[day] || day}:{" "}
              {hours && typeof hours === "object" && "isOpen" in hours ? (
                hours.isOpen ? (
                  <bdi>
                    {text((hours as any).open)} – {text((hours as any).close)}
                  </bdi>
                ) : (
                  t("setupTemplateUx.closed")
                )
              ) : (
                text(hours)
              )}
            </li>
          ))}
        </ul>
      )}
      {(["products", "services"] as const).map(kind => (
        <details key={kind} open>
          <summary>
            {t(
              kind === "products"
                ? "setupDraftUx.products"
                : "setupDraftUx.services"
            )}{" "}
            · {Array.isArray(data[kind]) ? data[kind].length : "—"}
          </summary>
          {Array.isArray(data[kind]) ? (
            <ol>
              {data[kind].map((item, index) => (
                <li key={index}>
                  {item && typeof item === "object" ? (
                    <>
                      <strong>
                        {text(item.name) || t("setupDraftUx.unnamed")}
                      </strong>
                      <p>
                        {t("setupCatalogUx.price")}:{" "}
                        <bdi>
                          {text(item.price) || t("setupWorkspace.notProvided")}{" "}
                          {text(item.currency)}
                        </bdi>
                      </p>
                      {item.description && <p>{text(item.description)}</p>}
                      {item.category && (
                        <p>
                          {t("setupApprovalUx.category")}: {text(item.category)}
                        </p>
                      )}
                      {kind === "services" && item.durationMinutes != null && (
                        <p>
                          {t("setupApprovalUx.duration", {
                            minutes: text(item.durationMinutes),
                          })}
                        </p>
                      )}
                      {item.productUrl && (
                        <p dir="ltr">{text(item.productUrl)}</p>
                      )}
                      {item.imageUrl && <p dir="ltr">{text(item.imageUrl)}</p>}
                    </>
                  ) : (
                    <p>{t("setupDraftUx.unreadableItem")}</p>
                  )}
                </li>
              ))}
            </ol>
          ) : data[kind] == null ? (
            <p>{t("setupCatalogUx.empty")}</p>
          ) : (
            <p>{t("setupDraftUx.unreadableItem")}</p>
          )}
        </details>
      ))}
      <p>{t("setupDraftUx.currencyHelp")}</p>
      <details>
        <summary>{t("setupCatalogUx.originalData")}</summary>
        <pre dir="ltr">{JSON.stringify(draft, null, 2)}</pre>
      </details>
    </div>
  );
}
export default function SetupDraftRecovery({
  local,
  remote,
  error,
  busy,
  onRefresh,
  onLocal,
  onRemote,
  onExit,
}: {
  local: SetupDraftPayload;
  remote?: Progress;
  error: string;
  busy: boolean;
  onRefresh: () => void;
  onLocal: () => void;
  onRemote: () => void;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  let saved: SetupDraftPayload | null = null;
  if (remote && !remote.draftUnreadable)
    try {
      saved = {
        currentStep: remote.currentStep,
        completedSteps: JSON.parse(remote.completedSteps),
        wizardData: JSON.parse(remote.wizardData),
      };
    } catch {
      /* Preserve the unreadable server draft. */
    }
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(local, null, 2)], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "sary-setup-draft.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="space-y-4" data-setup-draft-recovery>
      <p>{t("setupDraftUx.help")}</p>
      {error && <p role="alert">{error}</p>}
      {remote?.isCompleted === 1 && (
        <p role="alert">{t("setupDraftUx.completedElsewhere")}</p>
      )}
      <div className="ms-draft-compare">
        <section>
          <h2>{t("setupDraftUx.local")}</h2>
          <DraftPreview draft={local} />
        </section>
        <section>
          <h2>{t("setupDraftUx.remote")}</h2>
          {saved ? (
            <DraftPreview draft={saved} />
          ) : (
            <p>
              {t(
                remote?.draftUnreadable
                  ? "setupDraftUx.remoteUnreadable"
                  : "setupDraftUx.loadRemote"
              )}
            </p>
          )}
        </section>
      </div>
      <div className="ms-actions">
        <Button onClick={onRefresh} variant="outline" disabled={busy}>
          {t("setupDraftUx.refresh")}
        </Button>
        <Button onClick={download} variant="outline">
          {t("setupDraftUx.download")}
        </Button>
      </div>
      {saved && !remote?.isCompleted && (
        <div className="ms-draft-choices">
          <p>{t("setupDraftUx.choiceHelp")}</p>
          <div className="ms-actions">
            <Button onClick={onLocal} disabled={busy}>
              {t("setupDraftUx.useLocal")}
            </Button>
            <Button onClick={onRemote} variant="outline" disabled={busy}>
              {t("setupDraftUx.useRemote")}
            </Button>
          </div>
        </div>
      )}
      {remote?.isCompleted === 1 && (
        <Button onClick={onExit}>{t("setupApprovalUx.openDashboard")}</Button>
      )}
    </div>
  );
}
