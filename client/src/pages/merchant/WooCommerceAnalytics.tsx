/**
 * WooCommerce Analytics Page
 * 
 * لوحة تحليلات WooCommerce - عرض إحصائيات المبيعات والمنتجات الأكثر مبيعاً ومعدل التحويل
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, ShoppingCart, Users, DollarSign, Package, Target, RefreshCw } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';

export default function WooCommerceAnalytics() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Fetch analytics data
  const { data: salesStats, isLoading: isLoadingSales, refetch: refetchSales } = trpc.woocommerce.getSalesStats.useQuery({
    period,
    startDate,
    endDate,
  });

  const { data: topProducts, isLoading: isLoadingProducts, refetch: refetchProducts } = trpc.woocommerce.getTopProducts.useQuery({
    limit: 10,
    startDate,
    endDate,
  });

  const { data: conversionRate, isLoading: isLoadingConversion, refetch: refetchConversion } = trpc.woocommerce.getConversionRate.useQuery({
    startDate,
    endDate,
  });

  const { data: customerStats, isLoading: isLoadingCustomers, refetch: refetchCustomers } = trpc.woocommerce.getCustomerStats.useQuery({
    startDate,
    endDate,
  });

  const handleRefresh = () => {
    refetchSales();
    refetchProducts();
    refetchConversion();
    refetchCustomers();
  };

  const isLoading = isLoadingSales || isLoadingProducts || isLoadingConversion || isLoadingCustomers;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('wooCommerceAnalyticsPage.text0')}</h1>
          <p className="text-muted-foreground">
            {t('wooCommerceAnalyticsPage.text37')}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="ml-2 h-4 w-4" />
          {t('wooCommerceAnalyticsPage.text38')}
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('wooCommerceAnalyticsPage.text1')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>{t('wooCommerceAnalyticsPage.text2')}</Label>
              <Select value={period} onValueChange={(value: any) => setPeriod(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t('wooCommerceAnalyticsPage.text3')}</SelectItem>
                  <SelectItem value="weekly">{t('wooCommerceAnalyticsPage.text4')}</SelectItem>
                  <SelectItem value="monthly">{t('wooCommerceAnalyticsPage.text5')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">{t('wooCommerceAnalyticsPage.text6')}</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">{t('wooCommerceAnalyticsPage.text7')}</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button onClick={handleRefresh} className="w-full">
                {t('wooCommerceAnalyticsPage.text39')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('wooCommerceAnalyticsPage.text8')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {t('wooCommerceAnalyticsPage.text47', { var0: salesStats?.totalRevenue.toFixed(2) })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('wooCommerceAnalyticsPage.text48', { var0: salesStats?.totalOrders })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('wooCommerceAnalyticsPage.text9')}</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {t('wooCommerceAnalyticsPage.text49', { var0: salesStats?.averageOrderValue.toFixed(2) })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('wooCommerceAnalyticsPage.text40')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('wooCommerceAnalyticsPage.text10')}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversionRate?.conversionRate.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('wooCommerceAnalyticsPage.text50', { var0: conversionRate?.totalConversations })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('wooCommerceAnalyticsPage.text11')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customerStats?.totalCustomers}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('wooCommerceAnalyticsPage.text51', { var0: customerStats?.newCustomers, var1: customerStats?.returningCustomers })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed analytics */}
      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sales">{t('wooCommerceAnalyticsPage.text12')}</TabsTrigger>
          <TabsTrigger value="products">{t('wooCommerceAnalyticsPage.text13')}</TabsTrigger>
          <TabsTrigger value="conversion">{t('wooCommerceAnalyticsPage.text14')}</TabsTrigger>
          <TabsTrigger value="customers">{t('wooCommerceAnalyticsPage.text15')}</TabsTrigger>
        </TabsList>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('wooCommerceAnalyticsPage.text16')}</CardTitle>
              <CardDescription>
                {t('wooCommerceAnalyticsPage.text41')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={salesStats?.chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#8884d8"
                    name={t('wooCommerceAnalyticsPage.text57')}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="orders"
                    stroke="#82ca9d"
                    name={t('wooCommerceAnalyticsPage.text58')}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('wooCommerceAnalyticsPage.text17')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {salesStats?.completedOrders}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('wooCommerceAnalyticsPage.text18')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {salesStats?.processingOrders}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('wooCommerceAnalyticsPage.text19')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">
                  {salesStats?.cancelledOrders}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('wooCommerceAnalyticsPage.text20')}</CardTitle>
              <CardDescription>
                {t('wooCommerceAnalyticsPage.text42')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={150} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="quantity" fill="#8884d8" name={t('wooCommerceAnalyticsPage.text59')} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('wooCommerceAnalyticsPage.text21')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topProducts?.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('wooCommerceAnalyticsPage.text52', { var0: product.quantity })}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-lg">{product.revenue.toFixed(2)} ر.س</p>
                      <p className="text-sm text-muted-foreground">{t('wooCommerceAnalyticsPage.text23')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversion Tab */}
        <TabsContent value="conversion" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('wooCommerceAnalyticsPage.text24')}</CardTitle>
                <CardDescription>
                  {t('wooCommerceAnalyticsPage.text43')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-5xl font-bold text-center text-primary mb-4">
                  {conversionRate?.conversionRate.toFixed(2)}%
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wooCommerceAnalyticsPage.text25')}</span>
                    <span className="font-medium">{conversionRate?.totalConversations}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wooCommerceAnalyticsPage.text26')}</span>
                    <span className="font-medium">{conversionRate?.totalOrders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wooCommerceAnalyticsPage.text27')}</span>
                    <span className="font-medium">{conversionRate?.completedOrders}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('wooCommerceAnalyticsPage.text28')}</CardTitle>
                <CardDescription>
                  {t('wooCommerceAnalyticsPage.text44')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-5xl font-bold text-center text-green-600 mb-4">
                  {conversionRate?.completionRate.toFixed(2)}%
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wooCommerceAnalyticsPage.text29')}</span>
                    <span className="font-medium">{conversionRate?.whatsappOrders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('wooCommerceAnalyticsPage.text30')}</span>
                    <span className="font-medium">{conversionRate?.whatsappRevenue.toFixed(2)} ر.س</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('wooCommerceAnalyticsPage.text32')}</CardTitle>
              <CardDescription>
                {t('wooCommerceAnalyticsPage.text45')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="relative">
                  <div className="h-16 bg-blue-500 flex items-center justify-center text-white font-bold rounded">
                    {t('wooCommerceAnalyticsPage.text53', { var0: conversionRate?.totalConversations })}
                  </div>
                </div>
                <div className="relative mx-8">
                  <div className="h-16 bg-green-500 flex items-center justify-center text-white font-bold rounded">
                    {t('wooCommerceAnalyticsPage.text54', { var0: conversionRate?.totalOrders })}
                  </div>
                </div>
                <div className="relative mx-16">
                  <div className="h-16 bg-emerald-600 flex items-center justify-center text-white font-bold rounded">
                    {t('wooCommerceAnalyticsPage.text55', { var0: conversionRate?.completedOrders })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('wooCommerceAnalyticsPage.text33')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-center text-primary">
                  {customerStats?.totalCustomers}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('wooCommerceAnalyticsPage.text34')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-center text-blue-600">
                  {customerStats?.newCustomers}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('wooCommerceAnalyticsPage.text35')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-center text-green-600">
                  {customerStats?.returningCustomers}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('wooCommerceAnalyticsPage.text36')}</CardTitle>
              <CardDescription>
                {t('wooCommerceAnalyticsPage.text46')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-center text-primary mb-4">
                {customerStats?.repeatCustomerRate.toFixed(2)}%
              </div>
              <p className="text-center text-muted-foreground">
                {t('wooCommerceAnalyticsPage.text56', { var0: customerStats?.returningCustomers, var1: customerStats?.totalCustomers })}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
