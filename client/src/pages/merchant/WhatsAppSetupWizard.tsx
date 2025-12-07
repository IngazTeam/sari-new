import { useState, useEffect } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, Smartphone, QrCode, Loader2, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';

import { useTranslation } from 'react-i18next';
export default function WhatsAppSetupWizard() {
  const { t } = useTranslation();

  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<any>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');

  const { data: merchant } = trpc.merchants.getCurrent.useQuery();

  const { data: requests, refetch: refetchRequests } = trpc.whatsappRequests.listMine.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  const createRequestMutation = trpc.whatsappRequests.create.useMutation();
  const { data: qrCode, refetch: refetchQRCode } = trpc.whatsappRequests.getQRCode.useQuery(
    { requestId: currentRequest?.id || 0 },
    { enabled: !!currentRequest && currentRequest.status === 'approved', refetchInterval: false }
  );

  const { data: connectionCheck } = trpc.whatsappRequests.checkConnection.useQuery(
    { requestId: currentRequest?.id || 0 },
    {
      enabled: !!currentRequest && currentRequest.status === 'approved',
      refetchInterval: connectionStatus === 'checking' ? 3000 : false,
    }
  );

  const pendingRequest = requests?.find(r => r.status === 'pending');
  const approvedRequest = requests?.find(r => r.status === 'approved');
  const completedRequest = requests?.find(r => r.status === 'completed');

  useEffect(() => {
    if (connectionCheck?.connected) {
      setConnectionStatus('connected');
      toast.success('✅ تم ربط واتساب بنجاح!');
      setTimeout(() => {
        navigate('/merchant/whatsapp-instances');
      }, 2000);
    }
  }, [connectionCheck, navigate]);

  useEffect(() => {
    if (qrCode?.qrCodeUrl) {
      setQrCodeUrl(qrCode.qrCodeUrl);
    }
  }, [qrCode]);

  const handleCreateRequest = () => {
    if (!merchant) return;

    createRequestMutation.mutate(
      {
        merchantId: merchant.id,
        phoneNumber,
        businessName: merchant.businessName,
      },
      {
        onSuccess: () => {
          toast.success(t('toast.common.msg6'));
          setPhoneNumber('');
          refetchRequests();
        },
        onError: (error) => {
          toast.error(error.message || 'فشل إرسال الطلب');
        },
      }
    );
  };

  const handleShowQRCode = async (request: any) => {
    setCurrentRequest(request);
    setQrCodeDialogOpen(true);
    setConnectionStatus('idle');
    
    // Fetch QR code
    await refetchQRCode();
  };

  const handleStartChecking = () => {
    setConnectionStatus('checking');
  };

  const handleRefreshQRCode = async () => {
    await refetchQRCode();
    toast.success(t('toast.common.msg7'));
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { variant: 'secondary', icon: Clock, label: 'قيد المراجعة' },
      approved: { variant: 'default', icon: CheckCircle2, label: 'جاهز للربط' },
      rejected: { variant: 'destructive', icon: XCircle, label: 'مرفوض' },
      completed: { variant: 'outline', icon: CheckCircle2, label: 'مكتمل' },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  if (!merchant) {
    return (
      <div className="container py-8">
        <div className="text-center">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ربط رقم واتساب</h1>
        <p className="text-muted-foreground">ابدأ باستخدام ساري عبر ربط رقم واتساب الخاص بك</p>
      </div>

      {/* Completed Request */}
      {completedRequest && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <CardTitle className="text-green-900">تم ربط واتساب بنجاح!</CardTitle>
            </div>
            <CardDescription className="text-green-700">
              رقم الهاتف: {completedRequest.phoneNumber}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/merchant/whatsapp-instances')}>
              الذهاب إلى إدارة الأرقام
              <ArrowRight className="mr-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending Request */}
      {pendingRequest && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <CardTitle className="text-yellow-900">طلبك قيد المراجعة</CardTitle>
            </div>
            <CardDescription className="text-yellow-700">
              سيتم مراجعة طلبك وإعداد رقم واتساب لك قريباً
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                {getStatusBadge(pendingRequest.status)}
              </div>
              <div className="text-sm text-muted-foreground">
                تم الإرسال: {new Date(pendingRequest.createdAt).toLocaleDateString('ar-SA')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approved Request */}
      {approvedRequest && !completedRequest && (
        <Card className="border-primary/30 bg-primary/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-primary">رقمك جاهز للربط!</CardTitle>
            </div>
            <CardDescription className="text-primary">
              تمت الموافقة على طلبك. اضغط الزر أدناه لمسح QR Code وإتمام الربط
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleShowQRCode(approvedRequest)} size="lg" className="w-full">
              <QrCode className="mr-2 h-5 w-5" />
              مسح QR Code وربط الرقم
            </Button>
          </CardContent>
        </Card>
      )}

      {/* New Request Form */}
      {!pendingRequest && !approvedRequest && !completedRequest && (
        <Card>
          <CardHeader>
            <CardTitle>طلب ربط رقم واتساب جديد</CardTitle>
            <CardDescription>
              أدخل رقم الهاتف الذي تريد ربطه (اختياري)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">رقم الهاتف (اختياري)</Label>
              <Input
                id="phoneNumber"
                placeholder="+966501234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
            <Button
              onClick={handleCreateRequest}
              disabled={createRequestMutation.isPending}
              size="lg"
              className="w-full"
            >
              {createRequestMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Smartphone className="mr-2 h-4 w-4" />
                  إرسال طلب ربط رقم
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle>كيف يعمل النظام؟</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                1
              </span>
              <span>قم بإرسال طلب ربط رقم واتساب</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                2
              </span>
              <span>سيقوم فريق ساري بمراجعة طلبك وإعداد رقم واتساب لك</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                3
              </span>
              <span>بعد الموافقة، ستظهر لك QR Code لمسحها من هاتفك</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                4
              </span>
              <span>افتح واتساب → الإعدادات → الأجهزة المرتبطة → امسح الكود</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                5
              </span>
              <span>✅ تم! يمكنك الآن استخدام ساري لإدارة محادثات واتساب</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      <Dialog open={qrCodeDialogOpen} onOpenChange={setQrCodeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>مسح QR Code</DialogTitle>
            <DialogDescription>
              امسح الكود من هاتفك لربط واتساب
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* QR Code */}
            {qrCodeUrl ? (
              <div className="flex flex-col items-center gap-4">
                <div className="border-4 border-primary rounded-lg p-4 bg-white">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code"
                    className="w-64 h-64"
                  />
                </div>
                
                {/* Status */}
                {connectionStatus === 'idle' && (
                  <Button onClick={handleStartChecking} size="lg" className="w-full">
                    <Smartphone className="mr-2 h-4 w-4" />
                    بدء التحقق من الاتصال
                  </Button>
                )}
                
                {connectionStatus === 'checking' && (
                  <div className="flex items-center gap-2 text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>في انتظار المسح...</span>
                  </div>
                )}
                
                {connectionStatus === 'connected' && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">تم الربط بنجاح!</span>
                  </div>
                )}
                
                {connectionStatus === 'error' && (
                  <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    <span>فشل الاتصال. حاول مرة أخرى</span>
                  </div>
                )}
                
                <Button
                  variant="outline"
                  onClick={handleRefreshQRCode}
                  size="sm"
                >
                  تحديث الكود
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            
            {/* Instructions */}
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium">الخطوات:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>افتح واتساب على هاتفك</li>
                <li>اذهب إلى الإعدادات</li>
                <li>اضغط على "الأجهزة المرتبطة"</li>
                <li>امسح الكود أعلاه</li>
              </ol>
              <p className="text-xs text-yellow-600">
                ⏱️ الكود ينتهي خلال دقيقتين. إذا انتهى، اضغط "تحديث الكود"
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
