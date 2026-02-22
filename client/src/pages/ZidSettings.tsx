import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, RefreshCw, Link as LinkIcon, Unlink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';

export default function ZidSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Get Zid status
  const { data: status, isLoading, refetch } = trpc.zid.getStatus.useQuery();

  // Mutations
  const disconnectMutation = trpc.zid.disconnect.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم فصل الاتصال',
        description: 'تم فصل Zid بنجاح',
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'خطأ',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateAutoSyncMutation = trpc.zid.updateAutoSync.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم التحديث',
        description: 'تم تحديث إعدادات المزامنة التلقائية',
      });
      refetch();
    },
  });

  const handleConnect = () => {
    if (!clientId || !clientSecret) {
      toast({
        title: 'خطأ',
        description: 'يرجى إدخال Client ID و Client Secret',
        variant: 'destructive',
      });
      return;
    }

    setIsConnecting(true);
    
    // Build redirect URI
    const redirectUri = `${window.location.origin}/merchant/zid/callback`;
    
    // Get authorization URL
    const authUrl = `https://oauth.zid.sa/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    
    // Store credentials in sessionStorage for callback
    sessionStorage.setItem('zid_client_id', clientId);
    sessionStorage.setItem('zid_client_secret', clientSecret);
    sessionStorage.setItem('zid_redirect_uri', redirectUri);
    
    // Redirect to Zid OAuth
    window.location.href = authUrl;
  };

  const handleDisconnect = () => {
    if (confirm('هل أنت متأكد من فصل الاتصال مع Zid؟')) {
      disconnectMutation.mutate();
    }
  };

  const handleAutoSyncToggle = (field: 'autoSyncProducts' | 'autoSyncOrders' | 'autoSyncCustomers', value: boolean) => {
    updateAutoSyncMutation.mutate({ [field]: value });
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
        <p className="text-muted-foreground mt-2">
          ربط متجرك على منصة زد مع ساري لمزامنة المنتجات والطلبات والعملاء
        </p>
      </div>

      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status?.connected ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />
                متصل بـ Zid
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-gray-400" />
                غير متصل
              </>
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
                  للحصول على Client ID و Client Secret، قم بإنشاء تطبيق في{' '}
                  <a
                    href="https://partners.zid.sa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Partner Dashboard
                  </a>
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="clientId">Client ID</Label>
                  <Input
                    id="clientId"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder={t('zidSettingsPage.text1')}
                  />
                </div>

                <div>
                  <Label htmlFor="clientSecret">Client Secret</Label>
                  <Input
                    id="clientSecret"
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={t('zidSettingsPage.text2')}
                  />
                </div>

                <Button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      جاري الاتصال...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-4 h-4 ml-2" />
                      ربط مع Zid
                    </>
                  )}
                </Button>
              </div>
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
                    {status.lastProductSync
                      ? new Date(status.lastProductSync).toLocaleString('ar-SA')
                      : 'لم تتم المزامنة بعد'}
                  </p>
                </div>

                <div>
                  <Label>{t('zidSettingsPage.text5')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {status.lastOrderSync
                      ? new Date(status.lastOrderSync).toLocaleString('ar-SA')
                      : 'لم تتم المزامنة بعد'}
                  </p>
                </div>

                <div>
                  <Label>{t('zidSettingsPage.text6')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {status.lastCustomerSync
                      ? new Date(status.lastCustomerSync).toLocaleString('ar-SA')
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
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري الفصل...
                  </>
                ) : (
                  <>
                    <Unlink className="w-4 h-4 ml-2" />
                    فصل الاتصال
                  </>
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
            <CardDescription>
              تفعيل المزامنة التلقائية للبيانات من Zid
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t('zidSettingsPage.text8')}</Label>
                <p className="text-sm text-muted-foreground">
                  مزامنة المنتجات كل ساعة
                </p>
              </div>
              <Switch
                checked={status.autoSyncProducts}
                onCheckedChange={(checked) =>
                  handleAutoSyncToggle('autoSyncProducts', checked)
                }
                disabled={updateAutoSyncMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t('zidSettingsPage.text9')}</Label>
                <p className="text-sm text-muted-foreground">
                  مزامنة الطلبات كل 15 دقيقة
                </p>
              </div>
              <Switch
                checked={status.autoSyncOrders}
                onCheckedChange={(checked) =>
                  handleAutoSyncToggle('autoSyncOrders', checked)
                }
                disabled={updateAutoSyncMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t('zidSettingsPage.text10')}</Label>
                <p className="text-sm text-muted-foreground">
                  مزامنة العملاء يومياً
                </p>
              </div>
              <Switch
                checked={status.autoSyncCustomers}
                onCheckedChange={(checked) =>
                  handleAutoSyncToggle('autoSyncCustomers', checked)
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
            <CardDescription>
              قم بمزامنة البيانات يدوياً من Zid
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => window.location.href = '/merchant/zid/products'}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 ml-2" />
              مزامنة المنتجات
            </Button>

            <Button
              onClick={() => window.location.href = '/merchant/zid/orders'}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 ml-2" />
              مزامنة الطلبات
            </Button>

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
