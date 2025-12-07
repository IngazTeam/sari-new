import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Zap, Rocket } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

import { useTranslation } from 'react-i18next';
export default function Subscriptions() {
  const { t } = useTranslation();

  const [, setLocation] = useLocation();
  const { data: currentPlan, isLoading: currentPlanLoading } = trpc.merchants.getCurrentPlan.useQuery();
  const { data: plans, isLoading: plansLoading } = trpc.plans.list.useQuery();
  const upgradeMutation = trpc.merchants.requestUpgrade.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (currentPlanLoading || plansLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-96 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activePlans = plans?.filter(p => p.isActive) || [];
  const currentPlanId = currentPlan?.plan?.id;

  const getPlanIcon = (index: number) => {
    const icons = [Crown, Zap, Rocket];
    return icons[index % icons.length];
  };

  const getPlanColor = (index: number) => {
    const colors = ['text-yellow-500', 'text-blue-500', 'text-purple-500'];
    return colors[index % colors.length];
  };

  const handleUpgrade = async (planId: number) => {
    if (currentPlanId === planId) {
      toast.info(t('toast.subscriptions.msg1'));
      return;
    }
    // Redirect to checkout page
    setLocation(`/merchant/checkout?planId=${planId}`);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">الباقات والاشتراكات</h1>
        <p className="text-muted-foreground mt-1">
          اختر الباقة المناسبة لاحتياجات عملك
        </p>
      </div>

      {/* Current Plan Info */}
      {currentPlan && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              باقتك الحالية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{currentPlan.plan?.nameAr}</p>
                <p className="text-muted-foreground mt-1">
                  {currentPlan.plan?.priceMonthly} ريال / شهرياً
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">الاستخدام الحالي</p>
                <p className="text-lg font-semibold">
                  {currentPlan.subscription.conversationsUsed} / {currentPlan.plan?.conversationLimit === -1 ? '∞' : currentPlan.plan?.conversationLimit} محادثة
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentPlan.subscription.voiceMessagesUsed} / {currentPlan.plan?.voiceMessageLimit === -1 ? '∞' : currentPlan.plan?.voiceMessageLimit} رسالة صوتية
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {activePlans.map((plan, index) => {
          const Icon = getPlanIcon(index);
          const colorClass = getPlanColor(index);
          const isCurrentPlan = currentPlanId === plan.id;
          const isUpgrade = currentPlan && plan.priceMonthly > (currentPlan.plan?.priceMonthly || 0);

          return (
            <Card key={plan.id} className={isCurrentPlan ? 'border-primary shadow-lg' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Icon className={`h-8 w-8 ${colorClass}`} />
                  {isCurrentPlan && (
                    <Badge variant="default">الباقة الحالية</Badge>
                  )}
                </div>
                <CardTitle className="text-2xl mt-4">{plan.nameAr}</CardTitle>
                <CardDescription>{plan.features || 'باقة شاملة لجميع احتياجاتك'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-4xl font-bold">{plan.priceMonthly}</span>
                  <span className="text-muted-foreground"> ريال / شهرياً</span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      {plan.conversationLimit === -1 ? 'محادثات غير محدودة' : `${plan.conversationLimit} محادثة شهرياً`}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      {plan.voiceMessageLimit === -1 ? 'رسائل صوتية غير محدودة' : `${plan.voiceMessageLimit} رسالة صوتية شهرياً`}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      حملات تسويقية غير محدودة
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      دعم فني على مدار الساعة
                    </span>
                  </div>
                  {index >= 1 && (
                    <div className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">
                        تحليلات متقدمة
                      </span>
                    </div>
                  )}
                  {index >= 2 && (
                    <div className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">
                        أولوية في الدعم الفني
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={isCurrentPlan ? 'outline' : isUpgrade ? 'default' : 'secondary'}
                  disabled={isCurrentPlan || upgradeMutation.isPending}
                  onClick={() => handleUpgrade(plan.id)}
                >
                  {isCurrentPlan ? 'الباقة الحالية' : isUpgrade ? 'ترقية الباقة' : 'اختيار الباقة'}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>مقارنة الباقات</CardTitle>
          <CardDescription>قارن بين الباقات المختلفة لاختيار الأنسب لك</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-right p-4 font-medium">الميزة</th>
                  {activePlans.map(plan => (
                    <th key={plan.id} className="text-center p-4 font-medium">
                      {plan.nameAr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-4">السعر الشهري</td>
                  {activePlans.map(plan => (
                    <td key={plan.id} className="text-center p-4 font-semibold">
                      {plan.priceMonthly} ريال
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-4">عدد المحادثات</td>
                  {activePlans.map(plan => (
                    <td key={plan.id} className="text-center p-4">
                      {plan.conversationLimit === -1 ? 'غير محدود' : plan.conversationLimit}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-4">الرسائل الصوتية</td>
                  {activePlans.map(plan => (
                    <td key={plan.id} className="text-center p-4">
                      {plan.voiceMessageLimit === -1 ? 'غير محدود' : plan.voiceMessageLimit}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-4">الحملات التسويقية</td>
                  {activePlans.map(plan => (
                    <td key={plan.id} className="text-center p-4">
                      <Check className="h-5 w-5 text-green-500 mx-auto" />
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-4">الدعم الفني</td>
                  {activePlans.map(plan => (
                    <td key={plan.id} className="text-center p-4">
                      <Check className="h-5 w-5 text-green-500 mx-auto" />
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-4">التحليلات المتقدمة</td>
                  {activePlans.map((plan, index) => (
                    <td key={plan.id} className="text-center p-4">
                      {index >= 1 ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-4">أولوية الدعم</td>
                  {activePlans.map((plan, index) => (
                    <td key={plan.id} className="text-center p-4">
                      {index >= 2 ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>الأسئلة الشائعة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-medium">هل يمكنني الترقية في أي وقت؟</p>
            <p className="text-sm text-muted-foreground mt-1">
              نعم، يمكنك الترقية إلى باقة أعلى في أي وقت وسيتم تطبيق التغيير فوراً.
            </p>
          </div>
          <div>
            <p className="font-medium">ماذا يحدث عند انتهاء الاشتراك؟</p>
            <p className="text-sm text-muted-foreground mt-1">
              سيتم تجديد اشتراكك تلقائياً ما لم تقم بإلغاء التجديد التلقائي من الإعدادات.
            </p>
          </div>
          <div>
            <p className="font-medium">هل يمكنني استرداد المبلغ؟</p>
            <p className="text-sm text-muted-foreground mt-1">
              نعم، يمكنك طلب استرداد المبلغ خلال 14 يوم من تاريخ الاشتراك.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
