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

export default function ServiceForm() {
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
      toast.success('تم إنشاء الخدمة بنجاح');
      setLocation('/merchant/services');
    },
    onError: (error) => {
      toast.error('فشل إنشاء الخدمة: ' + error.message);
    },
  });

  const updateMutation = trpc.services.update.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث الخدمة بنجاح');
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
            <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
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
          العودة إلى الخدمات
        </Button>
        <h1 className="text-3xl font-bold">
          {isEdit ? 'تعديل الخدمة' : 'إضافة خدمة جديدة'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {isEdit ? 'تحديث معلومات الخدمة' : 'إضافة خدمة جديدة لنشاطك التجاري'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>المعلومات الأساسية</CardTitle>
            <CardDescription>معلومات الخدمة الأساسية</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">اسم الخدمة *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: قص شعر، استشارة قانونية، صيانة كمبيوتر"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف تفصيلي للخدمة"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="categoryId">التصنيف</Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر التصنيف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">بدون تصنيف</SelectItem>
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
            <CardTitle>التسعير</CardTitle>
            <CardDescription>حدد نوع التسعير والأسعار</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="priceType">نوع التسعير *</Label>
              <Select
                value={formData.priceType}
                onValueChange={(value: any) => setFormData({ ...formData, priceType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">سعر ثابت</SelectItem>
                  <SelectItem value="variable">سعر متغير (من - إلى)</SelectItem>
                  <SelectItem value="custom">حسب الطلب</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.priceType === 'fixed' && (
              <div>
                <Label htmlFor="basePrice">السعر (ريال) *</Label>
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
                  <Label htmlFor="minPrice">السعر الأدنى (ريال) *</Label>
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
                  <Label htmlFor="maxPrice">السعر الأعلى (ريال) *</Label>
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
            <CardTitle>إعدادات الوقت</CardTitle>
            <CardDescription>مدة الخدمة والوقت الإضافي</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="durationMinutes">مدة الخدمة (دقيقة) *</Label>
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
                <Label htmlFor="bufferTimeMinutes">وقت إضافي (دقيقة)</Label>
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
            <CardTitle>إعدادات الحجز</CardTitle>
            <CardDescription>إعدادات حجز المواعيد</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>يتطلب حجز موعد</Label>
                <p className="text-sm text-muted-foreground">
                  هل يجب على العميل حجز موعد لهذه الخدمة؟
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
                  <Label htmlFor="maxBookingsPerDay">الحد الأقصى للحجوزات اليومية</Label>
                  <Input
                    id="maxBookingsPerDay"
                    type="number"
                    value={formData.maxBookingsPerDay}
                    onChange={(e) =>
                      setFormData({ ...formData, maxBookingsPerDay: e.target.value })
                    }
                    placeholder="اتركه فارغاً لعدم التحديد"
                  />
                </div>

                <div>
                  <Label htmlFor="advanceBookingDays">الحجز المسبق (أيام)</Label>
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
                    كم يوماً مقدماً يمكن للعميل الحجز؟
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Display Order */}
        <Card>
          <CardHeader>
            <CardTitle>الترتيب</CardTitle>
            <CardDescription>ترتيب عرض الخدمة</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="displayOrder">ترتيب العرض</Label>
              <Input
                id="displayOrder"
                type="number"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: e.target.value })}
                placeholder="0"
              />
              <p className="text-sm text-muted-foreground mt-1">
                الخدمات ذات الترتيب الأقل تظهر أولاً
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
            إلغاء
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            <Save className="ml-2 h-4 w-4" />
            {createMutation.isPending || updateMutation.isPending
              ? 'جاري الحفظ...'
              : isEdit
              ? 'تحديث الخدمة'
              : 'إضافة الخدمة'}
          </Button>
        </div>
      </form>
    </div>
  );
}
