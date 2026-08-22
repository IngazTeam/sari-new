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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

type SensitiveZidAction = 'connect' | 'disconnect' | 'rotate';

export default function ZidIntegration() {
  const { t } = useTranslation();
  const [autoSync, setAutoSync] = useState(true);
  const [syncProducts, setSyncProducts] = useState(true);
  const [syncOrders, setSyncOrders] = useState(true);
  const [syncCustomers, setSyncCustomers] = useState(true);
  const [sensitiveAction, setSensitiveAction] = useState<SensitiveZidAction | null>(null);
  const [reauthPassword, setReauthPassword] = useState('');
  const [webhookCredentials, setWebhookCredentials] = useState<{
    endpointPath: string;
    username: string;
    password: string;
  } | null>(null);

  // Get connection status
  const { data: connection, isLoading, refetch } = trpc.zid.getConnection.useQuery(
    undefined,
  );

  // Get sync logs
  const { data: syncLogs } = trpc.zid.getSyncLogs.useQuery(
    { limit: 10 },
    // @ts-ignore
    { enabled: connection?.connected }
  );

  // Get sync stats
  const { data: syncStats } = trpc.zid.getSyncStats.useQuery(
    undefined,
    // @ts-ignore
    { enabled: connection?.connected }
  );

  // Mutations
  const beginOAuthMutation = trpc.zid.beginOAuth.useMutation({
    onSuccess: ({ authorizationUrl }) => {
      window.location.assign(authorizationUrl);
    },
    onError: () => {
      setReauthPassword('');
      toast.error(t('zidIntegrationPage.text45'), {
        description: 'تعذر تأكيد الهوية أو بدء الربط. أعد تسجيل الدخول أو أدخل كلمة المرور الصحيحة.',
      });
    },
  });

  const disconnectMutation = trpc.zid.disconnect.useMutation({
    onSuccess: (data: any) => {
      toast.success(t('zidIntegrationPage.text46'), {
        description: data.message,
      });
      closeSensitiveAction();
      refetch();
    },
    onError: () => {
      setReauthPassword('');
      toast.error(t('zidIntegrationPage.text47'), {
        description: 'تعذر تأكيد الهوية أو فصل التكامل. حاول مرة أخرى.',
      });
    },
  });

  const syncMutation = trpc.zid.syncNow.useMutation({
    onSuccess: (data: any) => {
      toast.success(t('zidIntegrationPage.text48'), {
        description: data.message,
      });
      refetch();
    },
    onError: () => {
      toast.error(t('zidIntegrationPage.text49'), {
        description: 'تعذر إكمال المزامنة. حاول مرة أخرى أو أعد ربط زد.',
      });
    },
  });

  const updateSettingsMutation = trpc.zid.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(t('zidIntegrationPage.text0'));
    },
    onError: () => {
      toast.error(t('zidIntegrationPage.text50'), {
        description: 'تعذر حفظ إعدادات المزامنة.',
      });
    },
  });

  const rotateWebhookMutation = trpc.zid.rotateWebhookCredentials.useMutation({
    onSuccess: (credentials) => {
      setWebhookCredentials(credentials);
      closeSensitiveAction();
      refetch();
      toast.success('تم إنشاء بيانات Webhook', {
        description: 'انسخ كلمة المرور الآن؛ لن نعرضها مرة أخرى.',
      });
    },
    onError: () => {
      setReauthPassword('');
      toast.error('تعذر إنشاء بيانات Webhook', {
        description: 'تعذر تأكيد الهوية أو تدوير البيانات. حاول مرة أخرى.',
      });
    },
  });

  const closeSensitiveAction = () => {
    setSensitiveAction(null);
    setReauthPassword('');
  };

  const submitSensitiveAction = () => {
    const credentials = reauthPassword ? { password: reauthPassword } : {};
    if (sensitiveAction === 'connect') beginOAuthMutation.mutate(credentials);
    if (sensitiveAction === 'disconnect') {
      setWebhookCredentials(null);
      disconnectMutation.mutate(credentials);
    }
    if (sensitiveAction === 'rotate') rotateWebhookMutation.mutate(credentials);
  };

  const sensitiveActionPending = beginOAuthMutation.isPending
    || disconnectMutation.isPending
    || rotateWebhookMutation.isPending;

  const handleSync = () => {
    syncMutation.mutate({ resource: 'all' });
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
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
                  <Button variant="destructive" onClick={() => setSensitiveAction('disconnect')}>
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
                      {(webhookCredentials || connection.webhookEndpointPath) ? (
                        <>
                          <code className="block p-2 bg-muted rounded text-sm break-all" dir="ltr">
                            {window.location.origin}{webhookCredentials?.endpointPath || connection.webhookEndpointPath}
                          </code>
                          {webhookCredentials ? (
                            <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                              <div className="flex items-center gap-2 font-medium">
                                <AlertCircle className="h-4 w-4" />
                                تُعرض كلمة المرور مرة واحدة فقط
                              </div>
                              <div>نوع التحقق: <code dir="ltr">Basic Auth</code></div>
                              <div>اسم المستخدم: <code dir="ltr">{webhookCredentials.username}</code></div>
                              <div>كلمة المرور: <code className="break-all" dir="ltr">{webhookCredentials.password}</code></div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              التحقق مضبوط مسبقًا. دوّر البيانات فقط إذا فقدتها أو اشتبهت بتسريبها.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          أنشئ رابطًا وبيانات Basic Auth ثم أضفها في إعدادات Webhooks في زد.
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSensitiveAction('rotate')}
                        disabled={rotateWebhookMutation.isPending}
                      >
                        {rotateWebhookMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                        {connection.webhookEndpointPath ? 'تدوير بيانات Webhook' : 'إنشاء بيانات Webhook'}
                      </Button>
                      <p className="text-sm text-muted-foreground mt-2">{t('zidIntegrationPage.text54')}</p>
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
                          {log.status === 'completed' ? (
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
        /* Server-owned OAuth connection */
        <Card>
          <CardHeader>
            <CardTitle>{t('zidIntegrationPage.text24')}</CardTitle>
            <CardDescription>
              اربط متجرك من صفحة زد الرسمية دون نسخ أو حفظ رموز الوصول في المتصفح.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                سيُنقلك ساري إلى زد للموافقة، ثم يعيدك تلقائيًا بعد اكتمال الربط الآمن.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button
                onClick={() => setSensitiveAction('connect')}
                disabled={beginOAuthMutation.isPending}
              >
                {beginOAuthMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                الربط الآمن مع زد
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

      <AlertDialog
        open={sensitiveAction !== null}
        onOpenChange={(open) => { if (!open) closeSensitiveAction(); }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الهوية قبل الإجراء</AlertDialogTitle>
            <AlertDialogDescription>
              {sensitiveAction === 'connect' && 'ستبدأ عملية ربط متجر زد ومنح الصلاحيات.'}
              {sensitiveAction === 'disconnect' && 'سيُحذف اتصال زد واعتماداته من ساري.'}
              {sensitiveAction === 'rotate' && 'ستُبطل كلمة مرور Webhook الحالية فورًا.'}
              {' '}إذا مر أكثر من خمس دقائق على تسجيل الدخول، أدخل كلمة مرور حسابك.
              وللحساب دون كلمة مرور، أعد تسجيل الدخول ثم نفذ الإجراء خلال خمس دقائق.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="zidReauthPassword">كلمة المرور الحالية</Label>
            <Input
              id="zidReauthPassword"
              type="password"
              autoComplete="current-password"
              value={reauthPassword}
              onChange={(event) => setReauthPassword(event.target.value)}
              maxLength={128}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sensitiveActionPending}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className={sensitiveAction === 'disconnect' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
              disabled={sensitiveActionPending || (reauthPassword.length > 0 && reauthPassword.length < 8)}
              onClick={(event) => {
                event.preventDefault();
                submitSensitiveAction();
              }}
            >
              {sensitiveActionPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              تأكيد وتنفيذ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
