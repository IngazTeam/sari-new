import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, MessageSquare, TrendingUp, Clock, Package, FileDown, FileSpreadsheet, Smile, Frown, Meh, Heart } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function Analytics() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();

  const [dateRange] = useState<{ start?: string; end?: string }>({});
  const [isExporting, setIsExporting] = useState(false);

  const exportPDF = trpc.messageAnalytics.exportPDF.useMutation();
  const exportExcel = trpc.messageAnalytics.exportExcel.useMutation();

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const result = await exportPDF.mutateAsync({
        startDate: dateRange.start,
        endDate: dateRange.end,
      });

      // Convert base64 to blob and download
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.click();
      window.URL.revokeObjectURL(url);

      toast.success(t('toast.analytics.msg1'));
    } catch (error) {
      toast.error(t('toast.analytics.msg2'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const result = await exportExcel.mutateAsync({
        startDate: dateRange.start,
        endDate: dateRange.end,
      });

      // Convert base64 to blob and download
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.click();
      window.URL.revokeObjectURL(url);

      toast.success(t('toast.analytics.msg3'));
    } catch (error) {
      toast.error(t('toast.analytics.msg4'));
    } finally {
      setIsExporting(false);
    }
  };

  // Fetch analytics data
  const { data: messageStats, isLoading: loadingMessages } = trpc.messageAnalytics.getMessageStats.useQuery({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  const { data: peakHours, isLoading: loadingPeakHours } = trpc.messageAnalytics.getPeakHours.useQuery({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  const { data: topProducts, isLoading: loadingTopProducts } = trpc.messageAnalytics.getTopProducts.useQuery({
    limit: 10,
  });

  const { data: conversionRate, isLoading: loadingConversion } = trpc.messageAnalytics.getConversionRate.useQuery({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  const { data: dailyMessages, isLoading: loadingDaily } = trpc.messageAnalytics.getDailyMessageCount.useQuery({
    days: 30,
  });

  const [sentimentDays, setSentimentDays] = useState(30);
  const { data: sentimentStats, isLoading: loadingSentiment } = trpc.sentiment.getStats.useQuery({ days: sentimentDays });
  const { data: sentimentDistribution, isLoading: loadingSentimentDist } = trpc.sentiment.getDistribution.useQuery({ days: sentimentDays });

  if (loadingMessages || loadingPeakHours || loadingTopProducts || loadingConversion || loadingDaily || loadingSentiment || loadingSentimentDist) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t('analyticsPage.text0')}</h1>
          <p className="text-muted-foreground mt-2">{t('analyticsPage.text1')}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Calculate percentages for message types
  const voicePercentage = messageStats?.total ? Math.round((messageStats.voice / messageStats.total) * 100) : 0;
  const textPercentage = messageStats?.total ? Math.round((messageStats.text / messageStats.total) * 100) : 0;
  const imagePercentage = messageStats?.total ? Math.round((messageStats.image / messageStats.total) * 100) : 0;

  // Find peak hour
  const peakHour = peakHours && peakHours.length > 0
    ? peakHours.reduce((prev, current) => (prev.count > current.count ? prev : current))
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('analyticsPage.text2')}</h1>
          <p className="text-muted-foreground mt-2">{t('analyticsPage.text3')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleExportPDF}
            disabled={isExporting}
            variant="outline"
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            {t('analyticsPage.text58')}
          </Button>
          <Button
            onClick={handleExportExcel}
            disabled={isExporting}
            variant="outline"
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t('analyticsPage.text59')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Messages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analyticsPage.text4')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{messageStats?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('analyticsPage.text60', { var0: messageStats?.text || 0, var1: messageStats?.voice || 0 })}
            </p>
          </CardContent>
        </Card>

        {/* Voice Messages Percentage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analyticsPage.text5')}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{voicePercentage}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('analyticsPage.text61', { var0: messageStats?.voice || 0 })}
            </p>
          </CardContent>
        </Card>

        {/* Conversion Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analyticsPage.text6')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate?.rate || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('analyticsPage.text62', { var0: conversionRate?.convertedConversations || 0, var1: conversionRate?.totalConversations || 0 })}
            </p>
          </CardContent>
        </Card>

        {/* Peak Hour */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analyticsPage.text7')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {peakHour ? `${peakHour.hour}:00 - ${peakHour.count} ${t('analyticsPage.text55')}` : t('analyticsPage.text28')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sentiment Analysis Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            {t('analyticsPage.text29')}
          </h2>
          <div className="flex gap-2">
            <Button
              variant={sentimentDays === 7 ? "default" : "outline"}
              size="sm"
              onClick={() => setSentimentDays(7)}
            >
              {t('analyticsPage.text30')}
            </Button>
            <Button
              variant={sentimentDays === 30 ? "default" : "outline"}
              size="sm"
              onClick={() => setSentimentDays(30)}
            >
              {t('analyticsPage.text31')}
            </Button>
            <Button
              variant={sentimentDays === 90 ? "default" : "outline"}
              size="sm"
              onClick={() => setSentimentDays(90)}
            >
              {t('analyticsPage.text32')}
            </Button>
          </div>
        </div>

        {/* Sentiment Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('analyticsPage.text8')}</CardTitle>
              <Smile className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{sentimentStats?.positive || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {sentimentStats?.total ? Math.round((sentimentStats.positive / sentimentStats.total) * 100) : 0}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('analyticsPage.text9')}</CardTitle>
              <Frown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{sentimentStats?.negative || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {sentimentStats?.total ? Math.round((sentimentStats.negative / sentimentStats.total) * 100) : 0}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('analyticsPage.text10')}</CardTitle>
              <Meh className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{sentimentStats?.neutral || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {sentimentStats?.total ? Math.round((sentimentStats.neutral / sentimentStats.total) * 100) : 0}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('analyticsPage.text11')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sentimentStats?.averageConfidence || 0}%</div>
              <p className="text-xs text-muted-foreground mt-1">{t('analyticsPage.text12')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Sentiment Charts */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Pie Chart - Sentiment Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>{t('analyticsPage.text13')}</CardTitle>
              <CardDescription>{t('analyticsPage.text14')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: t('analyticsPage.text41'), value: sentimentDistribution?.positive || 0, color: '#10b981' },
                      { name: t('analyticsPage.text42'), value: sentimentDistribution?.negative || 0, color: '#ef4444' },
                      { name: t('analyticsPage.text43'), value: sentimentDistribution?.neutral || 0, color: '#6b7280' },
                      { name: t('analyticsPage.text44'), value: sentimentDistribution?.happy || 0, color: '#fbbf24' },
                      { name: t('analyticsPage.text45'), value: sentimentDistribution?.angry || 0, color: '#dc2626' },
                      { name: t('analyticsPage.text46'), value: sentimentDistribution?.sad || 0, color: '#3b82f6' },
                      { name: t('analyticsPage.text47'), value: sentimentDistribution?.frustrated || 0, color: '#f97316' },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[
                      { name: t('analyticsPage.text48'), value: sentimentDistribution?.positive || 0, color: '#10b981' },
                      { name: t('analyticsPage.text49'), value: sentimentDistribution?.negative || 0, color: '#ef4444' },
                      { name: t('analyticsPage.text50'), value: sentimentDistribution?.neutral || 0, color: '#6b7280' },
                      { name: t('analyticsPage.text51'), value: sentimentDistribution?.happy || 0, color: '#fbbf24' },
                      { name: t('analyticsPage.text52'), value: sentimentDistribution?.angry || 0, color: '#dc2626' },
                      { name: t('analyticsPage.text53'), value: sentimentDistribution?.sad || 0, color: '#3b82f6' },
                      { name: t('analyticsPage.text54'), value: sentimentDistribution?.frustrated || 0, color: '#f97316' },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Detailed Sentiment Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>{t('analyticsPage.text15')}</CardTitle>
              <CardDescription>{t('analyticsPage.text16')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Happy */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Smile className="h-4 w-4 text-yellow-500" />
                      {t('analyticsPage.text33')}
                    </span>
                    <span className="text-sm text-muted-foreground">{sentimentDistribution?.happy || 0}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 transition-all"
                      style={{ width: `${sentimentStats?.total && sentimentDistribution?.happy ? (sentimentDistribution.happy / sentimentStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Angry */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Frown className="h-4 w-4 text-red-600" />
                      {t('analyticsPage.text34')}
                    </span>
                    <span className="text-sm text-muted-foreground">{sentimentDistribution?.angry || 0}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-600 transition-all"
                      style={{ width: `${sentimentStats?.total && sentimentDistribution?.angry ? (sentimentDistribution.angry / sentimentStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Sad */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Meh className="h-4 w-4 text-blue-600" />
                      {t('analyticsPage.text35')}
                    </span>
                    <span className="text-sm text-muted-foreground">{sentimentDistribution?.sad || 0}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{ width: `${sentimentStats?.total && sentimentDistribution?.sad ? (sentimentDistribution.sad / sentimentStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Frustrated */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Frown className="h-4 w-4 text-orange-600" />
                      {t('analyticsPage.text36')}
                    </span>
                    <span className="text-sm text-muted-foreground">{sentimentDistribution?.frustrated || 0}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-600 transition-all"
                      style={{ width: `${sentimentStats?.total && sentimentDistribution?.frustrated ? (sentimentDistribution.frustrated / sentimentStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Message Types Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>{t('analyticsPage.text17')}</CardTitle>
            <CardDescription>{t('analyticsPage.text18')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Voice */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('analyticsPage.text19')}</span>
                  <span className="text-sm text-muted-foreground">{voicePercentage}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/100 transition-all"
                    style={{ width: `${voicePercentage}%` }}
                  />
                </div>
              </div>

              {/* Text */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('analyticsPage.text20')}</span>
                  <span className="text-sm text-muted-foreground">{textPercentage}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${textPercentage}%` }}
                  />
                </div>
              </div>

              {/* Image */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{t('analyticsPage.text21')}</span>
                  <span className="text-sm text-muted-foreground">{imagePercentage}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all"
                    style={{ width: `${imagePercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Peak Hours Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t('analyticsPage.text22')}</CardTitle>
            <CardDescription>{t('analyticsPage.text23')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between gap-1">
              {peakHours && peakHours.length > 0 ? (
                peakHours.map((hour) => {
                  const maxCount = Math.max(...peakHours.map(h => h.count));
                  const height = maxCount > 0 ? (hour.count / maxCount) * 100 : 0;
                  return (
                    <div key={hour.hour} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-primary/100 rounded-t transition-all hover:bg-primary"
                        style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                        title={t('analyticsPage.text56', { var0: hour.hour, var1: hour.count })}
                      />
                      <span className="text-xs text-muted-foreground">{hour.hour}</span>
                    </div>
                  );
                })
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  {t('analyticsPage.text37')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('analyticsPage.text38')}
          </CardTitle>
          <CardDescription>{t('analyticsPage.text24')}</CardDescription>
        </CardHeader>
        <CardContent>
          {topProducts && topProducts.length > 0 ? (
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <div key={product.productId} className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{product.mentionCount}</span>
                    <span className="text-sm text-muted-foreground">{t('analyticsPage.text25')}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t('analyticsPage.text39')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Messages Trend */}
      <Card>
        <CardHeader>
          <CardTitle>{t('analyticsPage.text26')}</CardTitle>
          <CardDescription>{t('analyticsPage.text27')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-end justify-between gap-1">
            {dailyMessages && dailyMessages.length > 0 ? (
              dailyMessages.map((day) => {
                const maxCount = Math.max(...dailyMessages.map(d => d.count));
                const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                const date = new Date(day.date);
                const dayLabel = `${date.getDate()}/${date.getMonth() + 1}`;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-green-500 rounded-t transition-all hover:bg-green-600"
                      style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                      title={t('analyticsPage.text57', { var0: dayLabel, var1: day.count })}
                    />
                    {dailyMessages.length <= 15 && (
                      <span className="text-xs text-muted-foreground">{dayLabel}</span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                {t('analyticsPage.text40')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
