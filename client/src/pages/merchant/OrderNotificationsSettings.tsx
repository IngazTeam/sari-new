import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Bell, Check, X, Clock } from 'lucide-react';

import { useTranslation } from 'react-i18next';
export default function OrderNotificationsSettings() {
  const { t } = useTranslation();

  const { data: templates, isLoading, refetch } = trpc.orderNotifications.getTemplates.useQuery();
  const updateTemplate = trpc.orderNotifications.updateTemplate.useMutation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState('');

  const statusLabels: Record<string, string> = {
    pending: 'طلب جديد',
    confirmed: 'تأكيد الطلب',
    processing: 'جاري التحضير',
    shipped: 'تم الشحن',
    delivered: 'تم التوصيل',
    cancelled: 'إلغاء الطلب',
  };

  const statusDescriptions: Record<string, string> = {
    pending: 'يُرسل عند إنشاء طلب جديد',
    confirmed: 'يُرسل عند تأكيد الطلب',
    processing: 'يُرسل عند بدء تحضير الطلب',
    shipped: 'يُرسل عند شحن الطلب',
    delivered: 'يُرسل عند توصيل الطلب',
    cancelled: 'يُرسل عند إلغاء الطلب',
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await updateTemplate.mutateAsync({ id, enabled });
      toast.success(enabled ? 'تم تفعيل الإشعار' : 'تم تعطيل الإشعار');
      refetch();
    } catch (error) {
      toast.error(t('toast.notifications.msg3'));
    }
  };

  const handleEdit = (id: number, template: string) => {
    setEditingId(id);
    setEditingTemplate(template);
  };

  const handleSave = async (id: number) => {
    try {
      await updateTemplate.mutateAsync({ id, template: editingTemplate });
      toast.success(t('toast.notifications.msg4'));
      setEditingId(null);
      refetch();
    } catch (error) {
      toast.error(t('toast.notifications.msg5'));
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingTemplate('');
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">جاري التحميل...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إعدادات إشعارات الطلبات</h1>
        <p className="text-muted-foreground mt-2">
          قم بتخصيص رسائل واتساب التي تُرسل للعملاء عند تغيير حالة الطلب
        </p>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">الإشعارات المفعلة</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templates?.filter(t => t.enabled).length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              من أصل {templates?.length || 0} إشعار
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">الإشعارات المعطلة</CardTitle>
            <X className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templates?.filter(t => !t.enabled).length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              إشعارات غير مفعلة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">آخر تحديث</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templates && templates.length > 0
                ? new Date(Math.max(...templates.map(t => t.updatedAt ? new Date(t.updatedAt).getTime() : 0))).toLocaleDateString('ar-SA')
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              تاريخ آخر تعديل
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Templates */}
      <div className="space-y-4">
        {templates?.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{statusLabels[template.status]}</CardTitle>
                  <CardDescription>{statusDescriptions[template.status]}</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={template.enabled || false}
                      onCheckedChange={(checked) => handleToggle(template.id, checked)}
                    />
                    <Label className="text-sm">
                      {template.enabled ? 'مفعّل' : 'معطّل'}
                    </Label>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {editingId === template.id ? (
                <>
                  <div>
                    <Label>قالب الرسالة</Label>
                    <Textarea
                      value={editingTemplate}
                      onChange={(e) => setEditingTemplate(e.target.value)}
                      rows={6}
                      className="mt-2 font-arabic"
                      dir="rtl"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      المتغيرات المتاحة: {'{customerName}'}, {'{storeName}'}, {'{orderNumber}'}, {'{total}'}, {'{trackingNumber}'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleSave(template.id)} size="sm">
                      <Check className="h-4 w-4 ml-2" />
                      حفظ
                    </Button>
                    <Button onClick={handleCancel} variant="outline" size="sm">
                      <X className="h-4 w-4 ml-2" />
                      إلغاء
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-muted p-4 rounded-lg">
                    <pre className="text-sm whitespace-pre-wrap font-arabic" dir="rtl">
                      {template.template}
                    </pre>
                  </div>
                  <Button
                    onClick={() => handleEdit(template.id, template.template)}
                    variant="outline"
                    size="sm"
                  >
                    تعديل القالب
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Help Section */}
      <Card className="bg-primary/10 dark:bg-blue-950 border-primary/30 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-primary dark:text-blue-100">💡 نصائح</CardTitle>
        </CardHeader>
        <CardContent className="text-primary dark:text-blue-200 space-y-2">
          <p>• استخدم المتغيرات لتخصيص الرسائل لكل عميل</p>
          <p>• تأكد من تفعيل الإشعارات المهمة مثل "تأكيد الطلب" و"تم الشحن"</p>
          <p>• اجعل الرسائل قصيرة وواضحة</p>
          <p>• أضف رابط تتبع الشحنة في إشعار "تم الشحن"</p>
        </CardContent>
      </Card>
    </div>
  );
}
