import { useState, useEffect } from 'react';
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
import ProductsServicesStep from './setup-wizard/ProductsServicesStep';
import IntegrationsStep from './setup-wizard/IntegrationsStep';
import PersonalityStep from './setup-wizard/PersonalityStep';
import LanguageStep from './setup-wizard/LanguageStep';
import CompleteStep from './setup-wizard/CompleteStep';

const TOTAL_STEPS = 9;

const STEP_TITLES = [
  'مرحباً بك!',
  'نوع نشاطك',
  'اختر قالب جاهز',
  'معلومات النشاط',
  'المنتجات والخدمات',
  'التكاملات',
  'شخصية ساري',
  'اختر اللغة',
  'جاهز للانطلاق!',
];

export default function SetupWizard() {
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

  // Auto-save progress
  const saveProgress = async () => {
    setIsSaving(true);
    try {
      await saveProgressMutation.mutateAsync({
        currentStep,
        completedSteps,
        wizardData,
      });
      setLastSaved(new Date());

      // Show success toast briefly
      toast.success('تم الحفظ ✓', {
        duration: 1500,
      });
    } catch (error) {
      console.error('Failed to save progress:', error);
      toast.error('فشل حفظ التقدم', {
        description: 'سيتم إعادة المحاولة تلقائياً',
      });
    } finally {
      setIsSaving(false);
    }
  };

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
      saveProgress();
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
        businessType: wizardData.businessType,
        businessName: wizardData.businessName,
        phone: wizardData.phone,
        address: wizardData.address,
        description: wizardData.description,
        workingHoursType: wizardData.workingHoursType || 'weekdays',
        workingHours: wizardData.workingHours,
        botTone: wizardData.botTone,
        botLanguage: wizardData.botLanguage,
        welcomeMessage: wizardData.welcomeMessage,
      });

      toast.success('تم الإعداد بنجاح! مرحباً بك في ساري، يمكنك الآن البدء في استخدام النظام.');

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
        return <ProductsServicesStep {...stepProps} />;
      case 6:
        return <IntegrationsStep {...stepProps} />;
      case 7:
        return <PersonalityStep {...stepProps} />;
      case 8:
        return <LanguageStep data={wizardData} onUpdate={updateWizardData} />;
      case 9:
        return <CompleteStep {...stepProps} completeSetup={completeSetup} isLoading={isLoading} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">إعداد ساري</h1>
          <p className="text-gray-600">سنساعدك في إعداد كل شيء خلال 5 دقائق فقط</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              الخطوة {currentStep} من {TOTAL_STEPS}
            </span>
            <div className="flex items-center gap-3">
              {/* Saving Indicator */}
              {isSaving && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  جاري الحفظ...
                </span>
              )}
              {!isSaving && lastSaved && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  تم الحفظ
                </span>
              )}
              <span className="text-sm font-medium text-gray-700">
                {Math.round(progressPercentage)}%
              </span>
            </div>
          </div>
          <Progress value={progressPercentage} className="h-2" />
          <div className="flex justify-between mt-2">
            {STEP_TITLES.map((title, index) => (
              <div
                key={index}
                className={`text-xs ${index + 1 === currentStep
                    ? 'text-primary font-semibold'
                    : index + 1 < currentStep
                      ? 'text-green-600'
                      : 'text-gray-400'
                  }`}
              >
                {index + 1 === currentStep && '→ '}
                {completedSteps.includes(index + 1) && <Check className="inline h-3 w-3 mr-1" />}
                {title}
              </div>
            ))}
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
              {currentStep === 5 && 'أضف منتجاتك أو خدماتك'}
              {currentStep === 6 && 'ربط مع Google (اختياري)'}
              {currentStep === 7 && 'اجعل ساري يتحدث بأسلوبك'}
              {currentStep === 8 && 'مراجعة نهائية قبل البدء'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderStep()}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        {currentStep !== 1 && currentStep !== 9 && (
          <div className="flex justify-between mt-6">
            <Button
              variant="outline"
              onClick={goToPreviousStep}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              السابق
            </Button>
            <Button onClick={goToNextStep}>
              التالي
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
