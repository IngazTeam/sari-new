import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  Target,
  BarChart3,
  Clock,
  Calendar,
  Package,
  Megaphone,
  Ticket,
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

// Date range presets
// Date range keys mapped to days
const DATE_RANGE_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

// Colors for charts
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [dateRange, setDateRange] = useState<keyof typeof DATE_RANGE_DAYS>('30d');

  const DATE_RANGES = {
    '7d': { label: t('analyticsDashboardPage.last7Days'), days: 7 },
    '30d': { label: t('analyticsDashboardPage.last30Days'), days: 30 },
    '90d': { label: t('analyticsDashboardPage.last90Days'), days: 90 },
    '1y': { label: t('analyticsDashboardPage.lastYear'), days: 365 },
  };

  // Get merchant
  const { data: merchant } = trpc.merchants.getCurrent.useQuery();

  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - DATE_RANGES[dateRange].days);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [dateRange]);

  // Fetch analytics data
  const { data: kpis } = trpc.analytics.getDashboardKPIs.useQuery(
    {
      merchantId: merchant?.id || 0,
      startDate,
      endDate,
    },
    { enabled: !!merchant }
  );

  const { data: revenueTrends = [] } = trpc.analytics.getRevenueTrends.useQuery(
    {
      merchantId: merchant?.id || 0,
      startDate,
      endDate,
      groupBy: dateRange === '7d' ? 'day' : dateRange === '30d' ? 'day' : 'week',
    },
    { enabled: !!merchant }
  );

  const { data: topProducts = [] } = trpc.analytics.getTopProducts.useQuery(
    {
      merchantId: merchant?.id || 0,
      startDate,
      endDate,
      limit: 10,
    },
    { enabled: !!merchant }
  );

  const { data: campaignAnalytics = [] } = trpc.analytics.getCampaignAnalytics.useQuery(
    {
      merchantId: merchant?.id || 0,
      startDate,
      endDate,
    },
    { enabled: !!merchant }
  );

  const { data: customerSegments = [] } = trpc.analytics.getCustomerSegments.useQuery(
    {
      merchantId: merchant?.id || 0,
      startDate,
      endDate,
    },
    { enabled: !!merchant }
  );

  const { data: hourlyAnalytics = [] } = trpc.analytics.getHourlyAnalytics.useQuery(
    {
      merchantId: merchant?.id || 0,
      startDate,
      endDate,
    },
    { enabled: !!merchant }
  );

  const { data: weekdayAnalytics = [] } = trpc.analytics.getWeekdayAnalytics.useQuery(
    {
      merchantId: merchant?.id || 0,
      startDate,
      endDate,
    },
    { enabled: !!merchant }
  );

  const { data: discountAnalytics = [] } = trpc.analytics.getDiscountCodeAnalytics.useQuery(
    {
      merchantId: merchant?.id || 0,
      startDate,
      endDate,
    },
    { enabled: !!merchant }
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-SA' : i18n.language, {
      style: 'currency',
      currency: 'SAR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : i18n.language, {
      month: 'short',
      day: 'numeric',
    });
  };

  const getGrowthIcon = (growth: number) => {
    return growth >= 0 ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  const getGrowthColor = (growth: number) => {
    return growth >= 0 ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('analyticsDashboardPage.title')}</h1>
          <p className="text-muted-foreground">
            {t('analyticsDashboardPage.subtitle')}
          </p>
        </div>

        <Select value={dateRange} onValueChange={(value) => setDateRange(value as keyof typeof DATE_RANGES)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DATE_RANGES).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analyticsDashboardPage.totalRevenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.totalRevenue || 0)}</div>
            <div className={`flex items-center gap-1 text-xs ${getGrowthColor(kpis?.revenueGrowth || 0)}`}>
              {getGrowthIcon(kpis?.revenueGrowth || 0)}
              <span>{formatPercent(Math.abs(kpis?.revenueGrowth || 0))} {t('analyticsDashboardPage.vsPreviousPeriod')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analyticsDashboardPage.totalOrders')}</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.totalOrders || 0}</div>
            <div className={`flex items-center gap-1 text-xs ${getGrowthColor(kpis?.ordersGrowth || 0)}`}>
              {getGrowthIcon(kpis?.ordersGrowth || 0)}
              <span>{formatPercent(Math.abs(kpis?.ordersGrowth || 0))} {t('analyticsDashboardPage.vsPreviousPeriod')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analyticsDashboardPage.avgOrderValue')}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.averageOrderValue || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('analyticsDashboardPage.perOrder')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analyticsDashboardPage.conversionRate')}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(kpis?.conversionRate || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">{kpis?.totalCustomers || 0} {t('analyticsDashboardPage.customer')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t('analyticsDashboardPage.tabOverview')}</TabsTrigger>
          <TabsTrigger value="products">{t('analyticsDashboardPage.tabProducts')}</TabsTrigger>
          <TabsTrigger value="campaigns">{t('analyticsDashboardPage.tabCampaigns')}</TabsTrigger>
          <TabsTrigger value="customers">{t('analyticsDashboardPage.tabCustomers')}</TabsTrigger>
          <TabsTrigger value="time">{t('analyticsDashboardPage.tabTime')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Revenue Trends */}
          <Card>
            <CardHeader>
              <CardTitle>{t('analyticsDashboardPage.revenueTrends')}</CardTitle>
              <CardDescription>{t('analyticsDashboardPage.revenueTrendsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDate} />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    labelFormatter={formatDate}
                    formatter={(value: number, name: string) => [
                      name === 'revenue' ? formatCurrency(value) : value,
                      name === 'revenue' ? t('analyticsDashboardPage.revenue') : t('analyticsDashboardPage.orders'),
                    ]}
                  />
                  <Legend formatter={(value) => (value === 'revenue' ? t('analyticsDashboardPage.revenue') : t('analyticsDashboardPage.orders'))} />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Customer Segments */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('analyticsDashboardPage.customerSegments')}</CardTitle>
                <CardDescription>{t('analyticsDashboardPage.customerSegmentsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={customerSegments}
                      dataKey="count"
                      nameKey="segment"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => {
                        const labels = { new: t('analyticsDashboardPage.segmentNew'), returning: t('analyticsDashboardPage.segmentReturning'), vip: t('analyticsDashboardPage.segmentVIP') };
                        return `${labels[entry.segment as keyof typeof labels]}: ${entry.count}`;
                      }}
                    >
                      {customerSegments.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('analyticsDashboardPage.segmentStats')}</CardTitle>
                <CardDescription>{t('analyticsDashboardPage.segmentStatsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {customerSegments.map((segment, index) => {
                    const labels = { new: t('analyticsDashboardPage.newCustomers'), returning: t('analyticsDashboardPage.returningCustomers'), vip: t('analyticsDashboardPage.vipCustomers') };
                    return (
                      <div key={segment.segment} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <div>
                            <p className="font-medium">{labels[segment.segment as keyof typeof labels]}</p>
                            <p className="text-sm text-muted-foreground">{segment.count} {t('analyticsDashboardPage.customer')}</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="font-medium">{formatCurrency(segment.revenue)}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(segment.averageOrderValue)} {t('analyticsDashboardPage.average')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {t('analyticsDashboardPage.topProducts')}
              </CardTitle>
              <CardDescription>{t('analyticsDashboardPage.topProductsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('analyticsDashboardPage.noSalesData')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('analyticsDashboardPage.product')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.sales')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.revenueCol')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.avgPrice')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.stock')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((product, index) => (
                      <TableRow key={product.productId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <span className="font-medium">{product.productName}</span>
                          </div>
                        </TableCell>
                        <TableCell>{product.totalSales}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(product.totalRevenue)}</TableCell>
                        <TableCell>{formatCurrency(product.averagePrice)}</TableCell>
                        <TableCell>
                          <Badge variant={product.stockLevel > 10 ? 'default' : 'destructive'}>
                            {product.stockLevel}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5" />
                {t('analyticsDashboardPage.campaignPerformance')}
              </CardTitle>
              <CardDescription>{t('analyticsDashboardPage.campaignPerformanceDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {campaignAnalytics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('analyticsDashboardPage.noCampaigns')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('analyticsDashboardPage.campaign')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.sent')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.openRate')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.clickRate')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.conversionRateCol')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.revenueCol')}</TableHead>
                      <TableHead>ROI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignAnalytics.map((campaign) => (
                      <TableRow key={campaign.campaignId}>
                        <TableCell className="font-medium">{campaign.campaignName}</TableCell>
                        <TableCell>{campaign.sentCount}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{formatPercent(campaign.openRate)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{formatPercent(campaign.clickRate)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="default">{formatPercent(campaign.conversionRate)}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(campaign.revenue)}</TableCell>
                        <TableCell>
                          <Badge variant="default" className="bg-green-600">
                            {campaign.roi > 100 ? '999+%' : formatPercent(campaign.roi)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Discount Codes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-5 w-5" />
                {t('analyticsDashboardPage.discountCodes')}
              </CardTitle>
              <CardDescription>{t('analyticsDashboardPage.discountCodesDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {discountAnalytics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('analyticsDashboardPage.noDiscounts')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('analyticsDashboardPage.code')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.type')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.value')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.usages')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.revenueCol')}</TableHead>
                      <TableHead>{t('analyticsDashboardPage.avgOrder')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discountAnalytics.map((discount) => (
                      <TableRow key={discount.code}>
                        <TableCell>
                          <code className="bg-muted px-2 py-1 rounded text-sm">{discount.code}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {discount.type === 'percentage' ? t('analyticsDashboardPage.percentage') : t('analyticsDashboardPage.fixedAmount')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {discount.type === 'percentage'
                            ? `${discount.value}%`
                            : formatCurrency(discount.value)}
                        </TableCell>
                        <TableCell>{discount.usageCount}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(discount.revenue)}</TableCell>
                        <TableCell>{formatCurrency(discount.averageOrderValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('analyticsDashboardPage.customerAnalysis')}
              </CardTitle>
              <CardDescription>{t('analyticsDashboardPage.customerAnalysisDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {customerSegments.map((segment, index) => {
                  const labels = { new: t('analyticsDashboardPage.newCustomers'), returning: t('analyticsDashboardPage.returningCustomers'), vip: t('analyticsDashboardPage.vipCustomers') };
                  const descriptions = {
                    new: t('analyticsDashboardPage.newCustomerDesc'),
                    returning: t('analyticsDashboardPage.returningCustomerDesc'),
                    vip: t('analyticsDashboardPage.vipCustomerDesc'),
                  };
                  return (
                    <Card key={segment.segment} className="border-2">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <CardTitle className="text-lg">
                            {labels[segment.segment as keyof typeof labels]}
                          </CardTitle>
                        </div>
                        <CardDescription>
                          {descriptions[segment.segment as keyof typeof descriptions]}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{t('analyticsDashboardPage.customerCount')}</span>
                          <span className="font-bold">{segment.count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{t('analyticsDashboardPage.revenueLabel')}</span>
                          <span className="font-bold">{formatCurrency(segment.revenue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{t('analyticsDashboardPage.avgOrderLabel')}</span>
                          <span className="font-bold">{formatCurrency(segment.averageOrderValue)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Time Tab */}
        <TabsContent value="time" className="space-y-4">
          {/* Hourly Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {t('analyticsDashboardPage.hourlyAnalysis')}
              </CardTitle>
              <CardDescription>{t('analyticsDashboardPage.hourlyAnalysisDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyAnalytics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tickFormatter={(hour) => `${hour}:00`} />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(hour) => `${t('analyticsDashboardPage.hour')} ${hour}:00`}
                    formatter={(value: number, name: string) => [
                      name === 'revenue' ? formatCurrency(value) : value,
                      name === 'revenue' ? t('analyticsDashboardPage.revenue') : t('analyticsDashboardPage.orders'),
                    ]}
                  />
                  <Legend formatter={(value) => (value === 'revenue' ? t('analyticsDashboardPage.revenue') : t('analyticsDashboardPage.orders'))} />
                  <Bar dataKey="revenue" fill="#3b82f6" />
                  <Bar dataKey="orders" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Weekday Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t('analyticsDashboardPage.weekdayAnalysis')}
              </CardTitle>
              <CardDescription>{t('analyticsDashboardPage.weekdayAnalysisDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weekdayAnalytics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === 'revenue' ? formatCurrency(value) : value,
                      name === 'revenue' ? t('analyticsDashboardPage.revenue') : t('analyticsDashboardPage.orders'),
                    ]}
                  />
                  <Legend formatter={(value) => (value === 'revenue' ? t('analyticsDashboardPage.revenue') : t('analyticsDashboardPage.orders'))} />
                  <Bar dataKey="revenue" fill="#3b82f6" />
                  <Bar dataKey="orders" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Insights */}
          <Card className="border-primary/30 bg-primary/10/50">
            <CardHeader>
              <CardTitle className="text-primary">{t('analyticsDashboardPage.insightsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-primary">
              <div className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <p className="text-sm">
                  <strong>{t('analyticsDashboardPage.insightCampaignTiming')}</strong> {t('analyticsDashboardPage.insightCampaignTimingDesc')}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <p className="text-sm">
                  <strong>{t('analyticsDashboardPage.insightTargetVIP')}</strong> {t('analyticsDashboardPage.insightTargetVIPDesc')}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <p className="text-sm">
                  <strong>{t('analyticsDashboardPage.insightOptimizeStock')}</strong> {t('analyticsDashboardPage.insightOptimizeStockDesc')}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
