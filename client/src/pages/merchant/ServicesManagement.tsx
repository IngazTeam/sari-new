import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Eye, Package, Users, Grid3x3 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ServicesManagement() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<number | null>(null);

  const { data: servicesData, isLoading, refetch } = trpc.services.list.useQuery();
  const { data: categoriesData } = trpc.serviceCategories.list.useQuery();
  const deleteServiceMutation = trpc.services.delete.useMutation({
    onSuccess: () => {
      toast.success(t('servicesManagementPage.text0'));
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
      return t('servicesManagementPage.text26', { var0: (service.basePrice / 100).toFixed(2) });
    } else if (service.priceType === 'variable') {
      return t('servicesManagementPage.text27', { var0: (service.minPrice / 100).toFixed(2), var1: (service.maxPrice / 100).toFixed(2) });
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
            <p className="mt-4 text-muted-foreground">{t('servicesManagementPage.text1')}</p>
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
          <h1 className="text-3xl font-bold">{t('servicesManagementPage.text2')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('servicesManagementPage.text15')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setLocation('/merchant/service-categories')}
          >
            <Grid3x3 className="ml-2 h-4 w-4" />
            {t('servicesManagementPage.text16')}
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation('/merchant/service-packages')}
          >
            <Package className="ml-2 h-4 w-4" />
            {t('servicesManagementPage.text17')}
          </Button>
          <Button
            onClick={() => setLocation('/merchant/services/new')}
          >
            <Plus className="ml-2 h-4 w-4" />
            {t('servicesManagementPage.text18')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('servicesManagementPage.text3')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{services.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('servicesManagementPage.text4')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('servicesManagementPage.text5')}</CardTitle>
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
              <h3 className="mt-4 text-lg font-semibold">{t('servicesManagementPage.text6')}</h3>
              <p className="text-muted-foreground mt-2">
                {t('servicesManagementPage.text19')}
              </p>
              <Button
                className="mt-4"
                onClick={() => setLocation('/merchant/services/new')}
              >
                <Plus className="ml-2 h-4 w-4" />
                {t('servicesManagementPage.text20')}
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
                    {service.isActive ? t('servicesManagementPage.text11') : t('servicesManagementPage.text12')}
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
                    <span className="text-muted-foreground">{t('servicesManagementPage.text7')}</span>
                    <span className="font-semibold">{getPriceDisplay(service)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('servicesManagementPage.text8')}</span>
                    <span className="font-semibold">{service.durationMinutes} دقيقة</span>
                  </div>
                  
                  {service.requiresAppointment && (
                    <Badge variant="outline" className="w-full justify-center">
                      {t('servicesManagementPage.text21')}
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
                      {t('servicesManagementPage.text22')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setLocation(`/merchant/services/${service.id}/edit`)}
                    >
                      <Edit className="ml-2 h-4 w-4" />
                      {t('servicesManagementPage.text23')}
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
            <DialogTitle>{t('servicesManagementPage.text10')}</DialogTitle>
            <DialogDescription>
              {t('servicesManagementPage.text24')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t('servicesManagementPage.text25')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteServiceMutation.isPending}
            >
              {deleteServiceMutation.isPending ? t('servicesManagementPage.text13') : t('servicesManagementPage.text14')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
