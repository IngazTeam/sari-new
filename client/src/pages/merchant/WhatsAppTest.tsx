import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Send, Image as ImageIcon, CheckCircle2, XCircle } from "lucide-react";

export default function WhatsAppTest() {
  const [phoneNumber, setPhoneNumber] = useState("966501898700");
  const [message, setMessage] = useState("مرحباً! هذه رسالة تجريبية من ساري 🎉");
  const [imageUrl, setImageUrl] = useState("");
  const [imageCaption, setImageCaption] = useState("");

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
      if (data.success) {
        toast.success(`الاتصال ناجح! ✅\nالحالة: ${data.status}`);
      } else {
        toast.error(`فشل الاتصال ❌\nالحالة: ${data.status}`);
      }
    },
    onError: (error) => {
      toast.error(`خطأ في الاتصال: ${error.message}`);
    },
  });

  const handleSendMessage = () => {
    if (!phoneNumber.trim()) {
      toast.error("يرجى إدخال رقم الجوال");
      return;
    }
    if (!message.trim()) {
      toast.error("يرجى إدخال نص الرسالة");
      return;
    }

    sendMessageMutation.mutate({
      phoneNumber: phoneNumber.trim(),
      message: message.trim(),
    });
  };

  const handleSendImage = () => {
    if (!phoneNumber.trim()) {
      toast.error("يرجى إدخال رقم الجوال");
      return;
    }
    if (!imageUrl.trim()) {
      toast.error("يرجى إدخال رابط الصورة");
      return;
    }

    sendImageMutation.mutate({
      phoneNumber: phoneNumber.trim(),
      imageUrl: imageUrl.trim(),
      caption: imageCaption.trim() || undefined,
    });
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
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
        {/* Test Connection Card */}
        <Card>
          <CardHeader>
            <CardTitle>اختبار الاتصال</CardTitle>
            <CardDescription>
              تحقق من اتصال Green API والحالة الحالية
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleTestConnection}
              disabled={testConnectionMutation.isPending}
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

            {testConnectionMutation.data && (
              <div className={`mt-4 p-4 rounded-lg border ${
                testConnectionMutation.data.success 
                  ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' 
                  : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {testConnectionMutation.data.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {testConnectionMutation.data.success ? 'الاتصال ناجح' : 'فشل الاتصال'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      الحالة: {testConnectionMutation.data.status}
                    </p>
                    {testConnectionMutation.data.phoneNumber && (
                      <p className="text-sm text-muted-foreground">
                        رقم الواتساب: {testConnectionMutation.data.phoneNumber}
                      </p>
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
                className="text-left"
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
              disabled={sendMessageMutation.isPending}
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
              disabled={sendImageMutation.isPending}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
