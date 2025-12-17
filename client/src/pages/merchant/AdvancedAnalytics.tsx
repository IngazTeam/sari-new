import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area, AreaChart } from 'recharts';
import { Download, TrendingUp, TrendingDown, Calendar } from 'lucide-react';

interface AnalyticsData {
  date: string;
  conversations: number;
  messages: number;
  successRate: number;
  responseTime: number;
}

export default function AdvancedAnalytics() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [selectedMetric, setSelectedMetric] = useState<'conversations' | 'messages' | 'success'>('conversations');

  // Mock data - في الواقع ستأتي من API
  const mockData: AnalyticsData[] = [
    { date: '2024-01-01', conversations: 45, messages: 230, successRate: 85, responseTime: 2.3 },
    { date: '2024-01-02', conversations: 52, messages: 267, successRate: 87, responseTime: 2.1 },
    { date: '2024-01-03', conversations: 48, messages: 245, successRate: 84, responseTime: 2.4 },
    { date: '2024-01-04', conversations: 61, messages: 312, successRate: 89, responseTime: 1.9 },
    { date: '2024-01-05', conversations: 55, messages: 280, successRate: 86, responseTime: 2.2 },
    { date: '2024-01-06', conversations: 67, messages: 340, successRate: 91, responseTime: 1.8 },
    { date: '2024-01-07', conversations: 72, messages: 365, successRate: 92, responseTime: 1.7 },
  ];

  // بيانات توزيع الرسائل حسب النوع
  const messageTypeData = [
    { name: 'نصية', value: 65, color: '#3b82f6' },
    { name: 'صور', value: 20, color: '#10b981' },
    { name: 'صوتية', value: 10, color: '#f59e0b' },
    { name: 'مستندات', value: 5, color: '#ef4444' },
  ];

  // بيانات الأداء حسب الساعة
  const hourlyData = [
    { hour: '00:00', conversations: 5, messages: 25 },
    { hour: '04:00', conversations: 3, messages: 15 },
    { hour: '08:00', conversations: 15, messages: 75 },
    { hour: '12:00', conversations: 35, messages: 180 },
    { hour: '16:00', conversations: 42, messages: 210 },
    { hour: '20:00', conversations: 38, messages: 190 },
    { hour: '23:00', conversations: 12, messages: 60 },
  ];

  // حساب الإحصائيات
  const stats = useMemo(() => {
    const totalConversations = mockData.reduce((sum, d) => sum + d.conversations, 0);
    const totalMessages = mockData.reduce((sum, d) => sum + d.messages, 0);
    const avgSuccessRate = (mockData.reduce((sum, d) => sum + d.successRate, 0) / mockData.length).toFixed(1);
    const avgResponseTime = (mockData.reduce((sum, d) => sum + d.responseTime, 0) / mockData.length).toFixed(1);

    return {
      totalConversations,
      totalMessages,
      avgSuccessRate,
      avgResponseTime,
    };
  }, []);

  const handleExportPDF = () => {
    // سيتم تنفيذ تصدير PDF هنا
    console.log('تصدير التقرير كـ PDF');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">التحليلات المتقدمة</h1>
          <p className="text-gray-500 mt-2">رسوم بيانية متقدمة وتقارير مفصلة عن أداء حملاتك</p>
        </div>
        <Button onClick={handleExportPDF} className="gap-2">
          <Download className="h-4 w-4" />
          تصدير PDF
        </Button>
      </div>

      {/* إحصائيات رئيسية */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">إجمالي المحادثات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalConversations}</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" />
              +12% عن الفترة السابقة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">إجمالي الرسائل</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMessages}</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" />
              +8% عن الفترة السابقة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">متوسط نسبة النجاح</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgSuccessRate}%</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" />
              +3% عن الفترة السابقة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">متوسط وقت الرد</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgResponseTime}s</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <TrendingDown className="h-3 w-3" />
              -0.5s عن الفترة السابقة
            </p>
          </CardContent>
        </Card>
      </div>

      {/* الرسوم البيانية */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* مقارنة المحادثات والرسائل */}
        <Card>
          <CardHeader>
            <CardTitle>المحادثات والرسائل عبر الزمن</CardTitle>
            <CardDescription>مقارنة عدد المحادثات والرسائل اليومية</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={mockData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="conversations" fill="#3b82f6" name="المحادثات" />
                <Line yAxisId="right" type="monotone" dataKey="messages" stroke="#10b981" name="الرسائل" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* توزيع أنواع الرسائل */}
        <Card>
          <CardHeader>
            <CardTitle>توزيع أنواع الرسائل</CardTitle>
            <CardDescription>نسبة كل نوع من أنواع الرسائل</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={messageTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {messageTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* نسبة النجاح عبر الزمن */}
        <Card>
          <CardHeader>
            <CardTitle>نسبة النجاح عبر الزمن</CardTitle>
            <CardDescription>تطور نسبة نجاح الحملات</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={mockData}>
                <defs>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="successRate"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorSuccess)"
                  name="نسبة النجاح %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* أنماط الاستخدام حسب الساعة */}
        <Card>
          <CardHeader>
            <CardTitle>أنماط الاستخدام حسب الساعة</CardTitle>
            <CardDescription>توزيع المحادثات على مدار اليوم</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="conversations" fill="#3b82f6" name="المحادثات" />
                <Bar dataKey="messages" fill="#10b981" name="الرسائل" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* جدول البيانات المفصلة */}
      <Card>
        <CardHeader>
          <CardTitle>البيانات المفصلة</CardTitle>
          <CardDescription>تفاصيل كاملة عن الأداء اليومي</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-right py-2 px-4">التاريخ</th>
                  <th className="text-right py-2 px-4">المحادثات</th>
                  <th className="text-right py-2 px-4">الرسائل</th>
                  <th className="text-right py-2 px-4">نسبة النجاح</th>
                  <th className="text-right py-2 px-4">متوسط وقت الرد</th>
                </tr>
              </thead>
              <tbody>
                {mockData.map((row, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">{row.date}</td>
                    <td className="py-2 px-4">{row.conversations}</td>
                    <td className="py-2 px-4">{row.messages}</td>
                    <td className="py-2 px-4">
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                        {row.successRate}%
                      </span>
                    </td>
                    <td className="py-2 px-4">{row.responseTime}s</td>
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
