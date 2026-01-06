import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { DollarSign, Loader2, Save, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CURRENCY_CONFIG, type Currency } from '@shared/currency';

export default function CurrencySettings() {
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('SAR');

  // Get current merchant
  const { data: merchant, isLoading: merchantLoading, refetch } = trpc.merchant.get.useQuery();

  // Update merchant mutation
  const updateMutation = trpc.merchant.update.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث العملة بنجاح');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تحديث العملة');
    },
  });

  // Set initial currency when merchant data loads
  useState(() => {
    if (merchant?.currency) {
      setSelectedCurrency(merchant.currency as Currency);
    }
  });

  const handleSave = () => {
    if (!selectedCurrency) {
      toast.error('يرجى اختيار العملة');
      return;
    }

    updateMutation.mutate({
      currency: selectedCurrency,
    });
  };

  if (merchantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إعدادات العملة</h1>
        <p className="text-muted-foreground mt-2">
          اختر العملة الأساسية لمتجرك. سيتم عرض جميع الأسعار والمبالغ بهذه العملة.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            العملة الأساسية
          </CardTitle>
          <CardDescription>
            اختر العملة التي تريد استخدامها في متجرك
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription>
              العملة الحالية: <strong>{merchant?.currency ? (merchant.currency === 'SAR' ? 'ريال سعودي' : 'دولار أمريكي') : 'غير محدد'}</strong>
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currency">اختر العملة</Label>
              <Select
                value={selectedCurrency}
                onValueChange={(value) => setSelectedCurrency(value as Currency)}
              >
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue placeholder="اختر العملة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAR">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">﷼</span>
                      <span>ريال سعودي</span>
                      <span className="text-muted-foreground text-sm">(SAR)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="USD">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">$</span>
                      <span>دولار أمريكي</span>
                      <span className="text-muted-foreground text-sm">(USD)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h4 className="font-semibold text-sm">معلومات العملة المختارة:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">الرمز:</span>
                  <span className="font-medium mr-2">{selectedCurrency === 'SAR' ? '﷼' : '$'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">الكود:</span>
                  <span className="font-medium mr-2">{selectedCurrency}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">الاسم:</span>
                  <span className="font-medium mr-2">{selectedCurrency === 'SAR' ? 'ريال سعودي' : 'دولار أمريكي'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || selectedCurrency === merchant?.currency}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 ml-2" />
                  حفظ التغييرات
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ملاحظات هامة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <span>•</span>
            <p>سيتم عرض جميع المنتجات والطلبات الجديدة بالعملة المختارة</p>
          </div>
          <div className="flex gap-2">
            <span>•</span>
            <p>المنتجات والطلبات الموجودة ستحتفظ بعملتها الأصلية</p>
          </div>
          <div className="flex gap-2">
            <span>•</span>
            <p>يمكنك تغيير العملة في أي وقت</p>
          </div>
          <div className="flex gap-2">
            <span>•</span>
            <p>يمكنك تحديد عملة مختلفة لكل منتج عند إضافته</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
