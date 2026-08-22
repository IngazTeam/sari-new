import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock3, Loader2, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useRef } from "react";
import { useTranslation } from 'react-i18next';
import { PAYMENT_PROVIDER_REFERENCE_PATTERN } from '@shared/subscription-payment-status';

const MAX_LEGACY_STATUS_POLLS = 30;

export default function PaymentSuccess() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split('?')[1]);
  const subscriptionId = Number.parseInt(params.get('subscriptionId') || '0', 10);
  const transactionId = params.get('tap_id') || params.get('token') || '';
  const pollCount = useRef(0);
  const validReference = Number.isSafeInteger(subscriptionId)
    && subscriptionId > 0
    && PAYMENT_PROVIDER_REFERENCE_PATTERN.test(transactionId);
  const paymentStatus = trpc.subscriptionPayments.verifyPayment.useQuery(
    { subscriptionId, transactionId },
    {
      enabled: validReference,
      retry: false,
      refetchInterval: query => {
        pollCount.current += 1;
        const result = query.state.data?.status;
        return pollCount.current >= MAX_LEGACY_STATUS_POLLS || result === 'completed' || result === 'failed'
          ? false
          : 2000;
      },
      refetchIntervalInBackground: false,
    },
  );

  if (validReference && paymentStatus.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Loader2 className="h-16 w-16 animate-spin mx-auto text-primary" />
            <h2 className="text-2xl font-bold">{t('paymentSuccessPage.text0')}</h2>
            <p className="text-muted-foreground">
              {t('paymentSuccessPage.text3')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completed = paymentStatus.data?.status === 'completed';
  const failed = !validReference || paymentStatus.data?.status === 'failed';

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-6">
          <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            {completed
              ? <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
              : failed
                ? <XCircle className="h-12 w-12 text-destructive" />
                : <Clock3 className="h-12 w-12 text-amber-600" />}
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-2">
              {completed ? t('paymentSuccessPage.text1') : failed ? 'تعذر تأكيد الدفع' : 'الدفع قيد التأكيد'}
            </h2>
            <p className="text-muted-foreground">
              {completed
                ? t('paymentSuccessPage.text4')
                : failed
                  ? 'الرابط غير صالح أو تعذر قراءة العملية. لم يتم تغيير اشتراكك.'
                  : paymentStatus.isError
                    ? 'تعذر تحديث الحالة مؤقتًا. سنحاول تلقائيًا، ولا تُعد الدفع الآن.'
                    : 'ننتظر إشعار مزود الدفع الموقّع. لا تُعد الدفع الآن، وراجع الاشتراك بعد قليل.'}
            </p>
          </div>

          <div className="bg-muted p-4 rounded-lg text-right">
            <p className="text-sm text-muted-foreground mb-2">{t('paymentSuccessPage.text2')}</p>
            <p className="font-mono font-bold">#{subscriptionId}</p>
          </div>

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => setLocation('/merchant/subscriptions')}
            >
              {t('paymentSuccessPage.text5')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation('/merchant/dashboard')}
            >
              {t('paymentSuccessPage.text6')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t('paymentSuccessPage.text7')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
