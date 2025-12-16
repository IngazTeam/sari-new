import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AlertCircle, TrendingUp, Eye, CheckCircle } from "lucide-react";

export default function SeoDashboard() {
  // Mock data
  const trafficData = [
    { date: "1 يناير", visitors: 1200, pageViews: 2400, conversions: 240 },
    { date: "2 يناير", visitors: 1400, pageViews: 2210, conversions: 221 },
    { date: "3 يناير", visitors: 1100, pageViews: 2290, conversions: 229 },
    { date: "4 يناير", visitors: 1800, pageViews: 2000, conversions: 200 },
    { date: "5 يناير", visitors: 1500, pageViews: 2181, conversions: 218 },
    { date: "6 يناير", visitors: 2000, pageViews: 2500, conversions: 250 },
    { date: "7 يناير", visitors: 1900, pageViews: 2100, conversions: 210 },
  ];

  const topPages = [
    { slug: "home", views: 5420, conversions: 542, ctr: "8.2%" },
    { slug: "pricing", views: 3210, conversions: 321, ctr: "6.5%" },
    { slug: "features", views: 2840, conversions: 284, ctr: "5.9%" },
    { slug: "blog", views: 1920, conversions: 192, ctr: "4.3%" },
  ];

  const alerts = [
    { id: 1, type: "ranking_drop", severity: "high", message: "انخفاض ترتيب الكلمة المفتاحية 'واتساب'", page: "home" },
    { id: 2, type: "traffic_drop", severity: "medium", message: "انخفاض حركة المرور بنسبة 15%", page: "pricing" },
    { id: 3, type: "slow_page", severity: "high", message: "سرعة الصفحة أبطأ من المتوقع", page: "features" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">لوحة تحكم SEO</h1>
        <p className="text-gray-600 mt-2">مراقبة أداء SEO وتحسين ترتيب موقعك</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">إجمالي الزيارات</p>
              <p className="text-3xl font-bold mt-2">12,540</p>
              <p className="text-sm text-green-600 mt-2">↑ 12% هذا الشهر</p>
            </div>
            <Eye className="w-8 h-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">معدل التحويل</p>
              <p className="text-3xl font-bold mt-2">8.2%</p>
              <p className="text-sm text-green-600 mt-2">↑ 2.1% هذا الشهر</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">الكلمات المفتاحية</p>
              <p className="text-3xl font-bold mt-2">156</p>
              <p className="text-sm text-blue-600 mt-2">24 في الصفحة الأولى</p>
            </div>
            <CheckCircle className="w-8 h-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">الروابط الخارجية</p>
              <p className="text-3xl font-bold mt-2">342</p>
              <p className="text-sm text-orange-600 mt-2">18 جديدة هذا الشهر</p>
            </div>
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Traffic Chart */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">حركة المرور</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trafficData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="visitors" stroke="#3b82f6" name="الزيارات" />
              <Line type="monotone" dataKey="pageViews" stroke="#10b981" name="مشاهدات الصفحة" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Conversions Chart */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">التحويلات</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trafficData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="conversions" fill="#f59e0b" name="التحويلات" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Top Pages */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">أفضل الصفحات</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-semibold">الصفحة</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">المشاهدات</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">التحويلات</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">معدل النقر</th>
              </tr>
            </thead>
            <tbody>
              {topPages.map((page) => (
                <tr key={page.slug} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{page.slug}</td>
                  <td className="px-4 py-3">{page.views.toLocaleString()}</td>
                  <td className="px-4 py-3">{page.conversions}</td>
                  <td className="px-4 py-3">{page.ctr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Alerts */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">التنبيهات</h2>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
              <AlertCircle className={`w-5 h-5 mt-0.5 ${
                alert.severity === 'high' ? 'text-red-500' : 'text-yellow-500'
              }`} />
              <div className="flex-1">
                <p className="font-medium">{alert.message}</p>
                <p className="text-sm text-gray-600">الصفحة: {alert.page}</p>
              </div>
              <Badge variant={alert.severity === 'high' ? 'destructive' : 'outline'}>
                {alert.severity === 'high' ? 'حرج' : 'تحذير'}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
