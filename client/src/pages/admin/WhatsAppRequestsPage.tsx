import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, Phone, Building2, Calendar } from 'lucide-react';

import { useTranslation } from 'react-i18next';
export default function WhatsAppRequestsPage() {
  const { t } = useTranslation();

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  
  // Form state
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [apiUrl, setApiUrl] = useState('https://api.green-api.com');
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: requests, isLoading, refetch } = trpc.whatsappRequests.listAll.useQuery();
  const approveMutation = trpc.whatsappRequests.approve.useMutation();
  const rejectMutation = trpc.whatsappRequests.reject.useMutation();

  const pendingRequests = requests?.filter(r => r.status === 'pending') || [];
  const approvedRequests = requests?.filter(r => r.status === 'approved') || [];
  const rejectedRequests = requests?.filter(r => r.status === 'rejected') || [];
  const completedRequests = requests?.filter(r => r.status === 'completed') || [];

  const handleApprove = () => {
    if (!selectedRequest) return;
    if (!instanceId || !token) {
      toast.error(t('toast.common.msg8'));
      return;
    }

    approveMutation.mutate(
      {
        requestId: selectedRequest.id,
        instanceId,
        token,
        apiUrl,
        adminNotes,
      },
      {
        onSuccess: () => {
          toast.success(t('toast.common.msg18'));
          setApproveDialogOpen(false);
          resetForm();
          refetch();
        },
        onError: (error) => {
          toast.error(error.message || 'فشلت الموافقة على الطلب');
        },
      }
    );
  };

  const handleReject = () => {
    if (!selectedRequest) return;
    if (!rejectionReason) {
      toast.error(t('toast.common.msg23'));
      return;
    }

    rejectMutation.mutate(
      {
        requestId: selectedRequest.id,
        rejectionReason,
      },
      {
        onSuccess: () => {
          toast.success(t('toast.common.msg21'));
          setRejectDialogOpen(false);
          resetForm();
          refetch();
        },
        onError: (error) => {
          toast.error(error.message || 'فشل رفض الطلب');
        },
      }
    );
  };

  const resetForm = () => {
    setInstanceId('');
    setToken('');
    setApiUrl('https://api.green-api.com');
    setAdminNotes('');
    setRejectionReason('');
    setSelectedRequest(null);
  };

  const openApproveDialog = (request: any) => {
    setSelectedRequest(request);
    setApproveDialogOpen(true);
  };

  const openRejectDialog = (request: any) => {
    setSelectedRequest(request);
    setRejectDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { variant: 'secondary', icon: Clock, label: 'قيد الانتظار' },
      approved: { variant: 'default', icon: CheckCircle2, label: 'تمت الموافقة' },
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

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="text-center">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">طلبات ربط واتساب</h1>
        <p className="text-muted-foreground">إدارة طلبات التجار لربط أرقام واتساب</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">قيد الانتظار</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">تمت الموافقة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">مرفوضة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rejectedRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">مكتملة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedRequests.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>طلبات قيد الانتظار</CardTitle>
            <CardDescription>طلبات تحتاج إلى مراجعة</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{request.businessName}</span>
                      {getStatusBadge(request.status)}
                    </div>
                    {request.phoneNumber && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {request.phoneNumber}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(request.createdAt).toLocaleDateString('ar-SA')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => openApproveDialog(request)}
                    >
                      موافقة
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRejectDialog(request)}
                    >
                      رفض
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Requests */}
      <Card>
        <CardHeader>
          <CardTitle>جميع الطلبات</CardTitle>
          <CardDescription>سجل كامل لجميع الطلبات</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {requests && requests.length > 0 ? (
              requests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{request.businessName}</span>
                      {getStatusBadge(request.status)}
                    </div>
                    {request.phoneNumber && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {request.phoneNumber}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(request.createdAt).toLocaleDateString('ar-SA')}
                    </div>
                    {request.instanceId && (
                      <div className="text-xs text-muted-foreground">
                        Instance ID: {request.instanceId}
                      </div>
                    )}
                    {request.rejectionReason && (
                      <div className="text-sm text-destructive">
                        سبب الرفض: {request.rejectionReason}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">
                لا توجد طلبات
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>الموافقة على طلب ربط واتساب</DialogTitle>
            <DialogDescription>
              أدخل بيانات Green API Instance للتاجر
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instanceId">Instance ID *</Label>
              <Input
                id="instanceId"
                placeholder="7103123456"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token">API Token *</Label>
              <Input
                id="token"
                placeholder="abc123def456..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiUrl">API URL</Label>
              <Input
                id="apiUrl"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminNotes">ملاحظات (اختياري)</Label>
              <Textarea
                id="adminNotes"
                placeholder="ملاحظات إضافية..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleApprove} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? 'جاري الموافقة...' : 'موافقة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>رفض طلب ربط واتساب</DialogTitle>
            <DialogDescription>
              أدخل سبب رفض الطلب
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejectionReason">سبب الرفض *</Label>
              <Textarea
                id="rejectionReason"
                placeholder="يرجى توضيح سبب رفض الطلب..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'جاري الرفض...' : 'رفض الطلب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
