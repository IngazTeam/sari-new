import { Button } from "@/components/ui/button";
import { Globe, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  setupAssistantDraft,
  setupAssistantIssues,
} from "@/lib/setup-field-validation";

interface Language {
  code: string;
  name: string;
  nativeName: string;
}

const languages: Language[] = [
  {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
  },
  {
    code: "en",
    name: "English",
    nativeName: "English",
  },
  {
    code: "both",
    name: "Arabic + English",
    nativeName: "العربية والإنجليزية",
  },
  {
    code: "fr",
    name: "French",
    nativeName: "Français",
  },
  {
    code: "tr",
    name: "Turkish",
    nativeName: "Türkçe",
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
  },
  {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
  },
];

interface LanguageStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: any) => void;
  goToNextStep: () => void;
  skipStep?: () => void;
  compact?: boolean;
}

export default function LanguageStep({
  wizardData,
  updateWizardData,
  goToNextStep,
}: LanguageStepProps) {
  const { t } = useTranslation();
  const selectedLanguage = setupAssistantDraft(wizardData).botLanguage;
  const issues = setupAssistantIssues(wizardData);
  const handleLanguageSelect = (langCode: string) => {
    const lang = languages.find(item => item.code === langCode);
    if (lang)
      updateWizardData({
        botLanguage: lang.code,
      });
  };
  const choices = (options: Language[]) => (
    <div
      className="ms-choice-grid"
      role="group"
      aria-labelledby="assistant-language-title"
    >
      {options.map(lang => (
        <button
          type="button"
          key={lang.code}
          className="ms-choice"
          aria-pressed={selectedLanguage === lang.code}
          onClick={() => handleLanguageSelect(lang.code)}
        >
          <Globe aria-hidden="true" />
          <span>
            <strong>{lang.nativeName}</strong>
            <small>{lang.name}</small>
          </span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-4">
      <div>
        <h2
          className="ms-field-title"
          id="assistant-language-title"
          tabIndex={-1}
        >
          {t("setupWorkspace.languageTitle")}
        </h2>
        {choices(languages.slice(0, 3))}
      </div>
      <details
        className="ms-details"
        open={
          languages.slice(3).some(lang => lang.code === selectedLanguage) ||
          undefined
        }
      >
        <summary>{t("setupWorkspace.languageMore")}</summary>
        {choices(languages.slice(3))}
      </details>
      <p className="text-xs text-muted-foreground">
        {t("setupWorkspace.languageNote")}
      </p>
      {issues.includes("botLanguage") && (
        <p role="alert">{t("setupFieldUx.languageError")}</p>
      )}
      {issues.some(key => key !== "botLanguage") && (
        <p role="alert">{t("setupFieldUx.assistantInvalid")}</p>
      )}
      <div className="ms-actions">
        <Button size="lg" onClick={goToNextStep} disabled={issues.length > 0}>
          {t("languageStep.auto_3")}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
