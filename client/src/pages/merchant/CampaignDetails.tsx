import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Send, Calendar, Users, CheckCircle, XCircle } from 'lucide-react';
import { useLocation, useRoute } from 'wouter';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
export default function CampaignDetails() {
  const { t } = useTranslation();

  const [, params] = useRoute('/merchant/campaigns/:id');
  const [, setLocation] = useLocation();
  const campaignId = params?.id ? parseInt(params.id) : 0;

  const { data: campaign, isLoading, refetch } = trpc.campaigns.getById.useQuery({ id: campaignId });

  const sendMutation = trpc.campaigns.send.useMutation({
    onSuccess: () => {
      toast.success(t('toast.campaigns.msg5'));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إرسال الحملة');
    },
  });

  const handleSend = async () => {
    if (confirm('هل أنت متأكد من إرسال هذه الحملة؟ لا يمكن التراجع عن هذا الإجراء.')) {
      await sendMutation.mutateAsync({ id: campaignId });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      draft: { label: 'مسودة', variant: 'secondary' as const, icon: null },
      scheduled: { label: 'مجدول', variant: 'default' as const, icon: <Calendar className="w-3 h-3 ml-1" /> },
      sending: { label: 'جاري الإرسال', variant: 'default' as const, icon: <Send className="w-3 h-3 ml-1" /> },
      completed: { label: 'مكتمل', variant: 'default' as const, icon: <CheckCircle className="w-3 h-3 ml-1" /> },
      failed: { label: 'فشل', variant: 'destructive' as const, icon: <XCircle className="w-3 h-3 ml-1" /> },
    };

    const config = statusMap[status as keyof typeof statusMap] || statusMap.draft;
    return (
      <Badge variant={config.variant} className="flex items-center w-fit">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">الحملة غير موجودة</h3>
        <Button onClick={() => setLocation('/merchant/campaigns')}>
          <ArrowRight className="w-4 h-4 ml-2" />
          العودة للحملات
        </Button>
      </div>
    );
  }

  // Parse recipients
  let recipients: string[] = [];
  try {
    if (campaign.targetAudience) {
      recipients = JSON.parse(campaign.targetAudience);
    }
  } catch (error) {
    console.error('Failed to parse recipients:', error);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/merchant/campaigns')}
          >
            <ArrowRight className="w-4 h-4 ml-2" />
            العودة
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{campaign.name}</h1>
            <p className="text-muted-foreground mt-2">
              تفاصيل الحملة التسويقية
            </p>
          </div>
        </div>
        {campaign.status === 'draft' && (
          <Button onClick={handleSend} disabled={sendMutation.isPending}>
            <Send className="w-4 h-4 ml-2" />
            إرسال الحملة الآن
          </Button>
        )}
      </div>

      {/* Status and Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              الحالة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getStatusBadge(campaign.status)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي المستلمين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center">
              <Users className="w-5 h-5 ml-2 text-muted-foreground" />
              {campaign.totalRecipients || recipients.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              تم الإرسال
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {campaign.sentCount || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              تاريخ الإنشاء
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {new Date(campaign.createdAt).toLocaleDateString('ar-SA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Details */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Message Content */}
        <Card>
          <CardHeader>
            <CardTitle>محتوى الرسالة</CardTitle>
            <CardDescription>
              الرسالة التي سيتم إرسالها للعملاء
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap">
              {campaign.message}
            </div>
          </CardContent>
        </Card>

        {/* Image Preview */}
        {campaign.imageUrl && (
          <Card>
            <CardHeader>
              <CardTitle>الصورة المرفقة</CardTitle>
              <CardDescription>
                الصورة التي سيتم إرسالها مع الرسالة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <img
                src={campaign.imageUrl}
                alt="Campaign"
                className="w-full rounded-lg border"
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recipients List */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة المستلمين</CardTitle>
          <CardDescription>
            أرقام الهواتف التي سيتم إرسال الحملة لها ({recipients.length} مستلم)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recipients.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-3">
              {recipients.map((phone, index) => (
                <div
                  key={index}
                  className="bg-muted p-3 rounded-lg text-center font-mono"
                >
                  {phone}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد أرقام مستلمين
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
