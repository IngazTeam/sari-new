import { trpc } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Eye, Pencil, Trash2, Send, FileText } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

export default function Campaigns() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data: campaigns, isLoading, refetch } = trpc.campaigns.list.useQuery();
  const deleteMutation = trpc.campaigns.delete.useMutation({
    onSuccess: () => {
      toast.success(t('toast.campaigns.msg3'));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل حذف الحملة');
    },
  });

  const sendMutation = trpc.campaigns.send.useMutation({
    onSuccess: () => {
      toast.success(t('toast.campaigns.msg5'));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إرسال الحملة');
    },
  });

  const handleDelete = async (id: number) => {
    if (confirm('هل أنت متأكد من حذف هذه الحملة؟')) {
      await deleteMutation.mutateAsync({ id });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      draft: { label: 'مسودة', variant: 'secondary' as const },
      scheduled: { label: 'مجدول', variant: 'default' as const },
      sending: { label: 'جاري الإرسال', variant: 'default' as const },
      completed: { label: 'مكتمل', variant: 'default' as const },
      failed: { label: 'فشل', variant: 'destructive' as const },
    };

    const config = statusMap[status as keyof typeof statusMap] || statusMap.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">الحملات التسويقية</h1>
          <p className="text-muted-foreground mt-2">
            إدارة وإنشاء الحملات التسويقية عبر الواتساب
          </p>
        </div>
        <Button onClick={() => setLocation('/merchant/campaigns/new')}>
          <Plus className="w-4 h-4 ml-2" />
          حملة جديدة
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي الحملات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              مكتملة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {campaigns?.filter(c => c.status === 'completed').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              قيد التنفيذ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {campaigns?.filter(c => c.status === 'sending' || c.status === 'scheduled').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              مسودات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">
              {campaigns?.filter(c => c.status === 'draft').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>جميع الحملات</CardTitle>
          <CardDescription>
            قائمة بجميع الحملات التسويقية الخاصة بك
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns && campaigns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم الحملة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>المرسل</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell>{campaign.sentCount}</TableCell>
                    <TableCell>{campaign.totalRecipients}</TableCell>
                    <TableCell>
                      {new Date(campaign.createdAt).toLocaleDateString('ar-SA')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setLocation(`/merchant/campaigns/${campaign.id}`)}
                          title="عرض التفاصيل"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        
                        {campaign.status === 'completed' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setLocation(`/merchant/campaigns/${campaign.id}/report`)}
                            title="عرض التقرير"
                          >
                            <FileText className="w-4 h-4 text-blue-600" />
                          </Button>
                        )}
                        
                        {campaign.status === 'draft' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => sendMutation.mutateAsync({ id: campaign.id })}
                              disabled={sendMutation.isPending}
                              title="إرسال الحملة الآن"
                            >
                              <Send className="w-4 h-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setLocation(`/merchant/campaigns/${campaign.id}/edit`)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(campaign.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Send className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">لا توجد حملات بعد</h3>
              <p className="text-muted-foreground mb-4">
                ابدأ بإنشاء حملتك التسويقية الأولى
              </p>
              <Button onClick={() => setLocation('/merchant/campaigns/new')}>
                <Plus className="w-4 h-4 ml-2" />
                إنشاء حملة جديدة
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
