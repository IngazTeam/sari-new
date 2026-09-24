import { Button } from "@/components/ui/button";
import { Globe, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  currency: string;
  currencySymbol: string;
}

const languages: Language[] = [
  {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    flag: "🇸🇦",
    currency: "SAR",
    currencySymbol: "ر.س",
  },
  {
    code: "en",
    name: "English",
    nativeName: "English",
    flag: "🇬🇧",
    currency: "USD",
    currencySymbol: "$",
  },
  {
    code: "both",
    name: "Arabic + English",
    nativeName: "العربية والإنجليزية",
    flag: "🌍",
    currency: "SAR",
    currencySymbol: "ر.س",
  },
  {
    code: "fr",
    name: "French",
    nativeName: "Français",
    flag: "🇫🇷",
    currency: "EUR",
    currencySymbol: "€",
  },
  {
    code: "tr",
    name: "Turkish",
    nativeName: "Türkçe",
    flag: "🇹🇷",
    currency: "TRY",
    currencySymbol: "₺",
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    flag: "🇪🇸",
    currency: "EUR",
    currencySymbol: "€",
  },
  {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    flag: "🇮🇹",
    currency: "EUR",
    currencySymbol: "€",
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
  const selectedLanguage = wizardData.botLanguage || "ar";
  const handleLanguageSelect = (langCode: string) => {
    const lang = languages.find(item => item.code === langCode);
    if (lang)
      updateWizardData({
        botLanguage: lang.code,
        currency: lang.currency,
        currencySymbol: lang.currencySymbol,
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
        <h2 className="ms-field-title" id="assistant-language-title">
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
      <div className="ms-actions">
        <Button size="lg" onClick={goToNextStep}>
          {t("languageStep.auto_3")}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
