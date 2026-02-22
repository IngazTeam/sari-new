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
  Calendar, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ExternalLink, 
  AlertCircle,
  Clock,
  Users,
  Settings,
  History,
  Webhook,
  Link2,
  Bell
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function CalendlyIntegration() {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [sendReminders, setSendReminders] = useState(true);
  const [syncToWhatsApp, setSyncToWhatsApp] = useState(true);

  // Get merchant ID from localStorage
  const merchantId = parseInt(localStorage.getItem('merchantId') || '0');

  // Get connection status
  const { data: connection, isLoading, refetch } = trpc.calendly.getConnection.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  // Get upcoming events
  const { data: upcomingEvents } = trpc.calendly.getUpcomingEvents.useQuery(
    { merchantId, limit: 5 },
    { enabled: merchantId > 0 && connection?.connected }
  );

  // Get event types
  const { data: eventTypes } = trpc.calendly.getEventTypes.useQuery(
    { merchantId },
    { enabled: merchantId > 0 && connection?.connected }
  );

  // Get stats
  const { data: stats } = trpc.calendly.getStats.useQuery(
    { merchantId },
    { enabled: merchantId > 0 && connection?.connected }
  );

  // Mutations
  const connectMutation = trpc.calendly.connect.useMutation({
    onSuccess: (data) => {
      toast.success(t('calendlyIntegrationPage.text40'), {
        description: data.message,
      });
      setApiKey('');
      refetch();
    },
    onError: (error) => {
      toast.error(t('calendlyIntegrationPage.text41'), {
        description: error.message,
      });
    },
    onSettled: () => {
      setIsConnecting(false);
    },
  });

  const disconnectMutation = trpc.calendly.disconnect.useMutation({
    onSuccess: (data) => {
      toast.success(t('calendlyIntegrationPage.text42'), {
        description: data.message,
      });
      refetch();
    },
    onError: (error) => {
      toast.error(t('calendlyIntegrationPage.text43'), {
        description: error.message,
      });
    },
  });

  const syncMutation = trpc.calendly.syncNow.useMutation({
    onSuccess: (data) => {
      toast.success(t('calendlyIntegrationPage.text44'), {
        description: data.message,
      });
      refetch();
    },
    onError: (error) => {
      toast.error(t('calendlyIntegrationPage.text45'), {
        description: error.message,
      });
    },
  });

  const updateSettingsMutation = trpc.calendly.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(t('calendlyIntegrationPage.text0'));
    },
    onError: (error) => {
      toast.error(t('calendlyIntegrationPage.text46'), {
        description: error.message,
      });
    },
  });

  const handleConnect = () => {
    if (!apiKey) {
      toast.error(t('calendlyIntegrationPage.text47'), {
        description: t('calendlyIntegrationPage.text39'),
      });
      return;
    }

    setIsConnecting(true);
    connectMutation.mutate({
      merchantId,
      apiKey,
    });
  };

  const handleDisconnect = () => {
    if (confirm(t('calendlyIntegrationPage.text48'))) {
      disconnectMutation.mutate({ merchantId });
    }
  };

  const handleSync = () => {
    syncMutation.mutate({ merchantId });
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      merchantId,
      autoConfirm,
      sendReminders,
      syncToWhatsApp,
    });
  };

  // Load settings when connection data is available
  useEffect(() => {
    if (connection?.settings) {
      setAutoConfirm(connection.settings.autoConfirm ?? true);
      setSendReminders(connection.settings.sendReminders ?? true);
      setSyncToWhatsApp(connection.settings.syncToWhatsApp ?? true);
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
        <h1 className="text-3xl font-bold mb-2">{t('calendlyIntegrationPage.text1')}</h1>
        <p className="text-muted-foreground">
          {t('calendlyIntegrationPage.text49')}
        </p>
      </div>

      {/* Connection Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>{t('calendlyIntegrationPage.text2')}</CardTitle>
                <CardDescription>
                  {connection?.connected ? connection.userName : t('calendlyIntegrationPage.text26')}
                </CardDescription>
              </div>
            </div>
            <Badge variant={connection?.connected ? 'default' : 'secondary'}>
              {connection?.connected ? (
                <><CheckCircle2 className="h-4 w-4 ml-1" />{t('calendlyIntegrationPage.text3')}</>
              ) : (
                <><XCircle className="h-4 w-4 ml-1" />{t('calendlyIntegrationPage.text4')}</>
              )}
            </Badge>
          </div>
        </CardHeader>
        {connection?.connected && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <Calendar className="h-5 w-5 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold">{stats?.totalEvents || 0}</div>
                <div className="text-sm text-muted-foreground">{t('calendlyIntegrationPage.text5')}</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <Clock className="h-5 w-5 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold">{stats?.upcomingEvents || 0}</div>
                <div className="text-sm text-muted-foreground">{t('calendlyIntegrationPage.text6')}</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <Users className="h-5 w-5 mx-auto mb-2 text-orange-500" />
                <div className="text-2xl font-bold">{stats?.eventTypes || 0}</div>
                <div className="text-sm text-muted-foreground">{t('calendlyIntegrationPage.text7')}</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <Bell className="h-5 w-5 mx-auto mb-2 text-purple-500" />
                <div className="text-2xl font-bold">{stats?.remindersSent || 0}</div>
                <div className="text-sm text-muted-foreground">{t('calendlyIntegrationPage.text8')}</div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Main Content */}
      {connection?.connected ? (
        <Tabs defaultValue="events" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="events">
              <Calendar className="h-4 w-4 ml-2" />
              {t('calendlyIntegrationPage.text27')}
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 ml-2" />
              {t('calendlyIntegrationPage.text28')}
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Webhook className="h-4 w-4 ml-2" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="links">
              <Link2 className="h-4 w-4 ml-2" />
              {t('calendlyIntegrationPage.text29')}
            </TabsTrigger>
          </TabsList>

          {/* Events Tab */}
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>{t('calendlyIntegrationPage.text9')}</CardTitle>
                <CardDescription>
                  {t('calendlyIntegrationPage.text50')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {upcomingEvents && upcomingEvents.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingEvents.map((event: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                            <Calendar className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{event.name}</p>
                            <p className="text-sm text-muted-foreground">{event.inviteeName}</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="font-medium">{new Date(event.startTime).toLocaleDateString('ar-SA')}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(event.startTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{t('calendlyIntegrationPage.text10')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>{t('calendlyIntegrationPage.text11')}</CardTitle>
                <CardDescription>
                  {t('calendlyIntegrationPage.text51')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">{t('calendlyIntegrationPage.text12')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('calendlyIntegrationPage.text30')}
                    </p>
                  </div>
                  <Switch checked={autoConfirm} onCheckedChange={setAutoConfirm} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">{t('calendlyIntegrationPage.text13')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('calendlyIntegrationPage.text31')}
                    </p>
                  </div>
                  <Switch checked={sendReminders} onCheckedChange={setSendReminders} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">{t('calendlyIntegrationPage.text14')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('calendlyIntegrationPage.text32')}
                    </p>
                  </div>
                  <Switch checked={syncToWhatsApp} onCheckedChange={setSyncToWhatsApp} />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button onClick={handleSaveSettings} disabled={updateSettingsMutation.isPending}>
                    {updateSettingsMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                    {t('calendlyIntegrationPage.text33')}
                  </Button>
                  <Button variant="outline" onClick={handleSync} disabled={syncMutation.isPending}>
                    {syncMutation.isPending ? (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 ml-2" />
                    )}
                    {t('calendlyIntegrationPage.text34')}
                  </Button>
                  <Button variant="destructive" onClick={handleDisconnect}>
                    {t('calendlyIntegrationPage.text35')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks">
            <Card>
              <CardHeader>
                <CardTitle>{t('calendlyIntegrationPage.text15')}</CardTitle>
                <CardDescription>
                  {t('calendlyIntegrationPage.text52')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Webhook className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">{t('calendlyIntegrationPage.text16')}</p>
                      <code className="block p-2 bg-muted rounded text-sm break-all">
                        {window.location.origin}/api/webhooks/calendly/{merchantId}
                      </code>
                      <p className="text-sm text-muted-foreground mt-2">
                        {t('calendlyIntegrationPage.text53')}
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <h4 className="font-medium">{t('calendlyIntegrationPage.text17')}</h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{t('calendlyIntegrationPage.text18')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{t('calendlyIntegrationPage.text19')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{t('calendlyIntegrationPage.text20')}</span>
                    </li>
                  </ul>
                </div>

                <Button variant="outline" asChild>
                  <a href="https://developer.calendly.com/api-docs/ZG9jOjQ2NTA5-webhooks" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 ml-2" />
                    {t('calendlyIntegrationPage.text54')}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Booking Links Tab */}
          <TabsContent value="links">
            <Card>
              <CardHeader>
                <CardTitle>{t('calendlyIntegrationPage.text21')}</CardTitle>
                <CardDescription>
                  {t('calendlyIntegrationPage.text36')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {eventTypes && eventTypes.length > 0 ? (
                  <div className="space-y-3">
                    {eventTypes.map((eventType: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                            <Link2 className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{eventType.name}</p>
                            <p className="text-sm text-muted-foreground">{eventType.duration} دقيقة</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <a href={eventType.schedulingUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 ml-2" />
                            {t('calendlyIntegrationPage.text37')}
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Link2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{t('calendlyIntegrationPage.text23')}</p>
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
            <CardTitle>{t('calendlyIntegrationPage.text24')}</CardTitle>
            <CardDescription>
              {t('calendlyIntegrationPage.text55')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                للحصول على API Key، اذهب إلى Calendly &gt; Integrations &gt; API & Webhooks &gt; Personal Access Token
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">Personal Access Token</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={t('calendlyIntegrationPage.text25')}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleConnect} disabled={isConnecting}>
                {isConnecting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                {t('calendlyIntegrationPage.text38')}
              </Button>
              <Button variant="outline" asChild>
                <a href="https://calendly.com/integrations/api_webhooks" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 ml-2" />
                  {t('calendlyIntegrationPage.text56')}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
