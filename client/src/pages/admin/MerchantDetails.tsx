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
  Mail,
  Calendar, 
  CreditCard, 
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  CalendarPlus,
  Ban,
  Zap,
  Pencil,
  Save,
  X,
  KeyRound,
  User
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

  // State for edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');

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

  const adminUpdateMutation = trpc.merchants.adminUpdate.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث بيانات التاجر بنجاح');
      setIsEditing(false);
      utils.merchants.getById.invalidate({ merchantId });
      utils.merchants.list.invalidate();
    },
    onError: (error) => toast.error(error.message || 'فشل تحديث البيانات'),
  });

  const adminResetPasswordMutation = trpc.merchants.adminResetPassword.useMutation({
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور بنجاح');
      setShowPasswordReset(false);
      setNewPassword('');
    },
    onError: (error) => toast.error(error.message || 'فشل تغيير كلمة المرور'),
  });

  const startEditing = () => {
    if (!merchant) return;
    setEditBusinessName(merchant.businessName || '');
    setEditName((merchant as any).userName || '');
    setEditEmail((merchant as any).email || '');
    setEditPhone(merchant.phone || '');
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    adminUpdateMutation.mutate({
      merchantId,
      businessName: editBusinessName || undefined,
      name: editName || undefined,
      email: editEmail || undefined,
      phone: editPhone || undefined,
    });
  };

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
      // Force hard refetch — invalidate all cached subscription data
      utils.merchants.getSubscriptions.invalidate({ merchantId });
      utils.merchants.getById.invalidate({ merchantId });
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('adminMerchantDetailsPage.text10')}</CardTitle>
            <div className="flex gap-2">
              {!isEditing ? (
                <Button size="sm" variant="outline" onClick={startEditing} className="gap-1">
                  <Pencil className="h-4 w-4" /> تعديل
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={handleSaveEdit} disabled={adminUpdateMutation.isPending} className="gap-1">
                    <Save className="h-4 w-4" /> {adminUpdateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="gap-1">
                    <X className="h-4 w-4" /> إلغاء
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground flex items-center gap-1"><User className="h-3.5 w-3.5" /> اسم المستخدم</label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="اسم المستخدم" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground flex items-center gap-1"><Store className="h-3.5 w-3.5" /> اسم المتجر</label>
                  <Input value={editBusinessName} onChange={(e) => setEditBusinessName(e.target.value)} placeholder="اسم المتجر" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> الإيميل</label>
                  <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="البريد الإلكتروني" dir="ltr" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> رقم الهاتف</label>
                  <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="رقم الهاتف" dir="ltr" />
                </div>
              </div>
            ) : (
              <>
                {(merchant as any).userName && (
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">اسم المستخدم</p>
                      <p className="font-medium">{(merchant as any).userName}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('adminMerchantDetailsPage.text11')}</p>
                    <p className="font-medium">{merchant.businessName}</p>
                  </div>
                </div>
                {(merchant as any).email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">الإيميل</p>
                      <p className="font-medium" dir="ltr">{(merchant as any).email}</p>
                    </div>
                  </div>
                )}
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
                      {new Date(merchant.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Password Reset */}
            <div className="border-t pt-3 mt-3">
              {!showPasswordReset ? (
                <Button size="sm" variant="outline" onClick={() => setShowPasswordReset(true)} className="gap-1 w-full">
                  <KeyRound className="h-4 w-4" /> تغيير كلمة المرور
                </Button>
              ) : (
                <div className="space-y-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <label className="text-sm font-medium flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" /> كلمة المرور الجديدة</label>
                  <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="أدخل كلمة المرور الجديدة" dir="ltr" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { if (newPassword.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; } adminResetPasswordMutation.mutate({ merchantId, newPassword }); }} disabled={adminResetPasswordMutation.isPending}>
                      {adminResetPasswordMutation.isPending ? 'جاري التغيير...' : 'تأكيد التغيير'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowPasswordReset(false); setNewPassword(''); }}>إلغاء</Button>
                  </div>
                </div>
              )}
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
                  <Plus className="h-4 w-4" />{t('merchantDetails.auto_0')}</Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowExtendForm(!showExtendForm)}
                    className="gap-1"
                  >
                    <CalendarPlus className="h-4 w-4" />{t('merchantDetails.auto_1')}</Button>
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
                    <Ban className="h-4 w-4" />{t('merchantDetails.auto_2')}</Button>
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
                  <p className="font-medium text-sm">{t('merchantDetails.auto_3')}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">{t('merchantDetails.auto_4')}</label>
                  <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('merchantDetails.auto_12')} />
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
                    <label className="text-sm text-muted-foreground">{t('merchantDetails.auto_5')}</label>
                    <Input
                      type="number"
                      value={durationDays}
                      onChange={(e) => setDurationDays(parseInt(e.target.value) || 30)}
                      min={1}
                      max={730}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">{t('merchantDetails.auto_6')}</label>
                    <Select value={billingCycle} onValueChange={(v: any) => setBillingCycle(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">{t('merchantDetails.auto_7')}</SelectItem>
                        <SelectItem value="yearly">{t('merchantDetails.auto_8')}</SelectItem>
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
                  <p className="font-medium text-sm">{t('merchantDetails.auto_9')}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">{t('merchantDetails.auto_10')}</label>
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
              <p className="text-sm text-muted-foreground mt-1">{t('merchantDetails.auto_11')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
