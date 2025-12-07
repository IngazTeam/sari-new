import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Gift, TrendingUp, Send, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
// Occasion names in Arabic
const OCCASION_NAMES: Record<string, string> = {
  ramadan: 'رمضان المبارك',
  eid_fitr: 'عيد الفطر المبارك',
  eid_adha: 'عيد الأضحى المبارك',
  national_day: 'اليوم الوطني السعودي',
  new_year: 'رأس السنة الميلادية',
  hijri_new_year: 'رأس السنة الهجرية',
};

// Occasion emojis
const OCCASION_EMOJIS: Record<string, string> = {
  ramadan: '🌙',
  eid_fitr: '🎉',
  eid_adha: '🐑',
  national_day: '🇸🇦',
  new_year: '🎊',
  hijri_new_year: '🌟',
};

export default function OccasionCampaignsPage() {
  const { t } = useTranslation();

  const { user } = useAuth();

  // Get merchant
  const { data: merchant } = trpc.merchants.getCurrent.useQuery();

  // Get occasion campaigns
  const { data: campaigns = [], refetch: refetchCampaigns } = trpc.occasionCampaigns.list.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get statistics
  const { data: stats } = trpc.occasionCampaigns.getStats.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get upcoming occasions
  const { data: upcomingOccasions = [] } = trpc.occasionCampaigns.getUpcoming.useQuery();

  // Toggle mutation
  const toggleMutation = trpc.occasionCampaigns.toggle.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg1'));
      refetchCampaigns();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleToggle = (campaignId: number, enabled: boolean) => {
    toggleMutation.mutate({ campaignId, enabled });
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="h-3 w-3 ml-1" />
            تم الإرسال
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 ml-1" />
            قيد الانتظار
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            فشل
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">حملات المناسبات التلقائية</h1>
        <p className="text-muted-foreground">
          أرسل عروضاً خاصة تلقائياً في المناسبات المهمة مع كودات خصم محدودة
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الحملات</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCampaigns || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الحملات المرسلة</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.sentCampaigns || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المستلمين</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRecipients || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Occasions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            المناسبات القادمة (30 يوم)
          </CardTitle>
          <CardDescription>
            سيتم إرسال الحملات تلقائياً في هذه المناسبات إذا كانت مفعّلة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingOccasions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>لا توجد مناسبات قادمة في الـ 30 يوم القادمة</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingOccasions.map((occasion) => (
                <Card key={occasion.type} className="border-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span className="text-2xl">{OCCASION_EMOJIS[occasion.type]}</span>
                      {occasion.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">التاريخ:</span>
                        <span className="font-medium">{formatDate(new Date(occasion.date))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">بعد:</span>
                        <Badge variant="outline">{occasion.daysUntil} يوم</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaigns History */}
      <Card>
        <CardHeader>
          <CardTitle>سجل الحملات</CardTitle>
          <CardDescription>
            عرض جميع حملات المناسبات السابقة والمستقبلية
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Gift className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>لم يتم إرسال أي حملات بعد</p>
              <p className="text-sm mt-2">سيتم إنشاء الحملات تلقائياً عند حلول المناسبات</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المناسبة</TableHead>
                  <TableHead>السنة</TableHead>
                  <TableHead>نسبة الخصم</TableHead>
                  <TableHead>كود الخصم</TableHead>
                  <TableHead>عدد المستلمين</TableHead>
                  <TableHead>تاريخ الإرسال</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>مفعّلة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{OCCASION_EMOJIS[campaign.occasionType]}</span>
                        {OCCASION_NAMES[campaign.occasionType]}
                      </div>
                    </TableCell>
                    <TableCell>{campaign.year}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{campaign.discountPercentage}%</Badge>
                    </TableCell>
                    <TableCell>
                      {campaign.discountCode ? (
                        <code className="bg-muted px-2 py-1 rounded text-sm">
                          {campaign.discountCode}
                        </code>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{campaign.recipientCount}</TableCell>
                    <TableCell className="text-sm">{formatDate(campaign.sentAt)}</TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={campaign.enabled}
                        onCheckedChange={(checked) => handleToggle(campaign.id, checked)}
                        disabled={campaign.status === 'sent' || toggleMutation.isPending}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* How It Works Section */}
      <Card>
        <CardHeader>
          <CardTitle>كيف يعمل النظام؟</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary/20 text-primary rounded-full p-2 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">كشف تلقائي للمناسبات</p>
              <p className="text-sm text-muted-foreground">
                يتحقق النظام يومياً من المناسبات الحالية (رمضان، العيد، اليوم الوطني، إلخ)
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-primary/20 text-primary rounded-full p-2 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">إنشاء كود خصم تلقائي</p>
              <p className="text-sm text-muted-foreground">
                يتم إنشاء كود خصم حصري لكل مناسبة بنسبة خصم محددة (15%-25%)
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-primary/20 text-primary rounded-full p-2 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">إرسال رسائل احترافية</p>
              <p className="text-sm text-muted-foreground">
                يتم إرسال رسالة تهنئة مع العرض الخاص لجميع عملائك عبر الواتساب
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-primary/20 text-primary rounded-full p-2 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">تحكم كامل</p>
              <p className="text-sm text-muted-foreground">
                يمكنك تفعيل أو تعطيل الحملات في أي وقت حسب رغبتك
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips Section */}
      <Card className="border-primary/30 bg-primary/10/50">
        <CardHeader>
          <CardTitle className="text-primary">💡 نصائح لزيادة المبيعات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-primary">
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <p className="text-sm">
              <strong>استعد مبكراً:</strong> تأكد من تحديث منتجاتك وأسعارك قبل المناسبات بأسبوع
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <p className="text-sm">
              <strong>خصومات جذابة:</strong> نسبة الخصم الموصى بها: 20% لرمضان، 25% للعيد، 23% لليوم الوطني
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <p className="text-sm">
              <strong>تابع الأداء:</strong> راقب عدد المستلمين واستخدام كودات الخصم لتحسين الحملات المستقبلية
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <p className="text-sm">
              <strong>رد سريع:</strong> كن مستعداً للرد على استفسارات العملاء بسرعة خلال المناسبات
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
