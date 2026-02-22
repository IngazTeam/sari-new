import { ReactNode } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, AlertCircle } from 'lucide-react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';

interface SubscriptionGuardProps {
  children: ReactNode;
  feature?: string;
  fallbackMessage?: string;
}

export function SubscriptionGuard({ 
  children, 
  feature = 'هذه الميزة',
  fallbackMessage 
}: SubscriptionGuardProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data: status, isLoading } = trpc.merchantSubscription.checkStatus.useQuery();

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!status?.isActive) {
    return (
      <div className="container py-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <Lock className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">{t('compSubscriptionGuardPage.text0')}</CardTitle>
            <CardDescription>
              {fallbackMessage || `يتطلب الوصول إلى ${feature} اشتراكاً نشطاً`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {status?.reason || 'لا يوجد اشتراك نشط. يرجى الاشتراك في باقة للوصول إلى هذه الميزة.'}
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button 
                onClick={() => setLocation('/merchant/subscription/plans')}
                className="flex-1"
              >
                عرض الباقات
              </Button>
              <Button 
                variant="outline"
                onClick={() => setLocation('/merchant/dashboard')}
                className="flex-1"
              >
                العودة للرئيسية
              </Button>
            </div>

            <div className="pt-4 text-center text-sm text-muted-foreground">
              <p>{t('compSubscriptionGuardPage.text1')}</p>
              <Button 
                variant="link" 
                size="sm"
                onClick={() => window.location.reload()}
              >
                تحديث الصفحة
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
