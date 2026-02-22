import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";
import { 
  TrendingUp, MessageSquare, Target, Award, 
  Download, RefreshCw, Lightbulb, AlertCircle
} from "lucide-react";
import { toast } from "sonner";

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function InsightsDashboard() {
  const { t } = useTranslation();
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  // Fetch data
  const { data: keywordStats, isLoading: loadingKeywords, refetch: refetchKeywords } = 
    trpc.insights.getKeywordStats.useQuery({ merchantId: 1, period: selectedPeriod });
  
  const { data: weeklyReports, isLoading: loadingReports, refetch: refetchReports } = 
    trpc.insights.getWeeklyReports.useQuery({ merchantId: 1, limit: 4 });
  
  const { data: abTests, isLoading: loadingTests, refetch: refetchTests } = 
    trpc.insights.getActiveABTests.useQuery({ merchantId: 1 });

  const handleRefresh = () => {
    refetchKeywords();
    refetchReports();
    refetchTests();
    toast.success(t('insightsDashboardPage.text0'));
  };

  const handleExportCSV = () => {
    toast.info(t('insightsDashboardPage.text1'));
    // TODO: Implement CSV export
  };

  if (loadingKeywords || loadingReports || loadingTests) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-accent rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-accent rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Prepare keyword category data for pie chart
  const categoryData = keywordStats?.byCategory?.map((cat: any) => ({
    name: cat.category,
    value: cat.count
  })) || [];

  // Prepare weekly sentiment trend data
  const sentimentTrendData = weeklyReports?.map((report: any) => ({
    week: new Date(report.weekStart).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
    positive: report.positiveCount,
    negative: report.negativeCount,
    neutral: report.neutralCount,
    satisfaction: report.averageSatisfaction
  })) || [];

  // Prepare A/B test comparison data
  const abTestData = abTests?.map((test: any) => ({
    name: test.responseA?.substring(0, 20) + '...',
    versionA: test.usageCountA,
    versionB: test.usageCountB,
    successRateA: test.successRateA || 0,
    successRateB: test.successRateB || 0
  })) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('insightsDashboardPage.text2')}</h1>
          <p className="text-muted-foreground">{t('insightsDashboardPage.text3')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="ml-2 h-4 w-4" />
            {t('insightsDashboardPage.text37')}
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="ml-2 h-4 w-4" />
            {t('insightsDashboardPage.text43')}
          </Button>
        </div>
      </div>

      {/* Period Filter */}
      <div className="flex gap-2">
        {[
          { value: '7d', label: t('insightsDashboardPage.text40') },
          { value: '30d', label: t('insightsDashboardPage.text41') },
          { value: '90d', label: t('insightsDashboardPage.text42') }
        ].map(period => (
          <Button
            key={period.value}
            variant={selectedPeriod === period.value ? 'default' : 'outline'}
            onClick={() => setSelectedPeriod(period.value as any)}
          >
            {period.label}
          </Button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="keywords" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="keywords">
            <MessageSquare className="ml-2 h-4 w-4" />
            {t('insightsDashboardPage.text38')}
          </TabsTrigger>
          <TabsTrigger value="sentiment">
            <TrendingUp className="ml-2 h-4 w-4" />
            {t('insightsDashboardPage.text39')}
          </TabsTrigger>
          <TabsTrigger value="abtests">
            <Target className="ml-2 h-4 w-4" />
            {t('insightsDashboardPage.text44')}
          </TabsTrigger>
        </TabsList>

        {/* Keywords Tab */}
        <TabsContent value="keywords" className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('insightsDashboardPage.text4')}</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{keywordStats?.total ?? 0}</div>
                <p className="text-xs text-muted-foreground">{t('insightsDashboardPage.text5')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('insightsDashboardPage.text6')}</CardTitle>
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{keywordStats?.suggested ?? 0}</div>
                <p className="text-xs text-muted-foreground">{t('insightsDashboardPage.text7')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('insightsDashboardPage.text8')}</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{keywordStats?.applied ?? 0}</div>
                <p className="text-xs text-muted-foreground">{t('insightsDashboardPage.text9')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Category Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>{t('insightsDashboardPage.text10')}</CardTitle>
                <CardDescription>{t('insightsDashboardPage.text11')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top Keywords Table */}
            <Card>
              <CardHeader>
                <CardTitle>{t('insightsDashboardPage.text12')}</CardTitle>
                <CardDescription>{t('insightsDashboardPage.text13')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {keywordStats?.topKeywords?.slice(0, 10).map((kw: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-accent/50">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{index + 1}</Badge>
                        <span className="font-medium">{kw.keyword}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>{kw.category}</Badge>
                        <span className="text-sm text-muted-foreground">{kw.count} مرة</span>
                      </div>
                    </div>
                  )) || <p className="text-center text-muted-foreground py-8">{t('insightsDashboardPage.text15')}</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sentiment Tab */}
        <TabsContent value="sentiment" className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('insightsDashboardPage.text16')}</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {weeklyReports?.[0]?.averageSatisfaction?.toFixed(1) ?? '0.0'}%
                </div>
                <p className="text-xs text-muted-foreground">{t('insightsDashboardPage.text17')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('insightsDashboardPage.text18')}</CardTitle>
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {weeklyReports?.[0]?.positiveCount ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">{t('insightsDashboardPage.text19')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('insightsDashboardPage.text20')}</CardTitle>
                <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {weeklyReports?.[0]?.neutralCount ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">{t('insightsDashboardPage.text21')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('insightsDashboardPage.text22')}</CardTitle>
                <div className="h-3 w-3 rounded-full bg-red-500"></div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {weeklyReports?.[0]?.negativeCount ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">{t('insightsDashboardPage.text23')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Sentiment Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t('insightsDashboardPage.text24')}</CardTitle>
              <CardDescription>{t('insightsDashboardPage.text25')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sentimentTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="positive" stroke="#22c55e" name={t('insightsDashboardPage.text49')} strokeWidth={2} />
                  <Line type="monotone" dataKey="neutral" stroke="#f59e0b" name={t('insightsDashboardPage.text50')} strokeWidth={2} />
                  <Line type="monotone" dataKey="negative" stroke="#ef4444" name={t('insightsDashboardPage.text51')} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Recent Reports Table */}
          <Card>
            <CardHeader>
              <CardTitle>{t('insightsDashboardPage.text26')}</CardTitle>
              <CardDescription>{t('insightsDashboardPage.text27')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {weeklyReports?.map((report: any) => (
                  <div key={report.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                    <div>
                      <p className="font-medium">
                        {new Date(report.weekStart).toLocaleDateString('ar-SA')} - {new Date(report.weekEnd).toLocaleDateString('ar-SA')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('insightsDashboardPage.text45', { var0: report.totalConversations })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={report.averageSatisfaction >= 70 ? 'default' : 'destructive'}>
                        {t('insightsDashboardPage.text46', { var0: report.averageSatisfaction.toFixed(1) })}
                      </Badge>
                      {report.emailSent && (
                        <Badge variant="outline">{t('insightsDashboardPage.text28')}</Badge>
                      )}
                    </div>
                  </div>
                )) || <p className="text-center text-muted-foreground py-8">{t('insightsDashboardPage.text29')}</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* A/B Tests Tab */}
        <TabsContent value="abtests" className="space-y-4">
          {/* Active Tests */}
          <Card>
            <CardHeader>
              <CardTitle>{t('insightsDashboardPage.text30')}</CardTitle>
              <CardDescription>{t('insightsDashboardPage.text31')}</CardDescription>
            </CardHeader>
            <CardContent>
              {abTests && abTests.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={abTestData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="versionA" fill="#22c55e" name={t('insightsDashboardPage.text52')} />
                      <Bar dataKey="versionB" fill="#3b82f6" name={t('insightsDashboardPage.text53')} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-6 space-y-3">
                    {abTests.map((test: any) => (
                      <div key={test.id} className="p-4 rounded-lg border">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-medium mb-1">{t('insightsDashboardPage.text32')}</p>
                            <p className="text-sm text-muted-foreground">{test.responseA}</p>
                          </div>
                          <Badge variant="outline">{test.usageCountA} استخدام</Badge>
                        </div>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-medium mb-1">{t('insightsDashboardPage.text34')}</p>
                            <p className="text-sm text-muted-foreground">{test.responseB}</p>
                          </div>
                          <Badge variant="outline">{test.usageCountB} استخدام</Badge>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Badge variant={test.successRateA > test.successRateB ? 'default' : 'secondary'}>
                            {t('insightsDashboardPage.text47', { var0: test.successRateA?.toFixed(1) || 0 })}
                          </Badge>
                          <Badge variant={test.successRateB > test.successRateA ? 'default' : 'secondary'}>
                            {t('insightsDashboardPage.text48', { var0: test.successRateB?.toFixed(1) || 0 })}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{t('insightsDashboardPage.text36')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
