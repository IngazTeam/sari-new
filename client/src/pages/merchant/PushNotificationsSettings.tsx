import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Bell, BellOff, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';

export default function PushNotificationsSettings() {
  const { t } = useTranslation();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  const { data: vapidKey } = trpc.push.getVapidPublicKey.useQuery();
  const subscribe = trpc.push.subscribe.useMutation();
  const unsubscribe = trpc.push.unsubscribe.useMutation();
  const sendTest = trpc.push.sendTest.useMutation();
  const { data: stats } = trpc.push.getStats.useQuery();
  const { data: logs } = trpc.push.getLogs.useQuery({ limit: 20 });

  useEffect(() => {
    // Check if push notifications are supported
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      
      // Check if already subscribed
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((subscription) => {
          setIsSubscribed(!!subscription);
        });
      });
    }
  }, []);

  const handleSubscribe = async () => {
    if (!isSupported) {
      toast.error(t('pushNotificationsSettingsPage.text0'));
      return;
    }

    if (!vapidKey) {
      toast.error(t('pushNotificationsSettingsPage.text1'));
      return;
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission !== "granted") {
        toast.error(t('pushNotificationsSettingsPage.text2'));
        return;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey),
      });

      const subscriptionJson = subscription.toJSON();

      // Send subscription to server
      await subscribe.mutateAsync({
        endpoint: subscription.endpoint,
        p256dh: subscriptionJson.keys?.p256dh || "",
        auth: subscriptionJson.keys?.auth || "",
        userAgent: navigator.userAgent,
      });

      setIsSubscribed(true);
      toast.success(t('pushNotificationsSettingsPage.text3'));
    } catch (error) {
      console.error("Failed to subscribe:", error);
      toast.error(t('pushNotificationsSettingsPage.text4'));
    }
  };

  const handleUnsubscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await unsubscribe.mutateAsync({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
        setIsSubscribed(false);
        toast.success(t('pushNotificationsSettingsPage.text5'));
      }
    } catch (error) {
      console.error("Failed to unsubscribe:", error);
      toast.error(t('pushNotificationsSettingsPage.text6'));
    }
  };

  const handleSendTest = async () => {
    try {
      const result = await sendTest.mutateAsync();
      if (result.success > 0) {
        toast.success(t('pushNotificationsSettingsPage.text7'));
      } else {
        toast.error(t('pushNotificationsSettingsPage.text9'));
      }
    } catch (error) {
      toast.error(t('pushNotificationsSettingsPage.text10'));
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">{t('pushNotificationsSettingsPage.text11')}</h1>
          <p className="text-muted-foreground">{t('pushNotificationsSettingsPage.text12')}</p>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('pushNotificationsSettingsPage.text13')}</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalNotifications}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('pushNotificationsSettingsPage.text14')}</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.sentNotifications}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('pushNotificationsSettingsPage.text15')}</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.failedNotifications}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('pushNotificationsSettingsPage.text16')}</CardTitle>
              <Loader2 className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pendingNotifications}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subscription Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('pushNotificationsSettingsPage.text17')}</CardTitle>
          <CardDescription>
            {isSupported
              ? t('pushNotificationsSettingsPage.text27') : t('pushNotificationsSettingsPage.text28')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-medium">{t('pushNotificationsSettingsPage.text18')}</p>
              <div className="flex items-center gap-2">
                {isSubscribed ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600">{t('pushNotificationsSettingsPage.text19')}</span>
                  </>
                ) : (
                  <>
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{t('pushNotificationsSettingsPage.text20')}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {isSubscribed ? (
                <>
                  <Button
                    onClick={handleSendTest}
                    disabled={sendTest.isPending}
                    variant="outline"
                  >
                    {sendTest.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('pushNotificationsSettingsPage.text35')}
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        {t('pushNotificationsSettingsPage.text36')}
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleUnsubscribe}
                    disabled={unsubscribe.isPending}
                    variant="destructive"
                  >
                    {unsubscribe.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('pushNotificationsSettingsPage.text37')}
                      </>
                    ) : (
                      <>
                        <BellOff className="mr-2 h-4 w-4" />
                        {t('pushNotificationsSettingsPage.text38')}
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleSubscribe}
                  disabled={!isSupported || subscribe.isPending}
                >
                  {subscribe.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('pushNotificationsSettingsPage.text39')}
                    </>
                  ) : (
                    <>
                      <Bell className="mr-2 h-4 w-4" />
                      {t('pushNotificationsSettingsPage.text40')}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="font-medium mb-2">{t('pushNotificationsSettingsPage.text21')}</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• دعم Service Worker: {isSupported ? t('pushNotificationsSettingsPage.text29') : t('pushNotificationsSettingsPage.text30')}</li>
              <li>
                {t('pushNotificationsSettingsPage.text41', { var0: " " })}
                {permission === "granted"
                  ? t('pushNotificationsSettingsPage.text42')
                  : permission === "denied"
                  ? t('pushNotificationsSettingsPage.text31') : t('pushNotificationsSettingsPage.text32')}
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Logs Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('pushNotificationsSettingsPage.text23')}</CardTitle>
          <CardDescription>{t('pushNotificationsSettingsPage.text24')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {logs && logs.length > 0 ? (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{log.title}</span>
                      <Badge
                        variant={
                          log.status === "sent"
                            ? "default"
                            : log.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {log.status === "sent" ? "تم الإرسال" : log.status === "failed" ? t('pushNotificationsSettingsPage.text33') : t('pushNotificationsSettingsPage.text34')}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {log.body} • {new Date(log.createdAt).toLocaleString("ar-SA")}
                    </div>
                    {log.error && (
                      <div className="text-sm text-red-600 mt-1">خطأ: {log.error}</div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>{t('pushNotificationsSettingsPage.text26')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
