import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, DollarSign, Clock, Users, Target, BarChart3, MessageSquare, Zap, Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from 'react-i18next';

export default function MetricsDashboard() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  
  const { data: metrics, isLoading } = trpc.testSari.getMetrics.useQuery({ period });
  
  if (isLoading) {
    return <MetricsDashboardSkeleton />;
  }
  
  if (!metrics) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('metricsDashboardPage.text0')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('metricsDashboardPage.text1')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('metricsDashboardPage.text49')}
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">{t('metricsDashboardPage.text2')}</SelectItem>
            <SelectItem value="week">{t('metricsDashboardPage.text3')}</SelectItem>
            <SelectItem value="month">{t('metricsDashboardPage.text4')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* قسم 1: مقاييس التحويل والمبيعات */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          {t('metricsDashboardPage.text39')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title={t('metricsDashboardPage.text5')}
            value={`${metrics.conversion.conversionRate}%`}
            icon={<Target className="h-5 w-5" />}
            description={t('metricsDashboardPage.text6')}
            color="text-green-600"
            bgColor="bg-green-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text7')}
            value={t('metricsDashboardPage.text44', { var0: metrics.conversion.avgDealValue })}
            icon={<DollarSign className="h-5 w-5" />}
            description={t('metricsDashboardPage.text8')}
            color="text-blue-600"
            bgColor="bg-blue-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text9')}
            value={t('metricsDashboardPage.text45', { var0: metrics.conversion.totalRevenue })}
            icon={<TrendingUp className="h-5 w-5" />}
            description={t('metricsDashboardPage.text10')}
            color="text-purple-600"
            bgColor="bg-purple-50"
          />
        </div>
      </div>
      
      {/* قسم 2: مقاييس الوقت والكفاءة */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          {t('metricsDashboardPage.text40')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title={t('metricsDashboardPage.text11')}
            value={t('metricsDashboardPage.text46', { var0: (metrics.time.avgResponseTime / 1000).toFixed(1) })}
            icon={<Zap className="h-5 w-5" />}
            description={t('metricsDashboardPage.text12')}
            color="text-orange-600"
            bgColor="bg-orange-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text13')}
            value={t('metricsDashboardPage.text47', { var0: metrics.time.avgConversationLength })}
            icon={<MessageSquare className="h-5 w-5" />}
            description={t('metricsDashboardPage.text14')}
            color="text-indigo-600"
            bgColor="bg-indigo-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text15')}
            value={t('metricsDashboardPage.text48', { var0: Math.round(metrics.time.avgTimeToConversion / 60) })}
            icon={<Clock className="h-5 w-5" />}
            description={t('metricsDashboardPage.text16')}
            color="text-pink-600"
            bgColor="bg-pink-50"
          />
        </div>
      </div>
      
      {/* قسم 3: مقاييس الجودة */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Award className="h-6 w-6 text-primary" />
          {t('metricsDashboardPage.text41')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title={t('metricsDashboardPage.text17')}
            value={`${metrics.quality.resolutionRate}%`}
            icon={<Target className="h-5 w-5" />}
            description={t('metricsDashboardPage.text18')}
            color="text-teal-600"
            bgColor="bg-teal-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text19')}
            value={`${metrics.quality.escalationRate}%`}
            icon={<Users className="h-5 w-5" />}
            description={t('metricsDashboardPage.text20')}
            color="text-red-600"
            bgColor="bg-red-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text21')}
            value={`${metrics.quality.engagementRate}%`}
            icon={<TrendingUp className="h-5 w-5" />}
            description={t('metricsDashboardPage.text22')}
            color="text-cyan-600"
            bgColor="bg-cyan-50"
          />
        </div>
      </div>
      
      {/* قسم 4: مقاييس النمو */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          {t('metricsDashboardPage.text42')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricCard
            title={t('metricsDashboardPage.text23')}
            value={`${metrics.growth.returnRate}%`}
            icon={<Users className="h-5 w-5" />}
            description={t('metricsDashboardPage.text24')}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text25')}
            value={`${metrics.growth.referralRate}%`}
            icon={<TrendingUp className="h-5 w-5" />}
            description={t('metricsDashboardPage.text26')}
            color="text-violet-600"
            bgColor="bg-violet-50"
          />
        </div>
      </div>
      
      {/* قسم 5: مقاييس متقدمة */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Award className="h-6 w-6 text-primary" />
          {t('metricsDashboardPage.text43')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard
            title={t('metricsDashboardPage.text27')}
            value={`${metrics.advanced.productClickRate}%`}
            icon={<Target className="h-5 w-5" />}
            description={t('metricsDashboardPage.text28')}
            color="text-amber-600"
            bgColor="bg-amber-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text29')}
            value={`${metrics.advanced.orderCompletionRate}%`}
            icon={<DollarSign className="h-5 w-5" />}
            description={t('metricsDashboardPage.text30')}
            color="text-lime-600"
            bgColor="bg-lime-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text31')}
            value={`${metrics.advanced.csatScore}/5`}
            icon={<Award className="h-5 w-5" />}
            description={t('metricsDashboardPage.text32')}
            color="text-sky-600"
            bgColor="bg-sky-50"
          />
          <MetricCard
            title={t('metricsDashboardPage.text33')}
            value={`${metrics.advanced.npsScore}`}
            icon={<TrendingUp className="h-5 w-5" />}
            description={t('metricsDashboardPage.text34')}
            color="text-fuchsia-600"
            bgColor="bg-fuchsia-50"
          />
        </div>
      </div>

      {/* ملاحظة توضيحية */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">{t('metricsDashboardPage.text35')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <strong>{t('metricsDashboardPage.text36')}</strong> {t('metricsDashboardPage.text50')}
          </div>
          <div>
            <strong>{t('metricsDashboardPage.text37')}</strong> {t('metricsDashboardPage.text51')}
          </div>
          <div>
            <strong>{t('metricsDashboardPage.text38')}</strong> {t('metricsDashboardPage.text52')}
          </div>
          <div>
            <strong>CSAT Score:</strong> {t('metricsDashboardPage.text53')}
          </div>
          <div>
            <strong>NPS:</strong> {t('metricsDashboardPage.text54')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ 
  title, 
  value, 
  icon, 
  description,
  color,
  bgColor 
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  description: string;
  color?: string;
  bgColor?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`p-2 rounded-full ${bgColor || 'bg-muted'} ${color || 'text-muted-foreground'}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color || ''}`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function MetricsDashboardSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-10 w-[180px]" />
      </div>
      
      {[1, 2, 3, 4, 5].map((section) => (
        <div key={section}>
          <Skeleton className="h-8 w-64 mb-4" />
          <div className={`grid grid-cols-1 md:grid-cols-${section === 4 ? 2 : section === 5 ? 4 : 3} gap-6`}>
            {Array.from({ length: section === 4 ? 2 : section === 5 ? 4 : 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-24 mb-1" />
                  <Skeleton className="h-3 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
