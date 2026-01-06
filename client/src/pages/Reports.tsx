import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  ShoppingBag,
  MessageSquare,
  Download,
  Calendar,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/CurrencyContext";

export default function Reports() {
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");

  // Fetch reports data
  const { data: salesReport, isLoading: loadingSales } =
    trpc.reports.getSalesReport.useQuery({ period });

  const { data: customersReport, isLoading: loadingCustomers } =
    trpc.reports.getCustomersReport.useQuery({ period });

  const { data: conversationsReport, isLoading: loadingConversations } =
    trpc.reports.getConversationsReport.useQuery({ period });

  const handleExportReport = (reportType: string) => {
    toast({
      title: "جاري التصدير",
      description: `سيتم تحميل تقرير ${reportType} قريباً`,
    });
    // TODO: Implement export functionality
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">التقارير والإحصائيات</h1>
          <p className="text-muted-foreground mt-1">
            تقارير شاملة عن أداء عملك
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">اليوم</SelectItem>
              <SelectItem value="week">هذا الأسبوع</SelectItem>
              <SelectItem value="month">هذا الشهر</SelectItem>
              <SelectItem value="year">هذا العام</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sales">تقرير المبيعات</TabsTrigger>
          <TabsTrigger value="customers">تقرير العملاء</TabsTrigger>
          <TabsTrigger value="conversations">تقرير المحادثات</TabsTrigger>
        </TabsList>

        {/* Sales Report */}
        <TabsContent value="sales" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">تقرير المبيعات</h2>
            <Button
              variant="outline"
              onClick={() => handleExportReport("المبيعات")}
            >
              <Download className="ml-2 h-4 w-4" />
              تصدير PDF
            </Button>
          </div>

          {loadingSales ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      إجمالي المبيعات
                    </CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(salesReport?.totalRevenue || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {salesReport?.growth > 0 ? "+" : ""}
                      {salesReport?.growth || 0}% عن الفترة السابقة
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      عدد الطلبات
                    </CardTitle>
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {salesReport?.totalOrders || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      طلب خلال الفترة
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      متوسط قيمة الطلب
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(salesReport?.averageOrderValue || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      لكل طلب
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      معدل التحويل
                    </CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {salesReport?.conversionRate || 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      من المحادثات للطلبات
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Products */}
              <Card>
                <CardHeader>
                  <CardTitle>أكثر المنتجات مبيعاً</CardTitle>
                  <CardDescription>
                    المنتجات الأكثر طلباً خلال الفترة
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {salesReport?.topProducts?.length > 0 ? (
                    <div className="space-y-3">
                      {salesReport.topProducts.map((product: any, index: number) => (
                        <div
                          key={index}
                          className="flex justify-between items-center p-3 border rounded-lg"
                        >
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {product.quantity} وحدة مباعة
                            </p>
                          </div>
                          <p className="font-bold">
                            {formatCurrency(product.revenue)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground">
                      لا توجد بيانات
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Customers Report */}
        <TabsContent value="customers" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">تقرير العملاء</h2>
            <Button
              variant="outline"
              onClick={() => handleExportReport("العملاء")}
            >
              <Download className="ml-2 h-4 w-4" />
              تصدير PDF
            </Button>
          </div>

          {loadingCustomers ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      إجمالي العملاء
                    </CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {customersReport?.totalCustomers || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      عميل مسجل
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      عملاء جدد
                    </CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {customersReport?.newCustomers || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      خلال الفترة
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      عملاء نشطين
                    </CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {customersReport?.activeCustomers || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      تفاعلوا خلال الفترة
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      معدل الاحتفاظ
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {customersReport?.retentionRate || 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      عملاء عائدين
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Customers */}
              <Card>
                <CardHeader>
                  <CardTitle>أفضل العملاء</CardTitle>
                  <CardDescription>
                    العملاء الأكثر إنفاقاً خلال الفترة
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {customersReport?.topCustomers?.length > 0 ? (
                    <div className="space-y-3">
                      {customersReport.topCustomers.map(
                        (customer: any, index: number) => (
                          <div
                            key={index}
                            className="flex justify-between items-center p-3 border rounded-lg"
                          >
                            <div>
                              <p className="font-medium">{customer.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {customer.ordersCount} طلب
                              </p>
                            </div>
                            <p className="font-bold">
                              {formatCurrency(customer.totalSpent)}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground">
                      لا توجد بيانات
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Conversations Report */}
        <TabsContent value="conversations" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">تقرير المحادثات</h2>
            <Button
              variant="outline"
              onClick={() => handleExportReport("المحادثات")}
            >
              <Download className="ml-2 h-4 w-4" />
              تصدير PDF
            </Button>
          </div>

          {loadingConversations ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      إجمالي المحادثات
                    </CardTitle>
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {conversationsReport?.totalConversations || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      محادثة خلال الفترة
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      متوسط وقت الرد
                    </CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {conversationsReport?.averageResponseTime || 0} دقيقة
                    </div>
                    <p className="text-xs text-muted-foreground">
                      وقت الاستجابة
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      معدل الرضا
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {conversationsReport?.satisfactionRate || 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      رضا العملاء
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      معدل التحويل
                    </CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {conversationsReport?.conversionRate || 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      من محادثة لطلب
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Conversation Topics */}
              <Card>
                <CardHeader>
                  <CardTitle>المواضيع الأكثر شيوعاً</CardTitle>
                  <CardDescription>
                    أكثر المواضيع التي يسأل عنها العملاء
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {conversationsReport?.topTopics?.length > 0 ? (
                    <div className="space-y-3">
                      {conversationsReport.topTopics.map(
                        (topic: any, index: number) => (
                          <div
                            key={index}
                            className="flex justify-between items-center p-3 border rounded-lg"
                          >
                            <p className="font-medium">{topic.name}</p>
                            <p className="text-muted-foreground">
                              {topic.count} محادثة
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground">
                      لا توجد بيانات
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
