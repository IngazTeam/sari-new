import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Clock, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
export default function WhatsAppRequests() {
  const { t } = useTranslation();

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  // Get all requests
  const { data: allRequests, refetch } = trpc.whatsapp.listRequests.useQuery({});
  const { data: pendingRequests } = trpc.whatsapp.listRequests.useQuery({ status: 'pending' });
  const { data: approvedRequests } = trpc.whatsapp.listRequests.useQuery({ status: 'approved' });
  const { data: rejectedRequests } = trpc.whatsapp.listRequests.useQuery({ status: 'rejected' });

  // Approve mutation
  const approveMutation = trpc.whatsapp.approveRequest.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg18'));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل قبول الطلب');
    },
  });

  // Reject mutation
  const rejectMutation = trpc.whatsapp.rejectRequest.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg20'));
      setIsRejectDialogOpen(false);
      setRejectionReason('');
      setSelectedRequest(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل رفض الطلب');
    },
  });

  const handleApprove = (requestId: number) => {
    if (confirm('هل أنت متأكد من قبول هذا الطلب؟')) {
      approveMutation.mutate({ requestId });
    }
  };

  const handleRejectClick = (request: any) => {
    setSelectedRequest(request);
    setIsRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    if (!rejectionReason.trim()) {
      toast.error(t('toast.common.msg23'));
      return;
    }

    rejectMutation.mutate({
      requestId: selectedRequest.id,
      reason: rejectionReason,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-700">
            <Clock className="w-3 h-3" />
            قيد المراجعة
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="outline" className="gap-1 border-green-500 text-green-700">
            <CheckCircle2 className="w-3 h-3" />
            مقبول
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="gap-1 border-red-500 text-red-700">
            <XCircle className="w-3 h-3" />
            مرفوض
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const RequestsTable = ({ requests }: { requests: any[] | undefined }) => {
    if (!requests || requests.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          لا توجد طلبات
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>رقم الطلب</TableHead>
            <TableHead>اسم التاجر</TableHead>
            <TableHead>رقم الواتساب</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead>تاريخ الطلب</TableHead>
            <TableHead>الإجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-mono">#{request.id}</TableCell>
              <TableCell>
                <div className="font-medium">التاجر #{request.merchantId}</div>
              </TableCell>
              <TableCell>
                <div className="font-mono" dir="ltr">
                  {request.fullNumber}
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(request.status)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(request.createdAt)}
              </TableCell>
              <TableCell>
                {request.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleApprove(request.id)}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="w-4 h-4 ml-1" />
                      قبول
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleRejectClick(request)}
                      disabled={rejectMutation.isPending}
                    >
                      <XCircle className="w-4 h-4 ml-1" />
                      رفض
                    </Button>
                  </div>
                ) : request.status === 'rejected' && request.rejectionReason ? (
                  <div className="text-sm text-muted-foreground">
                    السبب: {request.rejectionReason}
                  </div>
                ) : request.status === 'approved' && request.reviewedAt ? (
                  <div className="text-sm text-muted-foreground">
                    تمت المراجعة: {formatDate(request.reviewedAt)}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Smartphone className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">طلبات ربط الواتساب</h1>
          <p className="text-muted-foreground">
            مراجعة وإدارة طلبات ربط أرقام الواتساب من التجار
          </p>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>قيد المراجعة</CardDescription>
            <CardTitle className="text-3xl">{pendingRequests?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>مقبولة</CardDescription>
            <CardTitle className="text-3xl text-green-600">{approvedRequests?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>مرفوضة</CardDescription>
            <CardTitle className="text-3xl text-red-600">{rejectedRequests?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>جميع الطلبات</CardTitle>
          <CardDescription>
            عرض وإدارة جميع طلبات ربط الواتساب
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">
                الكل ({allRequests?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="pending">
                قيد المراجعة ({pendingRequests?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="approved">
                مقبولة ({approvedRequests?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="rejected">
                مرفوضة ({rejectedRequests?.length || 0})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <RequestsTable requests={allRequests} />
            </TabsContent>
            <TabsContent value="pending">
              <RequestsTable requests={pendingRequests} />
            </TabsContent>
            <TabsContent value="approved">
              <RequestsTable requests={approvedRequests} />
            </TabsContent>
            <TabsContent value="rejected">
              <RequestsTable requests={rejectedRequests} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض طلب الربط</DialogTitle>
            <DialogDescription>
              الرجاء إدخال سبب رفض الطلب. سيتم إرسال السبب للتاجر.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedRequest && (
              <div className="space-y-2 p-4 bg-muted rounded-lg">
                <div className="text-sm">
                  <span className="font-semibold">رقم الواتساب:</span>{' '}
                  <span className="font-mono" dir="ltr">{selectedRequest.fullNumber}</span>
                </div>
                <div className="text-sm">
                  <span className="font-semibold">التاجر:</span> #{selectedRequest.merchantId}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">سبب الرفض</Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="مثال: الرقم غير صحيح، الرقم مستخدم من قبل تاجر آخر، إلخ..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRejectDialogOpen(false);
                setRejectionReason('');
                setSelectedRequest(null);
              }}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'جاري الرفض...' : 'تأكيد الرفض'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
