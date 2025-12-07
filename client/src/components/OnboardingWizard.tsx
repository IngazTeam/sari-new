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

interface OnboardingWizardProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
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
      title: 'ربط واتساب',
      description: 'اربط رقم واتساب للبدء في استقبال الطلبات',
      icon: MessageSquare,
    },
    {
      title: 'جاهز للانطلاق! 🚀',
      description: 'كل شيء جاهز الآن',
      icon: CheckCircle2,
    },
  ];

  const handleNext = async () => {
    // Validate step 1 (business info)
    if (currentStep === 1) {
      if (!businessName.trim()) {
        toast.error('يرجى إدخال اسم المتجر');
        return;
      }

      try {
        await updateMerchant.mutateAsync({
          businessName: businessName.trim(),
          phone: phone.trim() || undefined,
        });
        
        toast.success('تم حفظ معلومات المتجر بنجاح');
      } catch (error) {
        toast.error('حدث خطأ أثناء حفظ البيانات');
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
      toast.success('مبروك! 🎉 تم إعداد حسابك بنجاح');
      onComplete?.();
      setLocation('/merchant/dashboard');
    } catch (error) {
      toast.error('حدث خطأ أثناء إكمال الإعداد');
    }
  };

  const handleSkip = () => {
    onSkip?.();
  };

  const handleWhatsAppSetup = () => {
    setLocation('/merchant/whatsapp-setup');
  };

  const progress = ((currentStep + 1) / steps.length) * 100;
  const CurrentIcon = steps[currentStep].icon;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <CurrentIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-2xl">{steps[currentStep].title}</CardTitle>
                <CardDescription className="text-base mt-1">
                  {steps[currentStep].description}
                </CardDescription>
              </div>
            </div>
            {currentStep === 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkip}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>الخطوة {currentStep + 1} من {steps.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <div className="space-y-6 py-6">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-semibold">أهلاً بك في ساري!</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  ساري هو مساعدك الذكي الذي يعمل بالذكاء الاصطناعي لإدارة متجرك على واتساب.
                  يرد على عملائك باللهجة السعودية، يساعدهم في اختيار المنتجات، ويستقبل الطلبات تلقائياً.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-blue-50">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                  <h4 className="font-semibold mb-1">ردود تلقائية</h4>
                  <p className="text-sm text-gray-600">رد فوري على جميع رسائل العملاء</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-50">
                  <Store className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                  <h4 className="font-semibold mb-1">إدارة المنتجات</h4>
                  <p className="text-sm text-gray-600">نظام متكامل لإدارة منتجاتك</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-50">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                  <h4 className="font-semibold mb-1">استقبال الطلبات</h4>
                  <p className="text-sm text-gray-600">طلبات تلقائية من واتساب مباشرة</p>
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
                  <Label htmlFor="businessName">اسم المتجر *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-gray-400 hover:text-gray-600">
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <div className="space-y-2">
                        <p className="font-medium">اسم متجرك الذي سيظهر للعملاء في جميع المحادثات</p>
                        <div className="space-y-1 text-xs">
                          <p className="text-green-600">✅ متجر الهدايا الفاخرة</p>
                          <p className="text-green-600">✅ عطور الرياض</p>
                          <p className="text-green-600">✅ متجر الإلكترونيات</p>
                          <p className="text-red-600">❌ متجري (غير واضح)</p>
                          <p className="text-red-600">❌ ABC Store (بالإنجليزية)</p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="مثال: متجر الهدايا الفاخرة"
                  className="text-right"
                />
                <p className="text-sm text-gray-500">
                  هذا الاسم سيظهر للعملاء عند التواصل معهم
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="phone">رقم الجوال (اختياري)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-gray-400 hover:text-gray-600">
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <div className="space-y-2">
                        <p className="font-medium">رقمك الشخصي للتواصل الإداري (ليس رقم المتجر)</p>
                        <div className="space-y-1 text-xs">
                          <p className="text-green-600">✅ 0512345678</p>
                          <p className="text-green-600">✅ 0501234567</p>
                          <p className="text-green-600">✅ +966512345678</p>
                          <p className="text-red-600">❌ 512345678 (بدون 05)</p>
                          <p className="text-red-600">❌ 05-123-4567 (بفواصل)</p>
                        </div>
                        <p className="text-xs text-gray-400">سنستخدمه للتواصل معك بخصوص حسابك</p>
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

          {/* Step 2: WhatsApp Setup */}
          {currentStep === 2 && (
            <div className="space-y-6 py-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-green-600" />
                </div>
                <div className="flex items-center justify-center gap-2">
                  <h3 className="text-lg font-semibold">ربط رقم واتساب</h3>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-gray-400 hover:text-gray-600">
                        <HelpCircle className="w-5 h-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <div className="space-y-2">
                        <p className="font-medium">رقم متجرك الرسمي للرد التلقائي</p>
                        <div className="space-y-1 text-xs">
                          <p className="text-green-600">✅ رقم جديد غير مستخدم</p>
                          <p className="text-green-600">✅ رقم مخصص للمتجر فقط</p>
                          <p className="text-red-600">❌ رقمك الشخصي</p>
                          <p className="text-red-600">❌ رقم مستخدم في واتساب</p>
                        </div>
                        <p className="text-xs text-gray-400">يمكنك شراء رقم جديد من أي مزود خدمة</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-gray-600 max-w-md mx-auto">
                  لكي يتمكن ساري من استقبال الرسائل والرد على العملاء، نحتاج إلى ربط رقم واتساب خاص بمتجرك.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-blue-900">ما تحتاجه:</h4>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-blue-600 hover:text-blue-800">
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <div className="space-y-2">
                        <p className="font-medium">خطوات الربط الناجح:</p>
                        <div className="space-y-1 text-xs">
                          <p>📱 احصل على رقم جديد وفعّله</p>
                          <p>📲 افتح واتساب على جهازك</p>
                          <p>🔒 امسح QR code من الموقع</p>
                          <p>✅ انتظر التفعيل (2-5 دقائق)</p>
                        </div>
                        <p className="text-xs text-gray-400">تأكد من اتصال إنترنت مستقر</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <ul className="space-y-1 text-sm text-blue-800">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>رقم جوال سعودي جديد (غير مستخدم في واتساب)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>جهاز الجوال معك لمسح رمز QR</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>5 دقائق فقط لإكمال الربط</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={handleWhatsAppSetup}
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <MessageSquare className="ml-2 w-5 h-5" />
                ابدأ ربط واتساب
              </Button>

              <p className="text-center text-sm text-gray-500">
                يمكنك تخطي هذه الخطوة والعودة لها لاحقاً من الإعدادات
              </p>
            </div>
          )}

          {/* Step 3: Complete */}
          {currentStep === 3 && (
            <div className="space-y-6 py-6">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold">كل شيء جاهز! 🎉</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  تم إعداد حسابك بنجاح. يمكنك الآن البدء في استخدام ساري لإدارة متجرك على واتساب.
                </p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-blue-900">الخطوات التالية:</h4>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-blue-600 hover:text-blue-800">
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <div className="space-y-2">
                        <p className="font-medium">الخطوات المقترحة للبدء:</p>
                        <div className="space-y-1 text-xs">
                          <p>📦 أضف 5-10 منتجات على الأقل</p>
                          <p>📱 اربط واتساب إن لم تفعل</p>
                          <p>✅ جرّب إرسال رسالة تجريبية</p>
                          <p>🚀 ابدأ استقبال العملاء!</p>
                        </div>
                        <p className="text-xs text-gray-400">يمكنك البدء بأي خطوة من لوحة التحكم</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm flex-shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium">أضف منتجاتك</p>
                      <p className="text-sm text-gray-600">ابدأ بإضافة منتجاتك أو استيرادها من ملف CSV</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm flex-shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium">اربط واتساب (إن لم تفعل)</p>
                      <p className="text-sm text-gray-600">اربط رقم واتساب لبدء استقبال الطلبات</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm flex-shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium">ابدأ البيع!</p>
                      <p className="text-sm text-gray-600">ساري سيرد على عملائك ويستقبل الطلبات تلقائياً</p>
                    </div>
                  </div>
                </div>
              </div>
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
