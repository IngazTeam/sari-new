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
  const { data: staffData } = trpc.staff.list.useQuery({ activeOnly: true });

  const createMutation = trpc.services.create.useMutation({
    onSuccess: () => {
      toast.success(t('serviceFormPage.text0'));
      setLocation('/merchant/services');
    },
    onError: (error) => {
      toast.error('فشل إنشاء الخدمة: ' + error.message);
    },
  });

  const updateMutation = trpc.services.update.useMutation({
    onSuccess: () => {
      toast.success(t('serviceFormPage.text1'));
      setLocation('/merchant/services');
    },
    onError: (error) => {
      toast.error('فشل تحديث الخدمة: ' + error.message);
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
            <p className="mt-4 text-muted-foreground">{t('serviceFormPage.text2')}</p>
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
          {t('serviceFormPage.text40')}
        </Button>
        <h1 className="text-3xl font-bold">
          {isEdit ? t('serviceFormPage.text34') : t('serviceFormPage.text35')}
        </h1>
        <p className="text-muted-foreground mt-2">
          {isEdit ? t('serviceFormPage.text36') : t('serviceFormPage.text37')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>{t('serviceFormPage.text3')}</CardTitle>
            <CardDescription>{t('serviceFormPage.text4')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">{t('serviceFormPage.text5')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('serviceFormPage.text6')}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">{t('serviceFormPage.text7')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('serviceFormPage.text8')}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="categoryId">{t('serviceFormPage.text9')}</Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('serviceFormPage.text10')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('serviceFormPage.text11')}</SelectItem>
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
            <CardTitle>{t('serviceFormPage.text12')}</CardTitle>
            <CardDescription>{t('serviceFormPage.text13')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="priceType">{t('serviceFormPage.text14')}</Label>
              <Select
                value={formData.priceType}
                onValueChange={(value: any) => setFormData({ ...formData, priceType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">{t('serviceFormPage.text15')}</SelectItem>
                  <SelectItem value="variable">{t('serviceFormPage.text16')}</SelectItem>
                  <SelectItem value="custom">{t('serviceFormPage.text17')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.priceType === 'fixed' && (
              <div>
                <Label htmlFor="basePrice">{t('serviceFormPage.text18')}</Label>
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
                  <Label htmlFor="minPrice">{t('serviceFormPage.text19')}</Label>
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
                  <Label htmlFor="maxPrice">{t('serviceFormPage.text20')}</Label>
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
            <CardTitle>{t('serviceFormPage.text21')}</CardTitle>
            <CardDescription>{t('serviceFormPage.text22')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="durationMinutes">{t('serviceFormPage.text23')}</Label>
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
                <Label htmlFor="bufferTimeMinutes">{t('serviceFormPage.text24')}</Label>
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
            <CardTitle>{t('serviceFormPage.text25')}</CardTitle>
            <CardDescription>{t('serviceFormPage.text26')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t('serviceFormPage.text27')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('serviceFormPage.text41')}
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
                  <Label htmlFor="maxBookingsPerDay">{t('serviceFormPage.text28')}</Label>
                  <Input
                    id="maxBookingsPerDay"
                    type="number"
                    value={formData.maxBookingsPerDay}
                    onChange={(e) =>
                      setFormData({ ...formData, maxBookingsPerDay: e.target.value })
                    }
                    placeholder={t('serviceFormPage.text29')}
                  />
                </div>

                <div>
                  <Label htmlFor="advanceBookingDays">{t('serviceFormPage.text30')}</Label>
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
                    {t('serviceFormPage.text42')}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Display Order */}
        <Card>
          <CardHeader>
            <CardTitle>{t('serviceFormPage.text31')}</CardTitle>
            <CardDescription>{t('serviceFormPage.text32')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="displayOrder">{t('serviceFormPage.text33')}</Label>
              <Input
                id="displayOrder"
                type="number"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: e.target.value })}
                placeholder="0"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {t('serviceFormPage.text43')}
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
            {t('serviceFormPage.text44')}
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            <Save className="ml-2 h-4 w-4" />
            {createMutation.isPending || updateMutation.isPending
              ? t('serviceFormPage.text45')
              : isEdit
              ? t('serviceFormPage.text38') : t('serviceFormPage.text39')}
          </Button>
        </div>
      </form>
    </div>
  );
}
