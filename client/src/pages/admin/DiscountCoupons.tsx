import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, ToggleLeft, ToggleRight, TrendingUp, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function DiscountCoupons() {
  const { t } = useTranslation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);

  const { data: coupons, isLoading, refetch } = trpc.coupons.list.useQuery();
  const createCoupon = trpc.coupons.create.useMutation();
  const updateCoupon = trpc.coupons.update.useMutation();
  const deactivateCoupon = trpc.coupons.deactivate.useMutation();

  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: '',
    minPurchaseAmount: '',
    maxDiscountAmount: '',
    validFrom: '',
    validUntil: '',
    maxUsageCount: '',
    maxUsagePerMerchant: '1',
  });

  const resetForm = () => {
    setFormData({
      code: '',
      description: '',
      discountType: 'percentage',
      discountValue: '',
      minPurchaseAmount: '',
      maxDiscountAmount: '',
      validFrom: '',
      validUntil: '',
      maxUsageCount: '',
      maxUsagePerMerchant: '1',
    });
    setEditingCoupon(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const data = {
        code: formData.code.toUpperCase(),
        description: formData.description || undefined,
        discountType: formData.discountType,
        discountValue: parseFloat(formData.discountValue),
        minPurchaseAmount: formData.minPurchaseAmount ? parseFloat(formData.minPurchaseAmount) : undefined,
        maxDiscountAmount: formData.maxDiscountAmount ? parseFloat(formData.maxDiscountAmount) : undefined,
        validFrom: new Date(formData.validFrom),
        validUntil: new Date(formData.validUntil),
        maxUsageCount: formData.maxUsageCount ? parseInt(formData.maxUsageCount) : undefined,
        maxUsagePerMerchant: parseInt(formData.maxUsagePerMerchant),
      };

      if (editingCoupon) {
        await updateCoupon.mutateAsync({ id: editingCoupon.id, ...data });
        toast.success(t('adminDiscountCouponsPage.text32'));
      } else {
        await createCoupon.mutateAsync(data);
        toast.success(t('adminDiscountCouponsPage.text33'));
      }

      refetch();
      setIsCreateDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'فشلت العملية');
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!confirm(t('adminDiscountCouponsPage.text34'))) return;

    try {
      await deactivateCoupon.mutateAsync({ id });
      toast.success(t('adminDiscountCouponsPage.text35'));
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'فشل تعطيل الكوبون');
    }
  };

  const handleEdit = (coupon: any) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || '',
      discountType: coupon.discountType,
      discountValue: coupon.discountValue.toString(),
      minPurchaseAmount: coupon.minPurchaseAmount?.toString() || '',
      maxDiscountAmount: coupon.maxDiscountAmount?.toString() || '',
      validFrom: new Date(coupon.validFrom).toISOString().substring(0, 16),
      validUntil: new Date(coupon.validUntil).toISOString().substring(0, 16),
      maxUsageCount: coupon.maxUsageCount?.toString() || '',
      maxUsagePerMerchant: coupon.maxUsagePerMerchant.toString(),
    });
    setIsCreateDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('adminDiscountCouponsPage.text0')}</h1>
          <p className="text-muted-foreground mt-1">{t('adminDiscountCouponsPage.text1')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              إنشاء كوبون جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('adminDiscountCouponsPage.text2', { var0: editingCoupon ? 'تعديل الكوبون' : 'إنشاء كوبون جديد' })}</DialogTitle>
              <DialogDescription>
                أدخل تفاصيل الكوبون. سيتم تطبيقه على جميع الباقات.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">{t('adminDiscountCouponsPage.text3')}</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="SUMMER2024"
                    required
                    disabled={!!editingCoupon}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discountType">{t('adminDiscountCouponsPage.text4')}</Label>
                  <Select
                    value={formData.discountType}
                    onValueChange={(value: 'percentage' | 'fixed') =>
                      setFormData({ ...formData, discountType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">{t('adminDiscountCouponsPage.text5')}</SelectItem>
                      <SelectItem value="fixed">{t('adminDiscountCouponsPage.text6')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('adminDiscountCouponsPage.text7')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('adminDiscountCouponsPage.text8')}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discountValue">
                    قيمة الخصم * {formData.discountType === 'percentage' ? '(%)' : '(ريال)'}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    step="0.01"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder={formData.discountType === 'percentage' ? '20' : '100'}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minPurchaseAmount">{t('adminDiscountCouponsPage.text9')}</Label>
                  <Input
                    id="minPurchaseAmount"
                    type="number"
                    step="0.01"
                    value={formData.minPurchaseAmount}
                    onChange={(e) => setFormData({ ...formData, minPurchaseAmount: e.target.value })}
                    placeholder="0"
                  />
                </div>

                {formData.discountType === 'percentage' && (
                  <div className="space-y-2">
                    <Label htmlFor="maxDiscountAmount">{t('adminDiscountCouponsPage.text10')}</Label>
                    <Input
                      id="maxDiscountAmount"
                      type="number"
                      step="0.01"
                      value={formData.maxDiscountAmount}
                      onChange={(e) => setFormData({ ...formData, maxDiscountAmount: e.target.value })}
                      placeholder="500"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="validFrom">{t('adminDiscountCouponsPage.text11')}</Label>
                  <Input
                    id="validFrom"
                    type="datetime-local"
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="validUntil">{t('adminDiscountCouponsPage.text12')}</Label>
                  <Input
                    id="validUntil"
                    type="datetime-local"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxUsageCount">{t('adminDiscountCouponsPage.text13')}</Label>
                  <Input
                    id="maxUsageCount"
                    type="number"
                    value={formData.maxUsageCount}
                    onChange={(e) => setFormData({ ...formData, maxUsageCount: e.target.value })}
                    placeholder={t('adminDiscountCouponsPage.text14')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxUsagePerMerchant">{t('adminDiscountCouponsPage.text15')}</Label>
                  <Input
                    id="maxUsagePerMerchant"
                    type="number"
                    value={formData.maxUsagePerMerchant}
                    onChange={(e) => setFormData({ ...formData, maxUsagePerMerchant: e.target.value })}
                    required
                    min="1"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={createCoupon.isPending || updateCoupon.isPending}>
                  {createCoupon.isPending || updateCoupon.isPending ? 'جاري الحفظ...' : editingCoupon ? 'تحديث' : 'إنشاء'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Coupons Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminDiscountCouponsPage.text16')}</CardTitle>
          <CardDescription>{t('adminDiscountCouponsPage.text17')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!coupons || coupons.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">{t('adminDiscountCouponsPage.text18')}</p>
              <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="ml-2 h-4 w-4" />
                إنشاء أول كوبون
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('adminDiscountCouponsPage.text19')}</TableHead>
                  <TableHead>{t('adminDiscountCouponsPage.text20')}</TableHead>
                  <TableHead>{t('adminDiscountCouponsPage.text21')}</TableHead>
                  <TableHead>{t('adminDiscountCouponsPage.text22')}</TableHead>
                  <TableHead>{t('adminDiscountCouponsPage.text23')}</TableHead>
                  <TableHead>{t('adminDiscountCouponsPage.text24')}</TableHead>
                  <TableHead>{t('adminDiscountCouponsPage.text25')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon: any) => {
                  const now = new Date();
                  const isExpired = new Date(coupon.validUntil) < now;
                  const isNotStarted = new Date(coupon.validFrom) > now;
                  const isMaxedOut = coupon.maxUsageCount && coupon.currentUsageCount >= coupon.maxUsageCount;

                  return (
                    <TableRow key={coupon.id}>
                      <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                      <TableCell>
                        {coupon.discountType === 'percentage' ? 'نسبة مئوية' : 'مبلغ ثابت'}
                      </TableCell>
                      <TableCell>
                        {coupon.discountType === 'percentage'
                          ? `${coupon.discountValue}%`
                          : t('adminDiscountCouponsPage.text26', { var0: coupon.discountValue })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          {new Date(coupon.validFrom).toLocaleDateString('ar-SA')} -{' '}
                          {new Date(coupon.validUntil).toLocaleDateString('ar-SA')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {coupon.currentUsageCount} / {coupon.maxUsageCount || '∞'}
                      </TableCell>
                      <TableCell>
                        {!coupon.isActive ? (
                          <Badge variant="outline">{t('adminDiscountCouponsPage.text27')}</Badge>
                        ) : isExpired ? (
                          <Badge variant="destructive">{t('adminDiscountCouponsPage.text28')}</Badge>
                        ) : isNotStarted ? (
                          <Badge variant="secondary">{t('adminDiscountCouponsPage.text29')}</Badge>
                        ) : isMaxedOut ? (
                          <Badge variant="outline">{t('adminDiscountCouponsPage.text30')}</Badge>
                        ) : (
                          <Badge variant="default">{t('adminDiscountCouponsPage.text31')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(coupon)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {coupon.isActive ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeactivate(coupon.id)}
                            >
                              <ToggleRight className="h-4 w-4 text-red-500" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" disabled>
                              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
