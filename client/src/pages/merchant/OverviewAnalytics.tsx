import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ShoppingCart, 
  TrendingUp, 
  Star, 
  Users, 
  Package,
  DollarSign,
  BarChart3,
  AlertCircle
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

export default function OverviewAnalytics() {
  const [dateRange] = useState<{ start?: string; end?: string }>({});

  // Get current merchant
  const { data: merchant } = trpc.merchants.getCurrent.useQuery();
  const merchantId = merchant?.id || 0;

  // Fetch all analytics data
  const { data: abandonedCarts, isLoading: loadingCarts } = trpc.abandonedCarts.getStats.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  const { data: conversionRate, isLoading: loadingConversion } = trpc.messageAnalytics.getConversionRate.useQuery({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  const { data: referralStats, isLoading: loadingReferrals } = trpc.referrals.getStats.useQuery();

  const { data: orderStats, isLoading: loadingOrders } = trpc.orders.getStats.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  const isLoading = loadingCarts || loadingConversion || loadingReferrals || loadingOrders;

  // Calculate KPIs
  const totalRevenue = orderStats?.totalRevenue || 0;
  const totalOrders = orderStats?.total || 0;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const conversionPercentage = conversionRate?.rate || 0;
  const abandonedCartsCount = abandonedCarts?.totalAbandoned || 0;
  const recoveredCarts = abandonedCarts?.recovered || 0;
  const recoveryRate = abandonedCartsCount > 0 ? (recoveredCarts / abandonedCartsCount) * 100 : 0;
  // Review stats - to be implemented
  const averageRating = 0;
  const totalReviews = 0;
  const totalReferrals = referralStats?.totalReferrals || 0;
  const successfulReferrals = referralStats?.completedReferrals || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">نظرة عامة على الأداء</h1>
        <p className="text-muted-foreground mt-2">
          إحصائيات شاملة عن مبيعاتك وعملائك
        </p>
      </div>

      {/* Main KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Revenue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المبيعات</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalRevenue.toLocaleString('ar-SA')} ر.س</div>
                <p className="text-xs text-muted-foreground mt-1">
                  متوسط الطلب: {averageOrderValue.toFixed(2)} ر.س
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Conversion Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">معدل التحويل</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{conversionPercentage.toFixed(1)}%</div>
                <Progress value={conversionPercentage} className="mt-2" />
              </>
            )}
          </CardContent>
        </Card>

        {/* Average Rating */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">متوسط التقييم</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold flex items-center gap-1">
                  {averageRating.toFixed(1)}
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  من {totalReviews} تقييم
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Total Referrals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الإحالات الناجحة</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{successfulReferrals}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  من {totalReferrals} إحالة
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Abandoned Carts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              السلال المهجورة
            </CardTitle>
            <CardDescription>
              إحصائيات السلال المتروكة ومعدل الاستعادة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">إجمالي السلال المهجورة</span>
                    <Badge variant="destructive">{abandonedCartsCount}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">السلال المستعادة</span>
                    <Badge className="bg-green-600 text-white">{recoveredCarts}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">معدل الاستعادة</span>
                    <span className="text-lg font-bold text-green-600">{recoveryRate.toFixed(1)}%</span>
                  </div>
                </div>
                <Progress value={recoveryRate} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {recoveryRate >= 20 
                    ? '✅ معدل استعادة ممتاز!' 
                    : recoveryRate >= 10 
                    ? '⚠️ معدل استعادة جيد، يمكن تحسينه' 
                    : '❌ معدل استعادة منخفض، يحتاج تحسين'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Reviews Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              توزيع التقييمات
            </CardTitle>
            <CardDescription>
              تفصيل تقييمات العملاء حسب النجوم
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">نظام التقييمات قيد التطوير</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders & Referrals */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              إحصائيات الطلبات
            </CardTitle>
            <CardDescription>
              ملخص الطلبات حسب الحالة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : orderStats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">إجمالي الطلبات</p>
                    <p className="text-2xl font-bold">{orderStats.total}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">الطلبات المكتملة</p>
                    <p className="text-2xl font-bold text-green-600">{orderStats.completed || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">قيد المعالجة</p>
                    <p className="text-2xl font-bold text-blue-600">{orderStats.processing || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">الملغية</p>
                    <p className="text-2xl font-bold text-red-600">{orderStats.cancelled || 0}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">لا توجد بيانات</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Referral Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              أداء الإحالات
            </CardTitle>
            <CardDescription>
              إحصائيات برنامج الإحالة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : referralStats ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">إجمالي الإحالات</span>
                    <Badge>{totalReferrals}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">الإحالات الناجحة</span>
                    <Badge className="bg-green-600 text-white">{successfulReferrals}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">معدل النجاح</span>
                    <span className="text-lg font-bold text-green-600">
                      {totalReferrals > 0 ? ((successfulReferrals / totalReferrals) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
                <Progress 
                  value={totalReferrals > 0 ? (successfulReferrals / totalReferrals) * 100 : 0} 
                  className="h-2" 
                />
                {/* Top referrers section can be added later if needed */}
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">لا توجد بيانات</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insights & Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            رؤى وتوصيات
          </CardTitle>
          <CardDescription>
            تحليلات ذكية لتحسين أدائك
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {conversionPercentage < 5 && (
                <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                      معدل التحويل منخفض
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      معدل التحويل الحالي {conversionPercentage.toFixed(1)}%. جرب تحسين الردود الآلية أو إضافة عروض خاصة.
                    </p>
                  </div>
                </div>
              )}

              {recoveryRate < 15 && abandonedCartsCount > 0 && (
                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      فرصة لاستعادة السلال المهجورة
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      لديك {abandonedCartsCount} سلة مهجورة. أرسل تذكيرات مع كود خصم لزيادة معدل الاستعادة.
                    </p>
                  </div>
                </div>
              )}

              {averageRating >= 4.5 && totalReviews >= 10 && (
                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <Star className="h-5 w-5 text-green-600 mt-0.5 fill-green-600" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      تقييمات ممتازة!
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      متوسط تقييمك {averageRating.toFixed(1)} نجوم. اعرض التقييمات الإيجابية في صفحتك الرئيسية لزيادة الثقة.
                    </p>
                  </div>
                </div>
              )}

              {totalReferrals === 0 && (
                <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                  <Users className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                      فعّل برنامج الإحالة
                    </p>
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      لم تبدأ بعد في استخدام برنامج الإحالة. شجع عملائك على دعوة أصدقائهم مقابل خصومات.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
