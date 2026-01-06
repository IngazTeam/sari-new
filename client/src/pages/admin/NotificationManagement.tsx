import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Bell, CheckCircle, AlertCircle, Clock, RefreshCw, Settings, Filter } from 'lucide-react';

export default function NotificationManagement() {
  const [filterMerchantId, setFilterMerchantId] = useState<number | undefined>();
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<'pending' | 'sent' | 'failed' | undefined>();

  // Get notification logs
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = trpc.notificationManagement.getAllLogs.useQuery({
    limit: 100,
    merchantId: filterMerchantId,
    type: filterType,
    status: filterStatus,
  });

  // Get notification stats
  const { data: stats } = trpc.notificationManagement.getStats.useQuery();

  // Get global settings
  const { data: globalSettings, refetch: refetchSettings } = trpc.notificationManagement.getGlobalSettings.useQuery();

  // Resend notification
  const resendMutation = trpc.notificationManagement.resend.useMutation({
    onSuccess: () => {
      toast.success('تم إعادة إرسال الإشعار بنجاح');
      refetchLogs();
    },
    onError: (error) => {
      toast.error(`فشل إعادة الإرسال: ${error.message}`);
    },
  });

  // Update global settings
  const updateSettingsMutation = trpc.notificationManagement.updateGlobalSettings.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث الإعدادات العامة بنجاح');
      refetchSettings();
    },
    onError: (error) => {
      toast.error(`فشل التحديث: ${error.message}`);
    },
  });

  const handleResend = (logId: number) => {
    if (confirm('هل أنت متأكد من إعادة إرسال هذا الإشعار؟')) {
      resendMutation.mutate({ logId });
    }
  };

  const handleToggleSetting = (key: string, value: boolean) => {
    updateSettingsMutation.mutate({ [key]: value } as any);
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">إدارة الإشعارات</h1>
          <p className="text-muted-foreground mt-2">
            مراقبة وإدارة جميع الإشعارات في النظام
          </p>
        </div>
        <Button variant="outline" onClick={() => refetchLogs()}>
          <RefreshCw className="h-4 w-4 ml-2" />
          تحديث
        </Button>
      </div>

      {/* إحصائيات الإشعارات */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-sm text-muted-foreground mt-1">إجمالي الإشعارات</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{stats.sent}</div>
                <div className="text-sm text-muted-foreground mt-1">تم إرسالها</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
                <div className="text-sm text-muted-foreground mt-1">فشلت</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
                <div className="text-sm text-muted-foreground mt-1">قيد الإرسال</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* الإعدادات العامة */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle>الإعدادات العامة للإشعارات</CardTitle>
          </div>
          <CardDescription>تفعيل أو تعطيل أنواع الإشعارات على مستوى النظام</CardDescription>
        </CardHeader>
        <CardContent>
          {globalSettings && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">إشعارات الطلبات الجديدة</div>
                  <div className="text-sm text-muted-foreground">عند إنشاء طلب جديد</div>
                </div>
                <Switch
                  checked={globalSettings.newOrdersGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('newOrdersGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">إشعارات الرسائل الجديدة</div>
                  <div className="text-sm text-muted-foreground">عند استقبال رسالة واتساب</div>
                </div>
                <Switch
                  checked={globalSettings.newMessagesGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('newMessagesGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">إشعارات المواعيد</div>
                  <div className="text-sm text-muted-foreground">عند حجز موعد جديد</div>
                </div>
                <Switch
                  checked={globalSettings.appointmentsGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('appointmentsGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">إشعارات حالة الطلبات</div>
                  <div className="text-sm text-muted-foreground">عند تغيير حالة الطلب</div>
                </div>
                <Switch
                  checked={globalSettings.orderStatusGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('orderStatusGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">إشعارات فك ربط واتساب</div>
                  <div className="text-sm text-muted-foreground">عند فك ربط حساب واتساب</div>
                </div>
                <Switch
                  checked={globalSettings.whatsappDisconnectGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('whatsappDisconnectGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">التقارير الأسبوعية</div>
                  <div className="text-sm text-muted-foreground">إرسال تقرير أسبوعي للتجار</div>
                </div>
                <Switch
                  checked={globalSettings.weeklyReportsGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('weeklyReportsGlobalEnabled', checked)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* فلاتر البحث */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            <CardTitle>فلترة السجلات</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>رقم التاجر</Label>
              <Input
                type="number"
                placeholder="أدخل رقم التاجر"
                value={filterMerchantId || ''}
                onChange={(e) => setFilterMerchantId(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>

            <div className="space-y-2">
              <Label>نوع الإشعار</Label>
              <Select value={filterType} onValueChange={(value) => setFilterType(value === 'all' ? undefined : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="جميع الأنواع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأنواع</SelectItem>
                  <SelectItem value="new_order">طلب جديد</SelectItem>
                  <SelectItem value="new_message">رسالة جديدة</SelectItem>
                  <SelectItem value="appointment">موعد</SelectItem>
                  <SelectItem value="order_status">حالة الطلب</SelectItem>
                  <SelectItem value="whatsapp_disconnect">فك ربط واتساب</SelectItem>
                  <SelectItem value="weekly_report">تقرير أسبوعي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value === 'all' ? undefined : value as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="جميع الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="sent">تم الإرسال</SelectItem>
                  <SelectItem value="failed">فشل</SelectItem>
                  <SelectItem value="pending">قيد الإرسال</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* سجل الإشعارات */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle>سجل الإشعارات</CardTitle>
          </div>
          <CardDescription>جميع الإشعارات المرسلة في النظام</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              جاري التحميل...
            </div>
          ) : logs && logs.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>التاجر</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>العنوان</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">{log.id}</TableCell>
                      <TableCell>{log.merchantId}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {log.type === 'new_order' ? 'طلب جديد' :
                           log.type === 'new_message' ? 'رسالة جديدة' :
                           log.type === 'appointment' ? 'موعد' :
                           log.type === 'order_status' ? 'حالة الطلب' :
                           log.type === 'whatsapp_disconnect' ? 'فك ربط واتساب' :
                           log.type === 'weekly_report' ? 'تقرير أسبوعي' : log.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{log.title}</TableCell>
                      <TableCell>
                        {log.status === 'sent' ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle className="h-3 w-3 ml-1" />
                            تم الإرسال
                          </Badge>
                        ) : log.status === 'failed' ? (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 ml-1" />
                            فشل
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock className="h-3 w-3 ml-1" />
                            قيد الإرسال
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString('ar-SA', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell>
                        {log.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResend(log.id)}
                            disabled={resendMutation.isPending}
                          >
                            <RefreshCw className="h-4 w-4 ml-1" />
                            إعادة الإرسال
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد إشعارات مطابقة للفلاتر
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
