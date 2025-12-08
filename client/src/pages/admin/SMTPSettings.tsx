import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Mail, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function SMTPSettings() {
  const { t } = useTranslation();

  
  const [smtpSettings, setSmtpSettings] = useState({
    host: 'mail.smtp2go.com',
    port: '2525',
    user: '',
    pass: '',
    from: 'noreply@sary.live',
  });
  
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const updateSettingsMutation = trpc.smtp.updateSettings.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ إعدادات SMTP بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const testEmailMutation = trpc.smtp.sendTestEmail.useMutation({
    onSuccess: () => {
      setTestResult({
        success: true,
        message: 'تم إرسال البريد التجريبي بنجاح! تحقق من صندوق الوارد.',
      });
      toast.success('تم إرسال البريد التجريبي بنجاح');
    },
    onError: (error: any) => {
      setTestResult({
        success: false,
        message: `فشل الإرسال: ${error.message}`,
      });
      toast.error(error.message);
    },
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      host: smtpSettings.host,
      port: parseInt(smtpSettings.port),
      user: smtpSettings.user,
      pass: smtpSettings.pass,
      from: smtpSettings.from,
    });
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error('يرجى إدخال عنوان بريد إلكتروني');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    
    try {
      await testEmailMutation.mutateAsync({ to: testEmail });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إعدادات SMTP</h1>
        <p className="text-muted-foreground mt-2">
          قم بإعداد خدمة SMTP2GO لإرسال رسائل البريد الإلكتروني التلقائية
        </p>
      </div>

      {/* معلومات SMTP2GO */}
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          <strong>كيفية الحصول على بيانات SMTP2GO:</strong>
          <ol className="list-decimal mr-6 mt-2 space-y-1">
            <li>سجل حساب مجاني في <a href="https://www.smtp2go.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">SMTP2GO</a></li>
            <li>من لوحة التحكم، اذهب إلى Settings → Users</li>
            <li>أنشئ مستخدم SMTP جديد واحصل على Username و Password</li>
            <li>استخدم الإعدادات التالية:
              <ul className="list-disc mr-6 mt-1">
                <li>Host: mail.smtp2go.com</li>
                <li>Port: 2525 (أو 80، 8025، 587)</li>
              </ul>
            </li>
          </ol>
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        {/* بطاقة الإعدادات */}
        <Card>
          <CardHeader>
            <CardTitle>إعدادات SMTP</CardTitle>
            <CardDescription>
              أدخل بيانات SMTP2GO الخاصة بك
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="host">SMTP Host</Label>
              <Input
                id="host"
                value={smtpSettings.host}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                placeholder="mail.smtp2go.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="port">SMTP Port</Label>
              <Input
                id="port"
                value={smtpSettings.port}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, port: e.target.value })}
                placeholder="2525"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user">SMTP Username</Label>
              <Input
                id="user"
                value={smtpSettings.user}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, user: e.target.value })}
                placeholder="your-smtp-username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pass">SMTP Password</Label>
              <Input
                id="pass"
                type="password"
                value={smtpSettings.pass}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, pass: e.target.value })}
                placeholder="your-smtp-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="from">From Email</Label>
              <Input
                id="from"
                value={smtpSettings.from}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, from: e.target.value })}
                placeholder="noreply@sary.live"
              />
            </div>

            <Button 
              onClick={handleSaveSettings} 
              className="w-full"
              disabled={updateSettingsMutation.isPending}
            >
              {updateSettingsMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                'حفظ الإعدادات'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* بطاقة الاختبار */}
        <Card>
          <CardHeader>
            <CardTitle>اختبار الإرسال</CardTitle>
            <CardDescription>
              أرسل بريداً تجريبياً للتحقق من الإعدادات
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="testEmail">البريد الإلكتروني للاختبار</Label>
              <Input
                id="testEmail"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
              />
            </div>

            <Button 
              onClick={handleTestEmail} 
              className="w-full"
              disabled={isTesting || !testEmail}
            >
              {isTesting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="ml-2 h-4 w-4" />
                  إرسال بريد تجريبي
                </>
              )}
            </Button>

            {testResult && (
              <Alert variant={testResult.success ? 'default' : 'destructive'}>
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>{testResult.message}</AlertDescription>
              </Alert>
            )}

            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-2">ملاحظات هامة:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• احفظ الإعدادات أولاً قبل الاختبار</li>
                <li>• تحقق من صندوق البريد المزعج (Spam)</li>
                <li>• الحد المجاني: 1,000 رسالة/شهر</li>
                <li>• يستخدم للفواتير والتقارير الأسبوعية</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* بطاقة الاستخدام */}
      <Card>
        <CardHeader>
          <CardTitle>استخدامات البريد الإلكتروني في النظام</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start space-x-3 space-x-reverse">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold">الفواتير</h4>
                <p className="text-sm text-muted-foreground">
                  إرسال الفواتير تلقائياً بعد كل عملية دفع ناجحة
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 space-x-reverse">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold">التقارير الأسبوعية</h4>
                <p className="text-sm text-muted-foreground">
                  إرسال تقارير المشاعر والإحصائيات كل أحد صباحاً
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 space-x-reverse">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold">الإشعارات</h4>
                <p className="text-sm text-muted-foreground">
                  إشعارات الاشتراكات والتحديثات الهامة
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
