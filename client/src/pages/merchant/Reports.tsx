import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, MessageSquare, CheckCircle2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';

export default function Reports() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(30);
  
  const { data: stats, isLoading: statsLoading } = trpc.campaigns.getStats.useQuery();
  const { data: timelineData, isLoading: timelineLoading } = trpc.campaigns.getTimelineData.useQuery({ days: timeRange });

  // Format date for display
  const formattedTimelineData = useMemo(() => {
    if (!timelineData) return [];
    return timelineData.map(item => ({
      ...item,
      date: new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
    }));
  }, [timelineData]);

  if (statsLoading || timelineLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('reportsPage.text0')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('reportsPage.text17')}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('reportsPage.text1')}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCampaigns || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('reportsPage.text23', { var0: stats?.completedCampaigns || 0 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('reportsPage.text2')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalSent || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('reportsPage.text18')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('reportsPage.text3')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.deliveryRate || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('reportsPage.text19')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('reportsPage.text4')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.readRate || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('reportsPage.text20')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('reportsPage.text5')}</CardTitle>
              <CardDescription>{t('reportsPage.text6')}</CardDescription>
            </div>
            <Tabs value={timeRange.toString()} onValueChange={(v) => setTimeRange(Number(v) as 7 | 30 | 90)}>
              <TabsList>
                <TabsTrigger value="7">{t('reportsPage.text7')}</TabsTrigger>
                <TabsTrigger value="30">{t('reportsPage.text8')}</TabsTrigger>
                <TabsTrigger value="90">{t('reportsPage.text9')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedTimelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="sent" 
                  stroke="hsl(var(--primary))" 
                  name={t('reportsPage.text26')}
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="delivered" 
                  stroke="hsl(142 76% 36%)" 
                  name={t('reportsPage.text27')}
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="read" 
                  stroke="hsl(221 83% 53%)" 
                  name={t('reportsPage.text28')}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Additional Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('reportsPage.text10')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-primary mt-2" />
              <div>
                <p className="font-medium">{t('reportsPage.text11')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('reportsPage.text21')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-primary mt-2" />
              <div>
                <p className="font-medium">{t('reportsPage.text12')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('reportsPage.text24')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-primary mt-2" />
              <div>
                <p className="font-medium">{t('reportsPage.text13')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('reportsPage.text22')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('reportsPage.text14')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{t('reportsPage.text15')}</span>
                <span className="text-sm text-muted-foreground">{stats?.deliveryRate || 0}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all" 
                  style={{ width: `${stats?.deliveryRate || 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{t('reportsPage.text16')}</span>
                <span className="text-sm text-muted-foreground">{stats?.readRate || 0}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary/100 transition-all" 
                  style={{ width: `${stats?.readRate || 0}%` }}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {t('reportsPage.text25', { var0: Math.round((stats?.deliveryRate || 0) / 10) })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
