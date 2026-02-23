import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

// Import step components
import WelcomeStep from './setup-wizard/WelcomeStep';
import BusinessTypeStep from './setup-wizard/BusinessTypeStep';
import TemplatesStep from './setup-wizard/TemplatesStep';
import BasicInfoStep from './setup-wizard/BasicInfoStep';
import WebsiteStep from './setup-wizard/WebsiteStep';
import ProductsServicesStep from './setup-wizard/ProductsServicesStep';
import IntegrationsStep from './setup-wizard/IntegrationsStep';
import PersonalityStep from './setup-wizard/PersonalityStep';
import LanguageStep from './setup-wizard/LanguageStep';
import CompleteStep from './setup-wizard/CompleteStep';
import { useTranslation } from 'react-i18next';

const TOTAL_STEPS = 10;

const STEP_TITLES = [
  'مرحباً بك!',
  'نوع نشاطك',
  'اختر قالب جاهز',
  'معلومات النشاط',
  'ربط موقعك',
  'المنتجات والخدمات',
  'التكاملات',
  'شخصية ساري',
  'اختر اللغة',
  'جاهز للانطلاق!',
];

export default function SetupWizard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  // Using sonner toast
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [wizardData, setWizardData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load progress
  const { data: progress, isLoading: loadingProgress } = trpc.setupWizard.getProgress.useQuery();
  const saveProgressMutation = trpc.setupWizard.saveProgress.useMutation();
  const completeSetupMutation = trpc.setupWizard.completeSetup.useMutation();

  // Load saved progress
  useEffect(() => {
    if (progress && !progress.isCompleted) {
      setCurrentStep(progress.currentStep || 1);
      setCompletedSteps(progress.completedSteps ? JSON.parse(progress.completedSteps) : []);
      setWizardData(progress.wizardData ? JSON.parse(progress.wizardData) : {});
    } else if (progress?.isCompleted) {
      // Already completed, redirect to dashboard
      setLocation('/merchant/dashboard');
    }
  }, [progress]);

  // Save progress to server
  const saveProgress = useCallback(async (data?: { step?: number; completed?: number[]; wData?: Record<string, any> }) => {
    setIsSaving(true);
    try {
      await saveProgressMutation.mutateAsync({
        currentStep: data?.step ?? currentStep,
        completedSteps: data?.completed ?? completedSteps,
        wizardData: data?.wData ?? wizardData,
      });
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save progress:', error);
    } finally {
      setIsSaving(false);
    }
  }, [currentStep, completedSteps, wizardData]);

  // Debounced auto-save: save 2 seconds after any data change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    // Skip auto-save on initial load
    if (isInitialLoadRef.current) {
      return;
    }
    // Clear previous timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    // Set new debounced save
    saveTimerRef.current = setTimeout(() => {
      saveProgress();
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [wizardData, currentStep]);

  // Mark initial load complete after progress is loaded
  useEffect(() => {
    if (progress && !loadingProgress) {
      // Small delay to let initial state settle
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 500);
    }
  }, [progress, loadingProgress]);

  // Save before page unload (refresh/close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable save on page close
      const payload = JSON.stringify({
        currentStep,
        completedSteps,
        wizardData,
      });
      navigator.sendBeacon?.('/api/trpc/setupWizard.saveProgress', payload);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentStep, completedSteps, wizardData]);

  // Update wizard data
  const updateWizardData = (stepData: Record<string, any>) => {
    setWizardData(prev => ({ ...prev, ...stepData }));
  };

  // Navigate to next step
  const goToNextStep = () => {
    if (currentStep < TOTAL_STEPS) {
      const newCompletedSteps = [...completedSteps];
      if (!newCompletedSteps.includes(currentStep)) {
        newCompletedSteps.push(currentStep);
      }
      setCompletedSteps(newCompletedSteps);
      setCurrentStep(currentStep + 1);
      // Immediate save (not debounced) when explicitly moving forward
      saveProgress({ step: currentStep + 1, completed: newCompletedSteps });
    }
  };

  // Navigate to a specific step (for clicking on step indicators)
  const goToStep = (targetStep: number) => {
    // Allow going to any completed step, or the next available step
    const canNavigate = completedSteps.includes(targetStep) || targetStep <= Math.max(...completedSteps, 0) + 1;
    if (canNavigate && targetStep !== currentStep && targetStep >= 1 && targetStep <= TOTAL_STEPS) {
      // Save current data before navigating
      saveProgress();
      setCurrentStep(targetStep);
    }
  };

  // Navigate to previous step
  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Skip step
  const skipStep = () => {
    goToNextStep();
  };

  // Complete setup
  const completeSetup = async () => {
    setIsLoading(true);
    try {
      await completeSetupMutation.mutateAsync({
        businessType: wizardData.businessType || 'store',
        businessName: wizardData.businessName || '',
        phone: wizardData.phone || '',
        address: wizardData.address || '',
        description: wizardData.description || '',
        workingHoursType: wizardData.workingHoursType || '24_7',
        workingHours: wizardData.workingHours,
        botTone: wizardData.botTone || 'friendly',
        botLanguage: wizardData.botLanguage || 'ar',
        welcomeMessage: wizardData.welcomeMessage || '',
        products: (wizardData.products || []).filter((p: any) => p.name?.trim()).map((p: any) => ({
          name: p.name,
          description: p.description || '',
          price: p.price || '0',
          currency: p.currency || 'SAR',
          imageUrl: p.imageUrl || '',
          productUrl: p.productUrl || '',
          category: p.category || '',
        })),
        services: (wizardData.services || []).filter((s: any) => s.name?.trim()).map((s: any) => ({
          name: s.name,
          description: s.description || '',
          price: s.price || '0',
        })),
      });

      toast.success(t('setupWizardPage.text0'));

      setLocation('/merchant/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ أثناء إكمال الإعداد');
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingProgress) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const progressPercentage = (currentStep / TOTAL_STEPS) * 100;

  // Render current step component
  const renderStep = () => {
    const stepProps = {
      wizardData,
      updateWizardData,
      goToNextStep,
      skipStep,
    };

    switch (currentStep) {
      case 1:
        return <WelcomeStep {...stepProps} />;
      case 2:
        return <BusinessTypeStep {...stepProps} />;
      case 3:
        return <TemplatesStep {...stepProps} />;
      case 4:
        return <BasicInfoStep {...stepProps} />;
      case 5:
        return <WebsiteStep {...stepProps} />;
      case 6:
        return <ProductsServicesStep {...stepProps} />;
      case 7:
        return <IntegrationsStep {...stepProps} />;
      case 8:
        return <PersonalityStep {...stepProps} />;
      case 9:
        return <LanguageStep data={wizardData} onUpdate={updateWizardData} goToNextStep={goToNextStep} />;
      case 10:
        return <CompleteStep {...stepProps} completeSetup={completeSetup} isLoading={isLoading} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{t('setupWizardPage.text1')}</h1>
          <p className="text-sm md:text-base text-gray-600">{t('setupWizardPage.text2')}</p>
        </div>

        {/* Progress Section */}
        <div className="mb-6 md:mb-8">
          {/* Top info row */}
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-emerald-700">
              {currentStep} / {TOTAL_STEPS}
            </span>
            <div className="flex items-center gap-2">
              {isSaving && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">{t('setupWizardPage.text3')}</span>
                </span>
              )}
              {!isSaving && lastSaved && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  <span className="hidden sm:inline">{t('setupWizardPage.text4')}</span>
                </span>
              )}
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {Math.round(progressPercentage)}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <Progress value={progressPercentage} className="h-2 mb-3" />

          {/* Mobile: Current step name + dot indicators */}
          <div className="md:hidden">
            <p className="text-sm font-semibold text-emerald-700 mb-2 text-center">
              {STEP_TITLES[currentStep - 1]}
            </p>
            <div className="flex flex-row-reverse justify-center items-center gap-1.5">
              {STEP_TITLES.map((_, index) => {
                const stepNum = index + 1;
                const isCompleted = completedSteps.includes(stepNum);
                const isCurrent = stepNum === currentStep;
                const canClick = isCompleted || stepNum <= Math.max(...completedSteps, 0) + 1;
                return (
                  <button
                    key={index}
                    onClick={() => canClick && goToStep(stepNum)}
                    className={`
                      rounded-full transition-all duration-300
                      ${canClick && !isCurrent ? 'cursor-pointer hover:scale-125' : ''}
                      ${!canClick ? 'cursor-default' : ''}
                      ${isCurrent
                        ? 'w-6 h-2.5 bg-emerald-500'
                        : isCompleted
                          ? 'w-2.5 h-2.5 bg-emerald-400'
                          : 'w-2.5 h-2.5 bg-gray-200'
                      }
                    `}
                    disabled={!canClick}
                    aria-label={`الخطوة ${stepNum}: ${STEP_TITLES[index]}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Desktop: Full step labels (clickable) */}
          <div className="hidden md:flex flex-row-reverse justify-between mt-2">
            {STEP_TITLES.map((title, index) => {
              const stepNum = index + 1;
              const isCompleted = completedSteps.includes(stepNum);
              const isCurrent = stepNum === currentStep;
              const canClick = isCompleted || stepNum <= Math.max(...completedSteps, 0) + 1;
              return (
                <button
                  key={index}
                  onClick={() => canClick && goToStep(stepNum)}
                  disabled={!canClick}
                  className={`text-xs transition-colors ${isCurrent
                    ? 'text-emerald-600 font-bold'
                    : isCompleted
                      ? 'text-green-600 hover:text-green-800 cursor-pointer hover:underline'
                      : canClick
                        ? 'text-gray-500 hover:text-gray-700 cursor-pointer'
                        : 'text-gray-400 cursor-default'
                    }`}
                >
                  {isCurrent && '← '}
                  {isCompleted && <Check className="inline h-3 w-3 mr-0.5" />}
                  {title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">{STEP_TITLES[currentStep - 1]}</CardTitle>
            <CardDescription>
              {currentStep === 1 && 'دعنا نبدأ رحلتك مع ساري'}
              {currentStep === 2 && 'اختر نوع نشاطك التجاري'}
              {currentStep === 3 && 'وفر الوقت باستخدام قالب جاهز'}
              {currentStep === 4 && 'أخبرنا المزيد عن نشاطك'}
              {currentStep === 5 && 'ساري يسحب المنتجات من موقعك تلقائياً'}
              {currentStep === 6 && 'أضف منتجاتك أو خدماتك'}
              {currentStep === 7 && 'ربط مع Google (اختياري)'}
              {currentStep === 8 && 'اجعل ساري يتحدث بأسلوبك'}
              {currentStep === 9 && 'اختر لغة التواصل'}
              {currentStep === 10 && 'مراجعة نهائية قبل البدء'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderStep()}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        {currentStep !== 1 && currentStep !== 9 && (
          <div className="flex justify-start mt-6">
            <Button
              variant="outline"
              onClick={goToPreviousStep}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              السابق
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
