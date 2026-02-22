import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Users, 
  MessageSquare, 
  Package, 
  Send, 
  Bot, 
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';

export default function UsageDashboard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data: usage, isLoading } = trpc.usage.getCurrentUsage.useQuery();

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-48 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="container py-8">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('usageDashboardPage.text11')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getProgressColor = (percentage: number) => {
    if (percentage < 70) return 'bg-green-500';
    if (percentage < 90) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusIcon = (percentage: number) => {
    if (percentage < 70) return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    if (percentage < 90) return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    return <AlertCircle className="h-5 w-5 text-red-500" />;
  };

  const getStatusMessage = (percentage: number, name: string) => {
    if (percentage >= 100) return t('usageDashboardPage.text27', { var0: name });
    if (percentage >= 90) return t('usageDashboardPage.text28', { var0: percentage.toFixed(0) });
    if (percentage >= 70) return t('usageDashboardPage.text29', { var0: percentage.toFixed(0), var1: name });
    return t('usageDashboardPage.text30', { var0: percentage.toFixed(0) });
  };

  const usageItems = [
    {
      icon: Users,
      title: t('usageDashboardPage.text17'),
      current: usage.customers.current,
      max: usage.customers.max,
      percentage: usage.customers.percentage,
      description: t('usageDashboardPage.text18'),
    },
    {
      icon: MessageSquare,
      title: t('usageDashboardPage.text19'),
      current: usage.whatsappNumbers.current,
      max: usage.whatsappNumbers.max,
      percentage: usage.whatsappNumbers.percentage,
      description: t('usageDashboardPage.text20'),
    },
    {
      icon: Package,
      title: t('usageDashboardPage.text21'),
      current: usage.products.current,
      max: usage.products.max,
      percentage: usage.products.percentage,
      description: t('usageDashboardPage.text22'),
    },
    {
      icon: Send,
      title: t('usageDashboardPage.text23'),
      current: usage.campaigns.current,
      max: usage.campaigns.max,
      percentage: usage.campaigns.percentage,
      description: t('usageDashboardPage.text24'),
    },
    {
      icon: Bot,
      title: t('usageDashboardPage.text25'),
      current: usage.aiMessages.current,
      max: usage.aiMessages.max,
      percentage: usage.aiMessages.percentage,
      description: t('usageDashboardPage.text26'),
    },
  ];

  const hasWarnings = usageItems.some(item => item.percentage >= 80);

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('usageDashboardPage.text0')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('usageDashboardPage.text31', { var0: usage.plan.name })}
          </p>
        </div>
        <Button onClick={() => setLocation('/merchant/subscription/compare')}>
          <TrendingUp className="ml-2 h-4 w-4" />
          {t('usageDashboardPage.text12')}
        </Button>
      </div>

      {/* Warning Alert */}
      {hasWarnings && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('usageDashboardPage.text13')}
            <Button 
              size="sm" 
              variant="outline" 
              className="mr-4"
              onClick={() => setLocation('/merchant/subscription/compare')}
            >
              {t('usageDashboardPage.text14')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Usage Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {usageItems.map((item) => {
          const Icon = item.icon;
          const isUnlimited = item.max === 999999;
          const percentage = Math.min(100, item.percentage);
          
          return (
            <Card key={item.title} className={percentage >= 90 ? 'border-red-500' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                  </div>
                  {getStatusIcon(percentage)}
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Numbers */}
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold">{item.current.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground">
                    / {isUnlimited ? 'غير محدود' : item.max.toLocaleString()}
                  </span>
                </div>

                {/* Progress Bar */}
                {!isUnlimited && (
                  <>
                    <div className="relative">
                      <Progress value={percentage} className="h-2" />
                      <div 
                        className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor(percentage)}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    {/* Status Message */}
                    <p className={`text-sm ${
                      percentage >= 90 ? 'text-red-500 font-semibold' :
                      percentage >= 70 ? 'text-yellow-600' :
                      'text-muted-foreground'
                    }`}>
                      {getStatusMessage(percentage, item.title)}
                    </p>

                    {/* Remaining */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>المتبقي: {(item.max - item.current).toLocaleString()}</span>
                      <span>{percentage.toFixed(1)}%</span>
                    </div>
                  </>
                )}

                {isUnlimited && (
                  <p className="text-sm text-green-600 font-medium">
                    {t('usageDashboardPage.text32')}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Plan Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('usageDashboardPage.text2')}</CardTitle>
          <CardDescription>{t('usageDashboardPage.text3')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold">{usage.plan.name}</h3>
              <p className="text-sm text-muted-foreground">
                {usage.plan.billingCycle === 'monthly' ? 'اشتراك شهري' : 
                 usage.plan.billingCycle === 'yearly' ? t('usageDashboardPage.text9') : t('usageDashboardPage.text10')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => setLocation('/merchant/subscription')}
              >
                {t('usageDashboardPage.text15')}
              </Button>
              <Button onClick={() => setLocation('/merchant/subscription/compare')}>
                <TrendingUp className="ml-2 h-4 w-4" />
                {t('usageDashboardPage.text16')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('usageDashboardPage.text4')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>{t('usageDashboardPage.text5')}</li>
            <li>{t('usageDashboardPage.text6')}</li>
            <li>{t('usageDashboardPage.text7')}</li>
            <li>{t('usageDashboardPage.text8')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
