import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { PhoneInput } from '@/components/ui/phone-input';
import { useTranslation } from 'react-i18next';

export default function SubscribePage() {
  const { t } = useTranslation();
  const [, params] = useRoute('/subscribe/:planId');
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<'plan' | 'auth' | 'billing'>('plan');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(
    params?.planId ? parseInt(params.planId) : null
  );
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isNewUser, setIsNewUser] = useState(true);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch plans
  const { data: plans, isLoading: plansLoading } = trpc.subscriptionPlans.listPlans.useQuery();

  // Get selected plan details
  const selectedPlan = plans?.find(p => p.id === selectedPlanId);

  // Calculate price
  const price = selectedPlan
    ? billingCycle === 'monthly'
      ? parseFloat(selectedPlan.monthlyPrice)
      : parseFloat(selectedPlan.yearlyPrice)
    : 0;

  // Auto-advance to auth step if plan is pre-selected
  useEffect(() => {
    if (selectedPlanId && step === 'plan') {
      setStep('auth');
    }
  }, [selectedPlanId, step]);

  // Parse features
  const parseFeatures = (featuresStr: string | null): string[] => {
    if (!featuresStr) return [];
    try {
      const parsed = JSON.parse(featuresStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // Handle plan selection
  const handlePlanSelect = (planId: number) => {
    setSelectedPlanId(planId);
    setStep('auth');
  };

  // Mutations
  const registerMutation = trpc.subscriptionSignup.registerUser.useMutation();
  const createSubscriptionMutation = trpc.subscriptionSignup.createSubscriptionWithPayment.useMutation();

  // Handle authentication and subscription creation
  const handleSubscribe = async () => {
    if (!selectedPlanId) {
      toast({
        title: 'خطأ',
        description: 'الرجاء اختيار باقة',
        variant: 'destructive',
      });
      return;
    }

    if (!email || !password) {
      toast({
        title: 'خطأ',
        description: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور',
        variant: 'destructive',
      });
      return;
    }

    if (isNewUser && (!businessName || !phone)) {
      toast({
        title: 'خطأ',
        description: 'الرجاء إدخال جميع البيانات المطلوبة',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Register or Login
      let userId: number;

      if (isNewUser) {
        // Register new user
        const registerResult = await registerMutation.mutateAsync({
          email,
          password,
          businessName,
          phone,
        });
        userId = registerResult.userId;
      } else {
        // For existing users, we need to login first
        // Since we're using Manus OAuth, redirect to login
        const loginUrl = `${process.env.VITE_OAUTH_PORTAL_URL || ''}/login?redirect=${encodeURIComponent(window.location.href)}`;
        window.location.href = loginUrl;
        return;
      }

      // Step 2: Create subscription with payment
      const subscriptionResult = await createSubscriptionMutation.mutateAsync({
        planId: selectedPlanId,
        billingCycle,
        userId,
      });

      // Step 3: Redirect to Tap Payment
      if (subscriptionResult.paymentUrl) {
        window.location.href = subscriptionResult.paymentUrl;
      } else {
        throw new Error('لم يتم الحصول على رابط الدفع');
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      toast({
        title: 'خطأ',
        description: error.message || 'حدث خطأ أثناء إنشاء الاشتراك',
        variant: 'destructive',
      });
      setIsProcessing(false);
    }
  };

  if (plansLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="container py-20">
        {/* Progress Indicator */}
        <div className="max-w-3xl mx-auto mb-12">
          <div className="flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 ${step === 'plan' ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'plan' ? 'bg-primary text-white' : 'bg-muted'}`}>
                1
              </div>
              <span className="text-sm font-medium">{t('subscribePagePage.text0')}</span>
            </div>
            <div className="w-16 h-0.5 bg-muted" />
            <div className={`flex items-center gap-2 ${step === 'auth' ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'auth' ? 'bg-primary text-white' : 'bg-muted'}`}>
                2
              </div>
              <span className="text-sm font-medium">{t('subscribePagePage.text1')}</span>
            </div>
            <div className="w-16 h-0.5 bg-muted" />
            <div className={`flex items-center gap-2 ${step === 'billing' ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'billing' ? 'bg-primary text-white' : 'bg-muted'}`}>
                3
              </div>
              <span className="text-sm font-medium">{t('subscribePagePage.text2')}</span>
            </div>
          </div>
        </div>

        {/* Step 1: Plan Selection */}
        {step === 'plan' && (
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold mb-4">{t('subscribePagePage.text3')}</h1>
              <p className="text-lg text-muted-foreground">
                ابدأ رحلتك مع ساري واختر الباقة التي تناسب احتياجاتك
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {plans?.map((plan, index) => {
                const features = parseFeatures(plan.features);
                const isPopular = plans.length === 3 && index === 1;

                return (
                  <Card
                    key={plan.id}
                    className={`relative border-2 ${isPopular
                      ? 'border-primary shadow-xl scale-105'
                      : 'border-border hover:border-primary/30'
                      } transition-all cursor-pointer`}
                    onClick={() => handlePlanSelect(plan.id)}
                  >
                    {isPopular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <div className="bg-primary text-white px-4 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                          <Sparkles className="w-4 h-4" />
                          الأكثر شعبية
                        </div>
                      </div>
                    )}

                    <CardHeader className="text-center space-y-4 pt-8">
                      <div>
                        <h3 className="text-2xl font-bold">{plan.name}</h3>
                        <p className="text-sm text-muted-foreground">{plan.nameEn}</p>
                      </div>
                      <div>
                        <div className="flex items-baseline justify-center gap-2">
                          <span className="text-5xl font-bold">{plan.monthlyPrice}</span>
                          <span className="text-muted-foreground">{plan.currency}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{t('subscribePagePage.text4')}</p>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-6">
                      <ul className="space-y-3">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{plan.maxCustomers} محادثة شهرياً</span>
                        </li>

                        {features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <Button
                        className="w-full"
                        variant={isPopular ? 'default' : 'outline'}
                        size="lg"
                      >
                        اختر هذه الباقة
                        <ArrowRight className="mr-2 w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Authentication */}
        {step === 'auth' && selectedPlan && (
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold text-center">{t('subscribePagePage.text5')}</h2>
                <p className="text-center text-muted-foreground">
                  الباقة المختارة: <span className="font-semibold text-foreground">{selectedPlan.name}</span>
                </p>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Auth Type Toggle */}
                <div className="flex items-center justify-center gap-4 p-1 bg-muted rounded-lg">
                  <button
                    className={`flex-1 py-2 px-4 rounded-md transition-colors ${isNewUser ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                      }`}
                    onClick={() => setIsNewUser(true)}
                  >
                    حساب جديد
                  </button>
                  <button
                    className={`flex-1 py-2 px-4 rounded-md transition-colors ${!isNewUser ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                      }`}
                    onClick={() => setIsNewUser(false)}
                  >
                    لدي حساب
                  </button>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">{t('subscribePagePage.text6')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@domain.com"
                    dir="ltr"
                  />
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">{t('subscribePagePage.text7')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                  />
                </div>

                {/* New User Fields */}
                {isNewUser && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="businessName">{t('subscribePagePage.text8')}</Label>
                      <Input
                        id="businessName"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder={t('subscribePagePage.text9')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">{t('subscribePagePage.text10')}</Label>
                      <PhoneInput
                        value={phone}
                        onChange={setPhone}
                        required
                      />
                    </div>
                  </>
                )}

                {/* Billing Cycle */}
                <div className="space-y-2">
                  <Label>{t('subscribePagePage.text11')}</Label>
                  <RadioGroup value={billingCycle} onValueChange={(v) => setBillingCycle(v as 'monthly' | 'yearly')}>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="monthly" id="monthly" />
                      <Label htmlFor="monthly" className="cursor-pointer">
                        شهري - {selectedPlan.monthlyPrice} {selectedPlan.currency}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="yearly" id="yearly" />
                      <Label htmlFor="yearly" className="cursor-pointer">
                        سنوي - {selectedPlan.yearlyPrice} {selectedPlan.currency}
                        <span className="mr-2 text-green-600 text-sm">(وفر {Math.round((1 - parseFloat(selectedPlan.yearlyPrice) / (parseFloat(selectedPlan.monthlyPrice) * 12)) * 100)}%)</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Summary */}
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('subscribePagePage.text12')}</span>
                    <span className="font-semibold">{selectedPlan.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('subscribePagePage.text13')}</span>
                    <span className="font-semibold">{billingCycle === 'monthly' ? 'شهري' : 'سنوي'}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t">
                    <span>{t('subscribePagePage.text14')}</span>
                    <span>{price.toFixed(2)} {selectedPlan.currency}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setStep('plan')}
                    className="flex-1"
                    disabled={isProcessing}
                  >
                    رجوع
                  </Button>
                  <Button
                    onClick={handleSubscribe}
                    className="flex-1"
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="ml-2 w-4 h-4 animate-spin" />
                        جاري المعالجة...
                      </>
                    ) : (
                      <>
                        متابعة للدفع
                        <ArrowRight className="mr-2 w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
