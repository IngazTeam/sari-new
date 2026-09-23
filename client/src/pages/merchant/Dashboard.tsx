import { LearningEvidenceCard } from '@/components/LearningEvidenceCard';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send, Users, TrendingUp, ArrowUp, ArrowDown, Package, UserPlus, Star, Clock, CheckCircle2, XCircle, AlertCircle, ArrowRight, Activity, DollarSign, Smartphone, Brain, Sparkles, Zap, Target, GraduationCap, Dna, AlertTriangle, TrendingDown, Rocket, Circle, RefreshCw, Globe } from 'lucide-react';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { TrialBanner } from '@/components/TrialBanner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { useCurrency } from '@/contexts/CurrencyContext';

/** Animated number counter — counts from 0 to target */
function AnimatedNumber({ value, duration = 1200, prefix = '', suffix = '' }: { value: number; duration?: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (!value) { setDisplay(0); return; }
    const start = ref.current;
    const diff = value - start;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + diff * eased);
      setDisplay(current);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
      else ref.current = value;
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);
  return <>{prefix}{display.toLocaleString()}{suffix}</>;
}

export default function MerchantDashboard() {
  const { t, i18n } = useTranslation();
  const { formatCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState(30);
  const { data: merchant, isLoading: merchantLoading } = trpc.merchants.getCurrent.useQuery(undefined as any);
  const { data: onboardingStatus, isLoading: onboardingLoading } = trpc.merchants.getOnboardingStatus.useQuery(undefined as any);
  // Performance: load only 5 recent conversations instead of ALL
  const { data: recentConversations, isLoading: conversationsLoading } = trpc.conversations.listRecent.useQuery({ limit: 5 });
  const { data: conversationCount } = trpc.conversations.count.useQuery(undefined as any);
  const { data: campaignStats, isLoading: campaignsLoading } = trpc.campaigns.getStats.useQuery(undefined as any);

  // Combined dashboard summary - reduces 5 requests to 1
  const { data: dashboardSummary, isLoading: summaryLoading } = trpc.dashboard.getSummary.useQuery({ days: dateRange, topProductsLimit: 5 });
  const dashboardStats = dashboardSummary?.stats;
  const comparisonStats = dashboardSummary?.comparison;
  const ordersTrend = dashboardSummary?.ordersTrend;
  const revenueTrend = dashboardSummary?.revenueTrend;
  const topProducts = dashboardSummary?.topProducts;
  const { data: reviewStats } = trpc.reviews.getStats.useQuery({ merchantId: merchant?.id || 1 });

  // AI Opportunity Engine
  const { data: aiInsights, isLoading: insightsLoading } = trpc.dashboard.getAiInsights.useQuery(undefined, {
    staleTime: 6 * 60 * 60 * 1000, // 6 hours — matches backend cache
    retry: false, // Don't retry on failure — graceful degradation
  });



  // 🔗 Integration Sync Status — persistent card
  const { data: syncStatus } = trpc.sariBrain.getIntegrationSyncStatus.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isLoading = merchantLoading || onboardingLoading || conversationsLoading || campaignsLoading || summaryLoading;
  const setupCompleted = onboardingStatus?.setupCompleted === true;
  const channelReady = onboardingStatus?.stage === 'ready';
  const channelPending = onboardingStatus?.stage === 'channel_pending';

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
      growth: comparisonStats?.growth.aov || 0,
      icon: DollarSign,
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
    { name: t('dashboardPage.orderCompleted'), value: dashboardStats?.completedOrders || 0, color: '#10b981' },
    { name: t('dashboardPage.orderProcessing'), value: (dashboardStats?.totalOrders || 0) - (dashboardStats?.completedOrders || 0), color: '#f59e0b' },
  ];

  // Prepare chart data for orders trend
  const ordersChartData = ordersTrend?.map((item: any) => ({
    date: new Date(item.date).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : i18n.language, { month: 'short', day: 'numeric' }),
    orders: Number(item.count),
  })) || [];

  // Prepare chart data for revenue trend
  const revenueChartData = revenueTrend?.map((item: any) => ({
    date: new Date(item.date).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : i18n.language, { month: 'short', day: 'numeric' }),
    revenue: Number(item.revenue),
  })) || [];


  // Show loading skeleton
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      <div className="space-y-6">
        {/* Trial Banner */}
        <TrialBanner />

        {!setupCompleted && (
          <Card role="status" className="border-2 border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30">
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="font-bold text-amber-950 dark:text-amber-100">أكمل إعداد نشاطك قبل الإطلاق</h2>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  يمكنك استكشاف لوحة التحكم الآن، لكن لن نعرض متجرك كجاهز حتى تراجع الملف وتؤكد الإعداد.
                </p>
              </div>
              <Link href="/merchant/setup-wizard">
                <Button className="shrink-0 gap-2">
                  إكمال الإعداد
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* ═══ Getting Started Checklist — للتجار الجدد ═══ */}
        {(conversationCount === 0 && (dashboardStats?.totalOrders || 0) === 0) && (
          <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-emerald-500/5 to-background shadow-lg overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-emerald-400 to-green-500" />
            <CardContent className="pt-6 pb-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center shadow-md">
                  <Rocket className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">🚀 ابدأ رحلتك مع ساري</h2>
                  <p className="text-sm text-muted-foreground">أكمل هذه الخطوات ليبدأ ساري بالعمل لك</p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Step 1: Canonical setup state */}
                <Link href={setupCompleted ? '/merchant/dashboard' : '/merchant/setup-wizard'}>
                  <div className={`flex items-center gap-3 p-3 rounded-xl border ${setupCompleted
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800 cursor-pointer'
                  }`}>
                    {setupCompleted
                      ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      : <Circle className="h-5 w-5 text-amber-600 shrink-0" />}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${setupCompleted ? 'text-green-800 dark:text-green-200' : 'text-amber-900 dark:text-amber-100'}`}>إعداد النشاط التجاري</p>
                      <p className={`text-xs ${setupCompleted ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-300'}`}>
                        {setupCompleted ? 'تمت المراجعة والتأكيد ✓' : 'غير مكتمل — راجع بيانات النشاط وأكدها'}
                      </p>
                    </div>
                  </div>
                </Link>

                {/* Step 2: Connect WhatsApp */}
                <Link href="/merchant/whatsapp">
                  <div className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all ${channelReady
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : channelPending
                      ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800'
                      : 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-300 dark:border-green-700'
                  }`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${channelReady ? 'bg-green-600' : channelPending ? 'bg-amber-500' : 'bg-green-500'}`}>
                      <Smartphone className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${channelPending ? 'text-amber-900 dark:text-amber-100' : 'text-green-800 dark:text-green-200'}`}>
                        {channelReady ? 'واتساب متصل ✓' : channelPending ? 'ربط واتساب قيد الإجراء' : 'اربط واتسابك الآن'}
                      </p>
                      <p className={`text-xs ${channelPending ? 'text-amber-700 dark:text-amber-300' : 'text-green-600 dark:text-green-400'}`}>
                        {channelReady ? 'القناة جاهزة لاستقبال رسائل العملاء' : channelPending ? 'تابع حالة الطلب وأكمل التحقق' : 'لن تبدأ الردود قبل اكتمال الربط والتحقق'}
                      </p>
                    </div>
                    {channelReady ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <ArrowRight className={`h-4 w-4 ${channelPending ? 'text-amber-600' : 'text-green-600'}`} />}
                  </div>
                </Link>

                {/* Step 3: Add Products */}
                <Link href="/merchant/products">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-background/60 border border-border cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all">
                    <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">أضف منتجاتك أو خدماتك</p>
                      <p className="text-xs text-muted-foreground">ساري يعرضها للعملاء ويساعدهم بالشراء</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>

                {/* Step 4: First Conversation */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-background/60 border border-border">
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">استقبل أول محادثة</p>
                    <p className="text-xs text-muted-foreground">ساري يتعلم ويتطور مع كل محادثة جديدة</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══ AI Presence Card — "ساري اليوم" ═══ */}
        <Card className="border-0 bg-gradient-to-br from-primary/10 via-emerald-500/5 to-background shadow-lg overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-emerald-400 to-primary" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center shadow-md">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    {channelReady ? '🧠 ساري يعمل الآن' : '🧠 ساري في وضع الإعداد'}
                    {channelReady && (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {channelReady
                      ? 'مساعدك الذكي متصل بالقناة ويساعد عملاءك'
                      : setupCompleted
                        ? 'أكمل ربط القناة حتى يبدأ ساري باستقبال رسائل العملاء'
                        : 'راجع إعداد نشاطك ثم اربط القناة لتفعيل العمل الفعلي'}
                  </p>
                </div>
              </div>
              <Link href="/merchant/sari-brain">
                <Button variant="outline" size="sm" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  عقل ساري
                </Button>
              </Link>
            </div>
            {/* AI Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/60 border border-primary/10">
                <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-lg font-bold text-primary leading-none"><AnimatedNumber value={conversationCount || 0} /></p>
                  <p className="text-[10px] text-muted-foreground">محادثة</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/60 border border-emerald-500/10">
                <Zap className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-lg font-bold text-emerald-600 leading-none"><AnimatedNumber value={dashboardStats?.totalOrders || 0} /></p>
                  <p className="text-[10px] text-muted-foreground">طلب</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/60 border border-amber-500/10">
                <Target className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-lg font-bold text-amber-600 leading-none"><AnimatedNumber value={campaignStats?.totalCampaigns || 0} /></p>
                  <p className="text-[10px] text-muted-foreground">حملة</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/60 border border-yellow-500/10">
                <Star className="h-4 w-4 text-yellow-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-lg font-bold text-yellow-600 leading-none">{reviewStats ? reviewStats.averageRating.toFixed(1) : '—'}</p>
                  <p className="text-[10px] text-muted-foreground">تقييم</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══ AI Opportunity Engine — "ساري يقترح" ═══ */}
        {(insightsLoading || (aiInsights && aiInsights.length > 0)) && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              ساري يقترح
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {insightsLoading ? (
                /* Skeleton loading */
                Array.from({ length: 2 }).map((_: any, i: number) => (
                  <div key={i} className="p-4 rounded-xl border bg-muted/20 animate-pulse">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-muted" />
                      <div className="h-4 w-32 bg-muted rounded" />
                    </div>
                    <div className="h-3 w-full bg-muted rounded mb-1.5" />
                    <div className="h-3 w-2/3 bg-muted rounded" />
                  </div>
                ))
              ) : aiInsights?.map((insight: any, i: number) => {
                const colorMap: Record<string, string> = {
                  opportunity: 'from-purple-500/10 to-indigo-500/5 border-purple-200 dark:border-purple-800',
                  momentum: 'from-emerald-500/10 to-green-500/5 border-emerald-200 dark:border-emerald-800',
                  alert: 'from-amber-500/10 to-yellow-500/5 border-amber-200 dark:border-amber-800',
                  recovery: 'from-orange-500/10 to-red-500/5 border-orange-200 dark:border-orange-800',
                  discovery: 'from-blue-500/10 to-cyan-500/5 border-blue-200 dark:border-blue-800',
                };
                const iconBgMap: Record<string, string> = {
                  opportunity: 'from-purple-500 to-indigo-500',
                  momentum: 'from-emerald-500 to-green-500',
                  alert: 'from-amber-500 to-yellow-500',
                  recovery: 'from-orange-500 to-red-500',
                  discovery: 'from-blue-500 to-cyan-500',
                };
                return (
                  <div key={i} className={`p-4 rounded-xl border bg-gradient-to-br ${colorMap[insight.type] || colorMap.discovery} transition-all hover:shadow-md hover:scale-[1.01]`}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${iconBgMap[insight.type] || iconBgMap.discovery} flex items-center justify-center text-white text-sm shadow-sm`}>
                        {insight.emoji}
                      </div>
                      <h4 className="font-semibold text-sm">{insight.title}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">{insight.body}</p>
                    {insight.action && (
                      <Link href={insight.action.href}>
                        <Button size="sm" className="w-full text-xs h-8 bg-white/90 hover:bg-white text-foreground border shadow-sm dark:bg-gray-900/90 dark:hover:bg-gray-900">
                          {insight.action.label || 'ابدأ الآن →'}
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <LearningEvidenceCard />

        {/* ═══ 🔗 Integration Sync Status — ثابت دائماً ═══ */}
        {syncStatus?.hasData && (
          <Card className="border border-indigo-200/50 dark:border-indigo-800/50 bg-gradient-to-br from-indigo-50/50 via-white to-blue-50/50 dark:from-indigo-900/10 dark:via-background dark:to-blue-900/10 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-400 via-blue-400 to-purple-400" />
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-md">
                    <RefreshCw className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      🔗 بيانات المزامنة
                      {syncStatus.integrationPlatform && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-medium">
                          {syncStatus.integrationPlatform === 'byaan' ? 'بيان' : syncStatus.integrationPlatform}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {syncStatus.lastSyncAt
                        ? `آخر مزامنة: ${new Date(syncStatus.lastSyncAt).toLocaleDateString('ar-SA')} ${new Date(syncStatus.lastSyncAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`
                        : 'لم تتم المزامنة بعد'}
                    </p>
                  </div>
                </div>
                <Link href="/merchant/sari-brain">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Globe className="h-3.5 w-3.5" />
                    التفاصيل
                  </Button>
                </Link>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/80 border border-indigo-100 dark:border-indigo-800/30">
                  <Package className="h-4 w-4 text-indigo-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-indigo-600 leading-none"><AnimatedNumber value={syncStatus.products} /></p>
                    <p className="text-[10px] text-muted-foreground">دورة / منتج</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/80 border border-emerald-100 dark:border-emerald-800/30">
                  <MessageSquare className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-emerald-600 leading-none"><AnimatedNumber value={syncStatus.faqs} /></p>
                    <p className="text-[10px] text-muted-foreground">سؤال شائع</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/80 border border-blue-100 dark:border-blue-800/30">
                  <Globe className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-blue-600 leading-none"><AnimatedNumber value={syncStatus.discoveredPages} /></p>
                    <p className="text-[10px] text-muted-foreground">صفحة موقع</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/80 border border-amber-100 dark:border-amber-800/30">
                  <Brain className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-amber-600 leading-none"><AnimatedNumber value={syncStatus.knowledgeSections} /></p>
                    <p className="text-[10px] text-muted-foreground">قسم معرفة</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/80 border border-purple-100 dark:border-purple-800/30">
                  <Users className="h-4 w-4 text-purple-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-purple-600 leading-none"><AnimatedNumber value={syncStatus.customers} /></p>
                    <p className="text-[10px] text-muted-foreground">عميل</p>
                  </div>
                </div>
              </div>

              {/* Product Names Tags */}
              {syncStatus.productNames.length > 0 && (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {syncStatus.productNames.slice(0, 10).map((name: any, i: number) => (
                      <span key={i} className="text-[11px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800/40">
                        {name}
                      </span>
                    ))}
                    {syncStatus.productNames.length > 10 && (
                      <span className="text-[11px] text-muted-foreground px-2 py-0.5">+{syncStatus.productNames.length - 10} أخرى</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Header with Welcome Message */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">👋 {t('dashboardPage.welcomeMessage', { name: merchant?.businessName || t('dashboardPage.welcomeDefault') })}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('dashboardPage.welcomeDescription')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(dateRange)} onValueChange={(v) => setDateRange(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('dashboard.last7Days', 'آخر 7 أيام')}</SelectItem>
                <SelectItem value="30">{t('dashboard.last30Days')}</SelectItem>
                <SelectItem value="90">{t('dashboard.last90Days', 'آخر 90 يوم')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Main Stats Grid — Hero Metrics */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          {mainStats.map((stat: any, idx: number) => {
            const Icon = stat.icon;
            const isPositiveGrowth = stat.growth >= 0;
            const GrowthIcon = isPositiveGrowth ? ArrowUp : ArrowDown;
            // First 2 stats (orders + revenue) are hero metrics on mobile
            const isHero = idx < 2;

            return (
              <Link key={stat.title} href={stat.link}>
                <Card className={`hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer border ${isHero ? 'lg:col-span-1 border-primary/20 bg-gradient-to-br from-background to-primary/5' : ''}`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs font-medium">
                      {stat.title}
                    </CardTitle>
                    <div className={`p-1.5 rounded-lg ${stat.bgColor}`}>
                      <Icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`font-bold ${isHero ? 'text-2xl' : 'text-xl'}`}>{stat.value}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        {stat.description}
                      </p>
                      {stat.growth !== 0 && (
                        <span className={`flex items-center text-xs font-medium ${isPositiveGrowth ? 'text-green-600' : 'text-red-600'
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
                  <CardTitle>{t('dashboardPage.ordersTrend')}</CardTitle>
                  <CardDescription>{t('dashboardPage.ordersTrendDesc')}</CardDescription>
                </div>
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {ordersChartData.length > 0 ? (
                <div dir="ltr">
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
                      name={t('dashboardPage.orderCount')}
                      dot={{ fill: '#10b981', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-primary/5 to-emerald-500/5 border border-primary/10 max-w-xs">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                      <Package className="h-7 w-7 text-primary" />
                    </div>
                    <p className="font-medium text-sm mb-1">📦 أضف طلبات لتظهر هنا</p>
                    <p className="text-[11px] text-muted-foreground">ساري يتابع اتجاه الطلبات تلقائياً</p>
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
                  <CardTitle>{t('dashboardPage.revenueTrend')}</CardTitle>
                  <CardDescription>{t('dashboardPage.revenueTrendDesc')}</CardDescription>
                </div>
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {revenueChartData.length > 0 ? (
                <div dir="ltr">
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
                      name={t('dashboardPage.revenueLabel')}
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-blue-500/5 to-primary/5 border border-blue-500/10 max-w-xs">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-primary/20 flex items-center justify-center mx-auto mb-3">
                      <TrendingUp className="h-7 w-7 text-blue-500" />
                    </div>
                    <p className="font-medium text-sm mb-1">💰 الإيرادات تظهر مع أول بيعة</p>
                    <p className="text-[11px] text-muted-foreground">ساري يحلل اتجاه الإيرادات ويقترح تحسينات</p>
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
                  <CardTitle>{t('dashboardPage.topSellingProducts')}</CardTitle>
                  <CardDescription>{t('dashboardPage.topSellingProductsDesc')}</CardDescription>
                </div>
                <Link href="/merchant/products">
                  <Button variant="ghost" size="sm">
                    {t('dashboardPage.viewAll')}
                    <ArrowRight className="mr-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {topProducts && topProducts.length > 0 ? (
                <div className="space-y-4">
                  {topProducts.map((product: any, index: number) => (
                    <div key={index} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{product.productName}</p>
                        <p className="text-sm text-muted-foreground">
                          {product.totalSales} {t('dashboardPage.soldCount')} • {formatCurrency(product.totalRevenue)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-primary">
                          {formatCurrency(product.averagePrice)}
                        </p>
                        <p className="text-xs text-muted-foreground">{t('dashboardPage.averagePrice')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                    <Package className="h-7 w-7 text-primary" />
                  </div>
                  <p className="font-medium text-sm mb-1">📦 أضف منتجاتك ليبدأ ساري ببيعها</p>
                  <p className="text-[11px] text-muted-foreground mb-3">ساري يعرض المنتجات للعملاء ويساعدهم بالشراء</p>
                  <Link href="/merchant/products">
                    <Button size="sm" className="gap-2">
                      <Package className="h-4 w-4" />
                      إضافة منتجات
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
                  <CardTitle>{t('dashboardPage.recentActivity')}</CardTitle>
                  <CardDescription>{t('dashboardPage.recentActivityDesc')}</CardDescription>
                </div>
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {recentConversations && recentConversations.length > 0 ? (
                <div className="space-y-4">
                  {recentConversations.map((conv) => (
                    <div key={conv.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <MessageSquare className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{conv.customerName || conv.customerPhone}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(conv.lastMessageAt).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : i18n.language)}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${conv.status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                        {conv.status === 'active' ? t('dashboardPage.statusActive') : t('dashboardPage.statusClosed')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                    <MessageSquare className="h-7 w-7 text-green-600" />
                  </div>
                  <p className="font-medium text-sm mb-1">🚀 اربط واتسابك وابدأ استقبال العملاء</p>
                  <p className="text-[11px] text-muted-foreground mb-3">ساري يرد على عملائك تلقائياً خلال ثوانٍ</p>
                  <Link href="/merchant/whatsapp">
                    <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700">
                      <Smartphone className="h-4 w-4" />
                      ربط واتساب
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
