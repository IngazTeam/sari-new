import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, CheckCircle, Loader, Info } from 'lucide-react';

export default function AdminDataSync() {
  const [merchantId, setMerchantId] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [syncChats, setSyncChats] = useState(true);
  const [syncMessages, setSyncMessages] = useState(true);
  const [limit, setLimit] = useState(100);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncMutation = trpc.merchants.syncGreenAPIData.useMutation();

  const handleSync = async () => {
    if (!merchantId || !instanceId || !token) {
      setError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSyncResult(null);

    try {
      const result = await syncMutation.mutateAsync({
        merchantId: parseInt(merchantId),
        instanceId,
        token,
        syncChats,
        syncMessages,
        limit,
      });

      setSyncResult(result);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء المزامنة');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">مزامنة بيانات Green API</h1>
        <p className="text-gray-500 mt-2">قم بتحميل البيانات الحقيقية من حسابك في Green API</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle>إعدادات المزامنة</CardTitle>
            <CardDescription>أدخل بيانات Green API الخاصة بك</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">معرف التاجر</label>
              <Input
                type="number"
                placeholder="مثال: 1"
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">معرف الحساب (Instance ID)</label>
              <Input
                type="text"
                placeholder="مثال: 1101234567"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">API Token</label>
              <Input
                type="password"
                placeholder="أدخل API Token الخاص بك"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">عدد المحادثات</label>
              <Input
                type="number"
                placeholder="100"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                disabled={isLoading}
                min="1"
                max="1000"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="syncChats"
                  checked={syncChats}
                  onCheckedChange={(checked) => setSyncChats(checked as boolean)}
                  disabled={isLoading}
                />
                <label htmlFor="syncChats" className="text-sm cursor-pointer">
                  مزامنة المحادثات
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="syncMessages"
                  checked={syncMessages}
                  onCheckedChange={(checked) => setSyncMessages(checked as boolean)}
                  disabled={isLoading}
                />
                <label htmlFor="syncMessages" className="text-sm cursor-pointer">
                  مزامنة الرسائل
                </label>
              </div>
            </div>

            <Button
              onClick={handleSync}
              disabled={isLoading || !merchantId || !instanceId || !token}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  جاري المزامنة...
                </>
              ) : (
                'بدء المزامنة'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900">خطأ</h3>
                    <p className="text-red-700 text-sm mt-1">{error}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {syncResult && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-green-900">نتائج المزامنة</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">الحالة</p>
                    <p className="font-semibold text-lg">
                      {syncResult.status === 'completed' ? 'مكتملة ✓' : syncResult.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">المحادثات المعالجة</p>
                    <p className="font-semibold text-lg">{syncResult.chatsProcessed}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">الرسائل المعالجة</p>
                    <p className="font-semibold text-lg">{syncResult.messagesProcessed}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">الأخطاء</p>
                    <p className="font-semibold text-lg">{syncResult.errors.length}</p>
                  </div>
                </div>

                {syncResult.errors.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-green-200">
                    <p className="text-sm font-semibold text-gray-700 mb-2">الأخطاء:</p>
                    <ul className="space-y-1 text-sm text-gray-600">
                      {syncResult.errors.map((error: string, idx: number) => (
                        <li key={idx}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!syncResult && !error && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-start space-x-3">
                  <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-blue-900">نصائح</h3>
                    <ul className="text-blue-700 text-sm mt-2 space-y-1">
                      <li>• تأكد من صحة بيانات Green API</li>
                      <li>• ستتم مزامنة المحادثات والرسائل الحقيقية</li>
                      <li>• قد تستغرق المزامنة بعض الوقت حسب عدد البيانات</li>
                      <li>• الحد الأقصى للمحادثات: 1000</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
