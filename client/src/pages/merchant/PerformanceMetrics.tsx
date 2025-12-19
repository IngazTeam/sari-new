import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Users, MessageSquare, Clock, Target, Activity, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";

export default function PerformanceMetrics() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d">("30d");

  // Fetch metrics data
  const { data: metrics, isLoading } = trpc.metrics.getOverview.useQuery({
    merchantId: user?.merchantId || 0,
    period: dateRange,
  });

  const growthMetrics = [
    {
      id: 1,
      title: "المحادثات",
      value: metrics?.totalConversations || 0,
      change: "+12%",
      icon: MessageSquare,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      description: "إجمالي عدد المحادثات النشطة",
    },
    {
      id: 2,
      title: "الزوار الفريدون",
      value: metrics?.uniqueVisitors || 0,
      change: "+8%",
      icon: Users,
      color: "text-green-600",
      bgColor: "bg-green-50",
      description: "عدد العملاء الفريدين",
    },
    {
      id: 3,
      title: "المستخدمون النشطون",
      value: metrics?.activeUsers || 0,
      change: "+15%",
      icon: Activity,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      description: "المستخدمون الذين تفاعلوا مؤخراً",
    },
    {
      id: 4,
      title: "معدل الاحتفاظ",
      value: `${metrics?.retentionRate || 0}%`,
      change: "+5%",
      icon: TrendingUp,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      description: "نسبة العملاء العائدين",
    },
  ];

  const performanceMetrics = [
    {
      id: 5,
      title: "معدل الإتمام",
      value: `${metrics?.completionRate || 0}%`,
      change: "+7%",
      icon: Target,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
      description: "نسبة المهام المكتملة",
    },
    {
      id: 6,
      title: "معدل التحويل",
      value: `${metrics?.conversionRate || 0}%`,
      change: "+10%",
      icon: BarChart3,
      color: "text-pink-600",
      bgColor: "bg-pink-50",
      description: "نسبة التحويل إلى مبيعات",
    },
    {
      id: 7,
      title: "متوسط وقت الاستجابة",
      value: `${metrics?.avgResponseTime || 0}ث`,
      change: "-20%",
      icon: Clock,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
      description: "متوسط الوقت للرد",
    },
    {
      id: 8,
      title: "معدل الخطأ",
      value: `${metrics?.errorRate || 0}%`,
      change: "-15%",
      icon: Zap,
      color: "text-red-600",
      bgColor: "bg-red-50",
      description: "نسبة الأخطاء في الردود",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">مقاييس الأداء</h1>
        <p className="text-muted-foreground mt-2">
          تتبع وتحليل أداء وكيل المبيعات الذكي سارية
        </p>
      </div>

      {/* Date Range Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setDateRange("7d")}
          className={`px-4 py-2 rounded-lg transition-colors ${
            dateRange === "7d"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          آخر 7 أيام
        </button>
        <button
          onClick={() => setDateRange("30d")}
          className={`px-4 py-2 rounded-lg transition-colors ${
            dateRange === "30d"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          آخر 30 يوم
        </button>
        <button
          onClick={() => setDateRange("90d")}
          className={`px-4 py-2 rounded-lg transition-colors ${
            dateRange === "90d"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          آخر 90 يوم
        </button>
      </div>

      {/* Tabs for Growth vs Performance */}
      <Tabs defaultValue="growth" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="growth">مقاييس النمو</TabsTrigger>
          <TabsTrigger value="performance">مقاييس الأداء</TabsTrigger>
        </TabsList>

        {/* Growth Metrics Tab */}
        <TabsContent value="growth" className="space-y-4 mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {growthMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Card key={metric.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {metric.title}
                    </CardTitle>
                    <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                      <Icon className={`h-4 w-4 ${metric.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metric.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {metric.description}
                    </p>
                    <div className="flex items-center mt-2">
                      <span className="text-xs text-green-600 font-medium">
                        {metric.change}
                      </span>
                      <span className="text-xs text-muted-foreground mr-1">
                        عن الفترة السابقة
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detailed Growth Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>تحليل النمو التفصيلي</CardTitle>
              <CardDescription>
                نظرة شاملة على مقاييس النمو والتفاعل
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">المحادثات</h3>
                  <p className="text-sm text-muted-foreground">
                    عدد المحادثات الفريدة التي بدأها العملاء مع الوكيل الذكي. كل محادثة تمثل فرصة تفاعل محتملة.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-2 flex-1 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600" style={{ width: "75%" }} />
                    </div>
                    <span className="text-xs font-medium">75%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">معدل الاحتفاظ</h3>
                  <p className="text-sm text-muted-foreground">
                    نسبة المستخدمين الذين يعودون للوكيل الذكي بعد تفاعلهم الأول. مؤشر على القيمة المقدمة.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-2 flex-1 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-orange-600" style={{ width: "62%" }} />
                    </div>
                    <span className="text-xs font-medium">62%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Metrics Tab */}
        <TabsContent value="performance" className="space-y-4 mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {performanceMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Card key={metric.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {metric.title}
                    </CardTitle>
                    <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                      <Icon className={`h-4 w-4 ${metric.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metric.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {metric.description}
                    </p>
                    <div className="flex items-center mt-2">
                      <span
                        className={`text-xs font-medium ${
                          metric.change.startsWith("-")
                            ? "text-green-600"
                            : "text-green-600"
                        }`}
                      >
                        {metric.change}
                      </span>
                      <span className="text-xs text-muted-foreground mr-1">
                        عن الفترة السابقة
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detailed Performance Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>تحليل الأداء التفصيلي</CardTitle>
              <CardDescription>
                نظرة شاملة على مقاييس الأداء والكفاءة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">معدل التحويل</h3>
                  <p className="text-sm text-muted-foreground">
                    نسبة المستخدمين الذين أكملوا الإجراءات المطلوبة بنجاح. يثبت ما إذا كان الوكيل يحل المشاكل فعلاً.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-2 flex-1 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-pink-600" style={{ width: "68%" }} />
                    </div>
                    <span className="text-xs font-medium">68%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">وقت الاستجابة</h3>
                  <p className="text-sm text-muted-foreground">
                    متوسط الوقت الذي يستغرقه الوكيل للرد على استفسارات العملاء. كلما كان أقل كان أفضل.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-2 flex-1 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600" style={{ width: "85%" }} />
                    </div>
                    <span className="text-xs font-medium">ممتاز</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ROI Section */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            العائد على الاستثمار (ROI)
          </CardTitle>
          <CardDescription>
            قياس القيمة الفعلية للوكيل الذكي
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-background/50 p-4 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">توفير الوقت</div>
              <div className="text-2xl font-bold text-primary">75%</div>
              <div className="text-xs text-muted-foreground mt-1">
                تقليل وقت الاستجابة من 5 دقائق إلى 75 ثانية
              </div>
            </div>
            <div className="bg-background/50 p-4 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">زيادة التحويلات</div>
              <div className="text-2xl font-bold text-primary">+20%</div>
              <div className="text-xs text-muted-foreground mt-1">
                زيادة معدل التحويل من 65% إلى 78%
              </div>
            </div>
            <div className="bg-background/50 p-4 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">تحسين الاحتفاظ</div>
              <div className="text-2xl font-bold text-primary">+12%</div>
              <div className="text-xs text-muted-foreground mt-1">
                رفع معدل الاحتفاظ الشهري من 35% إلى 42%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
