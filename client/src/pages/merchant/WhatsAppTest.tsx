import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Send, Image as ImageIcon, CheckCircle2, XCircle, Phone } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function WhatsAppTest() {
  // Green API Credentials
  const [instanceId, setInstanceId] = useState("");
  const [apiToken, setApiToken] = useState("");
  
  // Message fields
  const [phoneNumber, setPhoneNumber] = useState("966501898700");
  const [message, setMessage] = useState("مرحباً! هذه رسالة تجريبية من ساري 🎉");
  const [imageUrl, setImageUrl] = useState("");
  const [imageCaption, setImageCaption] = useState("");

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<{
    success: boolean;
    status: string;
    phoneNumber?: string;
    error?: string;
    debug?: any;
  } | null>(null);

  const sendMessageMutation = trpc.whatsapp.sendTestMessage.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال الرسالة بنجاح! ✅");
    },
    onError: (error) => {
      toast.error(`فشل إرسال الرسالة: ${error.message}`);
    },
  });

  const sendImageMutation = trpc.whatsapp.sendTestImage.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال الصورة بنجاح! ✅");
    },
    onError: (error) => {
      toast.error(`فشل إرسال الصورة: ${error.message}`);
    },
  });

  const testConnectionMutation = trpc.whatsapp.testConnection.useMutation({
    onSuccess: (data) => {
      setConnectionStatus(data);
      if (data.success) {
        toast.success(`الاتصال ناجح! ✅\nالحالة: ${data.status}`);
      } else {
        // Error returned in response (not thrown)
        toast.error(data.error || `فشل الاتصال ❌\nالحالة: ${data.status}`);
      }
    },
    onError: (error: any) => {
      console.error('[WhatsApp Test] Unexpected Error:', error);
      toast.error(`خطأ غير متوقع: ${error.message}`);
      setConnectionStatus({
        success: false,
        status: 'error',
        error: error.message,
        debug: {
          errorMessage: error.message,
          note: 'Unexpected error - check console',
        },
      });
    },
  });

  const handleTestConnection = () => {
    if (!instanceId.trim()) {
      toast.error("يرجى إدخال Instance ID");
      return;
    }
    if (!apiToken.trim()) {
      toast.error("يرجى إدخال API Token");
      return;
    }

    testConnectionMutation.mutate({
      instanceId: instanceId.trim(),
      token: apiToken.trim(),
    });
  };

  const handleSendMessage = () => {
    if (!instanceId.trim() || !apiToken.trim()) {
      toast.error("يرجى إدخال بيانات Green API أولاً");
      return;
    }
    if (!phoneNumber.trim()) {
      toast.error("يرجى إدخال رقم الجوال");
      return;
    }
    if (!message.trim()) {
      toast.error("يرجى إدخال نص الرسالة");
      return;
    }

    sendMessageMutation.mutate({
      instanceId: instanceId.trim(),
      token: apiToken.trim(),
      phoneNumber: phoneNumber.trim(),
      message: message.trim(),
    });
  };

  const handleSendImage = () => {
    if (!instanceId.trim() || !apiToken.trim()) {
      toast.error("يرجى إدخال بيانات Green API أولاً");
      return;
    }
    if (!phoneNumber.trim()) {
      toast.error("يرجى إدخال رقم الجوال");
      return;
    }
    if (!imageUrl.trim()) {
      toast.error("يرجى إدخال رابط الصورة");
      return;
    }

    sendImageMutation.mutate({
      instanceId: instanceId.trim(),
      token: apiToken.trim(),
      phoneNumber: phoneNumber.trim(),
      imageUrl: imageUrl.trim(),
      caption: imageCaption.trim() || undefined,
    });
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">اختبار WhatsApp</h1>
        <p className="text-muted-foreground">
          اختبر إرسال رسائل WhatsApp باستخدام Green API
        </p>
      </div>

      <div className="grid gap-6">
        {/* Green API Credentials Card */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle>بيانات Green API</CardTitle>
            <CardDescription>
              أدخل Instance ID و Token من حسابك في Green API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="instanceId">Instance ID</Label>
              <Input
                id="instanceId"
                placeholder="1101234567"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                dir="ltr"
                className="text-left font-mono"
              />
              <p className="text-xs text-muted-foreground">
                رقم Instance من لوحة تحكم Green API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiToken">API Token</Label>
              <Input
                id="apiToken"
                type="password"
                placeholder="••••••••••••••••••••"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                dir="ltr"
                className="text-left font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Token الخاص بـ Instance (سيتم إخفاؤه)
              </p>
            </div>

            <Alert>
              <AlertDescription className="text-sm">
                <strong>كيف تحصل على البيانات؟</strong>
                <br />
                1. سجل دخول إلى <a href="https://console.green-api.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.green-api.com</a>
                <br />
                2. اختر Instance أو أنشئ واحد جديد
                <br />
                3. انسخ Instance ID و API Token
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Test Connection Card */}
        <Card>
          <CardHeader>
            <CardTitle>اختبار الاتصال</CardTitle>
            <CardDescription>
              تحقق من اتصال Green API والحالة الحالية
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleTestConnection}
              disabled={testConnectionMutation.isPending || !instanceId || !apiToken}
              className="w-full"
            >
              {testConnectionMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الاختبار...
                </>
              ) : (
                <>
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                  اختبار الاتصال
                </>
              )}
            </Button>

            {connectionStatus && (
              <div className={`p-4 rounded-lg border-2 ${
                connectionStatus.success 
                  ? 'bg-green-50 border-green-500 dark:bg-green-950 dark:border-green-700' 
                  : 'bg-red-50 border-red-500 dark:bg-red-950 dark:border-red-700'
              }`}>
                <div className="flex items-start gap-3">
                  {connectionStatus.success ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 space-y-2">
                    <p className="font-bold text-lg">
                      {connectionStatus.success ? '✅ الاتصال ناجح' : '❌ فشل الاتصال'}
                    </p>
                    <div className="space-y-1 text-sm">
                      <p>
                        <strong>الحالة:</strong> {connectionStatus.status}
                      </p>
                      {connectionStatus.error && (
                        <p className="text-red-600 dark:text-red-400 mt-2">
                          <strong>تفاصيل الخطأ:</strong> {connectionStatus.error}
                        </p>
                      )}
                      {connectionStatus.phoneNumber && (
                        <p className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <strong>رقم الواتساب المتصل:</strong>
                          <span className="font-mono text-base">{connectionStatus.phoneNumber}</span>
                        </p>
                      )}
                    </div>
                    {connectionStatus.success && (
                      <p className="text-xs text-muted-foreground mt-2">
                        يمكنك الآن إرسال رسائل تجريبية ✨
                      </p>
                    )}
                    {connectionStatus.debug && (
                      <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded border">
                        <p className="font-bold text-sm mb-2">🔍 Debug Info (للإرسال لدعم Green API):</p>
                        <div className="space-y-1 text-xs font-mono">
                          <p><strong>URL:</strong> {connectionStatus.debug.url}</p>
                          <p><strong>Method:</strong> {connectionStatus.debug.method}</p>
                          {connectionStatus.debug.responseStatus && (
                            <p><strong>Response Status:</strong> {connectionStatus.debug.responseStatus}</p>
                          )}
                          {connectionStatus.debug.responseStatusText && (
                            <p><strong>Response Status Text:</strong> {connectionStatus.debug.responseStatusText}</p>
                          )}
                          {connectionStatus.debug.errorCode && (
                            <p><strong>Error Code:</strong> {connectionStatus.debug.errorCode}</p>
                          )}
                          {connectionStatus.debug.errorMessage && (
                            <p><strong>Error Message:</strong> {connectionStatus.debug.errorMessage}</p>
                          )}
                          {connectionStatus.debug.responseData && (
                            <div>
                              <p><strong>Response Data:</strong></p>
                              <pre className="mt-1 p-2 bg-white dark:bg-gray-900 rounded text-[10px] overflow-x-auto max-h-40">
                                {JSON.stringify(connectionStatus.debug.responseData, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 w-full"
                          onClick={() => {
                            const debugText = JSON.stringify(connectionStatus.debug, null, 2);
                            navigator.clipboard.writeText(debugText);
                            toast.success('تم نسخ Debug Info إلى الحافظة!');
                          }}
                        >
                          📋 نسخ Debug Info
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Send Text Message Card */}
        <Card>
          <CardHeader>
            <CardTitle>إرسال رسالة نصية</CardTitle>
            <CardDescription>
              أرسل رسالة نصية تجريبية إلى رقم WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">رقم الجوال (مع كود الدولة)</Label>
              <Input
                id="phoneNumber"
                placeholder="966501234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                dir="ltr"
                className="text-left font-mono text-lg"
              />
              <p className="text-xs text-muted-foreground">
                مثال: 966501234567 (بدون + أو 00)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">نص الرسالة</Label>
              <Textarea
                id="message"
                placeholder="اكتب رسالتك هنا..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>

            <Button
              onClick={handleSendMessage}
              disabled={sendMessageMutation.isPending || !instanceId || !apiToken}
              className="w-full"
            >
              {sendMessageMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="ml-2 h-4 w-4" />
                  إرسال الرسالة
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Send Image Card */}
        <Card>
          <CardHeader>
            <CardTitle>إرسال صورة</CardTitle>
            <CardDescription>
              أرسل صورة مع نص اختياري إلى رقم WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="imageUrl">رابط الصورة (URL)</Label>
              <Input
                id="imageUrl"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                dir="ltr"
                className="text-left"
              />
              <p className="text-xs text-muted-foreground">
                يجب أن يكون رابط مباشر للصورة (jpg, png, gif)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageCaption">نص مرفق (اختياري)</Label>
              <Textarea
                id="imageCaption"
                placeholder="نص يظهر مع الصورة..."
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
                rows={2}
              />
            </div>

            <Button
              onClick={handleSendImage}
              disabled={sendImageMutation.isPending || !instanceId || !apiToken}
              className="w-full"
              variant="secondary"
            >
              {sendImageMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <ImageIcon className="ml-2 h-4 w-4" />
                  إرسال الصورة
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Instructions Card */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-lg">ملاحظات مهمة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>• تأكد من أن Instance الخاص بك في حالة <strong>authorized</strong> (مصرح)</p>
            <p>• رقم الجوال يجب أن يكون بصيغة: كود الدولة + الرقم (بدون + أو 00)</p>
            <p>• مثال للسعودية: 966501234567</p>
            <p>• الصور يجب أن تكون روابط مباشرة (https://...)</p>
            <p>• قد يستغرق الإرسال بضع ثوانٍ</p>
            <p>• رقم الواتساب الافتراضي: <strong className="font-mono">966501898700</strong></p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
