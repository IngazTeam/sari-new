import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, RefreshCw, Link as LinkIcon, Unlink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';

export default function ZidSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  // Get Zid status
  const { data: status, isLoading, refetch } = trpc.zid.getConnection.useQuery();

  // Mutations
  const disconnectMutation = trpc.zid.disconnect.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم فصل الاتصال',
        description: 'تم فصل Zid بنجاح',
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'خطأ',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateAutoSyncMutation = trpc.zid.updateSettings.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم التحديث',
        description: 'تم تحديث إعدادات المزامنة التلقائية',
      });
      refetch();
    },
  });

  const beginOAuthMutation = trpc.zid.beginOAuth.useMutation({
    onSuccess: ({ authorizationUrl }) => {
      window.location.assign(authorizationUrl);
    },
    onError: () => {
      toast({
        title: 'تعذر بدء الربط',
        description: 'تحقق من إعداد تكامل زد على الخادم ثم حاول مرة أخرى.',
        variant: 'destructive',
      });
    },
  });

  const handleDisconnect = () => {
    if (confirm('هل أنت متأكد من فصل الاتصال مع Zid؟')) {
      disconnectMutation.mutate({} as any);
    }
  };

  const handleAutoSyncToggle = (field: 'syncProducts' | 'syncOrders' | 'syncCustomers', value: boolean) => {
    updateAutoSyncMutation.mutate({
      autoSync: status?.settings?.autoSync ?? true,
      syncProducts: field === 'syncProducts' ? value : (status?.settings?.syncProducts ?? true),
      syncOrders: field === 'syncOrders' ? value : (status?.settings?.syncOrders ?? true),
      syncCustomers: field === 'syncCustomers' ? value : (status?.settings?.syncCustomers ?? true),
    });
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
        <h1 className="text-3xl font-bold">{t('zidSettingsPage.text0')}</h1>
        <p className="text-muted-foreground mt-2">{t('zidSettings.auto_0')}</p>
      </div>

      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status?.connected ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />{t('zidSettings.auto_1')}</>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-gray-400" />{t('zidSettings.auto_2')}</>
            )}
          </CardTitle>
          <CardDescription>
            {status?.connected
              ? `متصل بمتجر: ${status.storeName || 'غير معروف'}`
              : 'قم بربط حسابك على Zid لبدء المزامنة'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status?.connected ? (
            <>
              <Alert>
                <AlertDescription>
                  سيحوّلك ساري إلى زد لمنح الصلاحيات المطلوبة. بيانات التطبيق السرية محفوظة على الخادم ولا تُدخل أو تُخزن في المتصفح.
                </AlertDescription>
              </Alert>

              <Button
                onClick={() => beginOAuthMutation.mutate()}
                disabled={beginOAuthMutation.isPending}
                className="w-full"
              >
                {beginOAuthMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />{t('zidSettings.auto_3')}</>
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4 ml-2" />{t('zidSettings.auto_4')}</>
                )}
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              {status.storeUrl && (
                <div>
                  <Label>{t('zidSettingsPage.text3')}</Label>
                  <a
                    href={status.storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline block mt-1"
                  >
                    {status.storeUrl}
                  </a>
                </div>
              )}

              <div className="grid gap-4">
                <div>
                  <Label>{t('zidSettingsPage.text4')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {status.lastSync
                      ? new Date(status.lastSync).toLocaleString('ar-SA')
                      : 'لم تتم المزامنة بعد'}
                  </p>
                </div>

                <div>
                  <Label>{t('zidSettingsPage.text5')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {status.lastSync
                      ? new Date(status.lastSync).toLocaleString('ar-SA')
                      : 'لم تتم المزامنة بعد'}
                  </p>
                </div>

                <div>
                  <Label>{t('zidSettingsPage.text6')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {status.lastSync
                      ? new Date(status.lastSync).toLocaleString('ar-SA')
                      : 'لم تتم المزامنة بعد'}
                  </p>
                </div>
              </div>

              <Button
                onClick={handleDisconnect}
                variant="destructive"
                disabled={disconnectMutation.isPending}
                className="w-full"
              >
                {disconnectMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />{t('zidSettings.auto_5')}</>
                ) : (
                  <>
                    <Unlink className="w-4 h-4 ml-2" />{t('zidSettings.auto_6')}</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-Sync Settings */}
      {status?.connected && (
        <Card>
          <CardHeader>
            <CardTitle>{t('zidSettingsPage.text7')}</CardTitle>
            <CardDescription>{t('zidSettings.auto_7')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t('zidSettingsPage.text8')}</Label>
                <p className="text-sm text-muted-foreground">{t('zidSettings.auto_8')}</p>
              </div>
              <Switch
                checked={status.settings?.syncProducts}
                onCheckedChange={(checked) =>
                  handleAutoSyncToggle('syncProducts', checked)
                }
                disabled={updateAutoSyncMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t('zidSettingsPage.text9')}</Label>
                <p className="text-sm text-muted-foreground">{t('zidSettings.auto_9')}</p>
              </div>
              <Switch
                checked={status.settings?.syncOrders}
                onCheckedChange={(checked) =>
                  handleAutoSyncToggle('syncOrders', checked)
                }
                disabled={updateAutoSyncMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t('zidSettingsPage.text10')}</Label>
                <p className="text-sm text-muted-foreground">{t('zidSettings.auto_10')}</p>
              </div>
              <Switch
                checked={status.settings?.syncCustomers}
                onCheckedChange={(checked) =>
                  handleAutoSyncToggle('syncCustomers', checked)
                }
                disabled={updateAutoSyncMutation.isPending}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Sync Card */}
      {status?.connected && (
        <Card>
          <CardHeader>
            <CardTitle>{t('zidSettingsPage.text11')}</CardTitle>
            <CardDescription>{t('zidSettings.auto_11')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => window.location.href = '/merchant/zid/products'}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 ml-2" />{t('zidSettings.auto_12')}</Button>

            <Button
              onClick={() => window.location.href = '/merchant/zid/orders'}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 ml-2" />{t('zidSettings.auto_13')}</Button>

            <Button
              onClick={() => window.location.href = '/merchant/zid/sync-logs'}
              variant="outline"
              className="w-full"
            >
              عرض سجل المزامنة
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
