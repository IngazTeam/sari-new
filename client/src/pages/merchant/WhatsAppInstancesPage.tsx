import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, CheckCircle2, XCircle, Clock, AlertCircle, Smartphone, Phone, Building2, Send, Loader2 } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function WhatsAppInstancesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessName, setBusinessName] = useState("");

  // Get current merchant
  const { data: merchant } = trpc.merchants.getCurrent.useQuery(
    undefined,
    { enabled: !!user }
  );

  // Get merchant's WhatsApp requests
  const { data: requests, refetch, isLoading } = trpc.whatsappRequests.listMine.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get active instances (read-only view — no sensitive data)
  const { data: instances } = trpc.whatsappInstances.list.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Create request mutation
  const createRequestMutation = trpc.whatsappRequests.create.useMutation({
    onSuccess: () => {
      toast.success(t('whatsappManagement.toast.requestSent', 'تم إرسال طلب الربط بنجاح! سيتم مراجعته من قبل الإدارة.'));
      setShowRequestDialog(false);
      setPhoneNumber("");
      setBusinessName("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || t('whatsappManagement.toast.requestFailed', 'فشل إرسال الطلب'));
    },
  });

  const handleSubmitRequest = () => {
    if (!merchant) return;
    createRequestMutation.mutate({
      merchantId: merchant.id,
      phoneNumber: phoneNumber || undefined,
      businessName: businessName || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-blue-500"><CheckCircle2 className="w-3 h-3 ml-1" />{t('whatsappManagement.status.approved', 'تمت الموافقة')}</Badge>;
      case "connected":
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 ml-1" />{t('whatsappManagement.status.connected', 'متصل')}</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 ml-1" />{t('whatsappManagement.status.rejected', 'مرفوض')}</Badge>;
      case "pending":
        return <Badge variant="outline" className="border-orange-400 text-orange-600"><Clock className="w-3 h-3 ml-1" />{t('whatsappManagement.status.pending', 'قيد المراجعة')}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const hasPendingRequest = requests?.some((r: any) => r.status === 'pending');
  const activeInstances = instances?.filter((i: any) => i.status === 'active') || [];

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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('whatsappManagement.title', 'إدارة أرقام الواتساب')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('whatsappManagement.subtitle', 'أضف أرقام واتساب جديدة وتابع حالة طلباتك')}
          </p>
        </div>
        <Button
          onClick={() => setShowRequestDialog(true)}
          disabled={hasPendingRequest}
        >
          <Plus className="w-4 h-4 ml-2" />
          {t('whatsappManagement.addNumber', 'طلب ربط رقم جديد')}
        </Button>
      </div>

      {/* Active Numbers Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('whatsappManagement.stats.activeNumbers', 'الأرقام المفعّلة')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeInstances.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('whatsappManagement.stats.pendingRequests', 'طلبات قيد المراجعة')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{requests?.filter((r: any) => r.status === 'pending').length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('whatsappManagement.stats.totalRequests', 'إجمالي الطلبات')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{requests?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Connected Numbers */}
      {activeInstances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-green-600" />
              {t('whatsappManagement.connectedNumbers', 'الأرقام المتصلة')}
            </CardTitle>
            <CardDescription>{t('whatsappManagement.connectedDesc', 'أرقام الواتساب النشطة والمتصلة بحسابك')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeInstances.map((instance: any) => (
                <div key={instance.id} className={`flex items-center justify-between p-4 rounded-lg border ${instance.isPrimary ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <Phone className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{instance.phoneNumber || t('whatsappManagement.noPhone', 'رقم غير محدد')}</span>
                        {instance.isPrimary && (
                          <Badge variant="outline" className="text-xs">{t('whatsappManagement.primary', 'الرقم الأساسي')}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('whatsappManagement.connectedSince', 'متصل منذ')}: {instance.connectedAt ? new Date(instance.connectedAt).toLocaleDateString('ar-SA') : new Date(instance.createdAt).toLocaleDateString('ar-SA')}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-green-500">{t('whatsappManagement.status.active', 'نشط')}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Requests History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('whatsappManagement.requestsHistory', 'سجل الطلبات')}</CardTitle>
          <CardDescription>{t('whatsappManagement.requestsHistoryDesc', 'جميع طلبات ربط أرقام الواتساب الخاصة بك')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !requests || requests.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                <Smartphone className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{t('whatsappManagement.noRequests', 'لا توجد طلبات بعد')}</p>
                <p className="text-sm text-muted-foreground">{t('whatsappManagement.noRequestsDesc', 'قدّم طلب ربط رقم واتساب جديد للبدء')}</p>
              </div>
              <Button onClick={() => setShowRequestDialog(true)}>
                <Plus className="w-4 h-4 ml-2" />
                {t('whatsappManagement.addNumber', 'طلب ربط رقم جديد')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((request: any) => (
                <div key={request.id} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      request.status === 'pending' ? 'bg-orange-100' :
                      request.status === 'approved' || request.status === 'completed' ? 'bg-green-100' :
                      'bg-red-100'
                    }`}>
                      {request.status === 'pending' ? <Clock className="w-5 h-5 text-orange-600" /> :
                       request.status === 'approved' || request.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-green-600" /> :
                       <XCircle className="w-5 h-5 text-red-600" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{request.phoneNumber || t('whatsappManagement.newNumberRequest', 'طلب رقم جديد')}</span>
                        {getStatusBadge(request.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(request.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      {request.rejectionReason && (
                        <p className="text-sm text-red-600 mt-1">
                          <AlertCircle className="w-3 h-3 inline ml-1" />
                          {t('whatsappManagement.rejectionReason', 'سبب الرفض')}: {request.rejectionReason}
                        </p>
                      )}
                      {request.adminNotes && request.status === 'approved' && (
                        <p className="text-sm text-blue-600 mt-1">
                          {t('whatsappManagement.adminNotes', 'ملاحظات الإدارة')}: {request.adminNotes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Dialog — CLEAN: No Instance ID, API Token, or Green API details */}
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

            {/* Info box */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {t('whatsappManagement.dialog.info', 'بعد إرسال الطلب، سيقوم فريق الدعم بمراجعته وتفعيل الرقم. ستتلقى إشعاراً عند التفعيل.')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>
              {t('common.cancel', 'إلغاء')}
            </Button>
            <Button
              onClick={handleSubmitRequest}
              disabled={createRequestMutation.isPending}
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
    </div>
  );
}
