import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CheckCircle2, XCircle, Clock, Smartphone, Send, RefreshCcw, QrCode, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
import { SubscriptionGuard } from '@/components/SubscriptionGuard';

// Popular country codes
const COUNTRY_CODES = [
  { code: '+966', name: 'السعودية', flag: '🇸🇦' },
  { code: '+971', name: 'الإمارات', flag: '🇦🇪' },
  { code: '+965', name: 'الكويت', flag: '🇰🇼' },
  { code: '+974', name: 'قطر', flag: '🇶🇦' },
  { code: '+973', name: 'البحرين', flag: '🇧🇭' },
  { code: '+968', name: 'عمان', flag: '🇴🇲' },
  { code: '+962', name: 'الأردن', flag: '🇯🇴' },
  { code: '+20', name: 'مصر', flag: '🇪🇬' },
  { code: '+212', name: 'المغرب', flag: '🇲🇦' },
  { code: '+213', name: 'الجزائر', flag: '🇩🇿' },
];

function WhatsAppConnectionContent() {
  const { t } = useTranslation();

  const [countryCode, setCountryCode] = useState('+966');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Get current request status
  const { data: requestStatus, refetch: refetchRequest } = trpc.whatsapp.getRequestStatus.useQuery();

  // Get connection status
  const { data: connectionStatus, refetch: refetchStatus } = trpc.whatsapp.getStatus.useQuery(undefined, {
    enabled: requestStatus?.status === 'approved' || requestStatus?.status === 'connected',
    refetchInterval: showQRDialog ? 3000 : false, // Poll every 3 seconds when QR dialog is open
  });

  // Initialize form with existing request data
  useEffect(() => {
    if (requestStatus) {
      setCountryCode(requestStatus.countryCode);
      setPhoneNumber(requestStatus.phoneNumber);
    }
  }, [requestStatus]);

  // Check if connected and close dialog
  useEffect(() => {
    if (connectionStatus?.connected && showQRDialog) {
      setShowQRDialog(false);
      setQrCode(null);
      toast.success('تم ربط الواتساب بنجاح! 🎉');
      refetchRequest();
    }
  }, [connectionStatus?.connected, showQRDialog, refetchRequest]);

  // Request connection mutation
  const requestConnectionMutation = trpc.whatsapp.requestConnection.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg2'));
      refetchRequest();
      setPhoneNumber('');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إرسال الطلب');
    },
  });

  // Get QR Code mutation
  const getQRCodeMutation = trpc.whatsapp.getQRCode.useMutation({
    onSuccess: (data) => {
      if (data.alreadyConnected) {
        toast.success('الواتساب مربوط بالفعل!');
        refetchRequest();
        refetchStatus();
      } else if (data.qrCode) {
        setQrCode(data.qrCode);
        setShowQRDialog(true);
      }
    },
    onError: (error) => {
      toast.error(error.message || 'فشل جلب QR Code');
    },
  });

  // Disconnect mutation
  const disconnectMutation = trpc.whatsapp.disconnect.useMutation({
    onSuccess: () => {
      toast.success('تم فك ربط الواتساب بنجاح');
      refetchRequest();
      setPhoneNumber('');
      setCountryCode('+966');
      setQrCode(null);
    },
    onError: (error) => {
      toast.error(error.message || 'فشل فك الربط');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneNumber.trim()) {
      toast.error(t('toast.common.msg4'));
      return;
    }

    // Validate phone number (basic validation)
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
      toast.error(t('toast.common.msg5'));
      return;
    }

    requestConnectionMutation.mutate({
      countryCode,
      phoneNumber: cleanNumber,
    });
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  const handleGetQRCode = () => {
    getQRCodeMutation.mutate();
  };

  const handleRefreshQRCode = () => {
    getQRCodeMutation.mutate();
  };

  const handleCheckStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    await refetchStatus();
    setIsCheckingStatus(false);
  }, [refetchStatus]);

  const getStatusBadge = () => {
    if (!requestStatus) return null;

    // If connected, show connected status
    if (requestStatus.status === 'connected' || connectionStatus?.connected) {
      return (
        <Alert className="border-green-500 bg-green-50">
          <Wifi className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <div className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              الواتساب مربوط ونشط
            </div>
            <div className="text-sm mt-1">
              رقم الواتساب الخاص بك جاهز لاستقبال الرسائل والرد عليها تلقائياً.
            </div>
            <div className="text-sm mt-2 font-mono">
              الرقم المربوط: {requestStatus.fullNumber}
            </div>
            {connectionStatus?.phoneNumber && (
              <div className="text-sm mt-1 font-mono text-green-700">
                رقم WhatsApp: {connectionStatus.phoneNumber}
              </div>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    switch (requestStatus.status) {
      case 'pending':
        return (
          <Alert className="border-yellow-500 bg-yellow-50">
            <Clock className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <div className="font-semibold">قيد المراجعة</div>
              <div className="text-sm mt-1">
                طلبك قيد المراجعة من قبل المدير. سيتم إشعارك بالنتيجة قريباً.
              </div>
              <div className="text-sm mt-2 font-mono">
                الرقم المطلوب: {requestStatus.fullNumber}
              </div>
            </AlertDescription>
          </Alert>
        );
      case 'approved':
        return (
          <Alert className="border-blue-500 bg-blue-50">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <div className="font-semibold">تمت الموافقة - جاهز للربط!</div>
              <div className="text-sm mt-1">
                تم قبول طلب الربط. اضغط على زر "ربط الواتساب" أدناه لمسح QR Code وإتمام الربط.
              </div>
              <div className="text-sm mt-2 font-mono">
                الرقم: {requestStatus.fullNumber}
              </div>
            </AlertDescription>
          </Alert>
        );
      case 'rejected':
        return (
          <Alert className="border-red-500 bg-red-50">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <div className="font-semibold">تم الرفض</div>
              <div className="text-sm mt-1">
                {requestStatus.rejectionReason || 'تم رفض طلب الربط'}
              </div>
              <div className="text-sm mt-2 text-muted-foreground">
                يمكنك تقديم طلب جديد برقم مختلف
              </div>
            </AlertDescription>
          </Alert>
        );
    }
  };

  const canSubmitNewRequest = !requestStatus || requestStatus.status === 'rejected';
  const canDisconnect = requestStatus && (requestStatus.status === 'pending' || requestStatus.status === 'approved' || requestStatus.status === 'connected');
  const canConnectWhatsApp = requestStatus?.status === 'approved' && !connectionStatus?.connected;
  const isConnected = requestStatus?.status === 'connected' || connectionStatus?.connected;

  return (
    <div className="container py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Smartphone className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">ربط الواتساب</h1>
            <p className="text-muted-foreground">
              قم بربط رقم الواتساب الخاص بمتجرك لبدء استقبال الرسائل
            </p>
          </div>
        </div>

        {/* Current Status */}
        {requestStatus && (
          <div className="space-y-4">
            {getStatusBadge()}
            
            {/* Connect WhatsApp Button - Only show when approved but not connected */}
            {canConnectWhatsApp && (
              <Button
                onClick={handleGetQRCode}
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
                disabled={getQRCodeMutation.isPending}
              >
                {getQRCodeMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                    جاري جلب QR Code...
                  </>
                ) : (
                  <>
                    <QrCode className="w-5 h-5 ml-2" />
                    ربط الواتساب الآن
                  </>
                )}
              </Button>
            )}

            {/* Check Status Button - Show when connected */}
            {isConnected && (
              <Button
                onClick={handleCheckStatus}
                variant="outline"
                className="w-full"
                disabled={isCheckingStatus}
              >
                {isCheckingStatus ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري التحقق...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="w-4 h-4 ml-2" />
                    تحقق من حالة الاتصال
                  </>
                )}
              </Button>
            )}
            
            {/* Disconnect Button */}
            {canDisconnect && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                        جاري فك الربط...
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-4 h-4 ml-2" />
                        فك الربط وطلب رقم جديد
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>تأكيد فك ربط الواتساب</AlertDialogTitle>
                    <AlertDialogDescription className="text-right">
                      <div className="space-y-2">
                        <p>هل أنت متأكد من فك ربط رقم الواتساب الحالي؟</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {requestStatus.fullNumber}
                        </p>
                        <p className="text-red-600">
                          سيتم إلغاء الربط الحالي وستحتاج لتقديم طلب جديد.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-row-reverse gap-2">
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDisconnect}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      نعم، فك الربط
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}

        {/* Connection Request Form */}
        <Card>
          <CardHeader>
            <CardTitle>طلب ربط رقم واتساب</CardTitle>
            <CardDescription>
              أدخل رقم الواتساب الذي تريد ربطه بمتجرك
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="country-code">مفتاح الدولة</Label>
                <Select
                  value={countryCode}
                  onValueChange={setCountryCode}
                  disabled={!canSubmitNewRequest}
                >
                  <SelectTrigger id="country-code">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        <span className="flex items-center gap-2">
                          <span>{country.flag}</span>
                          <span>{country.name}</span>
                          <span className="text-muted-foreground">({country.code})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone-number">رقم الهاتف</Label>
                <div className="flex gap-2">
                  <div className="w-24 flex items-center justify-center border rounded-md bg-muted px-3 font-mono">
                    {countryCode}
                  </div>
                  <Input
                    id="phone-number"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="5XXXXXXXX"
                    disabled={!canSubmitNewRequest}
                    dir="ltr"
                    className="flex-1 font-mono"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  أدخل رقم الهاتف بدون مفتاح الدولة (مثال: 501234567)
                </p>
              </div>

              {canSubmitNewRequest && (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={requestConnectionMutation.isPending}
                >
                  {requestConnectionMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 ml-2" />
                      إرسال طلب الربط
                    </>
                  )}
                </Button>
              )}

              {requestStatus?.status === 'pending' && (
                <Alert>
                  <AlertDescription className="text-sm">
                    لديك طلب قيد المراجعة حالياً. سيتم إشعارك عند معالجة الطلب.
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>معلومات مهمة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• يجب أن يكون رقم الواتساب نشطاً ومتاحاً للربط</p>
            <p>• سيتم مراجعة طلبك من قبل المدير قبل الموافقة</p>
            <p>• بعد الموافقة، اضغط على "ربط الواتساب" لمسح QR Code</p>
            <p>• افتح WhatsApp على هاتفك → الإعدادات → الأجهزة المرتبطة → ربط جهاز</p>
            <p>• امسح QR Code الظاهر على الشاشة</p>
            <p>• بعد الربط، سيتم الرد التلقائي على جميع الرسائل الواردة</p>
          </CardContent>
        </Card>

        {/* QR Code Dialog */}
        <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center">امسح QR Code لربط الواتساب</DialogTitle>
              <DialogDescription className="text-center">
                افتح WhatsApp على هاتفك → الإعدادات → الأجهزة المرتبطة → ربط جهاز
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center space-y-4 py-4">
              {qrCode ? (
                <div className="bg-white p-4 rounded-lg shadow-inner">
                  <img
                    src={`data:image/png;base64,${qrCode}`}
                    alt="WhatsApp QR Code"
                    className="w-64 h-64"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              )}
              
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  ينتهي QR Code خلال دقيقتين
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshQRCode}
                  disabled={getQRCodeMutation.isPending}
                >
                  {getQRCodeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCcw className="w-4 h-4 ml-2" />
                      تحديث QR Code
                    </>
                  )}
                </Button>
              </div>

              {/* Connection Status Indicator */}
              <div className="flex items-center gap-2 text-sm">
                {connectionStatus?.connected ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-green-600">تم الربط بنجاح!</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span className="text-blue-600">في انتظار مسح QR Code...</span>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function WhatsAppConnection() {
  return (
    <SubscriptionGuard 
      feature="ربط الواتساب"
      fallbackMessage="يتطلب ربط الواتساب اشتراكاً نشطاً في إحدى باقاتنا"
    >
      <WhatsAppConnectionContent />
    </SubscriptionGuard>
  );
}
