import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, CheckCircle2, AlertCircle, ExternalLink, Unlink } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

export default function CalendarSettings() {
  const { t } = useTranslation();
  const [isConnecting, setIsConnecting] = useState(false);
  
  const { data: status, isLoading, refetch } = trpc.calendar.getStatus.useQuery();
  const disconnectMutation = trpc.calendar.disconnect.useMutation({
    onSuccess: () => {
      toast.success(t('calendarSettingsPage.text0'));
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل فصل الاتصال: ${error.message}`);
    }
  });

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const result = await trpc.calendar.getAuthUrl.query();
      
      // فتح نافذة OAuth في نافذة جديدة
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const authWindow = window.open(
        result.authUrl,
        'GoogleCalendarAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // مراقبة إغلاق النافذة
      const checkWindow = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkWindow);
          setIsConnecting(false);
          // تحديث الحالة بعد إغلاق النافذة
          setTimeout(() => refetch(), 1000);
        }
      }, 500);
    } catch (error: any) {
      toast.error(`فشل الاتصال: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (confirm("هل أنت متأكد من فصل Google Calendar؟ سيتم إلغاء جميع المواعيد المستقبلية.")) {
      disconnectMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('calendarSettingsPage.text1')}</h1>
        <p className="text-muted-foreground">{t('calendarSettings.auto_0')}</p>
      </div>

      {/* حالة الاتصال */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />{t('calendarSettings.auto_1')}</CardTitle>
              <CardDescription>
                {status?.connected 
                  ? "متصل بـ Google Calendar" 
                  : "غير متصل - قم بربط حسابك للبدء"}
              </CardDescription>
            </div>
            {status?.connected ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="h-4 w-4 mr-1" />{t('calendarSettings.auto_2')}</Badge>
            ) : (
              <Badge variant="secondary">
                <AlertCircle className="h-4 w-4 mr-1" />{t('calendarSettings.auto_3')}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {status?.connected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">{t('calendarSettingsPage.text2')}</p>
                  <p className="font-medium">{status.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">{t('calendarSettingsPage.text3')}</p>
                  <p className="font-medium">
                    {new Date(status.connectedAt!).toLocaleDateString('ar-SA')}
                  </p>
                </div>
              </div>
              
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{t('calendarSettings.auto_4')}</AlertDescription>
              </Alert>

              <Button 
                variant="destructive" 
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('calendarSettings.auto_5')}</>
                ) : (
                  <>
                    <Unlink className="h-4 w-4 mr-2" />{t('calendarSettings.auto_6')}</>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{t('calendarSettings.auto_7')}<ul className="list-disc list-inside mt-2 mr-4">
                    <li>{t('calendarSettingsPage.text4')}</li>
                    <li>{t('calendarSettingsPage.text5')}</li>
                    <li>{t('calendarSettingsPage.text6')}</li>
                    <li>{t('calendarSettingsPage.text7')}</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Button 
                onClick={handleConnect} 
                disabled={isConnecting}
                size="lg"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('calendarSettings.auto_8')}</>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />{t('calendarSettings.auto_9')}</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* إعدادات التذكيرات */}
      {status?.connected && (
        <Card>
          <CardHeader>
            <CardTitle>{t('calendarSettingsPage.text8')}</CardTitle>
            <CardDescription>{t('calendarSettings.auto_10')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{t('calendarSettingsPage.text9')}</p>
                  <p className="text-sm text-muted-foreground">{t('calendarSettings.auto_11')}</p>
                </div>
                <Badge variant="outline" className="bg-green-50">{t('calendarSettingsPage.text10')}</Badge>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{t('calendarSettingsPage.text11')}</p>
                  <p className="text-sm text-muted-foreground">{t('calendarSettings.auto_12')}</p>
                </div>
                <Badge variant="outline" className="bg-green-50">{t('calendarSettingsPage.text12')}</Badge>
              </div>

              <Alert>
                <AlertDescription className="text-sm">{t('calendarSettings.auto_13')}</AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
