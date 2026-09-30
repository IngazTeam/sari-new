import { Smile, Briefcase, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PreviewChat from "@/components/PreviewChat";
import { useTranslation } from "react-i18next";
import {
  setupAssistantDraft,
  setupAssistantIssues,
  setupAssistantFields,
  setupTextValue,
} from "@/lib/setup-field-validation";
import { setupCatalogDraft } from "@shared/setup-catalog";

interface PersonalityStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
  compact?: boolean;
}

export default function PersonalityStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  compact,
}: PersonalityStepProps) {
  const { t } = useTranslation();
  const assistant = setupAssistantDraft(wizardData),
    issues = setupAssistantIssues(wizardData);
  const botTone = setupTextValue(assistant.botTone);
  const catalog = setupCatalogDraft.safeParse(wizardData);
  const language = setupTextValue(assistant.botLanguage);
  const validAssistant = setupAssistantFields.safeParse(assistant);
  const previewLanguage =
    language === "ar" || language === "en" || language === "both"
      ? language
      : null;
  const canPreview =
    !issues.length &&
    catalog.success &&
    ["ar", "en", "both"].includes(language);
  const tones = [
    {
      id: "friendly",
      icon: Smile,
      title: t("setupWorkspace.toneFriendly"),
      description: t("setupWorkspace.toneFriendlyDescription"),
    },
    {
      id: "professional",
      icon: Briefcase,
      title: t("setupWorkspace.toneProfessional"),
      description: t("setupWorkspace.toneProfessionalDescription"),
    },
    {
      id: "casual",
      icon: Coffee,
      title: t("setupWorkspace.toneCasual"),
      description: t("setupWorkspace.toneCasualDescription"),
    },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h2 className="ms-field-title" id="assistant-tone-title" tabIndex={-1}>
          {t("setupWorkspace.toneTitle")}
        </h2>
        <div
          className="ms-choice-grid"
          role="group"
          aria-labelledby="assistant-tone-title"
        >
          {tones.map(tone => (
            <button
              type="button"
              key={tone.id}
              className="ms-choice"
              aria-pressed={botTone === tone.id}
              onClick={() => updateWizardData({ botTone: tone.id })}
            >
              <tone.icon aria-hidden="true" />
              <span>
                <strong>{tone.title}</strong>
                <small>{tone.description}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      {issues.includes("botTone") && (
        <p role="alert">{t("setupFieldUx.toneError")}</p>
      )}
      <details
        className="ms-details"
        open={issues.includes("welcomeMessage") || undefined}
      >
        <summary>{t("setupWorkspace.customizeAssistant")}</summary>
        <div className="space-y-4">
          <Label htmlFor="welcomeMessage">{t("personalityStep.auto_1")}</Label>
          <Textarea
            id="welcomeMessage"
            value={setupTextValue(assistant.welcomeMessage)}
            aria-invalid={issues.includes("welcomeMessage")}
            aria-describedby={
              issues.includes("welcomeMessage")
                ? "welcomeMessage-error"
                : undefined
            }
            onChange={event =>
              updateWizardData({ welcomeMessage: event.target.value })
            }
            rows={3}
          />
          {issues.includes("welcomeMessage") && (
            <p id="welcomeMessage-error" role="alert">
              {t("setupFieldUx.welcomeError")}
            </p>
          )}
          {assistant.welcomeMessage != null &&
            typeof assistant.welcomeMessage !== "string" && (
              <details>
                <summary>{t("setupCatalogUx.originalData")}</summary>
                <pre className="ms-raw-field" dir="ltr">
                  {JSON.stringify(assistant.welcomeMessage, null, 2)}
                </pre>
                <Button
                  variant="outline"
                  onClick={() => updateWizardData({ welcomeMessage: "" })}
                >
                  {t("setupFieldUx.clearInvalid")}
                </Button>
              </details>
            )}
          <p className="text-xs text-muted-foreground">
            {t("personalityStep.auto_2")}
          </p>
          {canPreview &&
          catalog.success &&
          validAssistant.success &&
          previewLanguage ? (
            <PreviewChat
              businessName={setupTextValue(wizardData.businessName)}
              botTone={validAssistant.data.botTone}
              botLanguage={previewLanguage}
              products={catalog.data.products.map(({ priceMinor, ...row }) => ({
                ...row,
                price: priceMinor / 100,
              }))}
              services={catalog.data.services.map(({ priceMinor, ...row }) => ({
                ...row,
                price: priceMinor / 100,
              }))}
              welcomeMessage={setupTextValue(assistant.welcomeMessage)}
              className="max-w-md mx-auto"
              useAI={false}
            />
          ) : (
            <p>
              {t(
                !["ar", "en", "both"].includes(language)
                  ? "setupFieldUx.previewLanguage"
                  : "setupFieldUx.previewInvalid"
              )}
            </p>
          )}
        </div>
      </details>
      {!compact && (
        <div className="ms-actions">
          <Button onClick={goToNextStep} disabled={issues.length > 0}>
            {t("personalityStep.auto_4")}
          </Button>
        </div>
      )}
    </div>
  );
}
