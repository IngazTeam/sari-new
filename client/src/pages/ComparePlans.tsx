import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function ComparePlans() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  // Fetch all plans
  const { data: plans, isLoading: plansLoading } = trpc.subscriptionPlans.list.useQuery();

  // Fetch current subscription
  const { data: currentSubscription } = trpc.subscriptions.getCurrentSubscription.useQuery();

  // Upgrade/downgrade mutation
  const upgradeMutation = trpc.subscriptions.upgradeSubscription.useMutation({
    onSuccess: () => {
      toast.success(t('comparePlansPage.text0'));
      setLocation('/merchant/subscription');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تحديث الباقة');
    },
  });

  const handleSelectPlan = (planId: number) => {
    if (!currentSubscription) {
      toast.error(t('comparePlansPage.text1'));
      return;
    }

    if (planId === currentSubscription.planId) {
      toast.info(t('comparePlansPage.text2'));
      return;
    }

    setSelectedPlanId(planId);
    upgradeMutation.mutate({ newPlanId: planId });
  };

  if (plansLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">{t('comparePlansPage.text3')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sort plans by price
  const sortedPlans = [...plans].sort((a, b) => a.price - b.price);

  // Define features to compare
  const features = [
    { key: 'maxCustomers', label: 'عدد العملاء', format: (val: number) => val === 999999 ? 'غير محدود' : val.toLocaleString() },
    { key: 'maxWhatsAppNumbers', label: 'أرقام الواتساب', format: (val: number) => val === 999999 ? 'غير محدود' : val.toLocaleString() },
    { key: 'maxProducts', label: 'عدد المنتجات', format: (val: number) => val === 999999 ? 'غير محدود' : val.toLocaleString() },
    { key: 'maxCampaignsPerMonth', label: 'الحملات الشهرية', format: (val: number) => val === 999999 ? 'غير محدود' : val.toLocaleString() },
    { key: 'aiMessagesPerMonth', label: 'رسائل AI شهرياً', format: (val: number) => val === 999999 ? 'غير محدود' : val.toLocaleString() },
    { key: 'supportLevel', label: 'مستوى الدعم', format: (val: string) => {
      const levels: Record<string, string> = {
        email: 'بريد إلكتروني',
        chat: 'محادثة مباشرة',
        priority: 'دعم أولوية',
        dedicated: 'دعم مخصص 24/7',
      };
      return levels[val] || val;
    }},
    { key: 'hasAnalytics', label: 'التحليلات والتقارير', format: (val: boolean) => val },
    { key: 'hasAutomation', label: 'الأتمتة', format: (val: boolean) => val },
    { key: 'hasCalendarIntegration', label: 'تكامل التقويم', format: (val: boolean) => val },
    { key: 'hasSheetsIntegration', label: 'تكامل Sheets', format: (val: boolean) => val },
    { key: 'hasLoyaltyProgram', label: 'برنامج الولاء', format: (val: boolean) => val },
    { key: 'hasABTesting', label: 'اختبار A/B', format: (val: boolean) => val },
    { key: 'hasCustomBranding', label: 'علامة تجارية مخصصة', format: (val: boolean) => val },
    { key: 'hasApiAccess', label: 'الوصول لـ API', format: (val: boolean) => val },
  ];

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{t('comparePlansPage.text4')}</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          اختر الباقة المناسبة لاحتياجات عملك. يمكنك الترقية أو التخفيض في أي وقت.
        </p>
      </div>

      {/* Current Plan Badge */}
      {currentSubscription && (
        <div className="mb-8 text-center">
          <Badge variant="secondary" className="text-lg px-4 py-2">
            باقتك الحالية: {sortedPlans.find(p => p.id === currentSubscription.planId)?.name}
          </Badge>
        </div>
      )}

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="p-4 text-right font-semibold bg-muted/50 sticky right-0 z-10">
                الميزة
              </th>
              {sortedPlans.map((plan) => (
                <th key={plan.id} className="p-4 text-center min-w-[200px]">
                  <Card className={`${
                    currentSubscription?.planId === plan.id 
                      ? 'border-primary border-2 shadow-lg' 
                      : ''
                  }`}>
                    <CardHeader>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        {plan.isPopular && (
                          <Badge variant="default" className="gap-1">
                            <Sparkles className="h-3 w-3" />
                            الأكثر شعبية
                          </Badge>
                        )}
                        {currentSubscription?.planId === plan.id && (
                          <Badge variant="secondary">{t('comparePlansPage.text5')}</Badge>
                        )}
                      </div>
                      <CardTitle className="text-2xl">{plan.name}</CardTitle>
                      <CardDescription className="text-sm min-h-[40px]">
                        {plan.description}
                      </CardDescription>
                      <div className="mt-4">
                        <div className="text-3xl font-bold">
                          {plan.price === 0 ? 'مجاناً' : `${plan.price.toLocaleString()} ر.س`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {plan.billingCycle === 'monthly' ? 'شهرياً' : 
                           plan.billingCycle === 'yearly' ? 'سنوياً' : 
                           'لمرة واحدة'}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button
                        className="w-full"
                        variant={currentSubscription?.planId === plan.id ? 'outline' : 'default'}
                        disabled={
                          currentSubscription?.planId === plan.id ||
                          !plan.isActive ||
                          upgradeMutation.isPending
                        }
                        onClick={() => handleSelectPlan(plan.id)}
                      >
                        {upgradeMutation.isPending && selectedPlanId === plan.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin ml-2" />
                            جاري التحديث...
                          </>
                        ) : currentSubscription?.planId === plan.id ? (
                          'الباقة الحالية'
                        ) : (
                          <>
                            اختر هذه الباقة
                            <ArrowRight className="h-4 w-4 mr-2" />
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature, idx) => (
              <tr key={feature.key} className={`border-b ${idx % 2 === 0 ? 'bg-muted/20' : ''}`}>
                <td className="p-4 font-medium sticky right-0 z-10 bg-background">
                  {feature.label}
                </td>
                {sortedPlans.map((plan) => {
                  const value = (plan as any)[feature.key];
                  const formattedValue = feature.format(value);
                  
                  return (
                    <td key={plan.id} className="p-4 text-center">
                      {typeof formattedValue === 'boolean' ? (
                        formattedValue ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-muted-foreground mx-auto" />
                        )
                      ) : (
                        <span className="font-medium">{formattedValue}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom CTA */}
      <div className="mt-12 text-center">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6">
            <h3 className="text-xl font-semibold mb-2">{t('comparePlansPage.text6')}</h3>
            <p className="text-muted-foreground mb-4">
              تواصل مع فريق الدعم للحصول على استشارة مجانية
            </p>
            <Button variant="outline" onClick={() => setLocation('/merchant/subscription')}>
              العودة إلى صفحة الاشتراك
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
