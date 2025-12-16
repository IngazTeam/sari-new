import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, Filter, Calendar, TrendingUp, Users, Globe, Smartphone } from "lucide-react";

export default function SeoAnalytics() {
  const [dateRange, setDateRange] = useState("30days");
  const [selectedPage, setSelectedPage] = useState("all");

  // Mock data
  const trafficData = [
    { date: "1 يناير", organic: 1200, direct: 400, social: 200, referral: 100 },
    { date: "2 يناير", organic: 1400, direct: 350, social: 250, referral: 120 },
    { date: "3 يناير", organic: 1100, direct: 450, social: 180, referral: 90 },
    { date: "4 يناير", organic: 1800, direct: 500, social: 300, referral: 150 },
    { date: "5 يناير", organic: 1500, direct: 420, social: 220, referral: 110 },
    { date: "6 يناير", organic: 2000, direct: 550, social: 350, referral: 180 },
    { date: "7 يناير", organic: 1900, direct: 480, social: 280, referral: 140 },
  ];

  const deviceData = [
    { name: "Desktop", value: 6500, color: "#3b82f6" },
    { name: "Mobile", value: 4200, color: "#10b981" },
    { name: "Tablet", value: 1800, color: "#f59e0b" },
  ];

  const countryData = [
    { country: "السعودية", visitors: 3200, conversions: 320 },
    { country: "الإمارات", visitors: 2100, conversions: 210 },
    { country: "مصر", visitors: 1800, conversions: 180 },
    { country: "الكويت", visitors: 1200, conversions: 120 },
    { country: "قطر", visitors: 900, conversions: 90 },
  ];

  const topKeywords = [
    { keyword: "واتساب", rank: 3, volume: 8900, ctr: "12.5%" },
    { keyword: "مبيعات ذكية", rank: 5, volume: 2100, ctr: "8.3%" },
    { keyword: "ذكاء اصطناعي", rank: 12, volume: 5600, ctr: "6.2%" },
    { keyword: "إدارة العملاء", rank: 8, volume: 1200, ctr: "7.1%" },
    { keyword: "أتمتة المبيعات", rank: 15, volume: 890, ctr: "5.4%" },
  ];

  const conversionFunnelData = [
    { stage: "الزيارات", value: 12500 },
    { stage: "المشاهدات", value: 8200 },
    { stage: "النقرات", value: 4100 },
    { stage: "التحويلات", value: 1025 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">الإحصائيات والتقارير</h1>
          <p className="text-gray-600 mt-2">تحليل شامل لأداء SEO وحركة المرور</p>
        </div>
        <Button className="gap-2">
          <Download className="w-4 h-4" />
          تحميل التقرير
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 flex gap-4 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-600" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="7days">آخر 7 أيام</option>
            <option value="30days">آخر 30 يوم</option>
            <option value="90days">آخر 90 يوم</option>
            <option value="1year">آخر سنة</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-600" />
          <select
            value={selectedPage}
            onChange={(e) => setSelectedPage(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="all">جميع الصفحات</option>
            <option value="home">الصفحة الرئيسية</option>
            <option value="pricing">الأسعار</option>
            <option value="features">المميزات</option>
          </select>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">إجمالي الزيارات</p>
              <p className="text-3xl font-bold mt-2">12,540</p>
              <p className="text-sm text-green-600 mt-2">↑ 12% من الشهر السابق</p>
            </div>
            <Users className="w-8 h-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">معدل التحويل</p>
              <p className="text-3xl font-bold mt-2">8.2%</p>
              <p className="text-sm text-green-600 mt-2">↑ 2.1% من الشهر السابق</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">متوسط مدة الجلسة</p>
              <p className="text-3xl font-bold mt-2">3:24</p>
              <p className="text-sm text-green-600 mt-2">↑ 0:42 من الشهر السابق</p>
            </div>
            <Calendar className="w-8 h-8 text-orange-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600">معدل الارتداد</p>
              <p className="text-3xl font-bold mt-2">42.3%</p>
              <p className="text-sm text-green-600 mt-2">↓ 5.2% من الشهر السابق</p>
            </div>
            <Globe className="w-8 h-8 text-red-500" />
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Traffic Sources */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">مصادر حركة المرور</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trafficData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="organic" stroke="#3b82f6" name="عضوي" />
              <Line type="monotone" dataKey="direct" stroke="#10b981" name="مباشر" />
              <Line type="monotone" dataKey="social" stroke="#f59e0b" name="وسائل التواصل" />
              <Line type="monotone" dataKey="referral" stroke="#8b5cf6" name="إحالات" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Device Distribution */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">توزيع الأجهزة</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={deviceData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                {deviceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Countries */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">أفضل الدول</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-semibold">الدولة</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الزيارات</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">التحويلات</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">معدل التحويل</th>
              </tr>
            </thead>
            <tbody>
              {countryData.map((row) => (
                <tr key={row.country} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.country}</td>
                  <td className="px-4 py-3">{row.visitors.toLocaleString()}</td>
                  <td className="px-4 py-3">{row.conversions}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-green-50">
                      {((row.conversions / row.visitors) * 100).toFixed(1)}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top Keywords */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">أفضل الكلمات المفتاحية</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-semibold">الكلمة المفتاحية</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">الترتيب</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">حجم البحث</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">معدل النقر</th>
              </tr>
            </thead>
            <tbody>
              {topKeywords.map((row) => (
                <tr key={row.keyword} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.keyword}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.rank <= 5 ? "default" : "outline"}>
                      #{row.rank}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{row.volume.toLocaleString()}</td>
                  <td className="px-4 py-3">{row.ctr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Conversion Funnel */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">قمع التحويل</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={conversionFunnelData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="stage" type="category" />
            <Tooltip />
            <Bar dataKey="value" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
