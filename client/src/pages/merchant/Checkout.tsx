import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CreditCard, Loader2, Tag, X } from "lucide-react";
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
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  const validateCouponMutation = trpc.coupon.validate.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        setAppliedCoupon(data.coupon);
        toast.success(t('checkoutPage.text0'));
      } else {
        toast.error(data.message || t('checkoutPage.text26'));
      }
      setIsValidatingCoupon(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsValidatingCoupon(false);
    },
  });

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error(t('checkoutPage.text1'));
      return;
    }
    setIsValidatingCoupon(true);
    await validateCouponMutation.mutateAsync({ code: couponCode });
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
  };

  // Calculate discount
  const basePrice = plan?.priceMonthly || 0;
  const tax = basePrice * 0.15;
  let discount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountType === 'percentage') {
      discount = basePrice * (appliedCoupon.discountValue / 100);
    } else {
      discount = appliedCoupon.discountValue;
    }
  }
  const finalPrice = basePrice - discount;
  const finalTax = finalPrice * 0.15;
  const totalPrice = finalPrice + finalTax;

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
                <span>{basePrice.toFixed(2)} ريال</span>
              </div>
              
              {appliedCoupon && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                  <span>الخصم ({appliedCoupon.code})</span>
                  <span>-{discount.toFixed(2)} ريال</span>
                </div>
              )}
              
              {appliedCoupon && (
                <div className="flex justify-between text-sm">
                  <span>{t('checkoutPage.text9')}</span>
                  <span>{finalPrice.toFixed(2)} ريال</span>
                </div>
              )}
              
              <div className="flex justify-between text-sm">
                <span>{t('checkoutPage.text11')}</span>
                <span>{finalTax.toFixed(2)} ريال</span>
              </div>
              
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>{t('checkoutPage.text13')}</span>
                <span className={appliedCoupon ? 'text-green-600 dark:text-green-400' : ''}>
                  {t('checkoutPage.text36', { var0: totalPrice.toFixed(2) })}
                </span>
              </div>
              
              {appliedCoupon && (
                <div className="text-xs text-muted-foreground text-center">
                  {t('checkoutPage.text37', { var0: discount.toFixed(2) })}
                </div>
              )}
            </div>

            {/* Coupon Input */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">{t('checkoutPage.text14')}</p>
              {!appliedCoupon ? (
                <div className="flex gap-2">
                  <Input
                    placeholder={t('checkoutPage.text15')}
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    disabled={isValidatingCoupon}
                  />
                  <Button
                    onClick={handleApplyCoupon}
                    disabled={isValidatingCoupon || !couponCode.trim()}
                    variant="outline"
                  >
                    {isValidatingCoupon ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Tag className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/20 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      {appliedCoupon.code}
                    </span>
                  </div>
                  <Button
                    onClick={handleRemoveCoupon}
                    variant="ghost"
                    size="sm"
                    className="h-auto p-1"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="font-medium text-sm">{t('checkoutPage.text16')}</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• {plan.conversationLimit} محادثة شهرياً</li>
                <li>• {plan.voiceMessageLimit === -1 ? 'رسائل صوتية غير محدودة' : t('checkoutPage.text34', { var0: plan.voiceMessageLimit })}</li>
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
            {enabledGateways.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  {t('checkoutPage.text29')}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('checkoutPage.text30')}
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
                    {t('checkoutPage.text31')}
                  </p>
                </div>
                <Badge>{t('checkoutPage.text22')}</Badge>
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
                    {t('checkoutPage.text32')}
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
