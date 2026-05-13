/**
 * Admin Monitor — Message Delivery Monitoring Dashboard
 * Real-time tracking of every WhatsApp message: delivered vs failed
 */
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Activity, CheckCircle, XCircle, AlertTriangle, Clock, 
  TrendingUp, Phone, RefreshCw, ChevronDown 
} from 'lucide-react';
import { useState, useEffect } from 'react';

const FAILURE_LABELS: Record<string, string> = {
  instance_not_found: 'الرقم غير مسجل',
  instance_inactive: 'الرقم غير نشط',
  subscription_expired: 'الاشتراك منتهي',
  auto_reply_disabled: 'الرد التلقائي معطل',
  outside_working_hours: 'خارج ساعات العمل',
  voice_no_url: 'رسالة صوتية بدون رابط',
  no_text_content: 'رسالة بدون نص',
  human_takeover: 'التحكم البشري مفعل',
  ai_error: 'خطأ في الذكاء الاصطناعي',
  conversation_limit: 'حد المحادثات',
  message_limit: 'حد الرسائل',
  voice_limit: 'حد الرسائل الصوتية',
};

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `قبل ${diffMin} دقيقة`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `قبل ${diffHrs} ساعة`;
  const diffDays = Math.floor(diffHrs / 24);
  return `قبل ${diffDays} يوم`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'delivered') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
      <CheckCircle className="w-3 h-3" /> تم التوصيل
    </span>;
  }
  if (status === 'failed') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> فشل
    </span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
    <AlertTriangle className="w-3 h-3" /> تم تجاهله
  </span>;
}

function HealthIndicator({ rate }: { rate: number }) {
  if (rate >= 95) return <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 animate-pulse" title={`${rate}%`} />;
  if (rate >= 80) return <span className="inline-block w-3 h-3 rounded-full bg-amber-500 animate-pulse" title={`${rate}%`} />;
  return <span className="inline-block w-3 h-3 rounded-full bg-red-500 animate-pulse" title={`${rate}%`} />;
}

export default function Monitor() {
  const [hours, setHours] = useState(24);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const utils = trpc.useUtils();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      utils.monitor.getOverview.invalidate();
      utils.monitor.getFailedMessages.invalidate();
      utils.monitor.getMerchantHealth.invalidate();
      utils.monitor.getFailuresByReason.invalidate();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, utils]);

  const { data: overview, isLoading: loadingOverview } = trpc.monitor.getOverview.useQuery({ hours });
  const { data: failedMessages, isLoading: loadingFailed } = trpc.monitor.getFailedMessages.useQuery({ hours, limit: 50 });
  const { data: merchantHealth } = trpc.monitor.getMerchantHealth.useQuery({ hours });
  const { data: failureReasons } = trpc.monitor.getFailuresByReason.useQuery({ hours });

  const handleRefresh = () => {
    utils.monitor.getOverview.invalidate();
    utils.monitor.getFailedMessages.invalidate();
    utils.monitor.getMerchantHealth.invalidate();
    utils.monitor.getFailuresByReason.invalidate();
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-7 h-7 text-primary" />
            مركز المراقبة
          </h1>
          <p className="text-muted-foreground text-sm mt-1">رصد حقيقي لكل رسالة واردة ونتيجتها</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <div className="relative">
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="appearance-none bg-white border rounded-lg px-3 py-2 pe-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value={6}>آخر 6 ساعات</option>
              <option value={24}>آخر 24 ساعة</option>
              <option value={72}>آخر 3 أيام</option>
              <option value={168}>آخر 7 أيام</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${autoRefresh ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white text-muted-foreground'}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={autoRefresh ? { animationDuration: '3s' } : {}} />
            {autoRefresh ? 'تحديث تلقائي' : 'متوقف'}
          </button>

          {/* Manual refresh */}
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg border hover:bg-muted transition-colors"
            title="تحديث الآن"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">إجمالي الرسائل</p>
                <p className="text-2xl font-bold mt-1">{loadingOverview ? '...' : overview?.total?.toLocaleString() ?? 0}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Activity className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">تم التوصيل</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">{loadingOverview ? '...' : overview?.delivered?.toLocaleString() ?? 0}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={overview && overview.failed > 0 ? 'ring-2 ring-red-200' : ''}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">فشل التوصيل</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{loadingOverview ? '...' : overview?.failed ?? 0}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-red-50">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">نسبة التوصيل</p>
                <p className={`text-2xl font-bold mt-1 ${(overview?.rate ?? 100) >= 95 ? 'text-emerald-600' : (overview?.rate ?? 100) >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                  {loadingOverview ? '...' : `${overview?.rate ?? 100}%`}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">متوسط وقت الرد</p>
                <p className="text-2xl font-bold mt-1">
                  {loadingOverview ? '...' : overview?.avgResponseMs ? `${(overview.avgResponseMs / 1000).toFixed(1)}s` : '—'}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Failed Messages + Failure Reasons */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Failed Messages List */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              الرسائل الفاشلة
              {failedMessages && failedMessages.length > 0 && (
                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">{failedMessages.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingFailed ? (
              <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
            ) : !failedMessages || failedMessages.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">لا توجد رسائل فاشلة 🎉</p>
                <p className="text-xs text-muted-foreground mt-1">كل الرسائل تم توصيلها بنجاح</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {failedMessages.map((msg: any) => (
                  <div key={msg.id} className="flex items-start gap-3 p-3 rounded-lg border border-red-100 bg-red-50/30 hover:bg-red-50/60 transition-colors">
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{msg.merchantName}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {msg.customerPhone}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                          {FAILURE_LABELS[msg.failureReason || ''] || msg.failureReason || 'خطأ غير معروف'}
                        </span>
                        <span className="text-xs text-muted-foreground">{timeAgo(msg.createdAt)}</span>
                      </div>
                      {msg.failureDetails && (
                        <p className="text-xs text-muted-foreground mt-1 truncate" dir="ltr">{msg.failureDetails}</p>
                      )}
                    </div>
                    <StatusBadge status={msg.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Failure Reasons Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              أسباب الفشل
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!failureReasons || failureReasons.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">لا توجد أخطاء</p>
              </div>
            ) : (
              <div className="space-y-3">
                {failureReasons.map((item: any, i: number) => {
                  const total = failureReasons.reduce((sum: number, r: any) => sum + Number(r.count), 0);
                  const pct = total > 0 ? Math.round((Number(item.count) / total) * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">
                          {FAILURE_LABELS[item.reason || ''] || item.reason || 'غير معروف'}
                        </span>
                        <span className="text-sm text-muted-foreground">{item.count}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-red-400 h-2 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Merchant Health */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            حالة التجار
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!merchantHealth || merchantHealth.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">لا توجد بيانات بعد</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-start py-2 px-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="text-start py-2 px-3 font-medium text-muted-foreground">التاجر</th>
                    <th className="text-center py-2 px-3 font-medium text-muted-foreground">إجمالي</th>
                    <th className="text-center py-2 px-3 font-medium text-muted-foreground">ناجحة</th>
                    <th className="text-center py-2 px-3 font-medium text-muted-foreground">فاشلة</th>
                    <th className="text-center py-2 px-3 font-medium text-muted-foreground">نسبة التوصيل</th>
                    <th className="text-start py-2 px-3 font-medium text-muted-foreground">آخر رسالة</th>
                  </tr>
                </thead>
                <tbody>
                  {merchantHealth.map((m: any) => (
                    <tr key={m.merchantId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <HealthIndicator rate={m.rate} />
                      </td>
                      <td className="py-2.5 px-3 font-medium">{m.merchantName}</td>
                      <td className="py-2.5 px-3 text-center">{m.total}</td>
                      <td className="py-2.5 px-3 text-center text-emerald-600 font-medium">{m.delivered}</td>
                      <td className="py-2.5 px-3 text-center text-red-600 font-medium">{m.failed}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`font-bold ${m.rate >= 95 ? 'text-emerald-600' : m.rate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                          {m.rate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">{m.lastMessage ? timeAgo(m.lastMessage) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
