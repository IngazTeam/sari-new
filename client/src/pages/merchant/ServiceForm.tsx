import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function ServiceForm() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const params = useParams();
  const serviceId = params.id ? parseInt(params.id) : null;
  const isEdit = serviceId !== null;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    categoryId: '',
    priceType: 'fixed' as 'fixed' | 'variable' | 'custom',
    basePrice: '',
    minPrice: '',
    maxPrice: '',
    durationMinutes: '60',
    bufferTimeMinutes: '0',
    requiresAppointment: true,
    maxBookingsPerDay: '',
    advanceBookingDays: '30',
    displayOrder: '0',
  });

  const { data: categoriesData } = trpc.serviceCategories.list.useQuery();
  const { data: serviceData, isLoading: serviceLoading } = trpc.services.getById.useQuery(
    { serviceId: serviceId! },
    { enabled: isEdit }
  );
  const createMutation = trpc.services.create.useMutation({
    onSuccess: () => {
      toast.success(t('merchantUx.serviceForm.created'));
      setLocation('/merchant/services');
    },
    onError: (error: any) => {
      toast.error(t('merchantUx.serviceForm.createFailed', { message: error.message }));
    },
  });

  const updateMutation = trpc.services.update.useMutation({
    onSuccess: () => {
      toast.success(t('merchantUx.serviceForm.updated'));
      setLocation('/merchant/services');
    },
    onError: (error: any) => {
      toast.error(t('merchantUx.serviceForm.updateFailed', { message: error.message }));
    },
  });

  useEffect(() => {
    if (serviceData?.service) {
      const service = serviceData.service;
      setFormData({
        name: service.name,
        description: service.description || '',
        categoryId: service.categoryId?.toString() || '',
        priceType: service.priceType,
        basePrice: service.basePrice ? (service.basePrice / 100).toString() : '',
        minPrice: service.minPrice ? (service.minPrice / 100).toString() : '',
        maxPrice: service.maxPrice ? (service.maxPrice / 100).toString() : '',
        durationMinutes: service.durationMinutes.toString(),
        bufferTimeMinutes: service.bufferTimeMinutes.toString(),
        requiresAppointment: service.requiresAppointment === 1,
        maxBookingsPerDay: service.maxBookingsPerDay?.toString() || '',
        advanceBookingDays: service.advanceBookingDays.toString(),
        displayOrder: service.displayOrder.toString(),
      });
    }
  }, [serviceData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: any = {
      name: formData.name,
      description: formData.description || undefined,
      categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
      priceType: formData.priceType,
      durationMinutes: parseInt(formData.durationMinutes),
      bufferTimeMinutes: parseInt(formData.bufferTimeMinutes),
      requiresAppointment: formData.requiresAppointment,
      advanceBookingDays: parseInt(formData.advanceBookingDays),
      displayOrder: parseInt(formData.displayOrder),
    };

    if (formData.priceType === 'fixed') {
      data.basePrice = Math.round(parseFloat(formData.basePrice) * 100);
    } else if (formData.priceType === 'variable') {
      data.minPrice = Math.round(parseFloat(formData.minPrice) * 100);
      data.maxPrice = Math.round(parseFloat(formData.maxPrice) * 100);
    }

    if (formData.maxBookingsPerDay) {
      data.maxBookingsPerDay = parseInt(formData.maxBookingsPerDay);
    }

    if (isEdit) {
      updateMutation.mutate({ serviceId: serviceId!, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const categories = categoriesData?.categories || [];

  if (serviceLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">{t('merchantUx.serviceForm.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => setLocation('/merchant/services')}
          className="mb-4"
        >
          <ArrowLeft className="ml-2 h-4 w-4" />
          {t('merchantUx.serviceForm.back')}
        </Button>
        <h1 className="text-3xl font-bold">
          {isEdit ? t('merchantUx.serviceForm.editTitle') : t('merchantUx.serviceForm.addTitle')}
        </h1>
        <p className="text-muted-foreground mt-2">
          {isEdit ? t('merchantUx.serviceForm.editDescription') : t('merchantUx.serviceForm.addDescription')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>{t('merchantUx.serviceForm.basicInfo')}</CardTitle>
            <CardDescription>{t('merchantUx.serviceForm.basicInfoDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">{t('merchantUx.serviceForm.name')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('merchantUx.serviceForm.namePlaceholder')}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">{t('merchantUx.serviceForm.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('merchantUx.serviceForm.descriptionPlaceholder')}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="categoryId">{t('merchantUx.serviceForm.category')}</Label>
              <Select
                value={formData.categoryId || 'none'}
                onValueChange={(value) => setFormData({ ...formData, categoryId: value === 'none' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('merchantUx.serviceForm.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('merchantUx.serviceForm.noCategory')}</SelectItem>
                  {categories.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>{t('merchantUx.serviceForm.pricing')}</CardTitle>
            <CardDescription>{t('merchantUx.serviceForm.pricingDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="priceType">{t('merchantUx.serviceForm.priceType')}</Label>
              <Select
                value={formData.priceType}
                onValueChange={(value: any) => setFormData({ ...formData, priceType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">{t('merchantUx.serviceForm.fixedPrice')}</SelectItem>
                  <SelectItem value="variable">{t('merchantUx.serviceForm.variablePrice')}</SelectItem>
                  <SelectItem value="custom">{t('merchantUx.serviceForm.customPrice')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.priceType === 'fixed' && (
              <div>
                <Label htmlFor="basePrice">{t('merchantUx.serviceForm.basePrice')}</Label>
                <Input
                  id="basePrice"
                  type="number"
                  step="0.01"
                  value={formData.basePrice}
                  onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                  placeholder="100.00"
                  required
                />
              </div>
            )}

            {formData.priceType === 'variable' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="minPrice">{t('merchantUx.serviceForm.minPrice')}</Label>
                  <Input
                    id="minPrice"
                    type="number"
                    step="0.01"
                    value={formData.minPrice}
                    onChange={(e) => setFormData({ ...formData, minPrice: e.target.value })}
                    placeholder="50.00"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="maxPrice">{t('merchantUx.serviceForm.maxPrice')}</Label>
                  <Input
                    id="maxPrice"
                    type="number"
                    step="0.01"
                    value={formData.maxPrice}
                    onChange={(e) => setFormData({ ...formData, maxPrice: e.target.value })}
                    placeholder="200.00"
                    required
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Time Settings */}
        <Card>
          <CardHeader>
            <CardTitle>{t('merchantUx.serviceForm.timeSettings')}</CardTitle>
            <CardDescription>{t('merchantUx.serviceForm.timeDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="durationMinutes">{t('merchantUx.serviceForm.duration')}</Label>
                <Input
                  id="durationMinutes"
                  type="number"
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                  placeholder="60"
                  required
                />
              </div>
              <div>
                <Label htmlFor="bufferTimeMinutes">{t('merchantUx.serviceForm.bufferTime')}</Label>
                <Input
                  id="bufferTimeMinutes"
                  type="number"
                  value={formData.bufferTimeMinutes}
                  onChange={(e) => setFormData({ ...formData, bufferTimeMinutes: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Booking Settings */}
        <Card>
          <CardHeader>
            <CardTitle>{t('merchantUx.serviceForm.bookingSettings')}</CardTitle>
            <CardDescription>{t('merchantUx.serviceForm.bookingDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t('merchantUx.serviceForm.requiresAppointment')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('merchantUx.serviceForm.requiresAppointmentDescription')}
                </p>
              </div>
              <Switch
                checked={formData.requiresAppointment}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, requiresAppointment: checked })
                }
              />
            </div>

            {formData.requiresAppointment && (
              <>
                <div>
                  <Label htmlFor="maxBookingsPerDay">{t('merchantUx.serviceForm.maxBookings')}</Label>
                  <Input
                    id="maxBookingsPerDay"
                    type="number"
                    value={formData.maxBookingsPerDay}
                    onChange={(e) =>
                      setFormData({ ...formData, maxBookingsPerDay: e.target.value })
                    }
                    placeholder={t('merchantUx.serviceForm.maxBookingsPlaceholder')}
                  />
                </div>

                <div>
                  <Label htmlFor="advanceBookingDays">{t('merchantUx.serviceForm.advanceDays')}</Label>
                  <Input
                    id="advanceBookingDays"
                    type="number"
                    value={formData.advanceBookingDays}
                    onChange={(e) =>
                      setFormData({ ...formData, advanceBookingDays: e.target.value })
                    }
                    placeholder="30"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('merchantUx.serviceForm.advanceDaysDescription')}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Display Order */}
        <Card>
          <CardHeader>
            <CardTitle>{t('merchantUx.serviceForm.displaySettings')}</CardTitle>
            <CardDescription>{t('merchantUx.serviceForm.displayDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="displayOrder">{t('merchantUx.serviceForm.displayOrder')}</Label>
              <Input
                id="displayOrder"
                type="number"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: e.target.value })}
                placeholder="0"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {t('merchantUx.serviceForm.displayOrderDescription')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation('/merchant/services')}
            className="flex-1"
          >
            {t('merchantUx.serviceForm.cancel')}
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            <Save className="ml-2 h-4 w-4" />
            {createMutation.isPending || updateMutation.isPending
              ? t('merchantUx.serviceForm.saving')
              : isEdit
              ? t('merchantUx.serviceForm.update') : t('merchantUx.serviceForm.add')}
          </Button>
        </div>
      </form>
    </div>
  );
}
