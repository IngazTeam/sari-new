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
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useTranslation } from 'react-i18next';

export default function Reports() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const [isExporting, setIsExporting] = useState(false);

  // Fetch reports data
  const { data: salesReport, isLoading: loadingSales } =
    trpc.reports.getSalesReport.useQuery({ period });

  const { data: customersReport, isLoading: loadingCustomers } =
    trpc.reports.getCustomersReport.useQuery({ period });

  const { data: conversationsReport, isLoading: loadingConversations } =
    trpc.reports.getConversationsReport.useQuery({ period });

  // Export mutations — BUG FIX: was previously a TODO placeholder that only showed a toast
  const exportPDFMutation = trpc.messageAnalytics.exportPDF.useMutation({
    onSuccess: (data) => {
      // Convert base64 to blob and trigger download
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "تم التصدير", description: "تم تحميل التقرير بنجاح" });
      setIsExporting(false);
    },
    onError: (error) => {
      toast({ title: "خطأ في التصدير", description: error.message, variant: "destructive" });
      setIsExporting(false);
    },
  });

  const exportExcelMutation = trpc.messageAnalytics.exportExcel.useMutation({
    onSuccess: (data) => {
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "تم التصدير", description: "تم تحميل التقرير بنجاح" });
      setIsExporting(false);
    },
    onError: (error) => {
      toast({ title: "خطأ في التصدير", description: error.message, variant: "destructive" });
      setIsExporting(false);
    },
  });

  const handleExportReport = (reportType: string, format: 'pdf' | 'excel' = 'pdf') => {
    setIsExporting(true);
    toast({
      title: "جاري التصدير",
      description: `سيتم تحميل تقرير ${reportType} قريباً`,
    });
    const params = { startDate: undefined, endDate: undefined };
    if (format === 'excel') {
      exportExcelMutation.mutate(params);
    } else {
      exportPDFMutation.mutate(params);
    }
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('reportsPage.text0')}</h1>
          <p className="text-muted-foreground mt-1">{t('reports.auto_0')}</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{t('reportsPage.text1')}</SelectItem>
              <SelectItem value="week">{t('reportsPage.text2')}</SelectItem>
              <SelectItem value="month">{t('reportsPage.text3')}</SelectItem>
              <SelectItem value="year">{t('reportsPage.text4')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sales">{t('reportsPage.text5')}</TabsTrigger>
          <TabsTrigger value="customers">{t('reportsPage.text6')}</TabsTrigger>
          <TabsTrigger value="conversations">{t('reportsPage.text7')}</TabsTrigger>
        </TabsList>

        {/* Sales Report */}
        <TabsContent value="sales" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">{t('reportsPage.text8')}</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleExportReport("المبيعات", "pdf")}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
                تصدير PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExportReport("المبيعات", "excel")}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
                تصدير Excel
              </Button>
            </div>
          </div>

          {loadingSales ? (
            <div className="text-center py-8">{t('reportsPage.text9')}</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_1')}</CardTitle>
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
                    <CardTitle className="text-sm font-medium">{t('reports.auto_2')}</CardTitle>
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {salesReport?.totalOrders || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_3')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_4')}</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(salesReport?.averageOrderValue || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_5')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_6')}</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {salesReport?.conversionRate || 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_7')}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Products */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('reportsPage.text10')}</CardTitle>
                  <CardDescription>{t('reports.auto_8')}</CardDescription>
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
                    <p className="text-center py-8 text-muted-foreground">{t('reports.auto_9')}</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Customers Report */}
        <TabsContent value="customers" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">{t('reportsPage.text11')}</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleExportReport("العملاء", "pdf")}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
                تصدير PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExportReport("العملاء", "excel")}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
                تصدير Excel
              </Button>
            </div>
          </div>

          {loadingCustomers ? (
            <div className="text-center py-8">{t('reportsPage.text12')}</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_10')}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {customersReport?.totalCustomers || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_11')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_12')}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {customersReport?.newCustomers || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_13')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_14')}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {customersReport?.activeCustomers || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_15')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_16')}</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {customersReport?.retentionRate || 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_17')}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Customers */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('reportsPage.text13')}</CardTitle>
                  <CardDescription>{t('reports.auto_18')}</CardDescription>
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
                    <p className="text-center py-8 text-muted-foreground">{t('reports.auto_19')}</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Conversations Report */}
        <TabsContent value="conversations" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">{t('reportsPage.text14')}</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleExportReport("المحادثات", "pdf")}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
                تصدير PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExportReport("المحادثات", "excel")}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
                تصدير Excel
              </Button>
            </div>
          </div>

          {loadingConversations ? (
            <div className="text-center py-8">{t('reportsPage.text15')}</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_20')}</CardTitle>
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {conversationsReport?.totalConversations || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_21')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_22')}</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {conversationsReport?.averageResponseTime || 0} دقيقة
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_23')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_24')}</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {conversationsReport?.satisfactionRate || 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_25')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.auto_26')}</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {conversationsReport?.conversionRate || 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">{t('reports.auto_27')}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Conversation Topics */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('reportsPage.text16')}</CardTitle>
                  <CardDescription>{t('reports.auto_28')}</CardDescription>
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
                    <p className="text-center py-8 text-muted-foreground">{t('reports.auto_29')}</p>
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
