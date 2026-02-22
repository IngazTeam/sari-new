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
import { useTranslation } from 'react-i18next';

export default function OverviewAnalytics() {
  const { t } = useTranslation();
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
        <h1 className="text-3xl font-bold">{t('overviewAnalyticsPage.text0')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('overviewAnalyticsPage.text21')}
        </p>
      </div>

      {/* Main KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Revenue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('overviewAnalyticsPage.text1')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalRevenue.toLocaleString('ar-SA')} ر.س</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('overviewAnalyticsPage.text37', { var0: averageOrderValue.toFixed(2) })}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Conversion Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('overviewAnalyticsPage.text3')}</CardTitle>
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
            <CardTitle className="text-sm font-medium">{t('overviewAnalyticsPage.text4')}</CardTitle>
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
                  {t('overviewAnalyticsPage.text38', { var0: totalReviews })}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Total Referrals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('overviewAnalyticsPage.text5')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{successfulReferrals}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('overviewAnalyticsPage.text39', { var0: totalReferrals })}
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
              {t('overviewAnalyticsPage.text22')}
            </CardTitle>
            <CardDescription>
              {t('overviewAnalyticsPage.text23')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('overviewAnalyticsPage.text6')}</span>
                    <Badge variant="destructive">{abandonedCartsCount}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('overviewAnalyticsPage.text7')}</span>
                    <Badge className="bg-green-600 text-white">{recoveredCarts}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t('overviewAnalyticsPage.text8')}</span>
                    <span className="text-lg font-bold text-green-600">{recoveryRate.toFixed(1)}%</span>
                  </div>
                </div>
                <Progress value={recoveryRate} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {recoveryRate >= 20
                    ? t('overviewAnalyticsPage.text40')
                    : recoveryRate >= 10 
                    ? t('overviewAnalyticsPage.text19') : t('overviewAnalyticsPage.text20')}
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
              {t('overviewAnalyticsPage.text24')}
            </CardTitle>
            <CardDescription>
              {t('overviewAnalyticsPage.text25')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{t('overviewAnalyticsPage.text9')}</span>
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
              {t('overviewAnalyticsPage.text26')}
            </CardTitle>
            <CardDescription>
              {t('overviewAnalyticsPage.text27')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : orderStats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('overviewAnalyticsPage.text10')}</p>
                    <p className="text-2xl font-bold">{orderStats.total}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('overviewAnalyticsPage.text11')}</p>
                    <p className="text-2xl font-bold text-green-600">{orderStats.completed || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('overviewAnalyticsPage.text12')}</p>
                    <p className="text-2xl font-bold text-blue-600">{orderStats.processing || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('overviewAnalyticsPage.text13')}</p>
                    <p className="text-2xl font-bold text-red-600">{orderStats.cancelled || 0}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{t('overviewAnalyticsPage.text14')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Referral Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('overviewAnalyticsPage.text28')}
            </CardTitle>
            <CardDescription>
              {t('overviewAnalyticsPage.text29')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : referralStats ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('overviewAnalyticsPage.text15')}</span>
                    <Badge>{totalReferrals}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('overviewAnalyticsPage.text16')}</span>
                    <Badge className="bg-green-600 text-white">{successfulReferrals}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t('overviewAnalyticsPage.text17')}</span>
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
                <span className="text-sm">{t('overviewAnalyticsPage.text18')}</span>
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
            {t('overviewAnalyticsPage.text30')}
          </CardTitle>
          <CardDescription>
            {t('overviewAnalyticsPage.text31')}
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
                      {t('overviewAnalyticsPage.text32')}
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      {t('overviewAnalyticsPage.text41', { var0: conversionPercentage.toFixed(1) })}
                    </p>
                  </div>
                </div>
              )}

              {recoveryRate < 15 && abandonedCartsCount > 0 && (
                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      {t('overviewAnalyticsPage.text33')}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {t('overviewAnalyticsPage.text42', { var0: abandonedCartsCount })}
                    </p>
                  </div>
                </div>
              )}

              {averageRating >= 4.5 && totalReviews >= 10 && (
                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <Star className="h-5 w-5 text-green-600 mt-0.5 fill-green-600" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      {t('overviewAnalyticsPage.text34')}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      {t('overviewAnalyticsPage.text43', { var0: averageRating.toFixed(1) })}
                    </p>
                  </div>
                </div>
              )}

              {totalReferrals === 0 && (
                <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                  <Users className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                      {t('overviewAnalyticsPage.text35')}
                    </p>
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      {t('overviewAnalyticsPage.text36')}
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
