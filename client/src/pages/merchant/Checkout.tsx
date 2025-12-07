import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useLocation } from "wouter";

import { useTranslation } from 'react-i18next';
export default function Checkout() {
  const { t } = useTranslation();

  const params = new URLSearchParams(window.location.search);
  const planIdStr = params.get('planId');
  const planId = parseInt(planIdStr || '0', 10);

  const { data: plan, isLoading: planLoading } = trpc.plans.getById.useQuery({ id: planId });
  const createSessionMutation = trpc.payments.createSession.useMutation({
    onSuccess: (data) => {
      if (data.paymentUrl) {
        // Redirect to payment gateway
        window.location.href = data.paymentUrl;
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const [selectedGateway, setSelectedGateway] = useState<'tap' | 'paypal' | null>(null);

  if (planLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">الباقة غير موجودة</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tap is always enabled
  const enabledGateways = [{ id: 1, gateway: 'tap' as const, testMode: true }];

  const handlePayment = async () => {
    if (!selectedGateway) {
      toast.error(t('toast.subscriptions.msg2'));
      return;
    }

    await createSessionMutation.mutateAsync({
      planId: plan.id,
      gateway: selectedGateway,
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إتمام الدفع</h1>
        <p className="text-muted-foreground mt-1">
          اختر طريقة الدفع المناسبة لك
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Order Summary */}
        <Card>
          <CardHeader>
            <CardTitle>ملخص الطلب</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">{plan.nameAr}</span>
                <Badge variant="default">{plan.name}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                اشتراك شهري
              </p>
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>السعر الشهري</span>
                <span>{plan.priceMonthly} ريال</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>الضريبة (15%)</span>
                <span>{(plan.priceMonthly * 0.15).toFixed(2)} ريال</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>المجموع</span>
                <span>{(plan.priceMonthly * 1.15).toFixed(2)} ريال</span>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="font-medium text-sm">الميزات المضمنة:</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• {plan.conversationLimit} محادثة شهرياً</li>
                <li>• {plan.voiceMessageLimit === -1 ? 'رسائل صوتية غير محدودة' : `${plan.voiceMessageLimit} رسالة صوتية`}</li>
                <li>• دعم فني على مدار الساعة</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle>طريقة الدفع</CardTitle>
            <CardDescription>اختر البوابة المناسبة لك</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {enabledGateways.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  لا توجد بوابات دفع متاحة حالياً
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  يرجى التواصل مع الدعم الفني
                </p>
              </div>
            )}

            <button
              onClick={() => setSelectedGateway('tap')}
              className={`w-full p-4 border-2 rounded-lg transition-all ${
                selectedGateway === 'tap'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <CreditCard className="h-6 w-6" />
                <div className="flex-1 text-right">
                  <p className="font-medium">Tap Payment</p>
                  <p className="text-sm text-muted-foreground">
                    الدفع بالبطاقات السعودية
                  </p>
                </div>
                <Badge>موصى به</Badge>
              </div>
            </button>

            <button
              onClick={() => setSelectedGateway('paypal')}
              className={`w-full p-4 border-2 rounded-lg transition-all ${
                selectedGateway === 'paypal'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 bg-[#0070ba] rounded flex items-center justify-center text-white text-xs font-bold">
                  PP
                </div>
                <div className="flex-1 text-right">
                  <p className="font-medium">PayPal</p>
                  <p className="text-sm text-muted-foreground">
                    الدفع الدولي
                  </p>
                </div>
              </div>
            </button>

            <Button
              className="w-full"
              size="lg"
              onClick={handlePayment}
              disabled={!selectedGateway || createSessionMutation.isPending}
            >
              {createSessionMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري التحويل...
                </>
              ) : (
                `ادفع ${(plan.priceMonthly * 1.15).toFixed(2)} ريال`
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              بالنقر على "ادفع"، أنت توافق على{' '}
              <a href="#" className="underline">شروط الخدمة</a>
              {' '}و{' '}
              <a href="#" className="underline">سياسة الخصوصية</a>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Security Notice */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="bg-green-100 dark:bg-green-950 p-2 rounded">
              <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium">دفع آمن ومشفر</p>
              <p className="text-sm text-muted-foreground mt-1">
                جميع المعاملات محمية بتشفير SSL. لا نقوم بتخزين معلومات بطاقتك الائتمانية.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
