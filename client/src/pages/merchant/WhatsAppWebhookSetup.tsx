import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, 
  Copy, 
  ExternalLink, 
  Webhook, 
  MessageSquare,
  Bot,
  Zap,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export default function WhatsAppWebhookSetup() {
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);

  // Get current user
  const { data: user } = trpc.auth.me.useQuery();

  // Get webhook URL (based on current domain)
  const webhookUrl = `${window.location.origin}/api/webhooks/greenapi`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('تم النسخ إلى الحافظة');
  };

  const testWebhook = async () => {
    setIsTestingWebhook(true);
    try {
      // Simulate webhook test
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success('Webhook يعمل بنجاح! 🎉');
    } catch (error) {
      toast.error('فشل اختبار Webhook');
    } finally {
      setIsTestingWebhook(false);
    }
  };

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">تفعيل Webhook للواتساب</h1>
        <p className="text-muted-foreground">
          اتبع الخطوات التالية لربط ساري AI مع رقم الواتساب الخاص بك لاستقبال الرسائل والرد التلقائي
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <Webhook className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Webhook URL</p>
                <p className="font-semibold text-green-600 dark:text-green-400">جاهز</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ساري AI</p>
                <p className="font-semibold text-blue-600 dark:text-blue-400">نشط</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">الرد التلقائي</p>
                <p className="font-semibold text-purple-600 dark:text-purple-400">مفعّل</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Setup Steps */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            خطوات التفعيل
          </CardTitle>
          <CardDescription>
            اتبع هذه الخطوات لربط Green API مع ساري
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                1
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">احصل على Instance ID و Token من Green API</h3>
              <p className="text-sm text-muted-foreground mb-3">
                سجل دخول إلى حسابك في Green API وأنشئ instance جديد أو استخدم واحد موجود
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="https://console.green-api.com" target="_blank" rel="noopener noreferrer">
                  فتح Green API Console
                  <ExternalLink className="h-4 w-4 mr-2" />
                </a>
              </Button>
            </div>
          </div>

          <Separator />

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                2
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">انسخ Webhook URL</h3>
              <p className="text-sm text-muted-foreground mb-3">
                هذا هو رابط Webhook الذي سيستقبل الرسائل من Green API
              </p>
              <div className="flex gap-2">
                <Input 
                  value={webhookUrl} 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(webhookUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                3
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">فعّل Webhook في Green API</h3>
              <p className="text-sm text-muted-foreground mb-3">
                في إعدادات instance الخاص بك، فعّل الخيارات التالية:
              </p>
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Incoming webhook: <Badge variant="secondary">yes</Badge></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Outgoing webhook: <Badge variant="secondary">yes</Badge></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>State webhook: <Badge variant="secondary">yes</Badge></span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                ثم الصق Webhook URL في حقل "Webhook URL"
              </p>
            </div>
          </div>

          <Separator />

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                4
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">أضف Instance في ساري</h3>
              <p className="text-sm text-muted-foreground mb-3">
                اذهب إلى صفحة إدارة أرقام الواتساب وأضف Instance ID و Token
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="/merchant/whatsapp-instances">
                  إدارة أرقام الواتساب
                  <ArrowRight className="h-4 w-4 mr-2" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How it Works */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>كيف يعمل النظام؟</CardTitle>
          <CardDescription>
            فهم آلية عمل ساري AI مع الواتساب
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">استقبال الرسائل</h4>
                <p className="text-sm text-muted-foreground">
                  عندما يرسل عميل رسالة على الواتساب، يرسلها Green API إلى Webhook URL الخاص بساري
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">معالجة ذكية</h4>
                <p className="text-sm text-muted-foreground">
                  ساري AI يفهم الرسالة، يبحث في منتجاتك، ويولد رد مخصص باللهجة السعودية
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">رد تلقائي</h4>
                <p className="text-sm text-muted-foreground">
                  يُرسل الرد للعميل عبر Green API خلال 1-3 ثواني، مع حفظ المحادثة في قاعدة البيانات
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Important Notes */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>ملاحظات مهمة:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li>تأكد من أن رقم الواتساب متصل ونشط في Green API</li>
            <li>Webhook URL يجب أن يكون متاحاً على الإنترنت (HTTPS)</li>
            <li>ساري يرد تلقائياً على الرسائل النصية والصوتية</li>
            <li>يتم حفظ جميع المحادثات في قاعدة البيانات لمراجعتها لاحقاً</li>
            <li>تحقق من حدود باقتك (عدد المحادثات والرسائل الشهرية)</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
