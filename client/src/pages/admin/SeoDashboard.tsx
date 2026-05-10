import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  AlertCircle, TrendingUp, Eye, CheckCircle, Users,
  Settings, Loader2, RefreshCw, Link2, Unplug,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

export default function SeoDashboard() {
  const [days, setDays] = useState(30);

  // GA Config
  const { data: config, refetch: refetchConfig } = trpc.googleAnalytics.getConfig.useQuery();

  // GA Data (only fetch when enabled)
  const { data: overview, isLoading: loadingOverview } =
    trpc.googleAnalytics.getOverview.useQuery({ days }, { enabled: !!config?.isEnabled });
  const { data: trafficChart, isLoading: loadingChart } =
    trpc.googleAnalytics.getTrafficChart.useQuery({ days }, { enabled: !!config?.isEnabled });
  const { data: topPages } =
    trpc.googleAnalytics.getTopPages.useQuery({ days }, { enabled: !!config?.isEnabled });

  // If not configured, show setup
  if (!config?.isEnabled) {
    return <GASetupCard config={config} onConfigured={refetchConfig} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">لوحة التحكم SEO</h1>
          <p className="text-gray-600 mt-2">
            بيانات حقيقية من Google Analytics 4
            <Badge variant="outline" className="mr-2 bg-green-50 text-green-700">
              <CheckCircle className="w-3 h-3 ml-1" /> متصل
            </Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يوم</option>
            <option value={90}>آخر 90 يوم</option>
            <option value={365}>سنة كاملة</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="إجمالي المستخدمين"
          value={overview?.totalUsers}
          icon={<Users className="w-8 h-8 text-blue-500" />}
          loading={loadingOverview}
        />
        <KPICard
          label="الجلسات"
          value={overview?.sessions}
          icon={<Eye className="w-8 h-8 text-green-500" />}
          loading={loadingOverview}
        />
        <KPICard
          label="مشاهدات الصفحات"
          value={overview?.pageViews}
          icon={<TrendingUp className="w-8 h-8 text-purple-500" />}
          loading={loadingOverview}
        />
        <KPICard
          label="متوسط مدة الجلسة"
          value={overview ? formatDuration(overview.avgSessionDuration) : undefined}
          icon={<CheckCircle className="w-8 h-8 text-orange-500" />}
          loading={loadingOverview}
          raw
        />
      </div>

      {/* Traffic Chart */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">حركة المرور اليومية</h2>
        {loadingChart ? (
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : trafficChart && trafficChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trafficChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="users" stroke="#3b82f6" name="المستخدمون" strokeWidth={2} />
              <Line type="monotone" dataKey="sessions" stroke="#10b981" name="الجلسات" strokeWidth={2} />
              <Line type="monotone" dataKey="pageViews" stroke="#f59e0b" name="المشاهدات" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            لا توجد بيانات
          </div>
        )}
      </Card>

      {/* Top Pages */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">أعلى الصفحات زيارة</h2>
        {topPages && topPages.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-semibold">الصفحة</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">المشاهدات</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">متوسط الوقت</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((page: any) => (
                  <tr key={page.page} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-sm" dir="ltr">{page.page}</td>
                    <td className="px-4 py-3">{page.pageViews.toLocaleString()}</td>
                    <td className="px-4 py-3">{formatDuration(page.avgTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">لا توجد بيانات</p>
        )}
      </Card>
    </div>
  );
}

// ============ KPI Card ============
function KPICard({ label, value, icon, loading, raw }: {
  label: string; value?: number | string; icon: React.ReactNode;
  loading?: boolean; raw?: boolean;
}) {
  return (
    <Card className="p-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin mt-2 text-muted-foreground" />
          ) : (
            <p className="text-3xl font-bold mt-2">
              {raw ? value : (typeof value === 'number' ? value.toLocaleString('ar-SA') : value ?? '—')}
            </p>
          )}
        </div>
        {icon}
      </div>
    </Card>
  );
}

// ============ GA Setup Card ============
function GASetupCard({ config, onConfigured }: { config: any; onConfigured: () => void }) {
  const [propertyId, setPropertyId] = useState(config?.propertyId || "");
  const [saJson, setSaJson] = useState("");

  const updateMutation = trpc.googleAnalytics.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات ✅");
      onConfigured();
    },
    onError: (err) => toast.error(err.message),
  });

  const testMutation = trpc.googleAnalytics.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`✅ متصل بنجاح — ${data.propertyName}`);
      } else {
        toast.error(data.error || "فشل الاتصال");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    const data: Record<string, any> = { isEnabled: true };
    if (propertyId) data.propertyId = propertyId;
    if (saJson.trim()) data.serviceAccountJson = saJson.trim();
    updateMutation.mutate(data);
  };

  return (
    <div className="max-w-2xl mx-auto py-12">
      <Card className="p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-green-500 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold">ربط Google Analytics 4</h2>
          <p className="text-muted-foreground mt-2">
            أدخل بيانات Service Account لربط لوحة التحكم ببيانات GA4 الحقيقية
          </p>
        </div>

        {config?.hasCredentials && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 mb-4">
            <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Service Account مُسجّل</p>
              <p className="text-xs text-muted-foreground font-mono">{config.serviceAccountEmail}</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Property ID (الرقمي)</Label>
            <Input
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="123456789"
              dir="ltr"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              من GA4 → Admin → Property Settings → Property ID
            </p>
          </div>

          <div className="space-y-2">
            <Label>Service Account JSON</Label>
            <Textarea
              value={saJson}
              onChange={(e) => setSaJson(e.target.value)}
              placeholder='{"type": "service_account", "project_id": "...", ...}'
              rows={6}
              dir="ltr"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              محتوى ملف JSON المُحمّل من Google Cloud Console
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={updateMutation.isPending} className="flex-1">
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              حفظ وتفعيل
            </Button>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !config?.hasCredentials}
            >
              {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <RefreshCw className="h-4 w-4 ml-2" />}
              اختبار
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
