import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Store, CheckCircle2, XCircle, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
export default function SallaIntegration() {
  const { t } = useTranslation();

  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Get merchant ID from localStorage or context
  const merchantId = parseInt(localStorage.getItem('merchantId') || '0');

  // Get connection status
  const { data: connection, isLoading, refetch } = trpc.salla.getConnection.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  // Get sync logs
  const { data: syncLogs } = trpc.salla.getSyncLogs.useQuery(
    { merchantId },
    { enabled: merchantId > 0 && connection?.connected }
  );

  // Mutations
  const connectMutation = trpc.salla.connect.useMutation({
    onSuccess: (data) => {
      toast.success(t('toast.common.msg10'), {
        description: data.message,
      });
      setStoreUrl('');
      setAccessToken('');
      refetch();
    },
    onError: (error) => {
      toast.error(t('toast.common.msg11'), {
        description: error.message,
      });
    },
    onSettled: () => {
      setIsConnecting(false);
    },
  });

  const disconnectMutation = trpc.salla.disconnect.useMutation({
    onSuccess: (data) => {
      toast.success(t('toast.common.msg12'), {
        description: data.message,
      });
      refetch();
    },
    onError: (error) => {
      toast.error(t('toast.common.msg13'), {
        description: error.message,
      });
    },
  });

  const syncMutation = trpc.salla.syncNow.useMutation({
    onSuccess: (data) => {
      toast.success(t('toast.common.msg14'), {
        description: data.message,
      });
      refetch();
    },
    onError: (error) => {
      toast.error(t('toast.common.msg15'), {
        description: error.message,
      });
    },
  });

  const handleConnect = () => {
    if (!storeUrl || !accessToken) {
      toast.error(t('toast.common.msg16'), {
        description: 'يرجى إدخال رابط المتجر والـ Token',
      });
      return;
    }

    setIsConnecting(true);
    connectMutation.mutate({
      merchantId,
      storeUrl,
      accessToken,
    });
  };

  const handleDisconnect = () => {
    if (confirm('هل أنت متأكد من فصل المتجر؟')) {
      disconnectMutation.mutate({ merchantId });
    }
  };

  const handleSync = (syncType: 'full' | 'stock') => {
    syncMutation.mutate({ merchantId, syncType });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ربط متجر Salla</h1>
        <p className="text-muted-foreground mt-2">
          قم بربط متجرك في Salla لمزامنة المنتجات تلقائياً
        </p>
      </div>

      {/* Connection Status Card */}
      {connection?.connected ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <Store className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle>متجر مربوط</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <a 
                      href={connection.storeUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      {connection.storeUrl}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardDescription>
                </div>
              </div>
              <Badge 
                variant={connection.syncStatus === 'active' ? 'default' : 'destructive'}
                className="gap-1"
              >
                {connection.syncStatus === 'active' && <CheckCircle2 className="h-3 w-3" />}
                {connection.syncStatus === 'error' && <XCircle className="h-3 w-3" />}
                {connection.syncStatus === 'syncing' && <Loader2 className="h-3 w-3 animate-spin" />}
                {connection.syncStatus === 'active' ? 'نشط' : 
                 connection.syncStatus === 'error' ? 'خطأ' :
                 connection.syncStatus === 'syncing' ? 'جاري المزامنة' : 'متوقف'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {connection.lastSyncAt && (
              <div className="text-sm text-muted-foreground">
                آخر مزامنة: {new Date(connection.lastSyncAt).toLocaleString('ar-SA')}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => handleSync('stock')}
                disabled={syncMutation.isPending}
                variant="outline"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 ml-2" />
                )}
                مزامنة المخزون
              </Button>
              <Button
                onClick={() => handleSync('full')}
                disabled={syncMutation.isPending}
                variant="outline"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 ml-2" />
                )}
                مزامنة كاملة
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                variant="destructive"
              >
                {disconnectMutation.isPending && (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                )}
                فصل المتجر
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>ربط متجر Salla</CardTitle>
            <CardDescription>
              أدخل بيانات متجرك لبدء المزامنة التلقائية
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>كيفية الحصول على Personal Access Token:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                  <li>سجل دخول إلى لوحة تحكم Salla</li>
                  <li>اذهب إلى الإعدادات → API</li>
                  <li>اضغط على "Create Token"</li>
                  <li>انسخ الـ Token والصقه هنا</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="storeUrl">رابط المتجر</Label>
              <Input
                id="storeUrl"
                type="url"
                placeholder="https://mystore.salla.sa"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessToken">Personal Access Token</Label>
              <Input
                id="accessToken"
                type="password"
                placeholder="أدخل الـ Token من Salla"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            <Button
              onClick={handleConnect}
              disabled={isConnecting || !storeUrl || !accessToken}
              className="w-full"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الربط...
                </>
              ) : (
                <>
                  <Store className="h-4 w-4 ml-2" />
                  ربط المتجر
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sync Logs */}
      {connection?.connected && syncLogs && syncLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>سجل المزامنة</CardTitle>
            <CardDescription>آخر 20 عملية مزامنة</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {syncLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {log.status === 'success' && (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    )}
                    {log.status === 'failed' && (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    {log.status === 'in_progress' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    <div>
                      <div className="font-medium">
                        {log.syncType === 'full_sync' ? 'مزامنة كاملة' :
                         log.syncType === 'stock_sync' ? 'مزامنة المخزون' :
                         'تحديث منتج'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(log.startedAt).toLocaleString('ar-SA')}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm">
                    {log.status === 'success' && (
                      <span className="text-green-600">
                        {log.itemsSynced} منتج
                      </span>
                    )}
                    {log.status === 'failed' && (
                      <span className="text-red-600">فشل</span>
                    )}
                    {log.status === 'in_progress' && (
                      <span className="text-primary">جاري...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>كيف يعمل التكامل؟</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <strong>المزامنة الكاملة:</strong> تتم مرة واحدة يومياً في الساعة 3 صباحاً لجلب جميع المنتجات والأسعار والصور
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <strong>مزامنة المخزون:</strong> تتم كل ساعة لتحديث الكميات المتوفرة فقط
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <strong>التخزين المحلي:</strong> المنتجات تُحفظ في قاعدة بيانات ساري للرد السريع على العملاء
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              4
            </div>
            <div>
              <strong>إنشاء الطلبات:</strong> عندما يطلب العميل من الواتساب، يتم إنشاء الطلب تلقائياً في Salla
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
