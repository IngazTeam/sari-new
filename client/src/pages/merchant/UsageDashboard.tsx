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

export default function UsageDashboard() {
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
            لا يمكن تحميل بيانات الاستخدام. يرجى المحاولة لاحقاً.
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
    if (percentage >= 100) return `وصلت إلى الحد الأقصى من ${name}`;
    if (percentage >= 90) return `اقتربت من الحد الأقصى (${percentage.toFixed(0)}%)`;
    if (percentage >= 70) return `استهلكت ${percentage.toFixed(0)}% من ${name}`;
    return `استخدام جيد (${percentage.toFixed(0)}%)`;
  };

  const usageItems = [
    {
      icon: Users,
      title: 'العملاء',
      current: usage.customers.current,
      max: usage.customers.max,
      percentage: usage.customers.percentage,
      description: 'عدد العملاء المسجلين',
    },
    {
      icon: MessageSquare,
      title: 'أرقام الواتساب',
      current: usage.whatsappNumbers.current,
      max: usage.whatsappNumbers.max,
      percentage: usage.whatsappNumbers.percentage,
      description: 'الأرقام المربوطة',
    },
    {
      icon: Package,
      title: 'المنتجات',
      current: usage.products.current,
      max: usage.products.max,
      percentage: usage.products.percentage,
      description: 'المنتجات المضافة',
    },
    {
      icon: Send,
      title: 'الحملات الشهرية',
      current: usage.campaigns.current,
      max: usage.campaigns.max,
      percentage: usage.campaigns.percentage,
      description: 'الحملات هذا الشهر',
    },
    {
      icon: Bot,
      title: 'رسائل AI',
      current: usage.aiMessages.current,
      max: usage.aiMessages.max,
      percentage: usage.aiMessages.percentage,
      description: 'الرسائل الذكية هذا الشهر',
    },
  ];

  const hasWarnings = usageItems.some(item => item.percentage >= 80);

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">لوحة تحكم الاستخدام</h1>
          <p className="text-muted-foreground mt-1">
            تتبع استهلاكك من ميزات باقة {usage.plan.name}
          </p>
        </div>
        <Button onClick={() => setLocation('/merchant/subscription/compare')}>
          <TrendingUp className="ml-2 h-4 w-4" />
          ترقية الباقة
        </Button>
      </div>

      {/* Warning Alert */}
      {hasWarnings && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            أنت تقترب من حدود باقتك الحالية. ننصح بالترقية لتجنب انقطاع الخدمة.
            <Button 
              size="sm" 
              variant="outline" 
              className="mr-4"
              onClick={() => setLocation('/merchant/subscription/compare')}
            >
              عرض الباقات
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
                    ✓ استخدام غير محدود
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
          <CardTitle>معلومات الباقة</CardTitle>
          <CardDescription>باقتك الحالية ومميزاتها</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold">{usage.plan.name}</h3>
              <p className="text-sm text-muted-foreground">
                {usage.plan.billingCycle === 'monthly' ? 'اشتراك شهري' : 
                 usage.plan.billingCycle === 'yearly' ? 'اشتراك سنوي' : 
                 'اشتراك لمرة واحدة'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => setLocation('/merchant/subscription')}
              >
                إدارة الاشتراك
              </Button>
              <Button onClick={() => setLocation('/merchant/subscription/compare')}>
                <TrendingUp className="ml-2 h-4 w-4" />
                ترقية الباقة
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips Card */}
      <Card>
        <CardHeader>
          <CardTitle>نصائح لتحسين الاستخدام</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>راجع قائمة العملاء بانتظام وأرشف العملاء غير النشطين</li>
            <li>استخدم الرسائل الجماعية بدلاً من الحملات الفردية لتوفير الحصة</li>
            <li>قم بالترقية قبل الوصول للحد الأقصى لتجنب انقطاع الخدمة</li>
            <li>استفد من التقارير والإحصائيات لفهم أنماط الاستخدام</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
