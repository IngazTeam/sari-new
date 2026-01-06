import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Send, Users, TrendingUp, ArrowUp, ArrowDown, Package, UserPlus, Star, Clock, CheckCircle2, XCircle, AlertCircle, ArrowRight, Activity } from 'lucide-react';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { TrialBanner } from '@/components/TrialBanner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function MerchantDashboard() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { data: merchant, isLoading: merchantLoading } = trpc.merchants.getCurrent.useQuery();
  const { data: onboardingStatus } = trpc.merchants.getOnboardingStatus.useQuery();
  const completeOnboarding = trpc.merchants.completeOnboarding.useMutation();
  const { data: subscription, isLoading: subscriptionLoading } = trpc.subscriptions.getCurrent.useQuery();
  const { data: conversations, isLoading: conversationsLoading } = trpc.conversations.list.useQuery();
  const { data: campaigns, isLoading: campaignsLoading } = trpc.campaigns.list.useQuery();
  
  // New analytics queries
  const { data: dashboardStats, isLoading: statsLoading } = trpc.dashboard.getStats.useQuery();
  const { data: comparisonStats, isLoading: comparisonLoading } = trpc.dashboard.getComparisonStats.useQuery({ days: 30 });
  const { data: ordersTrend, isLoading: ordersTrendLoading } = trpc.dashboard.getOrdersTrend.useQuery({ days: 30 });
  const { data: revenueTrend, isLoading: revenueTrendLoading } = trpc.dashboard.getRevenueTrend.useQuery({ days: 30 });
  const { data: topProducts, isLoading: topProductsLoading } = trpc.dashboard.getTopProducts.useQuery({ limit: 5 });
  const { data: reviewStats } = trpc.reviews.getStats.useQuery({ merchantId: merchant?.id || 1 });

  const isLoading = merchantLoading || subscriptionLoading || conversationsLoading || campaignsLoading || 
                     statsLoading || comparisonLoading || ordersTrendLoading || revenueTrendLoading || topProductsLoading;

  // Show onboarding wizard for new merchants
  useEffect(() => {
    if (onboardingStatus && !onboardingStatus.completed) {
      setShowOnboarding(true);
    }
  }, [onboardingStatus]);

  // Show trial banner if trial is active
  const { data: trialStatus } = trpc.trial.getStatus.useQuery();

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = async () => {
    await completeOnboarding.mutateAsync();
    setShowOnboarding(false);
  };

  // Main stats with growth indicators
  const mainStats = [
    {
      title: t('dashboard.totalOrders'),
      value: dashboardStats?.totalOrders || 0,
      growth: comparisonStats?.growth.orders || 0,
      icon: Package,
      description: t('dashboard.last30Days'),
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      link: '/merchant/orders',
    },
    {
      title: t('dashboard.totalRevenue'),
      value: formatCurrency(dashboardStats?.totalRevenue || 0),
      growth: comparisonStats?.growth.revenue || 0,
      icon: TrendingUp,
      description: t('dashboard.last30Days'),
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      link: '/merchant/reports',
    },
    {
      title: t('dashboard.averageOrderValue'),
      value: formatCurrency(dashboardStats?.averageOrderValue || 0),
      growth: 0,
      icon: MessageSquare,
      description: t('dashboard.averageOrder'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      link: '/merchant/analytics',
    },
    {
      title: t('dashboard.completedOrders'),
      value: dashboardStats?.completedOrders || 0,
      growth: comparisonStats?.growth.completed || 0,
      icon: CheckCircle2,
      description: t('dashboard.successfulOrders'),
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      link: '/merchant/orders',
    },
    {
      title: t('dashboard.averageRating'),
      value: reviewStats ? `${reviewStats.averageRating.toFixed(1)} ⭐` : '0.0 ⭐',
      growth: 0,
      icon: Star,
      description: `${reviewStats?.totalReviews || 0} ${t('dashboard.reviews')}`,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      link: '/merchant/reviews',
    },
  ];

  // Order status distribution
  const orderStatusData = [
    { name: 'مكتمل', value: dashboardStats?.completedOrders || 0, color: '#10b981' },
    { name: 'قيد المعالجة', value: (dashboardStats?.totalOrders || 0) - (dashboardStats?.completedOrders || 0), color: '#f59e0b' },
  ];

  // Prepare chart data for orders trend
  const ordersChartData = ordersTrend?.map(item => ({
    date: new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
    orders: Number(item.count),
  })) || [];

  // Prepare chart data for revenue trend
  const revenueChartData = revenueTrend?.map(item => ({
    date: new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
    revenue: Number(item.revenue),
  })) || [];

  // Recent activity data
  const recentActivities = [
    { type: 'order', message: 'طلب جديد من أحمد المالكي', time: 'منذ 5 دقائق', icon: Package, color: 'text-primary' },
    { type: 'conversation', message: 'محادثة جديدة مع فاطمة', time: 'منذ 15 دقيقة', icon: MessageSquare, color: 'text-blue-600' },
    { type: 'review', message: 'تقييم جديد 5 نجوم', time: 'منذ ساعة', icon: Star, color: 'text-yellow-600' },
    { type: 'campaign', message: 'حملة "عروض الصيف" مكتملة', time: 'منذ ساعتين', icon: Send, color: 'text-green-600' },
  ];

  // Show loading skeleton
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
      
      <div className="space-y-8">
        {/* Trial Banner */}
        <TrialBanner />
        {/* Header with Welcome Message */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">مرحباً، {merchant?.businessName || 'التاجر'} 👋</h1>
            <p className="text-muted-foreground mt-2">
              إليك نظرة سريعة على نشاط متجرك اليوم
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/merchant/campaigns/new">
              <Button className="shadow-lg">
                <Send className="ml-2 h-4 w-4" />
                حملة جديدة
              </Button>
            </Link>
          </div>
        </div>

        {/* Main Stats Grid with Growth */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {mainStats.map((stat) => {
            const Icon = stat.icon;
            const isPositiveGrowth = stat.growth >= 0;
            const GrowthIcon = isPositiveGrowth ? ArrowUp : ArrowDown;
            
            return (
              <Link key={stat.title} href={stat.link}>
                <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {stat.title}
                    </CardTitle>
                    <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                      <Icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        {stat.description}
                      </p>
                      {stat.growth !== 0 && (
                        <span className={`flex items-center text-xs font-medium ${
                          isPositiveGrowth ? 'text-green-600' : 'text-red-600'
                        }`}>
                          <GrowthIcon className="h-3 w-3 ml-1" />
                          {Math.abs(stat.growth).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Orders Trend Chart */}
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>اتجاه الطلبات</CardTitle>
                  <CardDescription>عدد الطلبات خلال آخر 30 يوم</CardDescription>
                </div>
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {ordersChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={ordersChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis style={{ fontSize: '12px' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="orders" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      name="عدد الطلبات"
                      dot={{ fill: '#10b981', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>لا توجد بيانات متاحة</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue Trend Chart */}
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>اتجاه الإيرادات</CardTitle>
                  <CardDescription>الإيرادات خلال آخر 30 يوم (ريال)</CardDescription>
                </div>
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {revenueChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis style={{ fontSize: '12px' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="revenue" 
                      fill="#3b82f6" 
                      name="الإيرادات (ريال)"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>لا توجد بيانات متاحة</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Products & Recent Activity */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Top Products */}
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>أفضل المنتجات مبيعاً</CardTitle>
                  <CardDescription>المنتجات الأكثر مبيعاً هذا الشهر</CardDescription>
                </div>
                <Link href="/merchant/products">
                  <Button variant="ghost" size="sm">
                    عرض الكل
                    <ArrowRight className="mr-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {topProducts && topProducts.length > 0 ? (
                <div className="space-y-4">
                  {topProducts.map((product, index) => (
                    <div key={index} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{product.productName}</p>
                        <p className="text-sm text-muted-foreground">
                          {product.totalSales} مبيعة • {product.totalRevenue} ريال
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-primary">
                          {product.averagePrice} ريال
                        </p>
                        <p className="text-xs text-muted-foreground">متوسط السعر</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50 text-muted-foreground" />
                  <p className="text-muted-foreground">لا توجد مبيعات بعد</p>
                  <Link href="/merchant/products">
                    <Button variant="outline" size="sm" className="mt-4">
                      أضف منتجات
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>النشاط الأخير</CardTitle>
                  <CardDescription>آخر التحديثات والأنشطة</CardDescription>
                </div>
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {conversations && conversations.length > 0 ? (
                <div className="space-y-4">
                  {conversations.slice(0, 5).map((conv) => (
                    <div key={conv.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <MessageSquare className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{conv.customerName || conv.customerPhone}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(conv.lastMessageAt).toLocaleDateString('ar-SA')}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        conv.status === 'active' 
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {conv.status === 'active' ? 'نشط' : 'مغلق'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50 text-muted-foreground" />
                  <p className="text-muted-foreground">لا توجد محادثات بعد</p>
                  <Link href="/merchant/whatsapp">
                    <Button variant="outline" size="sm" className="mt-4">
                      اربط واتساب
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-2 bg-gradient-to-br from-primary/5 to-blue-50 dark:from-primary/5 dark:to-background">
          <CardHeader>
            <CardTitle>إجراءات سريعة</CardTitle>
            <CardDescription>الوصول السريع للميزات الأساسية</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href="/merchant/products">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                  <Package className="h-6 w-6" />
                  <span>إدارة المنتجات</span>
                </Button>
              </Link>
              <Link href="/merchant/campaigns/new">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                  <Send className="h-6 w-6" />
                  <span>حملة جديدة</span>
                </Button>
              </Link>
              <Link href="/merchant/conversations">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                  <MessageSquare className="h-6 w-6" />
                  <span>المحادثات</span>
                </Button>
              </Link>
              <Link href="/merchant/reports">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                  <BarChart className="h-6 w-6" />
                  <span>التقارير</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
