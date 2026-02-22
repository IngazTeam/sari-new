import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

export default function SubscriptionPlans() {
  const [, setLocation] = useLocation();
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const { data: plans, isLoading } = trpc.subscriptionPlans.listPlans.useQuery();
  const { data: currentSubscription } = trpc.merchantSubscription.getCurrentSubscription.useQuery();
  const subscribe = trpc.merchantSubscription.subscribe.useMutation();

  const handleSubscribe = async (planId: number) => {
    try {
      const result = await subscribe.mutateAsync({
        planId,
        billingCycle: selectedPeriod,
      });

      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
      } else {
        toast.success('تم الاشتراك بنجاح!');
        setLocation('/merchant/subscription');
      }
    } catch (error: any) {
      toast.error(error.message || 'فشل الاشتراك في الباقة');
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-96 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Calculate trial status
  const isTrial = currentSubscription?.status === 'trial';
  const isExpired = currentSubscription?.status === 'expired';
  const isActive = currentSubscription?.status === 'active';
  const daysRemaining = currentSubscription?.daysRemaining ?? 0;

  return (
    <div className="container py-8">
      <div className="text-right mb-8">
        <h1 className="text-4xl font-bold mb-2">اختر الباقة المناسبة لك</h1>
        <p className="text-muted-foreground text-lg">
          {isTrial
            ? `أنت في الفترة التجريبية — متبقي ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : daysRemaining === 2 ? 'يومين' : 'أيام'}`
            : 'اشترك في إحدى الباقات لتفعيل جميع الميزات'}
        </p>
      </div>

      {/* Period Toggle */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex rounded-lg border p-1">
          <Button
            variant={selectedPeriod === 'monthly' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedPeriod('monthly')}
          >
            شهري
          </Button>
          <Button
            variant={selectedPeriod === 'yearly' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedPeriod('yearly')}
          >
            سنوي
            <Badge variant="secondary" className="mr-2">وفّر 20%</Badge>
          </Button>
        </div>
      </div>

      {/* Trial Status Banner */}
      {isTrial && (
        <Card className="mb-8 border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-blue-900">🎁 أنت في الفترة التجريبية المجانية</CardTitle>
            </div>
            <CardDescription className="text-blue-700 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              متبقي {daysRemaining} {daysRemaining === 1 ? 'يوم' : daysRemaining === 2 ? 'يومين' : 'أيام'} — اشترك الآن لضمان الاستمرارية
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Expired Trial Banner */}
      {isExpired && (
        <Card className="mb-8 border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <CardTitle className="text-red-900">⏰ انتهت الفترة التجريبية</CardTitle>
            </div>
            <CardDescription className="text-red-700">
              اشترك الآن في إحدى الباقات لمتابعة استخدام جميع ميزات ساري
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Plans Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan) => {
          const price = selectedPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
          const isCurrentPlan = currentSubscription?.planId === plan.id;
          const features = plan.features ? JSON.parse(plan.features) : [];

          return (
            <Card
              key={plan.id}
              className={`relative ${isCurrentPlan ? 'border-primary shadow-lg' : ''}`}
            >
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary">الباقة الحالية</Badge>
                </div>
              )}

              <CardHeader>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Price */}
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{price}</span>
                    <span className="text-muted-foreground">{plan.currency}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedPeriod === 'monthly' ? 'شهرياً' : 'سنوياً'}
                  </p>
                </div>

                {/* Main Feature */}
                <div className="p-4 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">الحد الأقصى للعملاء</p>
                  <p className="text-2xl font-bold">{plan.maxCustomers.toLocaleString()} عميل</p>
                </div>

                {/* Features List */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">{plan.maxWhatsAppNumbers} رقم واتساب</span>
                  </div>
                  {features.map((feature: string, index: number) => (
                    <div key={index} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={isCurrentPlan ? 'outline' : 'default'}
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isCurrentPlan || subscribe.isPending}
                >
                  {isCurrentPlan ? 'الباقة الحالية' : subscribe.isPending ? 'جاري الاشتراك...' : 'اشترك الآن'}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Additional Info */}
      <div className="mt-12 text-right text-sm text-muted-foreground">
        <p>جميع الباقات تشمل:</p>
        <p className="mt-2">
          ردود ذكية بالذكاء الاصطناعي • إدارة المنتجات • الحملات التسويقية • التقارير والإحصائيات • الدعم الفني
        </p>
      </div>
    </div>
  );
}
