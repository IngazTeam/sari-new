import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_LANGUAGE_OPTIONS, changeAppLanguage } from '@/lib/i18n';

const languages = APP_LANGUAGE_OPTIONS;

interface LanguageSwitcherProps {
  variant?: 'default' | 'compact' | 'full';
  className?: string;
}

export function LanguageSwitcher({ variant = 'default', className }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = async (langCode: string) => {
    const selectedLang = languages.find(lang => lang.code === langCode);
    try {
      if (selectedLang) {
        await changeAppLanguage(selectedLang.code);
      }
    } finally {
      setIsOpen(false);
    }
  };

  // Do not present a switcher with one choice. Candidate locales are enabled
  // only after their complete catalogue passes the production locale gate.
  if (languages.length <= 1) return null;

  if (variant === 'compact') {
    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label={t('publicUx.navigation.switchLanguage')}
            title={t('publicUx.navigation.switchLanguage')}
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <span>{lang.flag}</span>
                <span>{lang.nativeName}</span>
              </span>
              {currentLanguage.code === lang.code && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (variant === 'full') {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="text-sm font-medium" id="app-language-label">
          {t('publicUx.navigation.languageLabel')}
        </div>
        <div className="flex gap-2">
          {languages.map((lang) => (
            <Button
              key={lang.code}
              variant={currentLanguage.code === lang.code ? 'default' : 'outline'}
              className="flex-1 gap-2"
              onClick={() => handleLanguageChange(lang.code)}
              aria-describedby="app-language-label"
              aria-pressed={currentLanguage.code === lang.code}
            >
              <span>{lang.flag}</span>
              <span>{lang.nativeName}</span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("gap-2", className)}
          aria-label={`${t('publicUx.navigation.switchLanguage')}: ${currentLanguage.nativeName}`}
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          <span>{currentLanguage.flag}</span>
          <span className="hidden sm:inline">{currentLanguage.nativeName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={cn(
              "flex items-center justify-between gap-2 cursor-pointer",
              currentLanguage.code === lang.code && "bg-primary/10"
            )}
          >
            <span className="flex items-center gap-2">
              <span className="text-lg">{lang.flag}</span>
              <div className="flex flex-col">
                <span className="font-medium">{lang.nativeName}</span>
                <span className="text-xs text-muted-foreground">{lang.name}</span>
              </div>
            </span>
            {currentLanguage.code === lang.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Hook للحصول على اتجاه اللغة الحالية
export function useLanguageDirection() {
  const { i18n } = useTranslation();
  const currentLanguage = languages.find(lang => lang.code === i18n.language);
  return currentLanguage?.dir || 'rtl';
}

// Hook للحصول على معلومات اللغة الحالية
export function useCurrentLanguage() {
  const { i18n } = useTranslation();
  return languages.find(lang => lang.code === i18n.language) || languages[0];
}

export default LanguageSwitcher;
