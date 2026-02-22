import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Clock, Smartphone, Wifi } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';

export default function WhatsAppRequests() {
  const { t } = useTranslation();

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [instanceId, setInstanceId] = useState('');
  const [apiToken, setApiToken] = useState('');

  // Get all requests
  const { data: allRequests, refetch } = trpc.whatsapp.listRequests.useQuery({});
  const { data: pendingRequests } = trpc.whatsapp.listRequests.useQuery({ status: 'pending' });
  const { data: approvedRequests } = trpc.whatsapp.listRequests.useQuery({ status: 'approved' });
  const { data: rejectedRequests } = trpc.whatsapp.listRequests.useQuery({ status: 'rejected' });

  // Approve mutation
  const approveMutation = trpc.whatsapp.approveRequest.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg18'));
      setIsApproveDialogOpen(false);
      setInstanceId('');
      setApiToken('');
      setSelectedRequest(null);
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

  const handleApproveClick = (request: any) => {
    setSelectedRequest(request);
    setIsApproveDialogOpen(true);
  };

  const handleApproveConfirm = () => {
    if (!instanceId.trim()) {
      toast.error(t('adminWhatsAppRequestsPage.text27'));
      return;
    }
    if (!apiToken.trim()) {
      toast.error(t('adminWhatsAppRequestsPage.text28'));
      return;
    }

    approveMutation.mutate({
      requestId: selectedRequest.id,
      instanceId: instanceId.trim(),
      apiToken: apiToken.trim(),
    });
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
          <Badge variant="outline" className="gap-1 border-blue-500 text-blue-700">
            <CheckCircle2 className="w-3 h-3" />
            مقبول - في انتظار الربط
          </Badge>
        );
      case 'connected':
        return (
          <Badge variant="outline" className="gap-1 border-green-500 text-green-700">
            <Wifi className="w-3 h-3" />
            مربوط
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
            <TableHead>{t('adminWhatsAppRequestsPage.text0')}</TableHead>
            <TableHead>{t('adminWhatsAppRequestsPage.text1')}</TableHead>
            <TableHead>{t('adminWhatsAppRequestsPage.text2')}</TableHead>
            <TableHead>{t('adminWhatsAppRequestsPage.text3')}</TableHead>
            <TableHead>{t('adminWhatsAppRequestsPage.text4')}</TableHead>
            <TableHead>{t('adminWhatsAppRequestsPage.text5')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-mono">#{request.id}</TableCell>
              <TableCell>
                <div className="font-medium">{t('adminWhatsAppRequestsPage.text6', { var0: request.merchantId })}</div>
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
                      onClick={() => handleApproveClick(request)}
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
                ) : (request.status === 'approved' || request.status === 'connected') && request.instanceId ? (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-mono text-xs">Instance: {request.instanceId}</span>
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
          <h1 className="text-3xl font-bold">{t('adminWhatsAppRequestsPage.text7')}</h1>
          <p className="text-muted-foreground">
            مراجعة وإدارة طلبات ربط أرقام الواتساب من التجار
          </p>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{t('adminWhatsAppRequestsPage.text8')}</CardDescription>
            <CardTitle className="text-3xl">{pendingRequests?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{t('adminWhatsAppRequestsPage.text9')}</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{approvedRequests?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{t('adminWhatsAppRequestsPage.text10')}</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {allRequests?.filter((r: any) => r.status === 'connected').length || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{t('adminWhatsAppRequestsPage.text11')}</CardDescription>
            <CardTitle className="text-3xl text-red-600">{rejectedRequests?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Requests Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminWhatsAppRequestsPage.text12')}</CardTitle>
          <CardDescription>
            جميع طلبات ربط الواتساب من التجار
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">{t('adminWhatsAppRequestsPage.text13', { var0: allRequests?.length || 0 })}</TabsTrigger>
              <TabsTrigger value="pending">{t('adminWhatsAppRequestsPage.text14', { var0: pendingRequests?.length || 0 })}</TabsTrigger>
              <TabsTrigger value="approved">{t('adminWhatsAppRequestsPage.text15', { var0: approvedRequests?.length || 0 })}</TabsTrigger>
              <TabsTrigger value="rejected">{t('adminWhatsAppRequestsPage.text16', { var0: rejectedRequests?.length || 0 })}</TabsTrigger>
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

      {/* Approve Dialog with Green API Credentials */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('adminWhatsAppRequestsPage.text17')}</DialogTitle>
            <DialogDescription>
              أدخل بيانات Green API للتاجر لإتمام عملية الربط
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedRequest && (
              <div className="bg-muted p-3 rounded-lg text-sm">
                <p><strong>{t('adminWhatsAppRequestsPage.text18')}</strong> {selectedRequest.fullNumber}</p>
                <p><strong>{t('adminWhatsAppRequestsPage.text19')}</strong> #{selectedRequest.merchantId}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="instanceId">Instance ID</Label>
              <Input
                id="instanceId"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                placeholder={t('adminWhatsAppRequestsPage.text20')}
                dir="ltr"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                احصل عليه من لوحة تحكم Green API
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiToken">API Token</Label>
              <Input
                id="apiToken"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder={t('adminWhatsAppRequestsPage.text21')}
                dir="ltr"
                className="font-mono"
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                احصل عليه من لوحة تحكم Green API
              </p>
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsApproveDialogOpen(false);
                setInstanceId('');
                setApiToken('');
                setSelectedRequest(null);
              }}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleApproveConfirm}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? 'جاري القبول...' : 'قبول الطلب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('adminWhatsAppRequestsPage.text22')}</DialogTitle>
            <DialogDescription>
              يرجى إدخال سبب الرفض لإعلام التاجر
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedRequest && (
              <div className="bg-muted p-3 rounded-lg text-sm">
                <p><strong>{t('adminWhatsAppRequestsPage.text23')}</strong> {selectedRequest.fullNumber}</p>
                <p><strong>{t('adminWhatsAppRequestsPage.text24')}</strong> #{selectedRequest.merchantId}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="reason">{t('adminWhatsAppRequestsPage.text25')}</Label>
              <Textarea
                id="reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={t('adminWhatsAppRequestsPage.text26')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
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
              {rejectMutation.isPending ? 'جاري الرفض...' : 'رفض الطلب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
