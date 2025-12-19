import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, XCircle, ExternalLink, FileSpreadsheet, Settings, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import DashboardLayout from '@/components/DashboardLayout';

export default function SheetsSettings() {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  // الحصول على حالة الاتصال
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = trpc.sheets.getStatus.useQuery();

  // الحصول على إعدادات التقارير
  const { data: reportSettings, refetch: refetchSettings } = trpc.sheets.getReportSettings.useQuery();

  // الحصول على رابط التفويض
  const { data: authData } = trpc.sheets.getAuthUrl.useQuery();

  // إعداد Spreadsheet
  const setupMutation = trpc.sheets.setupSpreadsheet.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'نجح الإعداد',
          description: data.message,
        });
        refetchStatus();
      } else {
        toast({
          title: 'فشل الإعداد',
          description: data.message,
          variant: 'destructive',
        });
      }
    },
  });

  // تحديث إعدادات التقارير
  const updateSettingsMutation = trpc.sheets.updateReportSettings.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'تم التحديث',
          description: data.message,
        });
        refetchSettings();
      } else {
        toast({
          title: 'فشل التحديث',
          description: data.message,
          variant: 'destructive',
        });
      }
    },
  });

  // فصل الاتصال
  const disconnectMutation = trpc.sheets.disconnect.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'تم الفصل',
          description: data.message,
        });
        refetchStatus();
      } else {
        toast({
          title: 'فشل الفصل',
          description: data.message,
          variant: 'destructive',
        });
      }
    },
  });

  const handleConnect = () => {
    if (authData?.authUrl) {
      setIsConnecting(true);
      window.location.href = authData.authUrl;
    }
  };

  const handleSetup = () => {
    setupMutation.mutate();
  };

  const handleDisconnect = () => {
    if (confirm('هل أنت متأكد من فصل الاتصال بـ Google Sheets؟')) {
      disconnectMutation.mutate();
    }
  };

  const handleToggleSetting = (setting: string, value: boolean) => {
    updateSettingsMutation.mutate({
      [setting]: value,
    });
  };

  if (statusLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container max-w-4xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">إعدادات Google Sheets</h1>
          <p className="text-muted-foreground">
            ربط حسابك في Google Sheets لحفظ البيانات تلقائياً
          </p>
        </div>

        {/* حالة الاتصال */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
              <div>
                <h2 className="text-xl font-semibold">حالة الاتصال</h2>
                <p className="text-sm text-muted-foreground">
                  {status?.isConnected ? 'متصل' : 'غير متصل'}
                </p>
              </div>
            </div>
            <div>
              {status?.isConnected ? (
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              ) : (
                <XCircle className="w-8 h-8 text-gray-400" />
              )}
            </div>
          </div>

          {status?.isConnected ? (
            <div className="space-y-4">
              {status.spreadsheetId && (
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Spreadsheet ID</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {status.spreadsheetId}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${status.spreadsheetId}`, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 ml-2" />
                    فتح
                  </Button>
                </div>
              )}

              {status.lastSync && (
                <p className="text-sm text-muted-foreground">
                  آخر مزامنة: {new Date(status.lastSync).toLocaleString('ar-SA')}
                </p>
              )}

              <div className="flex gap-3">
                {!status.spreadsheetId && (
                  <Button
                    onClick={handleSetup}
                    disabled={setupMutation.isPending}
                  >
                    {setupMutation.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                    إعداد Spreadsheet
                  </Button>
                )}

                <Button
                  variant="outline"
                  onClick={() => refetchStatus()}
                >
                  <RefreshCw className="w-4 h-4 ml-2" />
                  تحديث الحالة
                </Button>

                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                  فصل الاتصال
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                قم بربط حسابك في Google Sheets لتفعيل المزامنة التلقائية للبيانات
              </p>
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                size="lg"
              >
                {isConnecting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                <FileSpreadsheet className="w-5 h-5 ml-2" />
                ربط Google Sheets
              </Button>
            </div>
          )}
        </Card>

        {/* إعدادات التقارير التلقائية */}
        {status?.isConnected && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="w-6 h-6 text-primary" />
              <div>
                <h2 className="text-xl font-semibold">إعدادات التقارير التلقائية</h2>
                <p className="text-sm text-muted-foreground">
                  تفعيل إرسال التقارير عبر WhatsApp
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="daily-reports" className="text-base font-medium">
                    التقارير اليومية
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    إرسال تقرير يومي في الساعة 11:59 مساءً
                  </p>
                </div>
                <Switch
                  id="daily-reports"
                  checked={reportSettings?.sendDailyReports || false}
                  onCheckedChange={(checked) => handleToggleSetting('sendDailyReports', checked)}
                  disabled={updateSettingsMutation.isPending}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="weekly-reports" className="text-base font-medium">
                    التقارير الأسبوعية
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    إرسال تقرير أسبوعي كل يوم أحد
                  </p>
                </div>
                <Switch
                  id="weekly-reports"
                  checked={reportSettings?.sendWeeklyReports || false}
                  onCheckedChange={(checked) => handleToggleSetting('sendWeeklyReports', checked)}
                  disabled={updateSettingsMutation.isPending}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="monthly-reports" className="text-base font-medium">
                    التقارير الشهرية
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    إرسال تقرير شهري في آخر يوم من الشهر
                  </p>
                </div>
                <Switch
                  id="monthly-reports"
                  checked={reportSettings?.sendMonthlyReports || false}
                  onCheckedChange={(checked) => handleToggleSetting('sendMonthlyReports', checked)}
                  disabled={updateSettingsMutation.isPending}
                />
              </div>
            </div>
          </Card>
        )}

        {/* معلومات إضافية */}
        {status?.isConnected && (
          <Card className="p-6 mt-6 bg-blue-50 border-blue-200">
            <h3 className="font-semibold mb-2 text-blue-900">ملاحظات مهمة:</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>يتم حفظ الطلبات تلقائياً في Google Sheets عند إنشائها</li>
              <li>يمكنك تصدير المحادثات والمخزون يدوياً من الصفحات المخصصة</li>
              <li>التقارير التلقائية تُحفظ في صفحة "التقارير" داخل Spreadsheet</li>
              <li>يمكنك تعديل البيانات مباشرة في Google Sheets</li>
            </ul>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
