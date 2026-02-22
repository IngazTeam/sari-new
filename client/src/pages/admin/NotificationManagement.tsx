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
import { useTranslation } from 'react-i18next';

export default function NotificationManagement() {
  const { t } = useTranslation();
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
      toast.success(t('adminNotificationManagementPage.text47'));
      refetchLogs();
    },
    onError: (error) => {
      toast.error(t('adminNotificationManagementPage.text0', { var0: error.message }));
    },
  });

  // Update global settings
  const updateSettingsMutation = trpc.notificationManagement.updateGlobalSettings.useMutation({
    onSuccess: () => {
      toast.success(t('adminNotificationManagementPage.text48'));
      refetchSettings();
    },
    onError: (error) => {
      toast.error(t('adminNotificationManagementPage.text1', { var0: error.message }));
    },
  });

  const handleResend = (logId: number) => {
    if (confirm(t('adminNotificationManagementPage.text49'))) {
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
          <h1 className="text-3xl font-bold">{t('adminNotificationManagementPage.text2')}</h1>
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
                <div className="text-sm text-muted-foreground mt-1">{t('adminNotificationManagementPage.text3')}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{stats.sent}</div>
                <div className="text-sm text-muted-foreground mt-1">{t('adminNotificationManagementPage.text4')}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
                <div className="text-sm text-muted-foreground mt-1">{t('adminNotificationManagementPage.text5')}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
                <div className="text-sm text-muted-foreground mt-1">{t('adminNotificationManagementPage.text6')}</div>
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
            <CardTitle>{t('adminNotificationManagementPage.text7')}</CardTitle>
          </div>
          <CardDescription>{t('adminNotificationManagementPage.text8')}</CardDescription>
        </CardHeader>
        <CardContent>
          {globalSettings && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">{t('adminNotificationManagementPage.text9')}</div>
                  <div className="text-sm text-muted-foreground">{t('adminNotificationManagementPage.text10')}</div>
                </div>
                <Switch
                  checked={globalSettings.newOrdersGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('newOrdersGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">{t('adminNotificationManagementPage.text11')}</div>
                  <div className="text-sm text-muted-foreground">{t('adminNotificationManagementPage.text12')}</div>
                </div>
                <Switch
                  checked={globalSettings.newMessagesGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('newMessagesGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">{t('adminNotificationManagementPage.text13')}</div>
                  <div className="text-sm text-muted-foreground">{t('adminNotificationManagementPage.text14')}</div>
                </div>
                <Switch
                  checked={globalSettings.appointmentsGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('appointmentsGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">{t('adminNotificationManagementPage.text15')}</div>
                  <div className="text-sm text-muted-foreground">{t('adminNotificationManagementPage.text16')}</div>
                </div>
                <Switch
                  checked={globalSettings.orderStatusGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('orderStatusGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">{t('adminNotificationManagementPage.text17')}</div>
                  <div className="text-sm text-muted-foreground">{t('adminNotificationManagementPage.text18')}</div>
                </div>
                <Switch
                  checked={globalSettings.whatsappDisconnectGlobalEnabled}
                  onCheckedChange={(checked) => handleToggleSetting('whatsappDisconnectGlobalEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">{t('adminNotificationManagementPage.text19')}</div>
                  <div className="text-sm text-muted-foreground">{t('adminNotificationManagementPage.text20')}</div>
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
            <CardTitle>{t('adminNotificationManagementPage.text21')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{t('adminNotificationManagementPage.text22')}</Label>
              <Input
                type="number"
                placeholder={t('adminNotificationManagementPage.text23')}
                value={filterMerchantId || ''}
                onChange={(e) => setFilterMerchantId(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('adminNotificationManagementPage.text24')}</Label>
              <Select value={filterType} onValueChange={(value) => setFilterType(value === 'all' ? undefined : value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('adminNotificationManagementPage.text25')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('adminNotificationManagementPage.text26')}</SelectItem>
                  <SelectItem value="new_order">{t('adminNotificationManagementPage.text27')}</SelectItem>
                  <SelectItem value="new_message">{t('adminNotificationManagementPage.text28')}</SelectItem>
                  <SelectItem value="appointment">{t('adminNotificationManagementPage.text29')}</SelectItem>
                  <SelectItem value="order_status">{t('adminNotificationManagementPage.text30')}</SelectItem>
                  <SelectItem value="whatsapp_disconnect">{t('adminNotificationManagementPage.text31')}</SelectItem>
                  <SelectItem value="weekly_report">{t('adminNotificationManagementPage.text32')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('adminNotificationManagementPage.text33')}</Label>
              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value === 'all' ? undefined : value as any)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('adminNotificationManagementPage.text34')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('adminNotificationManagementPage.text35')}</SelectItem>
                  <SelectItem value="sent">{t('adminNotificationManagementPage.text36')}</SelectItem>
                  <SelectItem value="failed">{t('adminNotificationManagementPage.text37')}</SelectItem>
                  <SelectItem value="pending">{t('adminNotificationManagementPage.text38')}</SelectItem>
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
            <CardTitle>{t('adminNotificationManagementPage.text39')}</CardTitle>
          </div>
          <CardDescription>{t('adminNotificationManagementPage.text40')}</CardDescription>
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
                    <TableHead>{t('adminNotificationManagementPage.text41')}</TableHead>
                    <TableHead>{t('adminNotificationManagementPage.text42')}</TableHead>
                    <TableHead>{t('adminNotificationManagementPage.text43')}</TableHead>
                    <TableHead>{t('adminNotificationManagementPage.text44')}</TableHead>
                    <TableHead>{t('adminNotificationManagementPage.text45')}</TableHead>
                    <TableHead>{t('adminNotificationManagementPage.text46')}</TableHead>
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
