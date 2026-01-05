import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Clock, Package, ShoppingCart, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ZidSyncLogs() {
  const { data: logs, isLoading } = trpc.zid.getSyncLogs.useQuery({ limit: 50 });
  const { data: stats } = trpc.zid.getSyncStats.useQuery();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500">مكتمل</Badge>;
      case 'failed':
        return <Badge variant="destructive">فشل</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500">جاري التنفيذ</Badge>;
      case 'pending':
        return <Badge variant="outline">قيد الانتظار</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSyncTypeIcon = (type: string) => {
    switch (type) {
      case 'products':
        return <Package className="w-4 h-4" />;
      case 'orders':
        return <ShoppingCart className="w-4 h-4" />;
      case 'customers':
        return <Users className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getSyncTypeLabel = (type: string) => {
    switch (type) {
      case 'products':
        return 'المنتجات';
      case 'orders':
        return 'الطلبات';
      case 'customers':
        return 'العملاء';
      case 'inventory':
        return 'المخزون';
      default:
        return type;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">سجل المزامنة</h1>
        <p className="text-muted-foreground mt-2">
          سجل جميع عمليات المزامنة مع Zid
        </p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">إجمالي المزامنات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSyncs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                مزامنات ناجحة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {stats.successfulSyncs}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                مزامنات فاشلة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                {stats.failedSyncs}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sync Logs */}
      <Card>
        <CardHeader>
          <CardTitle>سجل العمليات</CardTitle>
          <CardDescription>
            آخر 50 عملية مزامنة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!logs || logs.length === 0 ? (
            <Alert>
              <AlertDescription>
                لا توجد عمليات مزامنة بعد
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1">
                      {getSyncTypeIcon(log.syncType)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">
                          {getSyncTypeLabel(log.syncType)}
                        </h3>
                        {getStatusBadge(log.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString('ar-SA')}
                      </p>
                      {log.status === 'completed' && (
                        <div className="mt-2 text-sm">
                          <span className="text-green-600">
                            ✓ {log.successCount} نجح
                          </span>
                          {log.failedCount > 0 && (
                            <span className="text-red-600 mr-3">
                              ✗ {log.failedCount} فشل
                            </span>
                          )}
                        </div>
                      )}
                      {log.errorMessage && (
                        <p className="mt-2 text-sm text-red-600">
                          {log.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {log.completedAt ? (
                      <span>
                        استغرق:{' '}
                        {Math.round(
                          (new Date(log.completedAt).getTime() -
                            new Date(log.startedAt || log.createdAt).getTime()) /
                            1000
                        )}{' '}
                        ثانية
                      </span>
                    ) : (
                      <span>جاري التنفيذ...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
