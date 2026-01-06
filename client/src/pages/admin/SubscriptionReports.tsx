import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { useState } from "react";
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
  ResponsiveContainer
} from 'recharts';

export default function SubscriptionReports() {
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'year'>('month');

  const { data: overview, isLoading: overviewLoading } = trpc.subscriptionReports.getOverview.useQuery();
  const { data: conversionRate, isLoading: conversionLoading } = trpc.subscriptionReports.getConversionRate.useQuery({ period: dateRange });
  const { data: upgradeDowngrade, isLoading: upgradeLoading } = trpc.subscriptionReports.getUpgradeDowngrade.useQuery({ period: dateRange });
  const { data: cancellations, isLoading: cancellationsLoading } = trpc.subscriptionReports.getCancellations.useQuery({ period: dateRange });
  const { data: revenue, isLoading: revenueLoading } = trpc.subscriptionReports.getRevenue.useQuery({ period: dateRange });

  const isLoading = overviewLoading || conversionLoading || upgradeLoading || cancellationsLoading || revenueLoading;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  // Colors for charts
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  // Prepare conversion rate chart data
  const conversionChartData = conversionRate?.history?.map(item => ({
    date: new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
    rate: item.rate
  })) || [];

  // Prepare upgrade/downgrade chart data
  const upgradeDowngradeData = [
    { name: 'ترقيات', value: upgradeDowngrade?.upgrades || 0, color: '#10b981' },
    { name: 'تخفيضات', value: upgradeDowngrade?.downgrades || 0, color: '#ef4444' }
  ];

  // Prepare cancellation reasons chart
  const cancellationReasonsData = cancellations?.reasons?.map((reason, index) => ({
    name: reason.reason,
    value: reason.count,
    color: COLORS[index % COLORS.length]
  })) || [];

  // Prepare revenue chart data
  const revenueChartData = revenue?.monthly?.map(item => ({
    month: new Date(item.month).toLocaleDateString('ar-SA', { month: 'short' }),
    revenue: item.revenue,
    subscriptions: item.subscriptions
  })) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">تقارير الاشتراكات</h1>
          <p className="text-muted-foreground mt-1">
            تحليل شامل لأداء الاشتراكات والإيرادات
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={dateRange === 'week' ? 'default' : 'outline'}
            onClick={() => setDateRange('week')}
          >
            أسبوع
          </Button>
          <Button
            variant={dateRange === 'month' ? 'default' : 'outline'}
            onClick={() => setDateRange('month')}
          >
            شهر
          </Button>
          <Button
            variant={dateRange === 'year' ? 'default' : 'outline'}
            onClick={() => setDateRange('year')}
          >
            سنة
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الاشتراكات</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.totalSubscriptions || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview?.activeSubscriptions || 0} نشط
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الإيرادات الشهرية</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.monthlyRevenue?.toFixed(2) || '0.00'} ريال</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview?.yearlyRevenue?.toFixed(2) || '0.00'} ريال سنوياً
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">معدل التحويل</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate?.currentRate?.toFixed(1) || '0.0'}%</div>
            <div className="flex items-center text-xs mt-1">
              {(conversionRate?.change || 0) >= 0 ? (
                <>
                  <ArrowUpRight className="h-3 w-3 text-green-600" />
                  <span className="text-green-600">+{conversionRate?.change?.toFixed(1)}%</span>
                </>
              ) : (
                <>
                  <ArrowDownRight className="h-3 w-3 text-red-600" />
                  <span className="text-red-600">{conversionRate?.change?.toFixed(1)}%</span>
                </>
              )}
              <span className="text-muted-foreground mr-1">عن الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">معدل الإلغاء</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cancellations?.cancellationRate?.toFixed(1) || '0.0'}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {cancellations?.totalCancellations || 0} إلغاء
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Rate Chart */}
      <Card>
        <CardHeader>
          <CardTitle>معدل التحويل من تجربة مجانية إلى اشتراك مدفوع</CardTitle>
          <CardDescription>تتبع نسبة التحويل خلال الفترة المحددة</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={conversionChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="rate" 
                stroke="#10b981" 
                strokeWidth={2}
                name="معدل التحويل (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Upgrade/Downgrade Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>الترقيات والتخفيضات</CardTitle>
            <CardDescription>مقارنة بين الترقيات والتخفيضات</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={upgradeDowngradeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {upgradeDowngradeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">نسبة الترقيات:</span>
                <Badge variant="default" className="bg-green-600">
                  {upgradeDowngrade?.upgradeRate?.toFixed(1)}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">نسبة التخفيضات:</span>
                <Badge variant="destructive">
                  {upgradeDowngrade?.downgradeRate?.toFixed(1)}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cancellation Reasons */}
        <Card>
          <CardHeader>
            <CardTitle>أسباب الإلغاء</CardTitle>
            <CardDescription>تحليل أسباب إلغاء الاشتراكات</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cancellationReasonsData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="value" name="العدد">
                  {cancellationReasonsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle>الإيرادات الشهرية</CardTitle>
          <CardDescription>تتبع الإيرادات وعدد الاشتراكات شهرياً</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Bar 
                yAxisId="left" 
                dataKey="revenue" 
                fill="#3b82f6" 
                name="الإيرادات (ريال)"
              />
              <Bar 
                yAxisId="right" 
                dataKey="subscriptions" 
                fill="#10b981" 
                name="عدد الاشتراكات"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Revenue Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>ملخص الإيرادات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-right p-2">الشهر</th>
                  <th className="text-right p-2">عدد الاشتراكات</th>
                  <th className="text-right p-2">الإيرادات</th>
                  <th className="text-right p-2">متوسط الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {revenueChartData.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="p-2">{item.month}</td>
                    <td className="p-2">{item.subscriptions}</td>
                    <td className="p-2">{item.revenue.toFixed(2)} ريال</td>
                    <td className="p-2">
                      {item.subscriptions > 0 
                        ? (item.revenue / item.subscriptions).toFixed(2) 
                        : '0.00'} ريال
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
