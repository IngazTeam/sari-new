import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus, CheckCircle2, XCircle, Clock, AlertCircle, Smartphone, Phone,
  Building2, Send, Loader2, Star, StarOff, Power, PowerOff, Crown,
  ArrowUpRight, Shield, QrCode, RefreshCcw
} from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function WhatsAppInstancesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    type: 'deactivate' | 'activate' | 'setPrimary';
    instanceId: number;
    phoneNumber?: string;
  } | null>(null);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [connectingRequestId, setConnectingRequestId] = useState<number | null>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [reconnectInstanceId, setReconnectInstanceId] = useState<number | null>(null);
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);
  const [isPollingReconnect, setIsPollingReconnect] = useState(false);

  // Get current merchant
  const { data: merchant } = trpc.merchants.getCurrent.useQuery(
    undefined,
    { enabled: !!user }
  );

  // Get safe instances (no sensitive data)
  const { data: instances, refetch: refetchInstances, isLoading: instancesLoading } = trpc.whatsappInstances.listSafe.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get usage vs plan limits
  const { data: usage, refetch: refetchUsage } = trpc.whatsappInstances.getUsage.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get merchant's WhatsApp requests
  const { data: requests, refetch: refetchRequests, isLoading: requestsLoading } = trpc.whatsappRequests.listMine.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  const refetchAll = () => {
    refetchInstances();
    refetchUsage();
    refetchRequests();
  };

  // QR Code query for approved request
  const { data: qrCode, refetch: refetchQRCode, isFetching: qrFetching } = trpc.whatsappRequests.getQRCode.useQuery(
    { requestId: connectingRequestId || 0 },
    { enabled: !!connectingRequestId && showQRDialog, refetchInterval: false }
  );

  // Connection status check — polls every 3s when QR dialog is open
  const { data: connectionCheck } = trpc.whatsappRequests.checkConnection.useQuery(
    { requestId: connectingRequestId || 0 },
    {
      enabled: !!connectingRequestId && showQRDialog && isCheckingConnection,
      refetchInterval: isCheckingConnection ? 3000 : false,
    }
  );

  // Auto-close QR dialog when connected
  useEffect(() => {
    if (connectionCheck?.connected) {
      setShowQRDialog(false);
      setConnectingRequestId(null);
      setIsCheckingConnection(false);
      toast.success(t('whatsappManagement.toast.connected', 'تم ربط الواتساب بنجاح! 🎉'));
      refetchAll();
    }
  }, [connectionCheck?.connected]);

  const handleConnectWhatsApp = async (requestId: number) => {
    setConnectingRequestId(requestId);
    setShowQRDialog(true);
    setIsCheckingConnection(true);
  };

  const handleRefreshQR = () => {
    refetchQRCode();
  };

  // Mutations
  const createRequestMutation = trpc.whatsappRequests.create.useMutation({
    onSuccess: () => {
      toast.success(t('whatsappManagement.toast.requestSent', 'تم إرسال طلب الربط بنجاح! سيتم مراجعته من قبل الإدارة.'));
      setShowRequestDialog(false);
      setPhoneNumber("");
      setBusinessName("");
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(error.message || t('whatsappManagement.toast.requestFailed', 'فشل إرسال الطلب'));
    },
  });

  const toggleStatusMutation = trpc.whatsappInstances.toggleStatus.useMutation({
    onSuccess: () => {
      toast.success(t('whatsappManagement.toast.statusChanged', 'تم تحديث حالة الرقم بنجاح'));
      setConfirmAction(null);
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(error.message);
      setConfirmAction(null);
    },
  });

  const setPrimaryMutation = trpc.whatsappInstances.setPrimary.useMutation({
    onSuccess: () => {
      toast.success(t('whatsappManagement.toast.primarySet', 'تم تعيين الرقم الأساسي بنجاح'));
      setConfirmAction(null);
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(error.message);
      setConfirmAction(null);
    },
  });

  const refreshInstanceMutation = trpc.whatsappInstances.refreshInstance.useMutation({
    onSuccess: (data: any) => {
      const msg = data.phoneNumber
        ? t('whatsappManagement.toast.refreshed', `تم تحديث البيانات — الرقم: ${data.phoneNumber}`)
        : t('whatsappManagement.toast.refreshedNoPhone', 'تم تحديث البيانات');
      toast.success(msg);
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(error.message || t('whatsappManagement.toast.refreshFailed', 'فشل التحديث'));
    },
  });

  // Reconnect flow
  const reconnectMutation = trpc.whatsappInstances.reconnect.useMutation({
    onSuccess: () => {
      toast.success(t('whatsappManagement.toast.loggedOut', 'تم تسجيل الخروج. امسح QR Code بالرقم الجديد.'));
      setShowReconnectDialog(true);
      setIsPollingReconnect(true);
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const { data: reconnectQR, refetch: refetchReconnectQR } = trpc.whatsappInstances.getReconnectQR.useQuery(
    { instanceId: reconnectInstanceId || 0 },
    { enabled: !!reconnectInstanceId && showReconnectDialog, refetchInterval: showReconnectDialog ? 15000 : false }
  );

  const { data: reconnectStatus } = trpc.whatsappInstances.confirmReconnect.useQuery(
    { instanceId: reconnectInstanceId || 0 },
    { enabled: !!reconnectInstanceId && isPollingReconnect, refetchInterval: isPollingReconnect ? 3000 : false }
  );

  useEffect(() => {
    if (reconnectStatus?.connected) {
      setShowReconnectDialog(false);
      setReconnectInstanceId(null);
      setIsPollingReconnect(false);
      toast.success(t('whatsappManagement.toast.reconnected', `تم ربط الرقم الجديد بنجاح! ${reconnectStatus.phoneNumber || ''} 🎉`));
      refetchAll();
    }
  }, [reconnectStatus?.connected]);

  const handleReconnect = (instanceId: number) => {
    setReconnectInstanceId(instanceId);
    reconnectMutation.mutate({ instanceId });
  };

  const handleSubmitRequest = () => {
    if (!merchant) return;
    createRequestMutation.mutate({
      merchantId: merchant.id,
      phoneNumber: phoneNumber || undefined,
      businessName: businessName || undefined,
    });
  };

  const handleConfirmAction = () => {
    if (!confirmAction || !merchant) return;
    if (confirmAction.type === 'activate') {
      toggleStatusMutation.mutate({ id: confirmAction.instanceId, merchantId: merchant.id, newStatus: 'active' });
    } else if (confirmAction.type === 'deactivate') {
      toggleStatusMutation.mutate({ id: confirmAction.instanceId, merchantId: merchant.id, newStatus: 'inactive' });
    } else if (confirmAction.type === 'setPrimary') {
      setPrimaryMutation.mutate({ id: confirmAction.instanceId, merchantId: merchant.id });
    }
  };

  const getRequestStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-blue-500 gap-1"><CheckCircle2 className="w-3 h-3" />{t('whatsappManagement.status.approved', 'تمت الموافقة')}</Badge>;
      case "connected":
      case "completed":
        return <Badge className="bg-green-500 gap-1"><CheckCircle2 className="w-3 h-3" />{t('whatsappManagement.status.connected', 'متصل')}</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />{t('whatsappManagement.status.rejected', 'مرفوض')}</Badge>;
      case "pending":
        return <Badge variant="outline" className="border-orange-400 text-orange-600 gap-1"><Clock className="w-3 h-3" />{t('whatsappManagement.status.pending', 'قيد المراجعة')}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const hasPendingRequest = requests?.some((r: any) => r.status === 'pending');
  const activeInstances = instances?.filter((i: any) => i.status === 'active') || [];
  const inactiveInstances = instances?.filter((i: any) => i.status === 'inactive') || [];
  const canAddMore = usage ? usage.remaining > 0 : true;

  if (!merchant) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('whatsappManagement.title', 'إدارة أرقام الواتساب')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('whatsappManagement.subtitle', 'أضف أرقام واتساب جديدة وتحكّم في أرقامك النشطة')}
          </p>
        </div>
        <Button
          onClick={() => setShowRequestDialog(true)}
          disabled={hasPendingRequest || !canAddMore}
          className="shrink-0"
        >
          <Plus className="w-4 h-4 ml-2" />
          {t('whatsappManagement.addNumber', 'طلب ربط رقم جديد')}
        </Button>
      </div>

      {/* Plan Usage Bar */}
      {usage && (
        <Card className="border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="font-semibold">{t('whatsappManagement.planUsage', 'استخدام الباقة')}</span>
                {usage.planName && (
                  <Badge variant="outline" className="text-xs">{usage.planName}</Badge>
                )}
              </div>
              <span className="text-sm font-medium">
                {usage.current} / {usage.max} {t('whatsappManagement.numbersActive', 'أرقام نشطة')}
              </span>
            </div>
            <Progress value={usage.percentage} className="h-2" />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{t('whatsappManagement.remaining', 'متبقي')}: {usage.remaining} {t('whatsappManagement.numbers', 'أرقام')}</span>
              {usage.percentage >= 100 && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => window.location.href = '/merchant/my-subscription'}>
                  <ArrowUpRight className="w-3 h-3 ml-1" />
                  {t('whatsappManagement.upgradePlan', 'ترقية الباقة')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Power className="w-4 h-4 text-green-500" />
              {t('whatsappManagement.stats.activeNumbers', 'أرقام نشطة')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeInstances.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PowerOff className="w-4 h-4 text-gray-400" />
              {t('whatsappManagement.stats.inactiveNumbers', 'أرقام متوقفة')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">{inactiveInstances.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              {t('whatsappManagement.stats.pendingRequests', 'طلبات قيد المراجعة')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{requests?.filter((r: any) => r.status === 'pending').length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Numbers */}
      {activeInstances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-green-600" />
              {t('whatsappManagement.connectedNumbers', 'الأرقام النشطة')}
            </CardTitle>
            <CardDescription>{t('whatsappManagement.connectedDesc', 'أرقام الواتساب المتصلة والنشطة حالياً')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeInstances.map((instance: any) => (
                <div key={instance.id} className={`flex flex-col gap-3 p-4 rounded-lg border transition-colors ${instance.isPrimary ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${instance.isPrimary ? 'bg-primary/10' : 'bg-green-100'}`}>
                      <Phone className={`w-5 h-5 ${instance.isPrimary ? 'text-primary' : 'text-green-600'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold" dir="ltr">{instance.phoneNumber || t('whatsappManagement.noPhone', 'رقم غير محدد')}</span>
                        {instance.isPrimary && (
                          <Badge className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs">
                            <Crown className="w-3 h-3" />
                            {t('whatsappManagement.primary', 'الرقم الأساسي')}
                          </Badge>
                        )}
                        <Badge className="bg-green-500 text-xs">{t('whatsappManagement.status.active', 'نشط')}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('whatsappManagement.connectedSince', 'متصل منذ')} {(instance.connectedAt || instance.createdAt) ? new Date(instance.connectedAt || instance.createdAt).toLocaleDateString('ar-SA') : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refreshInstanceMutation.mutate({ instanceId: instance.id })}
                      disabled={refreshInstanceMutation.isPending}
                      className="gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      {refreshInstanceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                      {t('whatsappManagement.refresh', 'تحديث البيانات')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReconnect(instance.id)}
                      disabled={reconnectMutation.isPending}
                      className="gap-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                    >
                      {reconnectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                      {t('whatsappManagement.changeNumber', 'تغيير الرقم')}
                    </Button>
                    {!instance.isPrimary && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmAction({ type: 'setPrimary', instanceId: instance.id, phoneNumber: instance.phoneNumber })}
                        className="gap-1"
                      >
                        <Star className="w-4 h-4" />
                        {t('whatsappManagement.setAsPrimary', 'تعيين كأساسي')}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmAction({ type: 'deactivate', instanceId: instance.id, phoneNumber: instance.phoneNumber })}
                      className="gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    >
                      <PowerOff className="w-4 h-4" />
                      {t('whatsappManagement.deactivate', 'إيقاف')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inactive Numbers */}
      {inactiveInstances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <PowerOff className="w-5 h-5" />
              {t('whatsappManagement.inactiveNumbers', 'الأرقام المتوقفة')}
            </CardTitle>
            <CardDescription>{t('whatsappManagement.inactiveDesc', 'يمكنك إعادة تفعيل هذه الأرقام حسب حدود باقتك')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {inactiveInstances.map((instance: any) => (
                <div key={instance.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 dark:bg-gray-900/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <Phone className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-muted-foreground" dir="ltr">{instance.phoneNumber || t('whatsappManagement.noPhone', 'رقم غير محدد')}</span>
                        <Badge variant="secondary" className="text-xs">{t('whatsappManagement.status.inactive', 'متوقف')}</Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction({ type: 'activate', instanceId: instance.id, phoneNumber: instance.phoneNumber })}
                    disabled={!canAddMore}
                    className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 w-full sm:w-auto"
                  >
                    <Power className="w-4 h-4" />
                    {t('whatsappManagement.activate', 'تفعيل')}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {(!instances || instances.length === 0) && (!requests || requests.length === 0) && !instancesLoading && !requestsLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12 space-y-4">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Smartphone className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{t('whatsappManagement.emptyTitle', 'لم تربط أي رقم واتساب بعد')}</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">{t('whatsappManagement.emptyDesc', 'قدّم طلب ربط رقم واتساب جديد وسيقوم فريق الدعم بتفعيله خلال 24 ساعة')}</p>
              </div>
              <Button onClick={() => setShowRequestDialog(true)} size="lg" className="gap-2">
                <Plus className="w-5 h-5" />
                {t('whatsappManagement.addNumber', 'طلب ربط رقم جديد')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approved Request — Connect WhatsApp Banner */}
      {requests?.some((r: any) => r.status === 'approved') && (
        <Card className="border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900 rounded-2xl flex items-center justify-center">
                  <QrCode className="w-7 h-7 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-green-900 dark:text-green-100">
                    {t('whatsappManagement.readyToConnect', 'جاهز للربط! 🎉')}
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {t('whatsappManagement.readyToConnectDesc', 'تمت الموافقة على طلبك. اضغط الزر لمسح QR Code وربط الواتساب.')}
                  </p>
                </div>
              </div>
              <Button
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white gap-2 shrink-0 shadow-lg"
                onClick={() => {
                  const approved = requests?.find((r: any) => r.status === 'approved');
                  if (approved) handleConnectWhatsApp(approved.id);
                }}
              >
                <QrCode className="w-5 h-5" />
                {t('whatsappManagement.connectNow', 'ربط الواتساب الآن')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Requests History */}
      {requests && requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('whatsappManagement.requestsHistory', 'سجل الطلبات')}</CardTitle>
            <CardDescription>{t('whatsappManagement.requestsHistoryDesc', 'جميع طلبات ربط أرقام الواتساب الخاصة بك')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requests.map((request: any) => (
                <div key={request.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border ${request.status === 'approved' ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                      request.status === 'pending' ? 'bg-orange-100' :
                      request.status === 'approved' ? 'bg-blue-100' :
                      request.status === 'completed' ? 'bg-green-100' :
                      'bg-red-100'
                    }`}>
                      {request.status === 'pending' ? <Clock className="w-5 h-5 text-orange-600" /> :
                       request.status === 'approved' ? <QrCode className="w-5 h-5 text-blue-600" /> :
                       request.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-green-600" /> :
                       <XCircle className="w-5 h-5 text-red-600" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium" dir="ltr">{request.phoneNumber || t('whatsappManagement.newNumberRequest', 'طلب رقم جديد')}</span>
                        {getRequestStatusBadge(request.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(request.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      {request.rejectionReason && (
                        <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {t('whatsappManagement.rejectionReason', 'سبب الرفض')}: {request.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Connect button for approved requests */}
                  {request.status === 'approved' && (
                    <Button
                      onClick={() => handleConnectWhatsApp(request.id)}
                      className="bg-green-600 hover:bg-green-700 gap-2 shrink-0 w-full sm:w-auto"
                    >
                      <QrCode className="w-4 h-4" />
                      {t('whatsappManagement.connectWhatsApp', 'ربط الواتساب')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-green-600" />
              {t('whatsappManagement.dialog.title', 'طلب ربط رقم واتساب')}
            </DialogTitle>
            <DialogDescription>
              {t('whatsappManagement.dialog.description', 'أدخل رقم الواتساب الذي تريد ربطه. سيتم مراجعة طلبك من قبل فريق الإدارة وتفعيله خلال 24 ساعة.')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="phoneNumber" className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {t('whatsappManagement.dialog.phoneLabel', 'رقم الواتساب')}
              </Label>
              <Input
                id="phoneNumber"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+966500000000"
                dir="ltr"
                className="text-left"
              />
              <p className="text-xs text-muted-foreground">
                {t('whatsappManagement.dialog.phoneHint', 'أدخل الرقم مع مفتاح الدولة (مثال: +966)')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="businessName" className="flex items-center gap-1">
                <Building2 className="w-4 h-4" />
                {t('whatsappManagement.dialog.businessLabel', 'اسم النشاط التجاري (اختياري)')}
              </Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={merchant?.businessName || t('whatsappManagement.dialog.businessPlaceholder', 'اسم المتجر أو الشركة')}
              />
            </div>

            {/* Plan limit notice */}
            {usage && (
              <div className={`rounded-lg p-3 border ${usage.remaining > 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
                <p className={`text-sm flex items-start gap-2 ${usage.remaining > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}`}>
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {usage.remaining > 0
                    ? t('whatsappManagement.dialog.info', `يمكنك إضافة ${usage.remaining} رقم إضافي حسب باقتك الحالية (${usage.planName}).`)
                    : t('whatsappManagement.dialog.limitReached', 'وصلت للحد الأقصى من الأرقام. أوقف رقماً أو قم بترقية باقتك.')
                  }
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>
              {t('common.cancel', 'إلغاء')}
            </Button>
            <Button
              onClick={handleSubmitRequest}
              disabled={createRequestMutation.isPending || !canAddMore}
            >
              {createRequestMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t('whatsappManagement.dialog.sending', 'جاري الإرسال...')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 ml-2" />
                  {t('whatsappManagement.dialog.submit', 'إرسال الطلب')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Connection Dialog */}
      <Dialog open={showQRDialog} onOpenChange={(open) => {
        if (!open) {
          setShowQRDialog(false);
          setConnectingRequestId(null);
          setIsCheckingConnection(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5 text-green-600" />
              {t('whatsappManagement.qr.title', 'ربط الواتساب')}
            </DialogTitle>
            <DialogDescription className="text-center">
              {t('whatsappManagement.qr.description', 'امسح رمز QR من تطبيق الواتساب على هاتفك')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center space-y-4 py-4">
            {qrFetching ? (
              <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : qrCode?.qrCodeUrl ? (
              <div className="border-4 border-green-500 rounded-xl p-3 bg-white shadow-lg">
                <img
                  src={qrCode.qrCodeUrl.startsWith('data:') || qrCode.qrCodeUrl.startsWith('http') ? qrCode.qrCodeUrl : `data:image/png;base64,${qrCode.qrCodeUrl}`}
                  alt="WhatsApp QR Code"
                  className="w-64 h-64"
                />
              </div>
            ) : (
              <div className="w-64 h-64 bg-red-50 rounded-lg flex flex-col items-center justify-center gap-2 text-red-600">
                <XCircle className="w-8 h-8" />
                <span className="text-sm">{t('whatsappManagement.qr.error', 'فشل تحميل QR Code')}</span>
              </div>
            )}

            {/* Connection Status */}
            <div className="flex items-center gap-2 text-sm">
              {connectionCheck?.connected ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-green-600 font-medium">{t('whatsappManagement.qr.connected', 'تم الربط بنجاح! ✅')}</span>
                </>
              ) : isCheckingConnection ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span className="text-blue-600">{t('whatsappManagement.qr.waiting', 'بانتظار مسح الرمز...')}</span>
                </>
              ) : null}
            </div>

            {/* Refresh QR Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshQR}
              disabled={qrFetching}
              className="gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              {t('whatsappManagement.qr.refresh', 'تحديث الرمز')}
            </Button>

            {/* Instructions */}
            <div className="space-y-2 text-sm text-muted-foreground text-center border-t pt-4">
              <p className="font-medium">{t('whatsappManagement.qr.howTo', 'كيفية المسح:')}</p>
              <ol className="list-decimal list-inside space-y-1 text-right">
                <li>{t('whatsappManagement.qr.step1', 'افتح واتساب على هاتفك')}</li>
                <li>{t('whatsappManagement.qr.step2', 'اذهب إلى الإعدادات ← الأجهزة المرتبطة')}</li>
                <li>{t('whatsappManagement.qr.step3', 'اضغط "ربط جهاز"')}</li>
                <li>{t('whatsappManagement.qr.step4', 'وجّه الكاميرا نحو رمز QR')}</li>
              </ol>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Action Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'deactivate' && t('whatsappManagement.confirm.deactivateTitle', 'إيقاف الرقم')}
              {confirmAction?.type === 'activate' && t('whatsappManagement.confirm.activateTitle', 'تفعيل الرقم')}
              {confirmAction?.type === 'setPrimary' && t('whatsappManagement.confirm.setPrimaryTitle', 'تعيين كرقم أساسي')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'deactivate' && t('whatsappManagement.confirm.deactivateDesc', `هل تريد إيقاف الرقم ${confirmAction?.phoneNumber || ''}؟ سيتوقف استقبال الرسائل على هذا الرقم.`)}
              {confirmAction?.type === 'activate' && t('whatsappManagement.confirm.activateDesc', `هل تريد إعادة تفعيل الرقم ${confirmAction?.phoneNumber || ''}؟`)}
              {confirmAction?.type === 'setPrimary' && t('whatsappManagement.confirm.setPrimaryDesc', `هل تريد تعيين ${confirmAction?.phoneNumber || ''} كرقم أساسي؟ سيتم إرسال الرسائل الافتراضية من هذا الرقم.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'إلغاء')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={confirmAction?.type === 'deactivate' ? 'bg-orange-600 hover:bg-orange-700' : ''}
            >
              {(toggleStatusMutation.isPending || setPrimaryMutation.isPending) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('common.confirm', 'تأكيد')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reconnect Dialog — Change Number */}
      <Dialog open={showReconnectDialog} onOpenChange={(open) => {
        if (!open) {
          setShowReconnectDialog(false);
          setIsPollingReconnect(false);
          setReconnectInstanceId(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-purple-600" />
              {t('whatsappManagement.reconnect.title', 'تغيير رقم الواتساب')}
            </DialogTitle>
            <DialogDescription>
              {t('whatsappManagement.reconnect.desc', 'امسح QR Code بالرقم الجديد الذي تريد ربطه')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {reconnectQR?.qrCode ? (
              <>
                <div className="bg-white p-4 rounded-lg border">
                  <img src={`data:image/png;base64,${reconnectQR.qrCode}`} alt="QR Code" className="w-64 h-64" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('whatsappManagement.reconnect.waiting', 'في انتظار مسح QR Code...')}
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchReconnectQR()} className="gap-1">
                  <RefreshCcw className="w-4 h-4" />
                  {t('whatsappManagement.refreshQR', 'تحديث QR Code')}
                </Button>
              </>
            ) : reconnectQR?.status === 'already_connected' ? (
              <div className="text-center text-green-600">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2" />
                <p>{t('whatsappManagement.reconnect.alreadyConnected', 'الرقم متصل بالفعل!')}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>{t('whatsappManagement.reconnect.loading', 'جاري التحميل...')}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
