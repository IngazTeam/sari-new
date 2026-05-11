import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useRoute, useLocation } from 'wouter';
import { 
  ArrowLeft, 
  Store, 
  Phone, 
  Calendar, 
  CreditCard, 
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  CalendarPlus,
  Ban,
  Zap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { toast } from 'sonner';

export default function MerchantDetails() {
  const { t } = useTranslation();
  const [, params] = useRoute('/admin/merchants/:id');
  const [, setLocation] = useLocation();
  const merchantId = params?.id ? parseInt(params.id) : 0;

  // State for subscription management
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [durationDays, setDurationDays] = useState(30);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [extendDays, setExtendDays] = useState(30);
  const [showExtendForm, setShowExtendForm] = useState(false);

  const { data: merchant, isLoading: merchantLoading } = trpc.merchants.getById.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  const { data: subscriptions = [], refetch: refetchSubs } = trpc.merchants.getSubscriptions.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  const { data: campaigns = [] } = trpc.merchants.getCampaigns.useQuery(
    { merchantId },
    { enabled: merchantId > 0 }
  );

  const { data: plans = [] } = trpc.merchants.getAvailablePlans.useQuery(
    undefined,
    { enabled: showAssignForm }
  );

  const utils = trpc.useUtils();

  const assignMutation = trpc.merchants.assignSubscription.useMutation({
    onSuccess: (data) => {
      toast.success(`تم تفعيل الاشتراك — ${data.planName}`);
      setShowAssignForm(false);
      setSelectedPlanId('');
      refetchSubs();
      utils.merchants.getById.invalidate({ merchantId });
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تفعيل الاشتراك');
    },
  });

  const extendMutation = trpc.merchants.extendSubscription.useMutation({
    onSuccess: (data) => {
      toast.success(`تم تمديد الاشتراك حتى ${new Date(data.newEndDate).toLocaleDateString('ar-SA')}`);
      setShowExtendForm(false);
      refetchSubs();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تمديد الاشتراك');
    },
  });

  const cancelMutation = trpc.merchants.cancelMerchantSubscription.useMutation({
    onSuccess: () => {
      toast.success('تم إلغاء الاشتراك');
      refetchSubs();
      utils.merchants.getById.invalidate({ merchantId });
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إلغاء الاشتراك');
    },
  });

  if (merchantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">{t('adminMerchantDetailsPage.text0')}</p>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <XCircle className="w-16 h-16 text-muted-foreground" />
        <p className="text-lg font-medium">{t('adminMerchantDetailsPage.text1')}</p>
        <Button onClick={() => setLocation('/admin/merchants')}>
          العودة إلى قائمة التجار
        </Button>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700">{t('adminMerchantDetailsPage.text2')}</Badge>;
      case 'suspended':
        return <Badge className="bg-red-100 text-red-700">{t('adminMerchantDetailsPage.text3')}</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700">{t('adminMerchantDetailsPage.text4')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCampaignStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700">{t('adminMerchantDetailsPage.text5')}</Badge>;
      case 'sending':
        return <Badge className="bg-primary/20 text-primary">{t('adminMerchantDetailsPage.text6')}</Badge>;
      case 'draft':
        return <Badge className="bg-gray-100 text-gray-700">{t('adminMerchantDetailsPage.text7')}</Badge>;
      case 'scheduled':
        return <Badge className="bg-yellow-100 text-yellow-700">{t('adminMerchantDetailsPage.text8')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const hasActiveSubscription = subscriptions.length > 0 && subscriptions[0]?.status === 'active';

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
            <CardTitle>{t('adminMerchantDetailsPage.text10')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Store className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text11')}</p>
                <p className="font-medium">{merchant.businessName}</p>
              </div>
            </div>

            {merchant.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text12')}</p>
                  <p className="font-medium">{merchant.phone}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text13')}</p>
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

        {/* Subscription Info + Admin Actions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('adminMerchantDetailsPage.text14')}</CardTitle>
            <div className="flex gap-2">
              {!hasActiveSubscription ? (
                <Button
                  size="sm"
                  onClick={() => setShowAssignForm(!showAssignForm)}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  تفعيل اشتراك
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowExtendForm(!showExtendForm)}
                    className="gap-1"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    تمديد
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm('هل أنت متأكد من إلغاء اشتراك هذا التاجر؟')) {
                        cancelMutation.mutate({ merchantId });
                      }
                    }}
                    disabled={cancelMutation.isPending}
                    className="gap-1"
                  >
                    <Ban className="h-4 w-4" />
                    إلغاء
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Assign Subscription Form */}
            {showAssignForm && (
              <div className="p-4 border rounded-lg bg-primary/5 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <p className="font-medium text-sm">تفعيل اشتراك جديد</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">الباقة</label>
                  <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الباقة" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan: any) => (
                        <SelectItem key={plan.id} value={plan.id.toString()}>
                          {plan.name} — {plan.monthlyPrice} ر.س/شهر
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">المدة (أيام)</label>
                    <Input
                      type="number"
                      value={durationDays}
                      onChange={(e) => setDurationDays(parseInt(e.target.value) || 30)}
                      min={1}
                      max={730}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">دورة الفوترة</label>
                    <Select value={billingCycle} onValueChange={(v: any) => setBillingCycle(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">شهري</SelectItem>
                        <SelectItem value="yearly">سنوي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!selectedPlanId) {
                        toast.error('اختر الباقة أولاً');
                        return;
                      }
                      assignMutation.mutate({
                        merchantId,
                        planId: parseInt(selectedPlanId),
                        durationDays,
                        billingCycle,
                      });
                    }}
                    disabled={assignMutation.isPending || !selectedPlanId}
                  >
                    {assignMutation.isPending ? 'جاري التفعيل...' : 'تفعيل الاشتراك'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAssignForm(false)}>
                    إلغاء
                  </Button>
                </div>
              </div>
            )}

            {/* Extend Subscription Form */}
            {showExtendForm && hasActiveSubscription && (
              <div className="p-4 border rounded-lg bg-blue-50 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarPlus className="h-4 w-4 text-blue-600" />
                  <p className="font-medium text-sm">تمديد الاشتراك</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">عدد الأيام الإضافية</label>
                  <Input
                    type="number"
                    value={extendDays}
                    onChange={(e) => setExtendDays(parseInt(e.target.value) || 30)}
                    min={1}
                    max={365}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => extendMutation.mutate({ merchantId, extraDays: extendDays })}
                    disabled={extendMutation.isPending}
                  >
                    {extendMutation.isPending ? 'جاري التمديد...' : `تمديد ${extendDays} يوم`}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowExtendForm(false)}>
                    إلغاء
                  </Button>
                </div>
              </div>
            )}

            {/* Subscription Details */}
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text15')}</p>
                <p className="font-medium">
                  {subscriptions.length > 0 && subscriptions[0]?.planId
                    ? (subscriptions[0] as any).planName || `الباقة #${subscriptions[0].planId}`
                    : 'لا يوجد'}
                </p>
              </div>
            </div>

            {subscriptions.length > 0 && subscriptions[0] && (
              <>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text16')}</p>
                    <p className="font-medium">
                      {new Date(subscriptions[0].startDate).toLocaleDateString('ar-SA')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text17')}</p>
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
                    <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text18')}</p>
                    <p className="font-medium">
                      {subscriptions[0].status === 'active' ? 'نشط' : 
                       subscriptions[0].status === 'expired' ? 'منتهي' : 
                       subscriptions[0].status === 'cancelled' ? 'ملغي' : subscriptions[0].status}
                    </p>
                  </div>
                </div>
              </>
            )}

            {subscriptions.length === 0 && !showAssignForm && (
              <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text19')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminMerchantDetailsPage.text20')}</CardTitle>
          <CardDescription>
            {subscriptions.length > 0 && subscriptions[0]?.endDate
              ? `${t('adminMerchantDetailsPage.text21')} ${new Date(subscriptions[0].endDate).toLocaleDateString('ar-SA')}`
              : t('adminMerchantDetailsPage.text21')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-primary/10 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text22')}</p>
                  <p className="text-2xl font-bold text-primary">{campaigns.length}</p>
                </div>
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text23')}</p>
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
                  <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text24')}</p>
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
          <CardTitle>{t('adminMerchantDetailsPage.text25')}</CardTitle>
          <CardDescription>{t('adminMerchantDetailsPage.text26')}</CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('adminMerchantDetailsPage.text27')}</TableHead>
                    <TableHead>{t('adminMerchantDetailsPage.text28')}</TableHead>
                    <TableHead>{t('adminMerchantDetailsPage.text29')}</TableHead>
                    <TableHead>{t('adminMerchantDetailsPage.text30')}</TableHead>
                    <TableHead>{t('adminMerchantDetailsPage.text31')}</TableHead>
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
              <p className="mt-4 text-lg font-medium">{t('adminMerchantDetailsPage.text32')}</p>
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
