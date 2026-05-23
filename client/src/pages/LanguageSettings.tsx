import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Languages, Globe, DollarSign, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCurrency } from "@/contexts/CurrencyContext";

export default function LanguageSettings() {
  // @ts-ignore
  const { t } = useTranslation();
  // @ts-ignore
  const { t, i18n } = useTranslation();
  const { currency, setCurrency } = useCurrency();
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language);
  const [selectedCurrency, setSelectedCurrency] = useState(currency);

  const updateBotSettings = trpc.botSettings.update.useMutation({
    onSuccess: () => {
      toast.success(t('success.updated'));
    },
    onError: (error: any) => {
      toast.error(t('errors.updateFailed') + ': ' + error.message);
    },
  });

  const handleLanguageChange = (lang: string) => {
    setSelectedLanguage(lang);
    i18n.changeLanguage(lang);
    
    // Update bot settings to match user's language preference
    const botLanguage = lang === 'ar' ? 'ar' : lang === 'en' ? 'en' : 'both';
    updateBotSettings.mutate({ language: botLanguage as any });
    
    toast.success(t('success.updated'));
  };

  const handleCurrencyChange = (curr: string) => {
    // @ts-ignore
    setSelectedCurrency(curr);
    // @ts-ignore
    setCurrency(curr);
    toast.success(t('success.updated'));
  };

  const languages = [
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  ];

  const currencies = [
    { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س' },
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'AED', name: 'درهم إماراتي', symbol: 'د.إ' },
    { code: 'KWD', name: 'دينار كويتي', symbol: 'د.ك' },
  ];

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Languages className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">{t('common.settings')}</h1>
          <p className="text-muted-foreground">{t('languageSettingsPage.text0')}</p>
        </div>
      </div>

      <Separator />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Language Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />{t('languageSettings.auto_0')}</CardTitle>
            <CardDescription>{t('languageSettings.auto_1')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="language">{t('languageSettingsPage.text1')}</Label>
              <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
                <SelectTrigger id="language">
                  <SelectValue placeholder={t('languageSettingsPage.text2')} />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      <div className="flex items-center gap-2">
                        <span>{lang.flag}</span>
                        <span>{lang.name}</span>
                        {selectedLanguage === lang.code && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">{t('languageSettingsPage.text3')}</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>{t('languageSettingsPage.text4')}</li>
                <li>{t('languageSettingsPage.text5')}</li>
                <li>{t('languageSettingsPage.text6')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Currency Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />{t('languageSettings.auto_2')}</CardTitle>
            <CardDescription>{t('languageSettings.auto_3')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currency">{t('languageSettingsPage.text7')}</Label>
              <Select value={selectedCurrency} onValueChange={handleCurrencyChange}>
                <SelectTrigger id="currency">
                  <SelectValue placeholder={t('languageSettingsPage.text8')} />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((curr) => (
                    <SelectItem key={curr.code} value={curr.code}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{curr.symbol}</span>
                        <span>{curr.name}</span>
                        {selectedCurrency === curr.code && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">{t('languageSettingsPage.text9')}</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>{t('languageSettingsPage.text10')}</li>
                <li>{t('languageSettingsPage.text11')}</li>
                <li>{t('languageSettingsPage.text12')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('languageSettingsPage.text13')}</CardTitle>
          <CardDescription>{t('languageSettings.auto_4')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground mb-2">{t('languageSettingsPage.text14')}</p>
              <div className="space-y-2">
                <p className="font-medium">{t('common.welcome')}</p>
                <p className="text-sm">{t('bot.welcome')}</p>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground mb-2">{t('languageSettingsPage.text15')}</p>
              <div className="space-y-2">
                <p className="font-medium">
                  {t('common.price')}: {currencies.find(c => c.code === selectedCurrency)?.symbol} 1,500
                </p>
                <p className="text-sm">
                  {t('common.total')}: {currencies.find(c => c.code === selectedCurrency)?.symbol} 4,500
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}