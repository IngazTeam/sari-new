import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, Users, MousePointer, CheckCircle } from 'lucide-react';

export default function AdminABTestDashboard() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [newVariantData, setNewVariantData] = useState({
    variantId: '',
    title: '',
    description: '',
    ctaText: '',
    offerText: '',
    showOffer: false,
    messageThreshold: 3,
  });

  // Get test stats
  const statsQuery = trpc.signupPrompt.getStats.useQuery({ days });
  
  // Create variant mutation
  const createVariantMutation = trpc.signupPrompt.createVariant.useMutation();
  
  // Get active variants
  const variantsQuery = trpc.signupPrompt.getVariants.useQuery();

  const handleCreateVariant = async () => {
    if (!newVariantData.variantId || !newVariantData.title) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    createVariantMutation.mutate(newVariantData, {
      onSuccess: () => {
        setNewVariantData({
          variantId: '',
          title: '',
          description: '',
          ctaText: '',
          offerText: '',
          showOffer: false,
          messageThreshold: 3,
        });
        variantsQuery.refetch();
        alert('تم إنشاء المتغير بنجاح');
      },
      onError: (error) => {
        alert('خطأ في إنشاء المتغير: ' + (error as any).message);
      },
    });
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">غير مصرح</h1>
          <p className="text-gray-600 mt-2">هذه الصفحة متاحة فقط للمسؤولين</p>
        </div>
      </div>
    );
  }

  const stats = statsQuery.data || [];

  // Calculate overall metrics
  const totalShown = stats.reduce((sum, s) => sum + s.shown, 0);
  const totalClicked = stats.reduce((sum, s) => sum + s.clicked, 0);
  const totalConverted = stats.reduce((sum, s) => sum + s.converted, 0);
  const overallClickRate = totalShown > 0 ? Math.round((totalClicked / totalShown) * 100) : 0;
  const overallConversionRate = totalShown > 0 ? Math.round((totalConverted / totalShown) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">لوحة تحكم اختبار A/B</h1>
          <p className="text-gray-600 mt-2">مراقبة أداء متغيرات النافذة المنبثقة</p>
        </div>

        {/* Overall Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">إجمالي العروض</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-gray-900">{totalShown}</div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">عدد النقرات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-gray-900">{totalClicked}</div>
                <MousePointer className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">معدل النقر</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-gray-900">{overallClickRate}%</div>
                <TrendingUp className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">معدل التحويل</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-gray-900">{overallConversionRate}%</div>
                <CheckCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>الفلاتر</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div>
                <Label>عدد الأيام</Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value))}
                  className="mt-2 w-24"
                />
              </div>
              <Button onClick={() => statsQuery.refetch()}>تحديث</Button>
            </div>
          </CardContent>
        </Card>

        {/* Variants Comparison */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>مقارنة المتغيرات</CardTitle>
            <CardDescription>أداء كل متغير في آخر {days} يوم</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                لا توجد بيانات حتى الآن
              </div>
            ) : (
              <div className="space-y-6">
                {stats.map((stat) => (
                  <div key={stat.variant} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">المتغير {stat.variant}</h3>
                      <div className="flex gap-4">
                        <div className="text-right">
                          <p className="text-sm text-gray-600">معدل النقر</p>
                          <p className="text-2xl font-bold text-green-600">{stat.clickRate}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">معدل التحويل</p>
                          <p className="text-2xl font-bold text-blue-600">{stat.conversionRate}%</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div className="bg-blue-50 p-3 rounded">
                        <p className="text-sm text-gray-600">العروض</p>
                        <p className="text-2xl font-bold text-blue-600">{stat.shown}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded">
                        <p className="text-sm text-gray-600">النقرات</p>
                        <p className="text-2xl font-bold text-green-600">{stat.clicked}</p>
                      </div>
                      <div className="bg-purple-50 p-3 rounded">
                        <p className="text-sm text-gray-600">التحويلات</p>
                        <p className="text-2xl font-bold text-purple-600">{stat.converted}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-600">معدل التحويل</p>
                        <p className="text-2xl font-bold text-gray-600">{stat.conversionRate}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create New Variant */}
        <Card>
          <CardHeader>
            <CardTitle>إنشاء متغير جديد</CardTitle>
            <CardDescription>أضف متغيراً جديداً لاختبار A/B</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="mb-4">إنشاء متغير جديد</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>إنشاء متغير جديد</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>معرف المتغير (A, B, C...)</Label>
                    <Input
                      value={newVariantData.variantId}
                      onChange={(e) => setNewVariantData({ ...newVariantData, variantId: e.target.value })}
                      placeholder="A"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>العنوان</Label>
                    <Input
                      value={newVariantData.title}
                      onChange={(e) => setNewVariantData({ ...newVariantData, title: e.target.value })}
                      placeholder="أعجبك ساري؟"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>الوصف</Label>
                    <Input
                      value={newVariantData.description}
                      onChange={(e) => setNewVariantData({ ...newVariantData, description: e.target.value })}
                      placeholder="احصل على ساري لمتجرك الآن"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>نص زر الـ CTA</Label>
                    <Input
                      value={newVariantData.ctaText}
                      onChange={(e) => setNewVariantData({ ...newVariantData, ctaText: e.target.value })}
                      placeholder="ابدأ الآن"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>نص العرض</Label>
                    <Input
                      value={newVariantData.offerText}
                      onChange={(e) => setNewVariantData({ ...newVariantData, offerText: e.target.value })}
                      placeholder="احصل على خصم 20%"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>عدد الرسائل قبل الظهور</Label>
                    <Input
                      type="number"
                      value={newVariantData.messageThreshold}
                      onChange={(e) => setNewVariantData({ ...newVariantData, messageThreshold: parseInt(e.target.value) })}
                      min="1"
                      className="mt-2"
                    />
                  </div>
                  <Button onClick={handleCreateVariant} className="w-full">
                    إنشاء
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Active Variants List */}
            <div className="mt-6">
              <h3 className="font-semibold mb-4">المتغيرات النشطة</h3>
              {variantsQuery.data && variantsQuery.data.length > 0 ? (
                <div className="space-y-3">
                  {variantsQuery.data.map((variant) => (
                    <div key={variant.id} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">المتغير {variant.variantId}</p>
                          <p className="text-sm text-gray-600">{variant.title}</p>
                        </div>
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">نشط</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">لا توجد متغيرات نشطة</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
