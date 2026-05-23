import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  Target,
  Zap,
  Award,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function RecommendationsAnalytics() {
  const { t } = useTranslation();
  const { data: recommendations, isLoading } = trpc.seo.getAllRecommendations.useQuery();

  // Calculate analytics
  const analytics = useMemo(() => {
    if (!recommendations) return null;

    // Group by type
    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byDifficulty: Record<string, number> = {};
    let totalImpactScore = 0;
    let completedCount = 0;

    recommendations.forEach((rec: any) => {
      // Count by type
      byType[rec.recommendationType] = (byType[rec.recommendationType] || 0) + 1;

      // Count by priority
      byPriority[rec.priority] = (byPriority[rec.priority] || 0) + 1;

      // Count by status
      byStatus[rec.status] = (byStatus[rec.status] || 0) + 1;

      // Count by difficulty
      byDifficulty[rec.implementationDifficulty || 'unknown'] = 
        (byDifficulty[rec.implementationDifficulty || 'unknown'] || 0) + 1;

      // Calculate impact score
      if (rec.status === 'completed') {
        completedCount++;
        // @ts-ignore
        const priorityScore = { low: 1, medium: 2, high: 3, critical: 4 }[rec.priority] || 0;
        // @ts-ignore
        const difficultyScore = { easy: 3, medium: 2, hard: 1 }[rec.implementationDifficulty] || 0;
        totalImpactScore += priorityScore * difficultyScore;
      }
    });

    // Prepare chart data
    const typeChartData = Object.entries(byType).map(([type, count]) => ({
      name: formatType(type),
      value: count,
    }));

    const priorityChartData = Object.entries(byPriority).map(([priority, count]) => ({
      name: formatPriority(priority),
      value: count,
    }));

    const statusChartData = Object.entries(byStatus).map(([status, count]) => ({
      name: formatStatus(status),
      value: count,
    }));

    const difficultyChartData = Object.entries(byDifficulty).map(([difficulty, count]) => ({
      name: formatDifficulty(difficulty),
      value: count,
    }));

    // Calculate ROI metrics
    const completionRate = recommendations.length > 0 
      ? ((completedCount / recommendations.length) * 100).toFixed(1)
      : '0';

    const averageROI = completedCount > 0 
      ? (totalImpactScore / completedCount).toFixed(2)
      : '0';

    const pendingCount = byStatus['pending'] || 0;
    const inProgressCount = byStatus['in_progress'] || 0;
    const criticalCount = byPriority['critical'] || 0;

    return {
      total: recommendations.length,
      completed: completedCount,
      pending: pendingCount,
      inProgress: inProgressCount,
      critical: criticalCount,
      completionRate,
      averageROI,
      typeChartData,
      priorityChartData,
      statusChartData,
      difficultyChartData,
    };
  }, [recommendations]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">{t('adminRecommendationsAnalyticsPage.text0')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="w-8 h-8 text-blue-500" />{t('recommendationsAnalytics.auto_0')}</h1>
        <p className="text-muted-foreground mt-2">{t('recommendationsAnalytics.auto_1')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminRecommendationsAnalyticsPage.text1')}</CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.total}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('recommendationsAnalytics.auto_2')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminRecommendationsAnalyticsPage.text2')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.completionRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.completed} من {analytics.total}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminRecommendationsAnalyticsPage.text3')}</CardTitle>
            <Award className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.averageROI}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('recommendationsAnalytics.auto_3')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminRecommendationsAnalyticsPage.text4')}</CardTitle>
            <Zap className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.inProgress}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('recommendationsAnalytics.auto_4')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminRecommendationsAnalyticsPage.text5')}</CardTitle>
            <PieChartIcon className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.critical}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('recommendationsAnalytics.auto_5')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminRecommendationsAnalyticsPage.text6')}</CardTitle>
            <CardDescription>{t('recommendationsAnalytics.auto_6')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.statusChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {analytics.statusChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminRecommendationsAnalyticsPage.text7')}</CardTitle>
            <CardDescription>{t('recommendationsAnalytics.auto_7')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.priorityChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminRecommendationsAnalyticsPage.text8')}</CardTitle>
            <CardDescription>{t('recommendationsAnalytics.auto_8')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.typeChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Difficulty Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminRecommendationsAnalyticsPage.text9')}</CardTitle>
            <CardDescription>{t('recommendationsAnalytics.auto_9')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.difficultyChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {analytics.difficultyChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg">{t('adminRecommendationsAnalyticsPage.text10')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <strong>{t('adminRecommendationsAnalyticsPage.text11')}</strong> تم إكمال {analytics.completionRate}% من التوصيات ({analytics.completed} من {analytics.total})
          </p>
          <p>
            <strong>{t('adminRecommendationsAnalyticsPage.text12')}</strong> هناك {analytics.critical} توصية حرجة تحتاج إلى اهتمام فوري
          </p>
          <p>
            <strong>{t('adminRecommendationsAnalyticsPage.text13')}</strong> {analytics.inProgress} توصية قيد التنفيذ حالياً
          </p>
          <p>
            <strong>{t('adminRecommendationsAnalyticsPage.text14')}</strong> متوسط نقاط التأثير للتوصيات المكتملة هو {analytics.averageROI}
          </p>
          <p className="text-blue-900 font-medium pt-2">{t('recommendationsAnalytics.auto_10')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function formatType(type: string): string {
  const types: Record<string, string> = {
    keyword_optimization: 'تحسين الكلمات المفتاحية',
    content_improvement: 'تحسين المحتوى',
    technical_seo: 'تحسين تقني',
    link_building: 'بناء الروابط',
    user_experience: 'تحسين تجربة المستخدم',
    performance: 'تحسين الأداء',
  };
  return types[type] || type;
}

function formatPriority(priority: string): string {
  const priorities: Record<string, string> = {
    low: 'منخفضة',
    medium: 'متوسطة',
    high: 'عالية',
    critical: 'حرجة',
  };
  return priorities[priority] || priority;
}

function formatStatus(status: string): string {
  const statuses: Record<string, string> = {
    pending: 'قيد الانتظار',
    in_progress: 'قيد التنفيذ',
    completed: 'مكتملة',
    dismissed: 'مرفوضة',
  };
  return statuses[status] || status;
}

function formatDifficulty(difficulty: string): string {
  const difficulties: Record<string, string> = {
    easy: 'سهلة',
    medium: 'متوسطة',
    hard: 'صعبة',
    unknown: 'غير محددة',
  };
  return difficulties[difficulty] || difficulty;
}