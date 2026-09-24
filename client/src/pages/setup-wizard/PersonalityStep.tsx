import { Smile, Briefcase, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PreviewChat from "@/components/PreviewChat";
import { useTranslation } from "react-i18next";

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
  const botTone = wizardData.botTone || "friendly";
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
        <h2 className="ms-field-title" id="assistant-tone-title">
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
      <details className="ms-details">
        <summary>{t("setupWorkspace.customizeAssistant")}</summary>
        <div className="space-y-4">
          <Label htmlFor="welcomeMessage">{t("personalityStep.auto_1")}</Label>
          <Textarea
            id="welcomeMessage"
            value={wizardData.welcomeMessage || ""}
            onChange={event =>
              updateWizardData({ welcomeMessage: event.target.value })
            }
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            {t("personalityStep.auto_2")}
          </p>
          <PreviewChat
            businessName={wizardData.businessName}
            botTone={botTone}
            botLanguage={wizardData.botLanguage || "ar"}
            products={wizardData.products || []}
            services={wizardData.services || []}
            welcomeMessage={wizardData.welcomeMessage || ""}
            className="max-w-md mx-auto"
            useAI={false}
          />
        </div>
      </details>
      {!compact && (
        <div className="ms-actions">
          <Button onClick={goToNextStep}>{t("personalityStep.auto_4")}</Button>
        </div>
      )}
    </div>
  );
}
