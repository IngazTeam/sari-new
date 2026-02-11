import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Globe, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  currency: string;
  currencySymbol: string;
}

const languages: Language[] = [
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', currency: 'SAR', currencySymbol: 'ر.س' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', currency: 'USD', currencySymbol: '$' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', currency: 'EUR', currencySymbol: '€' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', currency: 'TRY', currencySymbol: '₺' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', currency: 'EUR', currencySymbol: '€' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', currency: 'EUR', currencySymbol: '€' },
];

interface LanguageStepProps {
  data: {
    botLanguage?: string;
    currency?: string;
  };
  onUpdate: (data: any) => void;
  goToNextStep: () => void;
}

export default function LanguageStep({ data, onUpdate, goToNextStep }: LanguageStepProps) {
  const [selectedLanguage, setSelectedLanguage] = useState(data.botLanguage || 'ar');

  useEffect(() => {
    // Update parent when language changes
    const lang = languages.find(l => l.code === selectedLanguage);
    if (lang) {
      onUpdate({
        botLanguage: lang.code,
        currency: lang.currency,
        currencySymbol: lang.currencySymbol,
      });
    }
  }, [selectedLanguage]);

  const handleLanguageSelect = (langCode: string) => {
    setSelectedLanguage(langCode);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Globe className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">اختر لغة البوت</h2>
        <p className="text-muted-foreground">
          اختر اللغة التي سيستخدمها ساري للتواصل مع عملائك
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {languages.map((lang) => (
          <Card
            key={lang.code}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              selectedLanguage === lang.code
                ? "border-primary border-2 bg-primary/5"
                : "border-border hover:border-primary/50"
            )}
            onClick={() => handleLanguageSelect(lang.code)}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{lang.flag}</span>
                  <div>
                    <h3 className="font-semibold text-lg">{lang.nativeName}</h3>
                    <p className="text-sm text-muted-foreground">{lang.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {lang.currencySymbol} {lang.currency}
                    </p>
                  </div>
                </div>
                {selectedLanguage === lang.code && (
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                معلومة مهمة
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                سيتم استخدام هذه اللغة في جميع رسائل البوت التلقائية. يمكنك تغيير اللغة لاحقاً من صفحة الإعدادات.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-3">معاينة رسالة البوت:</h4>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
          <p className="text-sm">
            {selectedLanguage === 'ar' && 'مرحباً! أنا ساري، مساعدك الذكي. كيف أقدر أساعدك اليوم؟'}
            {selectedLanguage === 'en' && 'Hello! I\'m Sari, your smart assistant. How can I help you today?'}
            {selectedLanguage === 'fr' && 'Bonjour ! Je suis Sari, votre assistant intelligent. Comment puis-je vous aider aujourd\'hui ?'}
            {selectedLanguage === 'tr' && 'Merhaba! Ben Sari, akıllı asistanınız. Bugün size nasıl yardımcı olabilirim?'}
            {selectedLanguage === 'es' && '¡Hola! Soy Sari, tu asistente inteligente. ¿Cómo puedo ayudarte hoy?'}
            {selectedLanguage === 'it' && 'Ciao! Sono Sari, il tuo assistente intelligente. Come posso aiutarti oggi?'}
          </p>
        </div>
      </div>

      {/* Next Button */}
      <div className="flex justify-center pt-4">
        <Button size="lg" onClick={goToNextStep} className="px-8 bg-emerald-600 hover:bg-emerald-700">
          التالي
          <ArrowRight className="mr-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
