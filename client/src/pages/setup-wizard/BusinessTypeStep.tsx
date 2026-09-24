import { Store, Briefcase, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface BusinessTypeStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
  compact?: boolean;
}

export default function BusinessTypeStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  compact,
}: BusinessTypeStepProps) {
  const { t } = useTranslation();
  const options = [
    {
      id: "store",
      icon: Store,
      title: t("setupWorkspace.storeTitle"),
      description: t("setupWorkspace.storeDescription"),
    },
    {
      id: "services",
      icon: Briefcase,
      title: t("setupWorkspace.servicesTitle"),
      description: t("setupWorkspace.servicesDescription"),
    },
    {
      id: "both",
      icon: Layers,
      title: t("setupWorkspace.bothTitle"),
      description: t("setupWorkspace.bothDescription"),
    },
  ];
  return (
    <div>
      <h2 className="ms-field-title" id="business-type-title">
        {t("setupWorkspace.businessType")}
      </h2>
      <div
        className="ms-choice-grid"
        role="group"
        aria-labelledby="business-type-title"
      >
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            className="ms-choice"
            aria-pressed={wizardData.businessType === option.id}
            onClick={() => updateWizardData({ businessType: option.id })}
          >
            <option.icon aria-hidden="true" />
            <span>
              <strong>{option.title}</strong>
              <small>{option.description}</small>
            </span>
          </button>
        ))}
      </div>
      {!compact && (
        <div className="ms-actions">
          <Button onClick={goToNextStep} disabled={!wizardData.businessType}>
            {t("businessTypeStep.auto_2")}
          </Button>
        </div>
      )}
    </div>
  );
}
