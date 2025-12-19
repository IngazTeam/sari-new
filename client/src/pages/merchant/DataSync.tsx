import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, Clock, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function DataSync() {
  const { t } = useTranslation();
  const [syncing, setSyncing] = useState(false);
  const utils = trpc.useUtils();

  // Get sync status
  const { data: syncStatus, isLoading } = trpc.googleSheets.getSyncStatus.useQuery();

  // Trigger manual sync
  const syncMutation = trpc.googleSheets.syncToSheets.useMutation({
    onSuccess: () => {
      utils.googleSheets.getSyncStatus.invalidate();
      setSyncing(false);
    },
    onError: () => {
      setSyncing(false);
    },
  });

  const handleSync = () => {
    setSyncing(true);
    syncMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800 border-green-200">نجح</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800 border-red-200">فشل</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">قيد الانتظار</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">غير معروف</Badge>;
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">مزامنة البيانات</h1>
          <p className="text-muted-foreground mt-2">
            تتبع حالة مزامنة بياناتك مع Google Sheets
          </p>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncing || syncMutation.isPending}
          size="lg"
        >
          {syncing || syncMutation.isPending ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              جاري المزامنة...
            </>
          ) : (
            <>
              <RefreshCw className="ml-2 h-4 w-4" />
              مزامنة الآن
            </>
          )}
        </Button>
      </div>

      {syncMutation.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {syncMutation.error?.message || 'حدث خطأ أثناء المزامنة'}
          </AlertDescription>
        </Alert>
      )}

      {syncMutation.isSuccess && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            تمت المزامنة بنجاح!
          </AlertDescription>
        </Alert>
      )}

      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle>الحالة العامة</CardTitle>
          <CardDescription>
            آخر تحديث للمزامنة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncStatus ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(syncStatus.lastSyncStatus)}
                  <div>
                    <p className="font-medium">
                      {syncStatus.lastSyncStatus === 'success' && 'تمت المزامنة بنجاح'}
                      {syncStatus.lastSyncStatus === 'error' && 'فشلت المزامنة'}
                      {syncStatus.lastSyncStatus === 'pending' && 'المزامنة قيد التنفيذ'}
                    </p>
                    {syncStatus.lastSyncAt && (
                      <p className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(syncStatus.lastSyncAt), {
                          addSuffix: true,
                          locale: ar,
                        })}
                      </p>
                    )}
                  </div>
                </div>
                {getStatusBadge(syncStatus.lastSyncStatus)}
              </div>

              {syncStatus.spreadsheetUrl && (
                <div className="pt-4 border-t">
                  <Button
                    variant="outline"
                    asChild
                    className="w-full"
                  >
                    <a
                      href={syncStatus.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="ml-2 h-4 w-4" />
                      فتح جدول البيانات
                    </a>
                  </Button>
                </div>
              )}

              {syncStatus.errorMessage && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{syncStatus.errorMessage}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>لم يتم إجراء أي مزامنة بعد</p>
              <p className="text-sm mt-2">انقر على "مزامنة الآن" لبدء المزامنة</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync History */}
      {syncStatus?.history && syncStatus.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>سجل المزامنة</CardTitle>
            <CardDescription>
              آخر {syncStatus.history.length} عمليات مزامنة
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {syncStatus.history.map((record: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(record.status)}
                    <div>
                      <p className="text-sm font-medium">
                        {record.status === 'success' && 'مزامنة ناجحة'}
                        {record.status === 'error' && 'مزامنة فاشلة'}
                        {record.status === 'pending' && 'قيد الانتظار'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(record.timestamp), {
                          addSuffix: true,
                          locale: ar,
                        })}
                      </p>
                      {record.recordsCount && (
                        <p className="text-xs text-muted-foreground">
                          {record.recordsCount} سجل
                        </p>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(record.status)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Info */}
      <Card>
        <CardHeader>
          <CardTitle>معلومات الإعداد</CardTitle>
          <CardDescription>
            تفاصيل إعداد المزامنة الحالية
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">حالة التكامل</span>
              <span className="font-medium">
                {syncStatus?.isConfigured ? (
                  <Badge className="bg-green-100 text-green-800">مفعّل</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800">غير مفعّل</Badge>
                )}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">المزامنة التلقائية</span>
              <span className="font-medium">
                {syncStatus?.autoSyncEnabled ? 'مفعّلة' : 'معطّلة'}
              </span>
            </div>
            {syncStatus?.nextSyncAt && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">المزامنة التالية</span>
                <span className="font-medium">
                  {formatDistanceToNow(new Date(syncStatus.nextSyncAt), {
                    addSuffix: true,
                    locale: ar,
                  })}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">كيف تعمل المزامنة؟</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 space-y-2 text-sm">
          <p>• يتم مزامنة بياناتك تلقائياً مع Google Sheets كل ساعة</p>
          <p>• يمكنك إجراء مزامنة يدوية في أي وقت بالنقر على "مزامنة الآن"</p>
          <p>• البيانات المزامنة تشمل: الطلبات، العملاء، المنتجات، والمحادثات</p>
          <p>• يمكنك الوصول إلى جدول البيانات من خلال الرابط أعلاه</p>
        </CardContent>
      </Card>
    </div>
  );
}
