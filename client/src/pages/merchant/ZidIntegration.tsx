import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  Store, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ExternalLink, 
  AlertCircle,
  Package,
  ShoppingCart,
  Users,
  Settings,
  History,
  Webhook
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function ZidIntegration() {
  const { t } = useTranslation();
  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [syncProducts, setSyncProducts] = useState(true);
  const [syncOrders, setSyncOrders] = useState(true);
  const [syncCustomers, setSyncCustomers] = useState(true);

  // Get merchant ID from localStorage
  const merchantId = parseInt(localStorage.getItem('merchantId') || '0');

  // Get connection status
  const { data: connection, isLoading, refetch } = trpc.zid.getConnection.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  // Get sync logs
  const { data: syncLogs } = trpc.zid.getSyncLogs.useQuery(
    { merchantId, limit: 10 },
    { enabled: merchantId > 0 && connection?.connected }
  );

  // Get sync stats
  const { data: syncStats } = trpc.zid.getSyncStats.useQuery(
    { merchantId },
    { enabled: merchantId > 0 && connection?.connected }
  );

  // Mutations
  const connectMutation = trpc.zid.connect.useMutation({
    onSuccess: (data) => {
      toast.success(t('zidIntegrationPage.text44'), {
        description: data.message,
      });
      setStoreUrl('');
      setAccessToken('');
      refetch();
    },
    onError: (error) => {
      toast.error(t('zidIntegrationPage.text45'), {
        description: error.message,
      });
    },
    onSettled: () => {
      setIsConnecting(false);
    },
  });

  const disconnectMutation = trpc.zid.disconnect.useMutation({
    onSuccess: (data) => {
      toast.success(t('zidIntegrationPage.text46'), {
        description: data.message,
      });
      refetch();
    },
    onError: (error) => {
      toast.error(t('zidIntegrationPage.text47'), {
        description: error.message,
      });
    },
  });

  const syncMutation = trpc.zid.syncNow.useMutation({
    onSuccess: (data) => {
      toast.success(t('zidIntegrationPage.text48'), {
        description: data.message,
      });
      refetch();
    },
    onError: (error) => {
      toast.error(t('zidIntegrationPage.text49'), {
        description: error.message,
      });
    },
  });

  const updateSettingsMutation = trpc.zid.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(t('zidIntegrationPage.text0'));
    },
    onError: (error) => {
      toast.error(t('zidIntegrationPage.text50'), {
        description: error.message,
      });
    },
  });

  const handleConnect = () => {
    if (!storeUrl || !accessToken) {
      toast.error(t('zidIntegrationPage.text51'), {
        description: t('zidIntegrationPage.text43'),
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
    if (confirm(t('zidIntegrationPage.text52'))) {
      disconnectMutation.mutate({ merchantId });
    }
  };

  const handleSync = () => {
    syncMutation.mutate({ merchantId });
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      merchantId,
      autoSync,
      syncProducts,
      syncOrders,
      syncCustomers,
    });
  };

  // Load settings when connection data is available
  useEffect(() => {
    if (connection?.settings) {
      setAutoSync(connection.settings.autoSync ?? true);
      setSyncProducts(connection.settings.syncProducts ?? true);
      setSyncOrders(connection.settings.syncOrders ?? true);
      setSyncCustomers(connection.settings.syncCustomers ?? true);
    }
  }, [connection]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl" dir="rtl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('zidIntegrationPage.text1')}</h1>
        <p className="text-muted-foreground">
          {t('zidIntegrationPage.text28')}
        </p>
      </div>

      {/* Connection Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Store className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <CardTitle>{t('zidIntegrationPage.text2')}</CardTitle>
                <CardDescription>
                  {connection?.connected ? connection.storeName : t('zidIntegrationPage.text27')}
                </CardDescription>
              </div>
            </div>
            <Badge variant={connection?.connected ? 'default' : 'secondary'}>
              {connection?.connected ? (
                <><CheckCircle2 className="h-4 w-4 ml-1" />{t('zidIntegrationPage.text3')}</>
              ) : (
                <><XCircle className="h-4 w-4 ml-1" />{t('zidIntegrationPage.text4')}</>
              )}
            </Badge>
          </div>
        </CardHeader>
        {connection?.connected && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <Package className="h-5 w-5 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold">{syncStats?.products || 0}</div>
                <div className="text-sm text-muted-foreground">{t('zidIntegrationPage.text5')}</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <ShoppingCart className="h-5 w-5 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold">{syncStats?.orders || 0}</div>
                <div className="text-sm text-muted-foreground">{t('zidIntegrationPage.text6')}</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <Users className="h-5 w-5 mx-auto mb-2 text-orange-500" />
                <div className="text-2xl font-bold">{syncStats?.customers || 0}</div>
                <div className="text-sm text-muted-foreground">{t('zidIntegrationPage.text7')}</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <History className="h-5 w-5 mx-auto mb-2 text-purple-500" />
                <div className="text-2xl font-bold">{syncStats?.lastSync || '-'}</div>
                <div className="text-sm text-muted-foreground">{t('zidIntegrationPage.text8')}</div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Main Content */}
      {connection?.connected ? (
        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 ml-2" />
              {t('zidIntegrationPage.text29')}
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Webhook className="h-4 w-4 ml-2" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="logs">
              <History className="h-4 w-4 ml-2" />
              {t('zidIntegrationPage.text30')}
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>{t('zidIntegrationPage.text9')}</CardTitle>
                <CardDescription>
                  {t('zidIntegrationPage.text31')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">{t('zidIntegrationPage.text10')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('zidIntegrationPage.text32')}
                    </p>
                  </div>
                  <Switch checked={autoSync} onCheckedChange={setAutoSync} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">{t('zidIntegrationPage.text11')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('zidIntegrationPage.text33')}
                    </p>
                  </div>
                  <Switch checked={syncProducts} onCheckedChange={setSyncProducts} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">{t('zidIntegrationPage.text12')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('zidIntegrationPage.text34')}
                    </p>
                  </div>
                  <Switch checked={syncOrders} onCheckedChange={setSyncOrders} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">{t('zidIntegrationPage.text13')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('zidIntegrationPage.text35')}
                    </p>
                  </div>
                  <Switch checked={syncCustomers} onCheckedChange={setSyncCustomers} />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button onClick={handleSaveSettings} disabled={updateSettingsMutation.isPending}>
                    {updateSettingsMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                    {t('zidIntegrationPage.text36')}
                  </Button>
                  <Button variant="outline" onClick={handleSync} disabled={syncMutation.isPending}>
                    {syncMutation.isPending ? (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 ml-2" />
                    )}
                    {t('zidIntegrationPage.text37')}
                  </Button>
                  <Button variant="destructive" onClick={handleDisconnect}>
                    {t('zidIntegrationPage.text38')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks">
            <Card>
              <CardHeader>
                <CardTitle>{t('zidIntegrationPage.text14')}</CardTitle>
                <CardDescription>
                  {t('zidIntegrationPage.text53')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Webhook className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">{t('zidIntegrationPage.text15')}</p>
                      <code className="block p-2 bg-muted rounded text-sm break-all">
                        {window.location.origin}/api/webhooks/zid/{merchantId}
                      </code>
                      <p className="text-sm text-muted-foreground mt-2">
                        {t('zidIntegrationPage.text54')}
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <h4 className="font-medium">{t('zidIntegrationPage.text16')}</h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{t('zidIntegrationPage.text17')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{t('zidIntegrationPage.text18')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{t('zidIntegrationPage.text19')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{t('zidIntegrationPage.text20')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{t('zidIntegrationPage.text21')}</span>
                    </li>
                  </ul>
                </div>

                <Button variant="outline" asChild>
                  <a href="https://docs.zid.sa/webhooks" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 ml-2" />
                    {t('zidIntegrationPage.text55')}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>{t('zidIntegrationPage.text22')}</CardTitle>
                <CardDescription>
                  {t('zidIntegrationPage.text39')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {syncLogs && syncLogs.length > 0 ? (
                  <div className="space-y-3">
                    {syncLogs.map((log: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          {log.status === 'success' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <p className="font-medium">{log.type}</p>
                            <p className="text-sm text-muted-foreground">{log.message}</p>
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString('ar-SA')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{t('zidIntegrationPage.text23')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        /* Connection Form */
        <Card>
          <CardHeader>
            <CardTitle>{t('zidIntegrationPage.text24')}</CardTitle>
            <CardDescription>
              {t('zidIntegrationPage.text40')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                للحصول على Access Token، اذهب إلى لوحة تحكم زد &gt; الإعدادات &gt; التكاملات &gt; API
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="storeUrl">{t('zidIntegrationPage.text25')}</Label>
                <Input
                  id="storeUrl"
                  placeholder="https://your-store.zid.store"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token</Label>
                <Input
                  id="accessToken"
                  type="password"
                  placeholder={t('zidIntegrationPage.text26')}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleConnect} disabled={isConnecting}>
                {isConnecting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                {t('zidIntegrationPage.text41')}
              </Button>
              <Button variant="outline" asChild>
                <a href="https://web.zid.sa/market/app-store" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 ml-2" />
                  {t('zidIntegrationPage.text42')}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
