import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  CheckCircle2,
  Store,
  MessageSquare,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface OnboardingWizardProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [, setLocation] = useLocation();

  const { data: merchant } = trpc.merchants.getCurrent.useQuery();
  const { data: onboardingStatus } = trpc.merchants.getOnboardingStatus.useQuery();
  const updateStep = trpc.merchants.updateOnboardingStep.useMutation();
  const updateMerchant = trpc.merchants.update.useMutation();
  const completeOnboarding = trpc.merchants.completeOnboarding.useMutation();

  useEffect(() => {
    if (onboardingStatus && !onboardingStatus.completed) {
      setCurrentStep(onboardingStatus.currentStep);
    }
    if (merchant) {
      setBusinessName(merchant.businessName || '');
      setPhone(merchant.phone || '');
    }
  }, [onboardingStatus, merchant]);

  const steps = [
    {
      title: 'مرحباً بك في ساري! 🎉',
      description: 'مساعدك الذكي لإدارة متجرك على واتساب',
      icon: Sparkles,
    },
    {
      title: 'معلومات متجرك',
      description: 'أخبرنا المزيد عن متجرك',
      icon: Store,
    },
    {
      title: 'جاهز للانطلاق! 🚀',
      description: 'استكشف ساري واشترك لربط واتساب',
      icon: CheckCircle2,
    },
  ];

  const handleNext = async () => {
    // Validate step 1 (business info)
    if (currentStep === 1) {
      if (!businessName.trim()) {
        toast.error(t('compOnboardingWizardPage.text0'));
        return;
      }

      try {
        await updateMerchant.mutateAsync({
          businessName: businessName.trim(),
          phone: phone.trim() || undefined,
        });

        toast.success(t('compOnboardingWizardPage.text1'));
      } catch (error) {
        toast.error(t('compOnboardingWizardPage.text2'));
        return;
      }
    }

    const nextStep = currentStep + 1;

    if (nextStep < steps.length) {
      await updateStep.mutateAsync({ step: nextStep });
      setCurrentStep(nextStep);
    }
  };

  const handleBack = async () => {
    const prevStep = currentStep - 1;
    if (prevStep >= 0) {
      await updateStep.mutateAsync({ step: prevStep });
      setCurrentStep(prevStep);
    }
  };

  const handleComplete = async () => {
    try {
      await completeOnboarding.mutateAsync();
      toast.success(t('compOnboardingWizardPage.text3'));
      onComplete?.();
      setLocation('/merchant/dashboard');
    } catch (error) {
      toast.error(t('compOnboardingWizardPage.text4'));
    }
  };

  const handleSkip = () => {
    onSkip?.();
  };



  const progress = ((currentStep + 1) / steps.length) * 100;
  const CurrentIcon = steps[currentStep].icon;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl my-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <CurrentIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">{steps[currentStep].title}</CardTitle>
                <CardDescription className="text-base mt-1">
                  {steps[currentStep].description}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              className="text-gray-500 hover:text-gray-700 flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>الخطوة {currentStep + 1} من {steps.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <div className="space-y-6 py-6">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary to-primary flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-semibold">{t('compOnboardingWizardPage.text5')}</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  ساري هو مساعدك الذكي الذي يعمل بالذكاء الاصطناعي لإدارة متجرك على واتساب.
                  يرد على عملائك باللهجة السعودية، يساعدهم في اختيار المنتجات، ويستقبل الطلبات تلقائياً.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-primary/10">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <h4 className="font-semibold mb-1">{t('compOnboardingWizardPage.text6')}</h4>
                  <p className="text-sm text-gray-600">{t('compOnboardingWizardPage.text7')}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-primary/10">
                  <Store className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <h4 className="font-semibold mb-1">{t('compOnboardingWizardPage.text8')}</h4>
                  <p className="text-sm text-gray-600">{t('compOnboardingWizardPage.text9')}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-primary/10">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <h4 className="font-semibold mb-1">{t('compOnboardingWizardPage.text10')}</h4>
                  <p className="text-sm text-gray-600">{t('compOnboardingWizardPage.text11')}</p>
                </div>
              </div>

              <p className="text-center text-sm text-gray-500">
                دعنا نساعدك في إعداد حسابك في 3 خطوات بسيطة
              </p>
            </div>
          )}

          {/* Step 1: Business Info */}
          {currentStep === 1 && (
            <div className="space-y-4 py-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="businessName">{t('compOnboardingWizardPage.text12')}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-gray-400 hover:text-gray-600">
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <div className="space-y-2">
                        <p className="font-medium">{t('compOnboardingWizardPage.text13')}</p>
                        <div className="space-y-1 text-xs">
                          <p className="text-green-600">{t('compOnboardingWizardPage.text14')}</p>
                          <p className="text-green-600">{t('compOnboardingWizardPage.text15')}</p>
                          <p className="text-green-600">{t('compOnboardingWizardPage.text16')}</p>
                          <p className="text-red-600">{t('compOnboardingWizardPage.text17')}</p>
                          <p className="text-red-600">{t('compOnboardingWizardPage.text18')}</p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t('compOnboardingWizardPage.text19')}
                  className="text-right"
                />
                <p className="text-sm text-gray-500">
                  هذا الاسم سيظهر للعملاء عند التواصل معهم
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="phone">{t('compOnboardingWizardPage.text20')}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-gray-400 hover:text-gray-600">
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <div className="space-y-2">
                        <p className="font-medium">{t('compOnboardingWizardPage.text21')}</p>
                        <div className="space-y-1 text-xs">
                          <p className="text-green-600">✅ 0512345678</p>
                          <p className="text-green-600">✅ 0501234567</p>
                          <p className="text-green-600">✅ +966512345678</p>
                          <p className="text-red-600">{t('compOnboardingWizardPage.text22')}</p>
                          <p className="text-red-600">{t('compOnboardingWizardPage.text23')}</p>
                        </div>
                        <p className="text-xs text-gray-400">{t('compOnboardingWizardPage.text24')}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="text-right"
                  dir="ltr"
                />
                <p className="text-sm text-gray-500">
                  رقم جوالك للتواصل (غير رقم واتساب المتجر)
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Trial + Subscription Info */}
          {currentStep === 2 && (
            <div className="space-y-6 py-6">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold">{t('compOnboardingWizardPage.text25')}</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  يمكنك الآن استكشاف لوحة التحكم بالكامل، إضافة المنتجات، وتجربة ردود ساري الذكية مجاناً
                </p>
              </div>

              {/* What you can do now */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-green-800">{t('compOnboardingWizardPage.text26')}</h4>
                <ul className="space-y-1 text-sm text-green-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{t('compOnboardingWizardPage.text27')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{t('compOnboardingWizardPage.text28')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{t('compOnboardingWizardPage.text29')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{t('compOnboardingWizardPage.text30')}</span>
                  </li>
                </ul>
              </div>

              {/* WhatsApp requires subscription */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-amber-800">{t('compOnboardingWizardPage.text31')}</h4>
                <p className="text-sm text-amber-700">
                  لتفعيل الرد التلقائي على واتساب واستقبال الطلبات من العملاء، اختر الباقة المناسبة لك:
                </p>
              </div>

              {/* Abbreviated Plans */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div
                  className="border-2 border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-primary hover:shadow-md transition-all"
                  onClick={() => setLocation('/merchant/subscription/plans')}
                >
                  <h5 className="font-semibold text-gray-900 mb-1">{t('compOnboardingWizardPage.text32')}</h5>
                  <p className="text-2xl font-bold text-primary mb-1">99 <span className="text-sm font-normal">{t('compOnboardingWizardPage.text33')}</span></p>
                  <p className="text-xs text-gray-500">{t('compOnboardingWizardPage.text34')}</p>
                </div>
                <div
                  className="border-2 border-primary rounded-lg p-4 text-center cursor-pointer hover:shadow-md transition-all bg-primary/5 relative"
                  onClick={() => setLocation('/merchant/subscription/plans')}
                >
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-white text-xs px-2 py-0.5 rounded-full">{t('compOnboardingWizardPage.text35')}</span>
                  <h5 className="font-semibold text-gray-900 mb-1">{t('compOnboardingWizardPage.text36')}</h5>
                  <p className="text-2xl font-bold text-primary mb-1">199 <span className="text-sm font-normal">{t('compOnboardingWizardPage.text37')}</span></p>
                  <p className="text-xs text-gray-500">{t('compOnboardingWizardPage.text38')}</p>
                </div>
                <div
                  className="border-2 border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-primary hover:shadow-md transition-all"
                  onClick={() => setLocation('/merchant/subscription/plans')}
                >
                  <h5 className="font-semibold text-gray-900 mb-1">{t('compOnboardingWizardPage.text39')}</h5>
                  <p className="text-2xl font-bold text-primary mb-1">399 <span className="text-sm font-normal">{t('compOnboardingWizardPage.text40')}</span></p>
                  <p className="text-xs text-gray-500">{t('compOnboardingWizardPage.text41')}</p>
                </div>
              </div>

              <Button
                onClick={() => setLocation('/merchant/subscription/plans')}
                className="w-full"
                variant="outline"
                size="sm"
              >
                عرض جميع الباقات والمقارنة
                <ArrowLeft className="mr-2 w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="ml-2 w-4 h-4" />
              السابق
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button onClick={handleNext}>
                التالي
                <ArrowRight className="mr-2 w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete} className="bg-green-600 hover:bg-green-700">
                ابدأ الآن
                <CheckCircle2 className="mr-2 w-4 h-4" />
              </Button>
            )}
          </div>

          {currentStep > 0 && currentStep < steps.length - 1 && (
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-gray-500 hover:text-gray-700"
              >
                تخطي وإنهاء الإعداد
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
