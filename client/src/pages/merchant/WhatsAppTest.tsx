import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Send, Image as ImageIcon, CheckCircle2, XCircle, Phone, Save, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function WhatsAppTest() {
  // Green API Credentials
  const [instanceId, setInstanceId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  
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

  // Load saved instance
  const { data: savedInstance, refetch: refetchInstance } = trpc.whatsapp.getPrimaryInstance.useQuery();

  // Load saved data on mount
  useEffect(() => {
    if (savedInstance) {
      setInstanceId(savedInstance.instanceId);
      setApiToken(savedInstance.token);
      setIsSaved(true);
      if (savedInstance.phoneNumber) {
        // Don't override user input, just show it's available
      }
    }
  }, [savedInstance]);

  const saveInstanceMutation = trpc.whatsapp.saveInstance.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ بيانات WhatsApp بنجاح! ✅");
      setIsSaved(true);
      refetchInstance();
    },
    onError: (error) => {
      toast.error(`فشل حفظ البيانات: ${error.message}`);
    },
  });

  const deleteInstanceMutation = trpc.whatsapp.deleteInstance.useMutation({
    onSuccess: () => {
      toast.success("تم حذف البيانات المحفوظة");
      setInstanceId("");
      setApiToken("");
      setIsSaved(false);
      setConnectionStatus(null);
      refetchInstance();
    },
    onError: (error) => {
      toast.error(`فشل حذف البيانات: ${error.message}`);
    },
  });

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

  const handleSaveInstance = () => {
    if (!instanceId.trim()) {
      toast.error("يرجى إدخال Instance ID");
      return;
    }
    if (!apiToken.trim()) {
      toast.error("يرجى إدخال API Token");
      return;
    }

    saveInstanceMutation.mutate({
      instanceId: instanceId.trim(),
      token: apiToken.trim(),
      phoneNumber: connectionStatus?.phoneNumber,
    });
  };

  const handleDeleteInstance = () => {
    if (!savedInstance) return;
    
    if (confirm("هل أنت متأكد من حذف بيانات WhatsApp المحفوظة؟")) {
      deleteInstanceMutation.mutate({ instanceId: savedInstance.id });
    }
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
      caption: imageCaption.trim(),
    });
  };

  const copyDebugInfo = () => {
    if (!connectionStatus?.debug) return;
    
    const debugText = JSON.stringify(connectionStatus.debug, null, 2);
    navigator.clipboard.writeText(debugText);
    toast.success("تم نسخ Debug Info للحافظة");
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">اختبار WhatsApp</h1>
        <p className="text-muted-foreground">
          اختبر الاتصال بـ Green API وإرسال الرسائل
        </p>
      </div>

      {/* Green API Credentials */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            بيانات Green API
          </CardTitle>
          <CardDescription>
            أدخل Instance ID و Token من لوحة تحكم Green API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSaved && savedInstance && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <AlertDescription className="text-green-800">
                البيانات محفوظة! Instance: {savedInstance.instanceId}
                {savedInstance.phoneNumber && ` • رقم الهاتف: ${savedInstance.phoneNumber}`}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            <div>
              <Label htmlFor="instanceId">Instance ID</Label>
              <Input
                id="instanceId"
                placeholder="7105411382"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                disabled={isSaved}
              />
            </div>

            <div>
              <Label htmlFor="apiToken">API Token</Label>
              <Input
                id="apiToken"
                type="password"
                placeholder="أدخل API Token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                disabled={isSaved}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleTestConnection}
              disabled={testConnectionMutation.isPending || !instanceId || !apiToken}
              className="flex-1"
            >
              {testConnectionMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              اختبار الاتصال
            </Button>

            {!isSaved && connectionStatus?.success && (
              <Button
                onClick={handleSaveInstance}
                disabled={saveInstanceMutation.isPending}
                variant="outline"
                className="flex-1"
              >
                {saveInstanceMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                <Save className="ml-2 h-4 w-4" />
                حفظ البيانات
              </Button>
            )}

            {isSaved && (
              <Button
                onClick={handleDeleteInstance}
                disabled={deleteInstanceMutation.isPending}
                variant="destructive"
              >
                {deleteInstanceMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                <Trash2 className="ml-2 h-4 w-4" />
                حذف
              </Button>
            )}
          </div>

          {/* Connection Status */}
          {connectionStatus && (
            <Alert className={connectionStatus.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
              {connectionStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600" />
              )}
              <AlertDescription className={connectionStatus.success ? "text-green-800" : "text-red-800"}>
                <div className="font-semibold mb-1">
                  {connectionStatus.success ? "✅ الاتصال ناجح" : "❌ فشل الاتصال"}
                </div>
                <div className="text-sm">
                  <strong>الحالة:</strong> {connectionStatus.status}
                </div>
                {connectionStatus.phoneNumber && (
                  <div className="text-sm">
                    <strong>رقم الهاتف:</strong> {connectionStatus.phoneNumber}
                  </div>
                )}
                {connectionStatus.error && (
                  <div className="text-sm mt-2">
                    <strong>تفاصيل الخطأ:</strong> {connectionStatus.error}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Debug Info */}
          {connectionStatus?.debug && (
            <div className="bg-gray-50 p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm">Debug Info 🔍 (للإرسال لدعم Green API):</h4>
                <Button size="sm" variant="outline" onClick={copyDebugInfo}>
                  📋 نسخ Debug Info
                </Button>
              </div>
              <div className="space-y-1 text-sm font-mono">
                {connectionStatus.debug.url && (
                  <div><strong>URL:</strong> {connectionStatus.debug.url}</div>
                )}
                {connectionStatus.debug.method && (
                  <div><strong>Method:</strong> {connectionStatus.debug.method}</div>
                )}
                {connectionStatus.debug.responseStatus && (
                  <div><strong>Response Status:</strong> {connectionStatus.debug.responseStatus}</div>
                )}
                {connectionStatus.debug.errorMessage && (
                  <div><strong>Error Message:</strong> {connectionStatus.debug.errorMessage}</div>
                )}
                {connectionStatus.debug.errorCode && (
                  <div><strong>Error Code:</strong> {connectionStatus.debug.errorCode}</div>
                )}
                {connectionStatus.debug.responseData && (
                  <div>
                    <strong>Response Data:</strong>
                    <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-40">
                      {JSON.stringify(connectionStatus.debug.responseData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Message */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            إرسال رسالة نصية
          </CardTitle>
          <CardDescription>
            اختبر إرسال رسالة نصية إلى رقم WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="phoneNumber">رقم الجوال (مع كود الدولة)</Label>
            <Input
              id="phoneNumber"
              placeholder="966501234567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              مثال: 966501234567 (بدون + أو 00)
            </p>
          </div>

          <div>
            <Label htmlFor="message">نص الرسالة</Label>
            <Textarea
              id="message"
              placeholder="أدخل نص الرسالة"
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
            {sendMessageMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            <Send className="ml-2 h-4 w-4" />
            إرسال الرسالة
          </Button>
        </CardContent>
      </Card>

      {/* Send Image */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            إرسال صورة
          </CardTitle>
          <CardDescription>
            اختبر إرسال صورة مع نص اختياري
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="imageUrl">رابط الصورة</Label>
            <Input
              id="imageUrl"
              placeholder="https://example.com/image.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="imageCaption">نص مرفق (اختياري)</Label>
            <Textarea
              id="imageCaption"
              placeholder="أدخل نص مرفق مع الصورة"
              value={imageCaption}
              onChange={(e) => setImageCaption(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleSendImage}
            disabled={sendImageMutation.isPending || !instanceId || !apiToken}
            className="w-full"
          >
            {sendImageMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            <ImageIcon className="ml-2 h-4 w-4" />
            إرسال الصورة
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
