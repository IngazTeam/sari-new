import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useTranslation } from 'react-i18next';
export default function Checkout() {
  const { t } = useTranslation();

  const params = new URLSearchParams(window.location.search);
  const planIdStr = params.get('planId');
  const planId = parseInt(planIdStr || '0', 10);

  const { data: plan, isLoading: planLoading } = trpc.plans.getById.useQuery({ id: planId });
  const createSessionMutation = trpc.subscriptionPayments.createSession.useMutation({
    onSuccess: (data: any) => {
      if (data.paymentUrl) {
        // Redirect to payment gateway
        window.location.href = data.paymentUrl;
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // The legacy plan price is the final VAT-inclusive amount. The server reads
  // the same persisted value when creating the Tap charge; no amount is sent
  // from the browser.
  const basePrice = plan?.priceMonthly || 0;
  const includedVat = basePrice * 15 / 115;
  const totalPrice = basePrice;

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
            <p className="text-center text-muted-foreground">{t('checkoutPage.text2')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handlePayment = async () => {
    await createSessionMutation.mutateAsync({
      planId: plan.id,
      gateway: 'tap',
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('checkoutPage.text3')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('checkoutPage.text27')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Order Summary */}
        <Card>
          <CardHeader>
            <CardTitle>{t('checkoutPage.text4')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">{plan.nameAr}</span>
                <Badge variant="default">{plan.name}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('checkoutPage.text28')}
              </p>
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('checkoutPage.text5')}</span>
                <span>{basePrice.toFixed(2)} {t('common.currency')}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span>{t('checkoutPage.vatIncluded', { defaultValue: 'ضريبة القيمة المضافة (مشمولة)' })}</span>
                <span>{includedVat.toFixed(2)} {t('common.currency')}</span>
              </div>
              
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>{t('checkoutPage.text13')}</span>
                <span>
                  {t('checkoutPage.text36', { var0: totalPrice.toFixed(2) })}
                </span>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="font-medium text-sm">{t('checkoutPage.text16')}</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• {t('checkoutPage.conversationsMonthly', { count: plan.conversationLimit })}</li>
                <li>• {plan.voiceMessageLimit === -1 ? t('checkoutPage.unlimitedVoice') : t('checkoutPage.text34', { var0: plan.voiceMessageLimit })}</li>
                <li>{t('checkoutPage.text19')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle>{t('checkoutPage.text20')}</CardTitle>
            <CardDescription>{t('checkoutPage.text21')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="w-full rounded-lg border-2 border-primary bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <CreditCard className="h-6 w-6" />
                <div className="flex-1 text-right">
                  <p className="font-medium">Tap Payment</p>
                  <p className="text-sm text-muted-foreground">
                    {t('checkoutPage.text31')}
                  </p>
                </div>
                <Badge>{t('checkoutPage.available', { defaultValue: 'متاح' })}</Badge>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handlePayment}
              disabled={createSessionMutation.isPending}
            >
              {createSessionMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  {t('checkoutPage.text33')}
                </>
              ) : (
                t('checkoutPage.text35', { var0: totalPrice.toFixed(2) })
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              {t('checkoutPage.text38', { var0: ' ' })}
              <a href="#" className="underline">{t('checkoutPage.text23')}</a>
              {t('checkoutPage.text39', { var0: ' ', var1: ' ' })}
              <a href="#" className="underline">{t('checkoutPage.text24')}</a>
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
              <p className="font-medium">{t('checkoutPage.text25')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('checkoutPage.text40')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
