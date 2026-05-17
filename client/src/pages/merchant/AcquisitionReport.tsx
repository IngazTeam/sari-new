/**
 * AcquisitionReport — Customer Acquisition Sources Dashboard
 * Shows where customers come from (Instagram, Snapchat, etc.)
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/_core/trpc';
import { useMerchantId } from '@/hooks/useMerchantId';

const SOURCE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  instagram: { label: 'إنستجرام', emoji: '📸', color: '#E1306C' },
  snapchat: { label: 'سناب شات', emoji: '👻', color: '#FFFC00' },
  twitter: { label: 'تويتر / 𝕏', emoji: '🐦', color: '#1DA1F2' },
  tiktok: { label: 'تيك توك', emoji: '🎵', color: '#010101' },
  facebook: { label: 'فيسبوك', emoji: '📘', color: '#4267B2' },
  youtube: { label: 'يوتيوب', emoji: '🎬', color: '#FF0000' },
  google_ads: { label: 'إعلانات قوقل', emoji: '🔍', color: '#4285F4' },
  ad_general: { label: 'إعلان عام', emoji: '📢', color: '#FF9800' },
  direct: { label: 'مباشر / عضوي', emoji: '💬', color: '#4CAF50' },
};

export default function AcquisitionReport() {
  const merchantId = useMerchantId();
  const { data, isLoading } = trpc.analytics.getAcquisitionSources.useQuery(
    { merchantId: merchantId! },
    { enabled: !!merchantId }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  const sources = data?.sources || [];
  const totalCustomers = data?.totalCustomers || 0;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            📊 مصادر العملاء
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            من أين يأتي عملاؤك؟ تتبع مصادر الاستقطاب لقياس ROI الإعلانات
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl px-4 py-2">
          <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">
            إجمالي العملاء: {totalCustomers}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sources.slice(0, 3).map((s) => {
          const info = SOURCE_LABELS[s.source] || {
            label: s.source,
            emoji: '📌',
            color: '#9E9E9E',
          };
          return (
            <Card key={s.source} className="border-t-4" style={{ borderTopColor: info.color }}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{info.emoji}</span>
                  <div>
                    <p className="text-sm text-gray-500">{info.label}</p>
                    <p className="text-2xl font-bold">{s.count}</p>
                    <p className="text-xs text-gray-400">{s.percentage}% من الإجمالي</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Full Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">تفاصيل المصادر</CardTitle>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p>لا توجد بيانات بعد. عندما يبدأ العملاء بالتواصل عبر الحملات الإعلانية، ستظهر البيانات هنا.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-3 text-sm font-medium text-gray-500">المصدر</th>
                    <th className="pb-3 text-sm font-medium text-gray-500">العملاء</th>
                    <th className="pb-3 text-sm font-medium text-gray-500">النسبة</th>
                    <th className="pb-3 text-sm font-medium text-gray-500">الرسم</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => {
                    const info = SOURCE_LABELS[s.source] || {
                      label: s.source,
                      emoji: '📌',
                      color: '#9E9E9E',
                    };
                    return (
                      <tr key={s.source} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-3">
                          <span className="ml-2">{info.emoji}</span>
                          <span className="font-medium">{info.label}</span>
                        </td>
                        <td className="py-3 font-semibold">{s.count}</td>
                        <td className="py-3 text-gray-500">{s.percentage}%</td>
                        <td className="py-3 w-48">
                          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5">
                            <div
                              className="h-2.5 rounded-full transition-all duration-500"
                              style={{
                                width: `${s.percentage}%`,
                                backgroundColor: info.color,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How to use */}
      <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-4">
          <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
            💡 كيف تتبع مصادر العملاء؟
          </h3>
          <div className="text-sm text-blue-700 dark:text-blue-400 space-y-2">
            <p>أضف كود الحملة في رابط واتساب:</p>
            <code className="block bg-white dark:bg-blue-900/30 p-2 rounded text-xs" dir="ltr">
              https://wa.me/966XXXXXXX?text=أبغى_أعرف_عن_العرض_IG2024
            </code>
            <p className="mt-2">أمثلة أكواد:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><code>IG2024</code> — إنستجرام</li>
              <li><code>SNAP_OFFER</code> — سناب شات</li>
              <li><code>TW_PROMO</code> — تويتر</li>
              <li><code>CAMP_RAMADAN</code> — حملة رمضان</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
