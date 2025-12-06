import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useState } from 'react';
import { ArrowRight, Send, Image as ImageIcon } from 'lucide-react';

export default function NewCampaign() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    name: '',
    message: '',
    imageUrl: '',
    scheduledAt: '',
  });

  const createMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success('تم إنشاء الحملة بنجاح');
      setLocation('/merchant/campaigns');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إنشاء الحملة');
    },
  });

  const handleSubmit = async (e: React.FormEvent, saveAsDraft: boolean = false) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('يرجى إدخال اسم الحملة');
      return;
    }

    if (!formData.message.trim()) {
      toast.error('يرجى إدخال نص الرسالة');
      return;
    }

    await createMutation.mutateAsync({
      name: formData.name,
      message: formData.message,
      imageUrl: formData.imageUrl || undefined,
      scheduledAt: formData.scheduledAt ? new Date(formData.scheduledAt) : undefined,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/merchant/campaigns')}
        >
          <ArrowRight className="w-4 h-4 ml-2" />
          رجوع
        </Button>
        <div>
          <h1 className="text-3xl font-bold">إنشاء حملة جديدة</h1>
          <p className="text-muted-foreground mt-2">
            أنشئ حملة تسويقية جديدة لإرسالها عبر الواتساب
          </p>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
        {/* Campaign Details */}
        <Card>
          <CardHeader>
            <CardTitle>تفاصيل الحملة</CardTitle>
            <CardDescription>
              أدخل المعلومات الأساسية للحملة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Campaign Name */}
            <div className="space-y-2">
              <Label htmlFor="name">اسم الحملة *</Label>
              <Input
                id="name"
                placeholder="مثال: عرض الجمعة البيضاء"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <p className="text-sm text-muted-foreground">
                اسم داخلي للحملة (لن يراه العملاء)
              </p>
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="message">نص الرسالة *</Label>
              <Textarea
                id="message"
                placeholder="مثال: 🎉 عرض خاص! خصم 50% على جميع المنتجات لفترة محدودة..."
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={6}
                required
                className="resize-none"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>الرسالة التي سيتم إرسالها للعملاء</span>
                <span>{formData.message.length} حرف</span>
              </div>
            </div>

            {/* Image URL */}
            <div className="space-y-2">
              <Label htmlFor="imageUrl">رابط الصورة (اختياري)</Label>
              <div className="flex gap-2">
                <Input
                  id="imageUrl"
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                />
                <Button type="button" variant="outline" size="icon">
                  <ImageIcon className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                أضف رابط صورة لإرفاقها مع الرسالة
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Scheduling */}
        <Card>
          <CardHeader>
            <CardTitle>جدولة الإرسال</CardTitle>
            <CardDescription>
              حدد موعد إرسال الحملة (اختياري)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scheduledAt">تاريخ ووقت الإرسال</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                اترك فارغاً للحفظ كمسودة، أو حدد موعداً لجدولة الإرسال التلقائي
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>معاينة الرسالة</CardTitle>
            <CardDescription>
              كيف ستظهر الرسالة للعملاء
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              {formData.imageUrl && (
                <div className="mb-4">
                  <img
                    src={formData.imageUrl}
                    alt="Preview"
                    className="max-w-full h-auto rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="whitespace-pre-wrap">
                {formData.message || 'سيظهر نص الرسالة هنا...'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation('/merchant/campaigns')}
            disabled={createMutation.isPending}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={(e) => handleSubmit(e, true)}
            disabled={createMutation.isPending}
          >
            حفظ كمسودة
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || !formData.scheduledAt}
          >
            <Send className="w-4 h-4 ml-2" />
            {formData.scheduledAt ? 'جدولة الإرسال' : 'إرسال الآن'}
          </Button>
        </div>
      </form>
    </div>
  );
}
