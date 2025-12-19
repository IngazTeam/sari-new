import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Eye, Package, Users, Grid3x3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ServicesManagement() {
  const [, setLocation] = useLocation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<number | null>(null);

  const { data: servicesData, isLoading, refetch } = trpc.services.list.useQuery();
  const { data: categoriesData } = trpc.serviceCategories.list.useQuery();
  const deleteServiceMutation = trpc.services.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف الخدمة بنجاح');
      refetch();
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast.error('فشل حذف الخدمة: ' + error.message);
    },
  });

  const services = servicesData?.services || [];
  const categories = categoriesData?.categories || [];

  const handleDelete = (serviceId: number) => {
    setServiceToDelete(serviceId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (serviceToDelete) {
      deleteServiceMutation.mutate({ serviceId: serviceToDelete });
    }
  };

  const getPriceDisplay = (service: any) => {
    if (service.priceType === 'fixed') {
      return `${(service.basePrice / 100).toFixed(2)} ريال`;
    } else if (service.priceType === 'variable') {
      return `${(service.minPrice / 100).toFixed(2)} - ${(service.maxPrice / 100).toFixed(2)} ريال`;
    } else {
      return 'حسب الطلب';
    }
  };

  const getCategoryName = (categoryId: number | null) => {
    if (!categoryId) return '-';
    const category = categories.find(c => c.id === categoryId);
    return category?.name || '-';
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">إدارة الخدمات</h1>
          <p className="text-muted-foreground mt-2">
            إدارة الخدمات المقدمة من نشاطك التجاري
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setLocation('/merchant/service-categories')}
          >
            <Grid3x3 className="ml-2 h-4 w-4" />
            التصنيفات
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation('/merchant/service-packages')}
          >
            <Package className="ml-2 h-4 w-4" />
            الحزم
          </Button>
          <Button
            onClick={() => setLocation('/merchant/services/new')}
          >
            <Plus className="ml-2 h-4 w-4" />
            إضافة خدمة جديدة
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الخدمات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{services.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">التصنيفات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الخدمات النشطة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {services.filter((s: any) => s.isActive).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Services List */}
      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Package className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">لا توجد خدمات</h3>
              <p className="text-muted-foreground mt-2">
                ابدأ بإضافة أول خدمة لنشاطك التجاري
              </p>
              <Button
                className="mt-4"
                onClick={() => setLocation('/merchant/services/new')}
              >
                <Plus className="ml-2 h-4 w-4" />
                إضافة خدمة جديدة
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service: any) => (
            <Card key={service.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{service.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {getCategoryName(service.categoryId)}
                    </CardDescription>
                  </div>
                  <Badge variant={service.isActive ? 'default' : 'secondary'}>
                    {service.isActive ? 'نشط' : 'غير نشط'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {service.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {service.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">السعر:</span>
                    <span className="font-semibold">{getPriceDisplay(service)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">المدة:</span>
                    <span className="font-semibold">{service.durationMinutes} دقيقة</span>
                  </div>
                  
                  {service.requiresAppointment && (
                    <Badge variant="outline" className="w-full justify-center">
                      يتطلب حجز موعد
                    </Badge>
                  )}
                  
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setLocation(`/merchant/services/${service.id}`)}
                    >
                      <Eye className="ml-2 h-4 w-4" />
                      عرض
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setLocation(`/merchant/services/${service.id}/edit`)}
                    >
                      <Edit className="ml-2 h-4 w-4" />
                      تعديل
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(service.id)}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف هذه الخدمة؟ لن يتم حذفها نهائياً بل سيتم تعطيلها فقط.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteServiceMutation.isPending}
            >
              {deleteServiceMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
