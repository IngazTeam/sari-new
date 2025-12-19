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

export default function GoogleOAuthSettings() {
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
      toast.error('يرجى إدخال Client ID و Client Secret');
      return;
    }

    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        isEnabled,
      });

      toast.success('تم تحديث إعدادات Google OAuth بنجاح');
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
        <h1 className="text-3xl font-bold">إعدادات Google OAuth</h1>
        <p className="text-muted-foreground mt-2">
          إدارة بيانات اعتماد Google OAuth للتكامل مع Google Sheets و Google Calendar
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            حالة التكامل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">تفعيل Google OAuth</p>
              <p className="text-sm text-muted-foreground">
                السماح للتجار بربط حساباتهم مع Google
              </p>
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
              <AlertDescription>
                تم تكوين Google OAuth. يمكن للتجار الآن ربط حساباتهم.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                لم يتم تكوين Google OAuth بعد. يرجى إدخال البيانات أدناه.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>بيانات الاعتماد</CardTitle>
          <CardDescription>
            أدخل Client ID و Client Secret من Google Cloud Console
          </CardDescription>
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
                  toast.success('تم نسخ Redirect URI');
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
            <p className="text-xs text-muted-foreground">
              استخدم هذا الرابط في Google Cloud Console كـ Authorized redirect URI
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving || !clientId.trim() || !clientSecret.trim()}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 ml-2" />
                حفظ الإعدادات
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Setup Guide Card */}
      <Card>
        <CardHeader>
          <CardTitle>دليل الإعداد</CardTitle>
          <CardDescription>
            خطوات الحصول على بيانات الاعتماد من Google Cloud Console
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 text-sm">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                1
              </div>
              <div>
                <p className="font-medium">إنشاء مشروع في Google Cloud Console</p>
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
                <p className="font-medium">تفعيل APIs المطلوبة</p>
                <p className="text-muted-foreground">
                  فعّل Google Sheets API و Google Calendar API من قسم "APIs & Services"
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                3
              </div>
              <div>
                <p className="font-medium">إنشاء OAuth Client ID</p>
                <p className="text-muted-foreground">
                  اذهب إلى "Credentials" → "Create Credentials" → "OAuth client ID"
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                4
              </div>
              <div>
                <p className="font-medium">تكوين OAuth consent screen</p>
                <p className="text-muted-foreground">
                  اختر "External" وأضف النطاقات (Scopes) التالية:
                </p>
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
                <p className="font-medium">إضافة Redirect URI</p>
                <p className="text-muted-foreground">
                  انسخ Redirect URI أعلاه وأضفه في "Authorized redirect URIs"
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                6
              </div>
              <div>
                <p className="font-medium">نسخ البيانات</p>
                <p className="text-muted-foreground">
                  انسخ Client ID و Client Secret وألصقهما في الحقول أعلاه
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
