import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from 'react-i18next';

export default function PaymentCancel() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split('?')[1]);
  const subscriptionId = params.get('subscriptionId');

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-6">
          <div className="bg-red-100 dark:bg-red-950 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <XCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-2">{t('paymentCancelPage.text0')}</h2>
            <p className="text-muted-foreground">
              {t('paymentCancelPage.text2')}
            </p>
          </div>

          {subscriptionId && (
            <div className="bg-muted p-4 rounded-lg text-right">
              <p className="text-sm text-muted-foreground mb-2">{t('paymentCancelPage.text1')}</p>
              <p className="font-mono font-bold">#{subscriptionId}</p>
            </div>
          )}

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => setLocation('/merchant/subscriptions')}
            >
              {t('paymentCancelPage.text3')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation('/merchant/dashboard')}
            >
              {t('paymentCancelPage.text4')}
            </Button>
          </div>

          <div className="bg-primary/10 dark:bg-blue-950 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-primary dark:text-blue-200 mb-2">
              {t('paymentCancelPage.text5')}
            </p>
            <p className="text-xs text-primary dark:text-blue-300">
              {t('paymentCancelPage.text6')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
