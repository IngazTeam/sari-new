import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Loader2, CheckCircle2, XCircle, RefreshCw, ExternalLink, GraduationCap,
  Users, BookOpen, CreditCard, Shield, Lock, Unlink, Activity,
  TrendingUp, Clock, AlertCircle, ChevronLeft, Plug, Wifi
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function ByaanIntegration() {
  const utils = trpc.useUtils();
  const { data, isLoading: loading } = trpc.integrations.getByaanStatus.useQuery();
  const [activeTab, setActiveTab] = useState('overview');
  const [disconnecting, setDisconnecting] = useState(false);
  const [tenantDomain, setTenantDomain] = useState('');

  // tRPC mutations
  const connectMutation = trpc.integrations.connectByaan.useMutation({
    onSuccess: () => {
      toast.success('✅ تم الربط مع بيان بنجاح!');
      utils.integrations.getByaanStatus.invalidate();
      utils.integrations.getCurrentPlatform.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const testMutation = trpc.integrations.testByaanConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      utils.integrations.getByaanStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const isConnected = data?.isConnected;
  const terminology = data?.terminology || { products: 'منتجات', customers: 'عملاء', orders: 'طلبات' };

  const handleConnect = () => {
    if (!tenantDomain.trim()) {
      toast.warning('أدخل نطاق بيان أولاً');
      return;
    }
    connectMutation.mutate({ tenantDomain: tenantDomain.trim() });
  };

  const handleTestConnection = () => {
    testMutation.mutate();
  };

  const handleDisconnect = async () => {
    if (!confirm('هل أنت متأكد من فصل ربط بيان؟ سيتم فتح التعديل اليدوي على المحتوى.')) return;
    setDisconnecting(true);
    try {
      const apiKey = sessionStorage.getItem('sari_api_key') || localStorage.getItem('sari_api_key') || '';
      const res = await fetch('/api/v1/connect/byaan', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        toast.success('تم فصل ربط بيان بنجاح');
        utils.integrations.getByaanStatus.invalidate();
        utils.integrations.getCurrentPlatform.invalidate();
      } else {
        toast.error('فشل فصل الربط');
      }
    } catch {
      toast.error('خطأ في الاتصال');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Stats — conversions will be loaded separately when needed
  const totalConversions = 0;
  const enrollments = 0;
  const payments = 0;
  const totalRevenue = 0;

  return (
    <div className="container max-w-5xl py-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/merchant/platform-integrations">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                <GraduationCap className="h-7 w-7 text-white" />
              </div>
              ربط بيان
            </h1>
            <p className="text-muted-foreground mt-1">إدارة الربط مع منصة بيان التدريبية</p>
          </div>
        </div>
        {isConnected && (
          <Badge variant="default" className="gap-1.5 px-4 py-2 text-sm bg-gradient-to-r from-green-500 to-emerald-600 border-0">
            <CheckCircle2 className="h-4 w-4" />
            مربوط
          </Badge>
        )}
      </div>

      {/* Connection Banner */}
      {isConnected ? (
        <Card className="border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                  <Shield className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100">
                    ✅ تم الربط بنجاح مع بيان — المحتوى يُدار تلقائياً
                  </h3>
                  <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-1">
                    {data?.byaan?.tenantDomain && (
                      <span className="flex items-center gap-1 flex-wrap">
                        النطاق: <code className="bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 rounded text-xs" dir="ltr">{data.byaan.tenantDomain}</code>
                        {data.byaan.syncStatus && (
                          <Badge variant="outline" className={`text-xs ${
                            data.byaan.syncStatus === 'active' ? 'border-green-300 text-green-700 bg-green-50' :
                            data.byaan.syncStatus === 'syncing' ? 'border-blue-300 text-blue-700 bg-blue-50 animate-pulse' :
                            data.byaan.syncStatus === 'error' ? 'border-red-300 text-red-700 bg-red-50' :
                            'border-gray-300 text-gray-700'
                          }`}>
                            {data.byaan.syncStatus === 'active' ? '● نشط' :
                             data.byaan.syncStatus === 'syncing' ? '◉ جاري المزامنة...' :
                             data.byaan.syncStatus === 'error' ? '✖ خطأ' : data.byaan.syncStatus}
                          </Badge>
                        )}
                        {data.byaan.lastSyncAt && (
                          <span className="mr-3 text-xs">
                            آخر مزامنة: {new Date(data.byaan.lastSyncAt).toLocaleString('ar-SA')}
                          </span>
                        )}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testMutation.isPending}
                  className={`gap-1.5 ${
                    testMutation.data?.success ? 'border-green-300 text-green-700 bg-green-50' :
                    testMutation.data?.success === false ? 'border-red-300 text-red-700 bg-red-50' : ''
                  }`}
                >
                  {testMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : testMutation.data?.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : testMutation.data?.success === false ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : (
                    <Wifi className="h-3.5 w-3.5" />
                  )}
                  {testMutation.isPending ? 'جاري الفحص...' : testMutation.data?.success ? 'الاتصال نشط ✓' : testMutation.data?.success === false ? 'فشل — أعد المحاولة' : 'اختبار الاتصال'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="gap-1.5"
                >
                  {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                  فصل الربط
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-amber-600" />
              ربط حسابك مع بيان
            </CardTitle>
            <CardDescription>
              أدخل نطاق مركزك التدريبي في بيان لتفعيل المزامنة التلقائية للدورات والمتدربين
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="مثال: academy.byaan.app"
                value={tenantDomain}
                onChange={(e) => setTenantDomain(e.target.value)}
                dir="ltr"
                className="max-w-sm"
              />
              <Button
                onClick={handleConnect}
                disabled={connectMutation.isPending || !tenantDomain.trim()}
                className="gap-1.5"
              >
                {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                {connectMutation.isPending ? 'جاري الربط...' : 'ربط الآن'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              النطاق هو عنوان مركزك في بيان. يمكنك إيجاده من إعدادات حسابك في بيان.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Content Lock Status */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              حالة التحكم اليدوي
            </CardTitle>
            <CardDescription>المحتوى يُدار من بيان — التعديل اليدوي مقفل لمنع التضارب</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: terminology.products, icon: BookOpen, locked: true, color: 'text-indigo-600' },
                { label: terminology.customers, icon: Users, locked: true, color: 'text-blue-600' },
                { label: 'الأسئلة الشائعة', icon: AlertCircle, locked: true, color: 'text-purple-600' },
                { label: 'اختبر ساري', icon: Activity, locked: false, color: 'text-green-600' },
              ].map((item, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${item.locked ? 'bg-muted/50 opacity-75' : 'bg-green-50 dark:bg-green-950/20'}`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                  <div>
                    <div className="font-medium text-sm">{item.label}</div>
                    <div className={`text-xs ${item.locked ? 'text-muted-foreground' : 'text-green-600'}`}>
                      {item.locked ? '🔒 من بيان' : '✅ متاح'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Conversions + Terminology */}
      {isConnected && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              الإحصائيات
            </TabsTrigger>
            <TabsTrigger value="conversions" className="gap-1.5">
              <CreditCard className="h-4 w-4" />
              سجل {terminology.orders}
            </TabsTrigger>
            <TabsTrigger value="terminology" className="gap-1.5">
              <BookOpen className="h-4 w-4" />
              المسميات
            </TabsTrigger>
          </TabsList>

          {/* Stats Tab */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-100 dark:border-blue-900">
                <CardContent className="pt-5">
                  <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">{totalConversions}</div>
                  <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">إجمالي العمليات</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-100 dark:border-green-900">
                <CardContent className="pt-5">
                  <div className="text-3xl font-bold text-green-700 dark:text-green-300">{enrollments}</div>
                  <div className="text-sm text-green-600 dark:text-green-400 mt-1">تسجيلات</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-100 dark:border-purple-900">
                <CardContent className="pt-5">
                  <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">{payments}</div>
                  <div className="text-sm text-purple-600 dark:text-purple-400 mt-1">مدفوعات</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-100 dark:border-amber-900">
                <CardContent className="pt-5">
                  <div className="text-3xl font-bold text-amber-700 dark:text-amber-300">{totalRevenue.toLocaleString('ar-SA')} ر.س</div>
                  <div className="text-sm text-amber-600 dark:text-amber-400 mt-1">الإيرادات عبر ساري</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Conversions Tab */}
          <TabsContent value="conversions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>سجل {terminology.orders} عبر ساري</CardTitle>
                <CardDescription>كل عملية تمت عبر بوت ساري — تسجيلات، مدفوعات، استعلامات</CardDescription>
              </CardHeader>
              <CardContent>
                {([] as any[]).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>لا توجد عمليات بعد</p>
                    <p className="text-sm mt-1">ستظهر هنا عند تسجيل متدربين أو دفعات عبر البوت</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {([] as any[]).map((conv: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            conv.action_type === 'enrollment' ? 'bg-green-100 dark:bg-green-900/30' :
                            conv.action_type === 'payment' ? 'bg-blue-100 dark:bg-blue-900/30' :
                            'bg-gray-100 dark:bg-gray-900/30'
                          }`}>
                            {conv.action_type === 'enrollment' ? <GraduationCap className="h-4 w-4 text-green-600" /> :
                             conv.action_type === 'payment' ? <CreditCard className="h-4 w-4 text-blue-600" /> :
                             <AlertCircle className="h-4 w-4 text-gray-600" />}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{conv.product_name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              {conv.customer_name && <span>{conv.customer_name}</span>}
                              {conv.customer_phone && <span dir="ltr">{conv.customer_phone}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="text-left">
                          {conv.amount && (
                            <div className="font-semibold text-sm">{parseFloat(conv.amount).toLocaleString('ar-SA')} ر.س</div>
                          )}
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(conv.created_at).toLocaleString('ar-SA')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Terminology Tab */}
          <TabsContent value="terminology" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-indigo-500" />
                  المسميات التكيّفية
                </CardTitle>
                <CardDescription>المسميات تتغير تلقائياً حسب المنصة المربوطة</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(terminology).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm text-muted-foreground font-mono" dir="ltr">{key}</span>
                      <Badge variant="outline" className="text-base font-semibold">{value as string}</Badge>
                    </div>
                  ))}
                </div>
                <Separator className="my-4" />
                <p className="text-sm text-muted-foreground">
                  عند ربط بيان: "منتجات" → "دورات"، "عملاء" → "متدربين"، "طلبات" → "تسجيلات"
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Info Card — Always visible */}
      <Card>
        <CardHeader>
          <CardTitle>كيف يعمل ربط بيان؟</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            { step: 1, title: 'الاشتراك', desc: 'اشترك بخدمة ساري من لوحة بيان — يُنشأ حسابك تلقائياً' },
            { step: 2, title: 'المزامنة', desc: 'بيان يزامن دوراتك ومتدربيك تلقائياً — المحتوى يدار من بيان' },
            { step: 3, title: 'البوت يعمل', desc: 'ساري يستقبل رسائل المتدربين ويرد ذكياً بناء على بيانات بيان' },
            { step: 4, title: 'متابعة', desc: 'تابع التسجيلات والمدفوعات التي تمت عبر ساري من هذه الصفحة' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
                {step}
              </div>
              <div><strong>{title}:</strong> {desc}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
