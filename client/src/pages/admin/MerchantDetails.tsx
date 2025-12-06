import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRoute, useLocation } from 'wouter';
import { 
  ArrowLeft, 
  Store, 
  Phone, 
  Mail, 
  Calendar, 
  CreditCard, 
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

export default function MerchantDetails() {
  const [, params] = useRoute('/admin/merchants/:id');
  const [, setLocation] = useLocation();
  const merchantId = params?.id ? parseInt(params.id) : 0;

  const { data: merchant, isLoading: merchantLoading } = trpc.merchants.getById.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  const { data: subscriptions = [] } = trpc.merchants.getSubscriptions.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  const { data: campaigns = [] } = trpc.merchants.getCampaigns.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  if (merchantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">جاري التحميل...</p>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <XCircle className="w-16 h-16 text-muted-foreground" />
        <p className="text-lg font-medium">التاجر غير موجود</p>
        <Button onClick={() => setLocation('/admin/merchants')}>
          العودة إلى قائمة التجار
        </Button>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700">نشط</Badge>;
      case 'suspended':
        return <Badge className="bg-red-100 text-red-700">معلق</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700">قيد المراجعة</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCampaignStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700">مكتمل</Badge>;
      case 'sending':
        return <Badge className="bg-blue-100 text-blue-700">جاري الإرسال</Badge>;
      case 'draft':
        return <Badge className="bg-gray-100 text-gray-700">مسودة</Badge>;
      case 'scheduled':
        return <Badge className="bg-yellow-100 text-yellow-700">مجدول</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlanName = (planId: number | null) => {
    if (!planId) return 'لا يوجد';
    switch (planId) {
      case 1:
        return 'Starter (B1) - 90 ريال';
      case 2:
        return 'Growth (B2) - 230 ريال';
      case 3:
        return 'Pro (B3) - 845 ريال';
      default:
        return `باقة ${planId}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation('/admin/merchants')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{merchant.businessName}</h1>
            <p className="text-muted-foreground mt-1">
              معرف التاجر: {merchant.id}
            </p>
          </div>
        </div>
        {getStatusBadge(merchant.status)}
      </div>

      {/* Merchant Info */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>المعلومات الأساسية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Store className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">اسم المتجر</p>
                <p className="font-medium">{merchant.businessName}</p>
              </div>
            </div>

            {merchant.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">رقم الهاتف</p>
                  <p className="font-medium">{merchant.phone}</p>
                </div>
              </div>
            )}



            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">تاريخ التسجيل</p>
                <p className="font-medium">
                  {new Date(merchant.createdAt).toLocaleDateString('ar-SA', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Info */}
        <Card>
          <CardHeader>
            <CardTitle>معلومات الاشتراك</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">الباقة الحالية</p>
                <p className="font-medium">{getPlanName(null)}</p>
              </div>
            </div>

            {subscriptions.length > 0 && subscriptions[0] && (
              <>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">تاريخ بدء الاشتراك</p>
                    <p className="font-medium">
                      {new Date(subscriptions[0].startDate).toLocaleDateString('ar-SA')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">تاريخ انتهاء الاشتراك</p>
                    <p className="font-medium">
                      {new Date(subscriptions[0].endDate).toLocaleDateString('ar-SA')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {subscriptions[0].status === 'active' ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">حالة الاشتراك</p>
                    <p className="font-medium">
                      {subscriptions[0].status === 'active' ? 'نشط' : 
                       subscriptions[0].status === 'expired' ? 'منتهي' : 
                       subscriptions[0].status === 'cancelled' ? 'ملغي' : subscriptions[0].status}
                    </p>
                  </div>
                </div>
              </>
            )}

            {subscriptions.length === 0 && (
              <p className="text-sm text-muted-foreground">لا يوجد اشتراك نشط</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <CardTitle>إحصائيات الاستخدام</CardTitle>
          <CardDescription>نظرة عامة على نشاط التاجر</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي الحملات</p>
                  <p className="text-2xl font-bold text-blue-700">{campaigns.length}</p>
                </div>
                <MessageSquare className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الحملات المكتملة</p>
                  <p className="text-2xl font-bold text-green-700">
                    {campaigns.filter((c: any) => c.status === 'completed').length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>

            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الحملات الجارية</p>
                  <p className="text-2xl font-bold text-yellow-700">
                    {campaigns.filter((c: any) => c.status === 'sending' || c.status === 'scheduled').length}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>الحملات التسويقية</CardTitle>
          <CardDescription>جميع الحملات التي أنشأها التاجر</CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اسم الحملة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>المستلمون</TableHead>
                    <TableHead>تم الإرسال</TableHead>
                    <TableHead>تاريخ الإنشاء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign: any) => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>{getCampaignStatusBadge(campaign.status)}</TableCell>
                      <TableCell>{campaign.totalRecipients || 0}</TableCell>
                      <TableCell>{campaign.sentCount || 0}</TableCell>
                      <TableCell>
                        {new Date(campaign.createdAt).toLocaleDateString('ar-SA')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium">لا توجد حملات بعد</p>
              <p className="text-sm text-muted-foreground mt-1">
                لم يقم التاجر بإنشاء أي حملات تسويقية حتى الآن
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
