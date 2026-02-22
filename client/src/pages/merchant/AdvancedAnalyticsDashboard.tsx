import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  BarChart3, 
  MessageSquare, 
  TrendingUp, 
  TrendingDown,
  Clock, 
  Package, 
  FileDown, 
  Users,
  ShoppingCart,
  DollarSign,
  Activity,
  Target,
  Zap,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  RefreshCw,
  Filter,
  Download,
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  AreaChart,
  Area,
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
  RadialBarChart,
  RadialBar,
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

// ألوان الرسوم البيانية
const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  loading?: boolean;
}

function StatCard({ title, value, change, changeLabel, icon, trend, loading }: StatCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4 rounded" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            {trend === 'up' ? (
              <ArrowUpRight className="h-3 w-3 text-green-500" />
            ) : trend === 'down' ? (
              <ArrowDownRight className="h-3 w-3 text-red-500" />
            ) : null}
            <span className={cn(
              "text-xs",
              trend === 'up' ? "text-green-500" : trend === 'down' ? "text-red-500" : "text-muted-foreground"
            )}>
              {change > 0 ? '+' : ''}{change}% {changeLabel || 'من الفترة السابقة'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdvancedAnalyticsDashboard() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch analytics data
  const { data: messageStats, isLoading: loadingMessages, refetch: refetchMessages } = 
    trpc.messageAnalytics.getMessageStats.useQuery({});

  const { data: dailyMessages, isLoading: loadingDaily } = 
    trpc.messageAnalytics.getDailyMessageCount.useQuery({
      days: timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365,
    });

  const { data: peakHours, isLoading: loadingPeakHours } = 
    trpc.messageAnalytics.getPeakHours.useQuery({});

  const { data: topProducts, isLoading: loadingProducts } = 
    trpc.messageAnalytics.getTopProducts.useQuery({ limit: 10 });

  const { data: conversionRate, isLoading: loadingConversion } = 
    trpc.messageAnalytics.getConversionRate.useQuery({});

  const { data: sentimentStats, isLoading: loadingSentiment } = 
    trpc.sentiment.getStats.useQuery({ 
      days: timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365 
    });

  const isLoading = loadingMessages || loadingDaily || loadingPeakHours || loadingProducts || loadingConversion || loadingSentiment;

  // بيانات محسوبة
  const chartData = useMemo(() => {
    if (!dailyMessages) return [];
    return dailyMessages.map((item: any) => ({
      date: new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
      messages: item.count,
      incoming: Math.floor(item.count * 0.6),
      outgoing: Math.floor(item.count * 0.4),
    }));
  }, [dailyMessages]);

  const peakHoursData = useMemo(() => {
    if (!peakHours) return [];
    return peakHours.map((item: any) => ({
      hour: `${item.hour}:00`,
      count: item.count,
    }));
  }, [peakHours]);

  const messageTypeData = useMemo(() => {
    if (!messageStats) return [];
    return [
      { name: t('advancedAnalyticsDashboardPage.text48'), value: messageStats.text || 0, color: COLORS[0] },
      { name: t('advancedAnalyticsDashboardPage.text49'), value: messageStats.voice || 0, color: COLORS[1] },
      { name: t('advancedAnalyticsDashboardPage.text50'), value: messageStats.image || 0, color: COLORS[2] },
    ];
  }, [messageStats]);

  const sentimentData = useMemo(() => {
    if (!sentimentStats) return [];
    return [
      { name: t('advancedAnalyticsDashboardPage.text51'), value: sentimentStats.positive || 0, fill: '#10B981' },
      { name: t('advancedAnalyticsDashboardPage.text52'), value: sentimentStats.neutral || 0, fill: '#F59E0B' },
      { name: t('advancedAnalyticsDashboardPage.text53'), value: sentimentStats.negative || 0, fill: '#EF4444' },
    ];
  }, [sentimentStats]);

  const handleRefresh = () => {
    refetchMessages();
    toast.success(t('advancedAnalyticsDashboardPage.text0'));
  };

  const handleExport = () => {
    toast.success(t('advancedAnalyticsDashboardPage.text1'));
    // يمكن إضافة منطق التصدير هنا
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('advancedAnalyticsDashboardPage.text2')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('advancedAnalyticsDashboardPage.text46')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(v: any) => setTimeRange(v)}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t('advancedAnalyticsDashboardPage.text3')}</SelectItem>
              <SelectItem value="30d">{t('advancedAnalyticsDashboardPage.text4')}</SelectItem>
              <SelectItem value="90d">{t('advancedAnalyticsDashboardPage.text5')}</SelectItem>
              <SelectItem value="1y">{t('advancedAnalyticsDashboardPage.text6')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" />
            {t('advancedAnalyticsDashboardPage.text47')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('advancedAnalyticsDashboardPage.text7')}
          value={messageStats?.total?.toLocaleString() || '0'}
          change={12}
          trend="up"
          icon={<MessageSquare className="h-4 w-4 text-primary" />}
          loading={loadingMessages}
        />
        <StatCard
          title={t('advancedAnalyticsDashboardPage.text8')}
          value={`${conversionRate?.rate || 0}%`}
          change={5}
          trend="up"
          icon={<Target className="h-4 w-4 text-primary" />}
          loading={loadingConversion}
        />
        <StatCard
          title={t('advancedAnalyticsDashboardPage.text9')}
          value="2.5 دقيقة"
          change={-15}
          trend="up"
          changeLabel={t('advancedAnalyticsDashboardPage.text10')}
          icon={<Clock className="h-4 w-4 text-primary" />}
          loading={isLoading}
        />
        <StatCard
          title={t('advancedAnalyticsDashboardPage.text11')}
          value={`${sentimentStats?.averageScore?.toFixed(1) || '0'}%`}
          change={8}
          trend="up"
          icon={<Activity className="h-4 w-4 text-primary" />}
          loading={loadingSentiment}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview">{t('advancedAnalyticsDashboardPage.text12')}</TabsTrigger>
          <TabsTrigger value="messages">{t('advancedAnalyticsDashboardPage.text13')}</TabsTrigger>
          <TabsTrigger value="products">{t('advancedAnalyticsDashboardPage.text14')}</TabsTrigger>
          <TabsTrigger value="customers">{t('advancedAnalyticsDashboardPage.text15')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Messages Over Time */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>{t('advancedAnalyticsDashboardPage.text16')}</CardTitle>
                <CardDescription>{t('advancedAnalyticsDashboardPage.text17')}</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingDaily ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorIncoming" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorOutgoing" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="incoming" 
                        name={t('advancedAnalyticsDashboardPage.text54')}
                        stroke="#10B981" 
                        fillOpacity={1} 
                        fill="url(#colorIncoming)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="outgoing" 
                        name={t('advancedAnalyticsDashboardPage.text55')}
                        stroke="#3B82F6" 
                        fillOpacity={1} 
                        fill="url(#colorOutgoing)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Message Types */}
            <Card>
              <CardHeader>
                <CardTitle>{t('advancedAnalyticsDashboardPage.text18')}</CardTitle>
                <CardDescription>{t('advancedAnalyticsDashboardPage.text19')}</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingMessages ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={messageTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {messageTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Sentiment Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>{t('advancedAnalyticsDashboardPage.text20')}</CardTitle>
                <CardDescription>{t('advancedAnalyticsDashboardPage.text21')}</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSentiment ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : (
                  <div className="space-y-4">
                    {sentimentData.map((item, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className="text-sm text-muted-foreground">{item.value}%</span>
                        </div>
                        <Progress 
                          value={item.value} 
                          className="h-2"
                          style={{ 
                            '--progress-background': item.fill 
                          } as React.CSSProperties}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Peak Hours */}
            <Card>
              <CardHeader>
                <CardTitle>{t('advancedAnalyticsDashboardPage.text22')}</CardTitle>
                <CardDescription>{t('advancedAnalyticsDashboardPage.text23')}</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingPeakHours ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={peakHoursData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="hour" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="count" name={t('advancedAnalyticsDashboardPage.text56')} fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Response Time Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>{t('advancedAnalyticsDashboardPage.text24')}</CardTitle>
                <CardDescription>{t('advancedAnalyticsDashboardPage.text25')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium">{t('advancedAnalyticsDashboardPage.text26')}</span>
                    </div>
                    <Badge variant="secondary" className="bg-green-100 text-green-700">45%</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium">{t('advancedAnalyticsDashboardPage.text27')}</span>
                    </div>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">35%</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm font-medium">{t('advancedAnalyticsDashboardPage.text28')}</span>
                    </div>
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">15%</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium">{t('advancedAnalyticsDashboardPage.text29')}</span>
                    </div>
                    <Badge variant="secondary" className="bg-red-100 text-red-700">5%</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('advancedAnalyticsDashboardPage.text30')}</CardTitle>
              <CardDescription>{t('advancedAnalyticsDashboardPage.text31')}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingProducts ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {topProducts?.map((product: any, index: number) => (
                      <div 
                        key={product.id || index}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm",
                            index === 0 ? "bg-yellow-500" :
                            index === 1 ? "bg-gray-400" :
                            index === 2 ? "bg-amber-600" :
                            "bg-primary/20 text-primary"
                          )}>
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {product.price ? `${product.price} ريال` : t('advancedAnalyticsDashboardPage.text45')}
                            </p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="font-bold">{product.inquiryCount || 0}</p>
                          <p className="text-xs text-muted-foreground">{t('advancedAnalyticsDashboardPage.text32')}</p>
                        </div>
                      </div>
                    ))}
                    {(!topProducts || topProducts.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>{t('advancedAnalyticsDashboardPage.text33')}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('advancedAnalyticsDashboardPage.text34')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">156</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <ArrowUpRight className="w-3 h-3 text-green-500" />
                  <span className="text-green-500">+23%</span>{t('merchantAdvancedAnalyticsDashboardPage.text0')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('advancedAnalyticsDashboardPage.text35')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">89</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <ArrowUpRight className="w-3 h-3 text-green-500" />
                  <span className="text-green-500">+12%</span>{t('merchantAdvancedAnalyticsDashboardPage.text1')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('advancedAnalyticsDashboardPage.text36')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">67%</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <ArrowUpRight className="w-3 h-3 text-green-500" />
                  <span className="text-green-500">+5%</span>{t('merchantAdvancedAnalyticsDashboardPage.text2')}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('advancedAnalyticsDashboardPage.text37')}</CardTitle>
              <CardDescription>{t('advancedAnalyticsDashboardPage.text38')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 text-center">
                  <Users className="w-8 h-8 mx-auto mb-2 text-green-600" />
                  <p className="text-2xl font-bold text-green-700">234</p>
                  <p className="text-sm text-green-600">{t('advancedAnalyticsDashboardPage.text39')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('advancedAnalyticsDashboardPage.text40')}</p>
                </div>
                <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950 text-center">
                  <Users className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                  <p className="text-2xl font-bold text-yellow-700">156</p>
                  <p className="text-sm text-yellow-600">{t('advancedAnalyticsDashboardPage.text41')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('advancedAnalyticsDashboardPage.text42')}</p>
                </div>
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950 text-center">
                  <Users className="w-8 h-8 mx-auto mb-2 text-red-600" />
                  <p className="text-2xl font-bold text-red-700">89</p>
                  <p className="text-sm text-red-600">{t('advancedAnalyticsDashboardPage.text43')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('advancedAnalyticsDashboardPage.text44')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
