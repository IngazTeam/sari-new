import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

export default function WhatsAppConnection() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Get connection status
  const { data: status, isLoading, refetch } = trpc.whatsapp.getStatus.useQuery(undefined, {
    refetchInterval: 5000, // Check status every 5 seconds
  });

  // Generate QR Code mutation
  const generateQR = trpc.whatsapp.getQRCode.useMutation({
    onSuccess: (data) => {
      setQrCode(data.qrCode);
      setIsGenerating(false);
      toast.success('تم إنشاء رمز QR بنجاح');
    },
    onError: (error) => {
      setIsGenerating(false);
      toast.error(`فشل في إنشاء رمز QR: ${error.message}`);
    },
  });

  const handleGenerateQR = () => {
    setIsGenerating(true);
    generateQR.mutate();
  };

  const handleRefreshStatus = () => {
    refetch();
    toast.info('جاري تحديث حالة الاتصال...');
  };

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">ربط الواتساب</h1>
          <p className="text-muted-foreground mt-2">
            قم بربط رقم الواتساب الخاص بمتجرك لبدء استقبال الرسائل والرد التلقائي على العملاء
          </p>
        </div>

        {/* Connection Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              حالة الاتصال
            </CardTitle>
            <CardDescription>
              حالة الاتصال الحالية لرقم الواتساب
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>جاري التحقق من حالة الاتصال...</span>
              </div>
            ) : status?.isConnected ? (
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <div className="font-semibold">متصل بنجاح!</div>
                  {status.phoneNumber && (
                    <div className="text-sm mt-1">رقم الهاتف: {status.phoneNumber}</div>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-orange-500 bg-orange-50">
                <XCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  <div className="font-semibold">غير متصل</div>
                  <div className="text-sm mt-1">
                    الحالة: {status?.status || 'غير معروف'}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleRefreshStatus}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              تحديث الحالة
            </Button>
          </CardContent>
        </Card>

        {/* QR Code Card */}
        {!status?.isConnected && (
          <Card>
            <CardHeader>
              <CardTitle>مسح رمز QR</CardTitle>
              <CardDescription>
                قم بمسح رمز QR باستخدام تطبيق الواتساب لربط رقمك
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {qrCode ? (
                <div className="space-y-4">
                  <div className="flex justify-center p-4 bg-white rounded-lg border">
                    <img
                      src={qrCode}
                      alt="QR Code"
                      className="w-64 h-64"
                    />
                  </div>
                  <Alert>
                    <AlertDescription>
                      <div className="font-semibold mb-2">خطوات الربط:</div>
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>افتح تطبيق الواتساب على هاتفك</li>
                        <li>اذهب إلى الإعدادات ← الأجهزة المرتبطة</li>
                        <li>اضغط على "ربط جهاز"</li>
                        <li>قم بمسح رمز QR أعلاه</li>
                      </ol>
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={handleGenerateQR}
                    variant="outline"
                    className="w-full"
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        جاري الإنشاء...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        إنشاء رمز جديد
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <p className="text-muted-foreground">
                    اضغط على الزر أدناه لإنشاء رمز QR جديد
                  </p>
                  <Button
                    onClick={handleGenerateQR}
                    size="lg"
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        جاري الإنشاء...
                      </>
                    ) : (
                      'إنشاء رمز QR'
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Instructions Card */}
        <Card>
          <CardHeader>
            <CardTitle>معلومات مهمة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• يجب أن يكون رقم الواتساب نشطاً ومتاحاً للربط</p>
            <p>• لا تقم بتسجيل الخروج من الواتساب على هاتفك بعد الربط</p>
            <p>• سيتم الرد التلقائي على جميع الرسائل الواردة من العملاء</p>
            <p>• يمكنك مراقبة المحادثات من صفحة "المحادثات"</p>
            <p>• في حال انقطاع الاتصال، قم بإعادة مسح رمز QR</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
