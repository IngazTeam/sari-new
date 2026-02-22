import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function SubscriptionPlans() {
  const { t } = useTranslation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);

  const { data: plans, isLoading, refetch } = trpc.subscriptionPlans.adminListPlans.useQuery();
  const createPlan = trpc.subscriptionPlans.createPlan.useMutation();
  const updatePlan = trpc.subscriptionPlans.updatePlan.useMutation();
  const deletePlan = trpc.subscriptionPlans.deletePlan.useMutation();
  const toggleStatus = trpc.subscriptionPlans.togglePlanStatus.useMutation();

  const [formData, setFormData] = useState({
    name: '',
    nameEn: '',
    description: '',
    descriptionEn: '',
    monthlyPrice: '',
    yearlyPrice: '',
    maxCustomers: '',
    maxWhatsAppNumbers: '1',
    features: '',
    isActive: 1,
  });

  const handleCreate = async () => {
    try {
      await createPlan.mutateAsync({
        ...formData,
        maxCustomers: parseInt(formData.maxCustomers),
        maxWhatsAppNumbers: parseInt(formData.maxWhatsAppNumbers),
      });
      toast.success(t('adminSubscriptionPlansPage.text31'));
      setIsCreateDialogOpen(false);
      refetch();
      resetForm();
    } catch (error) {
      toast.error(t('adminSubscriptionPlansPage.text32'));
    }
  };

  const handleUpdate = async () => {
    if (!selectedPlan) return;
    try {
      await updatePlan.mutateAsync({
        id: selectedPlan.id,
        ...formData,
        maxCustomers: formData.maxCustomers ? parseInt(formData.maxCustomers) : undefined,
        maxWhatsAppNumbers: formData.maxWhatsAppNumbers ? parseInt(formData.maxWhatsAppNumbers) : undefined,
      });
      toast.success(t('adminSubscriptionPlansPage.text33'));
      setIsEditDialogOpen(false);
      refetch();
      resetForm();
    } catch (error) {
      toast.error(t('adminSubscriptionPlansPage.text34'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('adminSubscriptionPlansPage.text35'))) return;
    try {
      await deletePlan.mutateAsync({ id });
      toast.success(t('adminSubscriptionPlansPage.text36'));
      refetch();
    } catch (error) {
      toast.error(t('adminSubscriptionPlansPage.text37'));
    }
  };

  const handleToggleStatus = async (id: number, isActive: number) => {
    try {
      await toggleStatus.mutateAsync({ id, isActive: isActive ? 0 : 1 });
      toast.success(isActive ? 'تم تعطيل الباقة' : 'تم تفعيل الباقة');
      refetch();
    } catch (error) {
      toast.error(t('adminSubscriptionPlansPage.text38'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      nameEn: '',
      description: '',
      descriptionEn: '',
      monthlyPrice: '',
      yearlyPrice: '',
      maxCustomers: '',
      maxWhatsAppNumbers: '1',
      features: '',
      isActive: 1,
    });
    setSelectedPlan(null);
  };

  const openEditDialog = (plan: any) => {
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      nameEn: plan.nameEn,
      description: plan.description || '',
      descriptionEn: plan.descriptionEn || '',
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      maxCustomers: plan.maxCustomers.toString(),
      maxWhatsAppNumbers: plan.maxWhatsAppNumbers.toString(),
      features: plan.features || '',
      isActive: plan.isActive,
    });
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t('adminSubscriptionPlansPage.text0')}</h1>
          <p className="text-muted-foreground mt-1">{t('adminSubscriptionPlansPage.text1')}</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          إضافة باقة جديدة
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan) => (
          <Card key={plan.id} className={!plan.isActive ? 'opacity-60' : ''}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.nameEn}</CardDescription>
                </div>
                <Switch
                  checked={!!plan.isActive}
                  onCheckedChange={() => handleToggleStatus(plan.id, plan.isActive)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t('adminSubscriptionPlansPage.text2')}</p>
                  <p className="text-2xl font-bold">{plan.monthlyPrice} {plan.currency}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('adminSubscriptionPlansPage.text3')}</p>
                  <p className="text-2xl font-bold">{plan.yearlyPrice} {plan.currency}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('adminSubscriptionPlansPage.text4')}</p>
                  <p className="font-semibold">{t('adminSubscriptionPlansPage.text5', { var0: plan.maxCustomers })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('adminSubscriptionPlansPage.text6')}</p>
                  <p className="font-semibold">{t('adminSubscriptionPlansPage.text7', { var0: plan.maxWhatsAppNumbers })}</p>
                </div>
                {plan.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t('adminSubscriptionPlansPage.text8')}</p>
                    <p className="text-sm">{plan.description}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(plan)}
                  >
                    <Edit className="ml-2 h-4 w-4" />
                    تعديل
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(plan.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('adminSubscriptionPlansPage.text9')}</DialogTitle>
            <DialogDescription>{t('adminSubscriptionPlansPage.text10')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('adminSubscriptionPlansPage.text11')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameEn">{t('adminSubscriptionPlansPage.text12')}</Label>
                <Input
                  id="nameEn"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('adminSubscriptionPlansPage.text13')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descriptionEn">{t('adminSubscriptionPlansPage.text14')}</Label>
              <Textarea
                id="descriptionEn"
                value={formData.descriptionEn}
                onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyPrice">{t('adminSubscriptionPlansPage.text15')}</Label>
                <Input
                  id="monthlyPrice"
                  type="number"
                  value={formData.monthlyPrice}
                  onChange={(e) => setFormData({ ...formData, monthlyPrice: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yearlyPrice">{t('adminSubscriptionPlansPage.text16')}</Label>
                <Input
                  id="yearlyPrice"
                  type="number"
                  value={formData.yearlyPrice}
                  onChange={(e) => setFormData({ ...formData, yearlyPrice: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxCustomers">{t('adminSubscriptionPlansPage.text17')}</Label>
                <Input
                  id="maxCustomers"
                  type="number"
                  value={formData.maxCustomers}
                  onChange={(e) => setFormData({ ...formData, maxCustomers: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxWhatsAppNumbers">{t('adminSubscriptionPlansPage.text18')}</Label>
                <Input
                  id="maxWhatsAppNumbers"
                  type="number"
                  value={formData.maxWhatsAppNumbers}
                  onChange={(e) => setFormData({ ...formData, maxWhatsAppNumbers: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="features">{t('adminSubscriptionPlansPage.text19')}</Label>
              <Textarea
                id="features"
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                placeholder={t('adminSubscriptionPlansPage.text39')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleCreate} disabled={createPlan.isPending}>
              {createPlan.isPending ? 'جاري الإنشاء...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('adminSubscriptionPlansPage.text20')}</DialogTitle>
            <DialogDescription>{t('adminSubscriptionPlansPage.text21')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t('adminSubscriptionPlansPage.text22')}</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-nameEn">{t('adminSubscriptionPlansPage.text23')}</Label>
                <Input
                  id="edit-nameEn"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">{t('adminSubscriptionPlansPage.text24')}</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-descriptionEn">{t('adminSubscriptionPlansPage.text25')}</Label>
              <Textarea
                id="edit-descriptionEn"
                value={formData.descriptionEn}
                onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-monthlyPrice">{t('adminSubscriptionPlansPage.text26')}</Label>
                <Input
                  id="edit-monthlyPrice"
                  type="number"
                  value={formData.monthlyPrice}
                  onChange={(e) => setFormData({ ...formData, monthlyPrice: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-yearlyPrice">{t('adminSubscriptionPlansPage.text27')}</Label>
                <Input
                  id="edit-yearlyPrice"
                  type="number"
                  value={formData.yearlyPrice}
                  onChange={(e) => setFormData({ ...formData, yearlyPrice: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-maxCustomers">{t('adminSubscriptionPlansPage.text28')}</Label>
                <Input
                  id="edit-maxCustomers"
                  type="number"
                  value={formData.maxCustomers}
                  onChange={(e) => setFormData({ ...formData, maxCustomers: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-maxWhatsAppNumbers">{t('adminSubscriptionPlansPage.text29')}</Label>
                <Input
                  id="edit-maxWhatsAppNumbers"
                  type="number"
                  value={formData.maxWhatsAppNumbers}
                  onChange={(e) => setFormData({ ...formData, maxWhatsAppNumbers: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-features">{t('adminSubscriptionPlansPage.text30')}</Label>
              <Textarea
                id="edit-features"
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                placeholder={t('adminSubscriptionPlansPage.text40')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleUpdate} disabled={updatePlan.isPending}>
              {updatePlan.isPending ? 'جاري التحديث...' : 'تحديث'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
