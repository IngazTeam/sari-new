import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Key, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function GoogleOAuthSettings() {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current settings
  const { data, isLoading, refetch } = trpc.googleOAuthSettings.get.useQuery();
  const updateMutation = trpc.googleOAuthSettings.update.useMutation();
  const toggleMutation = trpc.googleOAuthSettings.toggleEnabled.useMutation();

  useEffect(() => {
    if (data?.settings) {
      setClientId(data.settings.clientId || '');
      setClientSecret(data.settings.clientSecret || '');
      setIsEnabled(data.settings.isEnabled === 1);
    }
  }, [data]);

  const handleSave = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error(t('adminGoogleOAuthSettingsPage.text10'));
      return;
    }

    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        isEnabled,
      });

      toast.success(t('adminGoogleOAuthSettingsPage.text11'));
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({ isEnabled: enabled });
      setIsEnabled(enabled);
      
      toast.success(enabled 
        ? 'تم تفعيل Google OAuth بنجاح' 
        : 'تم تعطيل Google OAuth بنجاح');

      refetch();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const redirectUri = `${window.location.origin}/api/auth/google/callback`;

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('adminGoogleOAuthSettingsPage.text0')}</h1>
        <p className="text-muted-foreground mt-2">{t('googleOAuthSettings.auto_0')}</p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />{t('googleOAuthSettings.auto_1')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('adminGoogleOAuthSettingsPage.text1')}</p>
              <p className="text-sm text-muted-foreground">{t('googleOAuthSettings.auto_2')}</p>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggleEnabled}
              disabled={!data?.settings || toggleMutation.isPending}
            />
          </div>

          {data?.settings ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{t('googleOAuthSettings.auto_3')}</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t('googleOAuthSettings.auto_4')}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminGoogleOAuthSettingsPage.text2')}</CardTitle>
          <CardDescription>{t('googleOAuthSettings.auto_5')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="123456789-abcdefg.apps.googleusercontent.com"
              dir="ltr"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientSecret">Client Secret</Label>
            <Input
              id="clientSecret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="GOCSPX-***************"
              dir="ltr"
            />
          </div>

          <div className="space-y-2">
            <Label>Redirect URI</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={redirectUri}
                readOnly
                dir="ltr"
                className="bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(redirectUri);
                  toast.success(t('adminGoogleOAuthSettingsPage.text12'));
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('googleOAuthSettings.auto_6')}</p>
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving || !clientId.trim() || !clientSecret.trim()}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />{t('googleOAuthSettings.auto_7')}</>
            ) : (
              <>
                <Save className="w-4 h-4 ml-2" />{t('googleOAuthSettings.auto_8')}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Setup Guide Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminGoogleOAuthSettingsPage.text3')}</CardTitle>
          <CardDescription>{t('googleOAuthSettings.auto_9')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 text-sm">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                1
              </div>
              <div>
                <p className="font-medium">{t('adminGoogleOAuthSettingsPage.text4')}</p>
                <p className="text-muted-foreground">
                  اذهب إلى{' '}
                  <a
                    href="https://console.cloud.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Google Cloud Console
                    <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  وأنشئ مشروع جديد
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                2
              </div>
              <div>
                <p className="font-medium">{t('adminGoogleOAuthSettingsPage.text5')}</p>
                <p className="text-muted-foreground">{t('googleOAuthSettings.auto_10')}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                3
              </div>
              <div>
                <p className="font-medium">{t('adminGoogleOAuthSettingsPage.text6')}</p>
                <p className="text-muted-foreground">{t('googleOAuthSettings.auto_11')}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                4
              </div>
              <div>
                <p className="font-medium">{t('adminGoogleOAuthSettingsPage.text7')}</p>
                <p className="text-muted-foreground">{t('googleOAuthSettings.auto_12')}</p>
                <ul className="list-disc list-inside text-muted-foreground mr-4 mt-1">
                  <li dir="ltr">https://www.googleapis.com/auth/spreadsheets</li>
                  <li dir="ltr">https://www.googleapis.com/auth/calendar</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                5
              </div>
              <div>
                <p className="font-medium">{t('adminGoogleOAuthSettingsPage.text8')}</p>
                <p className="text-muted-foreground">{t('googleOAuthSettings.auto_13')}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                6
              </div>
              <div>
                <p className="font-medium">{t('adminGoogleOAuthSettingsPage.text9')}</p>
                <p className="text-muted-foreground">{t('googleOAuthSettings.auto_14')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
