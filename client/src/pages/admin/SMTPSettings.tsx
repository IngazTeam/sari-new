import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Mail, Send, CheckCircle, AlertCircle, Loader2, Key, ExternalLink, History, Clock } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function SMTPSettings() {
  const { t } = useTranslation();

  
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('noreply@sary.live');
  
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Get email logs
  const { data: emailLogs, isLoading: logsLoading, refetch: refetchLogs } = trpc.smtp.getEmailLogs.useQuery({ limit: 10 });
  
  // Get email stats
  const { data: emailStats } = trpc.smtp.getStats.useQuery();

  const updateSettingsMutation = trpc.smtp.updateSettings.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ إعدادات SMTP2GO API بنجاح');
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
      // Refresh logs
      setTimeout(() => refetchLogs(), 1000);
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
    if (!apiKey) {
      toast.error('يرجى إدخال API Key');
      return;
    }
    
    updateSettingsMutation.mutate({
      apiKey,
      from: fromEmail,
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
        <h1 className="text-3xl font-bold">إعدادات SMTP2GO API</h1>
        <p className="text-muted-foreground mt-2">
          قم بإعداد SMTP2GO API لإرسال رسائل البريد الإلكتروني التلقائية
        </p>
      </div>

      {/* معلومات SMTP2GO API */}
      <Alert>
        <Key className="h-4 w-4" />
        <AlertDescription>
          <strong>كيفية الحصول على SMTP2GO API Key:</strong>
          <ol className="list-decimal mr-6 mt-2 space-y-1">
            <li>سجل حساب مجاني في <a href="https://www.smtp2go.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">SMTP2GO <ExternalLink className="h-3 w-3" /></a></li>
            <li>من لوحة التحكم، اذهب إلى <strong>Settings → API Keys</strong></li>
            <li>اضغط على <strong>"Create API Key"</strong></li>
            <li>اختر الصلاحيات: <strong>Send Email</strong></li>
            <li>انسخ الـ API Key واحفظه في مكان آمن</li>
          </ol>
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        {/* بطاقة الإعدادات */}
        <Card>
          <CardHeader>
            <CardTitle>إعدادات API</CardTitle>
            <CardDescription>
              أدخل SMTP2GO API Key الخاص بك
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">SMTP2GO API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="api-xxxxxxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                يبدأ عادة بـ api-
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from">From Email</Label>
              <Input
                id="from"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="noreply@sary.live"
              />
              <p className="text-xs text-muted-foreground">
                البريد الذي سيظهر كمُرسِل
              </p>
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

            <Alert variant="default" className="mt-4">
              <AlertDescription className="text-xs">
                <strong>ملاحظة:</strong> بعد حفظ الإعدادات، يجب إضافة المتغيرات في <strong>Settings → Secrets</strong>:
                <ul className="list-disc mr-4 mt-1">
                  <li><code>SMTP2GO_API_KEY</code></li>
                  <li><code>SMTP_FROM</code></li>
                </ul>
                ثم إعادة تشغيل الخادم.
              </AlertDescription>
            </Alert>
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
                <li>• احفظ الإعدادات وأضفها في Secrets أولاً</li>
                <li>• أعد تشغيل الخادم بعد إضافة Secrets</li>
                <li>• تحقق من صندوق البريد المزعج (Spam)</li>
                <li>• الحد المجاني: 1,000 رسالة/شهر</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* بطاقة الاستخدامات */}
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

      {/* بطاقة الإحصائيات */}
      {emailStats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{emailStats.total}</div>
                <div className="text-sm text-muted-foreground mt-1">إجمالي الرسائل</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{emailStats.sent}</div>
                <div className="text-sm text-muted-foreground mt-1">تم إرسالها</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{emailStats.failed}</div>
                <div className="text-sm text-muted-foreground mt-1">فشلت</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{emailStats.pending}</div>
                <div className="text-sm text-muted-foreground mt-1">قيد الإرسال</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* سجل الرسائل المرسلة */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle>سجل الرسائل المرسلة</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
              تحديث
            </Button>
          </div>
          <CardDescription>آخر 10 رسائل بريد إلكتروني تم إرسالها</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : emailLogs && emailLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستلم</TableHead>
                    <TableHead>الموضوع</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.recipient}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{log.subject}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {log.email_type === 'test' ? 'اختبار' : 
                           log.email_type === 'notification' ? 'إشعار' :
                           log.email_type === 'invoice' ? 'فاتورة' :
                           log.email_type === 'report' ? 'تقرير' : log.email_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.status === 'sent' ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle className="h-3 w-3 ml-1" />
                            تم الإرسال
                          </Badge>
                        ) : log.status === 'failed' ? (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 ml-1" />
                            فشل
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock className="h-3 w-3 ml-1" />
                            قيد الإرسال
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('ar-SA', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد رسائل مرسلة بعد
            </div>
          )}
        </CardContent>
      </Card>

      {/* بطاقة المميزات */}
      <Card>
        <CardHeader>
          <CardTitle>✨ مميزات SMTP2GO API</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">سهولة الإعداد - API Key واحد فقط</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">لا حاجة لإعدادات DNS معقدة</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">1,000 رسالة مجاناً شهرياً</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">تتبع حالة الرسائل في الوقت الفعلي</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">دعم فني متاح 24/7</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">معدل توصيل عالي (99%+)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
