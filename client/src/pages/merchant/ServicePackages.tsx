import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, ArrowLeft, Package } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ServicePackages() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [packageToDelete, setPackageToDelete] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    serviceIds: [] as number[],
    originalPrice: '',
    packagePrice: '',
  });

  const { data: packagesData, isLoading, refetch } = trpc.servicePackages.list.useQuery();
  const { data: servicesData } = trpc.services.list.useQuery();
  
  const createMutation = trpc.servicePackages.create.useMutation({
    onSuccess: () => {
      toast.success('تم إنشاء الحزمة بنجاح');
      refetch();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('فشل إنشاء الحزمة: ' + error.message);
    },
  });

  const updateMutation = trpc.servicePackages.update.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث الحزمة بنجاح');
      refetch();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('فشل تحديث الحزمة: ' + error.message);
    },
  });

  const deleteMutation = trpc.servicePackages.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف الحزمة بنجاح');
      refetch();
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast.error('فشل حذف الحزمة: ' + error.message);
    },
  });

  const packages = packagesData?.packages || [];
  const services = servicesData?.services || [];

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      serviceIds: [],
      originalPrice: '',
      packagePrice: '',
    });
    setEditingPackage(null);
  };

  const handleOpenDialog = (pkg?: any) => {
    if (pkg) {
      setEditingPackage(pkg);
      const serviceIds = pkg.serviceIds ? JSON.parse(pkg.serviceIds) : [];
      setFormData({
        name: pkg.name,
        description: pkg.description || '',
        serviceIds,
        originalPrice: (pkg.originalPrice / 100).toString(),
        packagePrice: (pkg.packagePrice / 100).toString(),
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.serviceIds.length === 0) {
      toast.error('يجب اختيار خدمة واحدة على الأقل');
      return;
    }

    const discountPercentage = Math.round(
      ((parseFloat(formData.originalPrice) - parseFloat(formData.packagePrice)) /
        parseFloat(formData.originalPrice)) *
        100
    );

    const data = {
      name: formData.name,
      description: formData.description || undefined,
      serviceIds: formData.serviceIds,
      originalPrice: Math.round(parseFloat(formData.originalPrice) * 100),
      packagePrice: Math.round(parseFloat(formData.packagePrice) * 100),
      discountPercentage,
    };

    if (editingPackage) {
      updateMutation.mutate({ packageId: editingPackage.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (packageId: number) => {
    setPackageToDelete(packageId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (packageToDelete) {
      deleteMutation.mutate({ packageId: packageToDelete });
    }
  };

  const toggleService = (serviceId: number) => {
    setFormData((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter((id) => id !== serviceId)
        : [...prev.serviceIds, serviceId],
    }));
  };

  const getServiceNames = (serviceIds: string) => {
    try {
      const ids = JSON.parse(serviceIds);
      return services
        .filter((s: any) => ids.includes(s.id))
        .map((s: any) => s.name)
        .join(', ');
    } catch {
      return '-';
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => setLocation('/merchant/services')}
          className="mb-4"
        >
          <ArrowLeft className="ml-2 h-4 w-4" />
          العودة إلى الخدمات
        </Button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">حزم الخدمات</h1>
            <p className="text-muted-foreground mt-2">
              إنشاء حزم خدمات مخفضة لزيادة المبيعات
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="ml-2 h-4 w-4" />
            إضافة حزمة جديدة
          </Button>
        </div>
      </div>

      {/* Packages List */}
      {packages.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Package className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">لا توجد حزم</h3>
              <p className="text-muted-foreground mt-2">
                ابدأ بإنشاء حزمة خدمات مخفضة لجذب المزيد من العملاء
              </p>
              <Button className="mt-4" onClick={() => handleOpenDialog()}>
                <Plus className="ml-2 h-4 w-4" />
                إضافة حزمة جديدة
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {packages.map((pkg: any) => (
            <Card key={pkg.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{pkg.name}</CardTitle>
                    {pkg.description && (
                      <CardDescription className="mt-1">{pkg.description}</CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">الخدمات المشمولة:</span>
                    <p className="mt-1">{getServiceNames(pkg.serviceIds)}</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">السعر الأصلي</p>
                      <p className="text-lg font-semibold line-through text-muted-foreground">
                        {(pkg.originalPrice / 100).toFixed(2)} ريال
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="text-sm text-muted-foreground">سعر الحزمة</p>
                      <p className="text-2xl font-bold text-primary">
                        {(pkg.packagePrice / 100).toFixed(2)} ريال
                      </p>
                    </div>
                  </div>

                  {pkg.discountPercentage && (
                    <div className="bg-primary/10 text-primary px-3 py-2 rounded-md text-center font-semibold">
                      وفّر {pkg.discountPercentage}%
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleOpenDialog(pkg)}
                    >
                      <Edit className="ml-2 h-4 w-4" />
                      تعديل
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(pkg.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? 'تعديل الحزمة' : 'إضافة حزمة جديدة'}
            </DialogTitle>
            <DialogDescription>
              {editingPackage
                ? 'تحديث معلومات الحزمة'
                : 'إنشاء حزمة خدمات مخفضة'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">اسم الحزمة *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: حزمة العناية الكاملة"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف مختصر للحزمة"
                rows={2}
              />
            </div>

            <div>
              <Label>الخدمات المشمولة *</Label>
              <div className="border rounded-md p-4 mt-2 max-h-48 overflow-y-auto space-y-2">
                {services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    لا توجد خدمات. يجب إضافة خدمات أولاً.
                  </p>
                ) : (
                  services.map((service: any) => (
                    <div key={service.id} className="flex items-center space-x-2 space-x-reverse">
                      <Checkbox
                        id={`service-${service.id}`}
                        checked={formData.serviceIds.includes(service.id)}
                        onCheckedChange={() => toggleService(service.id)}
                      />
                      <label
                        htmlFor={`service-${service.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {service.name}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="originalPrice">السعر الأصلي (ريال) *</Label>
                <Input
                  id="originalPrice"
                  type="number"
                  step="0.01"
                  value={formData.originalPrice}
                  onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                  placeholder="500.00"
                  required
                />
              </div>
              <div>
                <Label htmlFor="packagePrice">سعر الحزمة (ريال) *</Label>
                <Input
                  id="packagePrice"
                  type="number"
                  step="0.01"
                  value={formData.packagePrice}
                  onChange={(e) => setFormData({ ...formData, packagePrice: e.target.value })}
                  placeholder="400.00"
                  required
                />
              </div>
            </div>

            {formData.originalPrice && formData.packagePrice && (
              <div className="bg-primary/10 text-primary px-4 py-3 rounded-md text-center">
                <p className="font-semibold">
                  الخصم:{' '}
                  {Math.round(
                    ((parseFloat(formData.originalPrice) - parseFloat(formData.packagePrice)) /
                      parseFloat(formData.originalPrice)) *
                      100
                  )}
                  %
                </p>
                <p className="text-sm mt-1">
                  توفير: {(parseFloat(formData.originalPrice) - parseFloat(formData.packagePrice)).toFixed(2)} ريال
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'جاري الحفظ...'
                  : editingPackage
                  ? 'تحديث'
                  : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف هذه الحزمة؟ لن يتم حذفها نهائياً بل سيتم تعطيلها فقط.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
