import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Settings } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function LoyaltySettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: settings, isLoading, refetch } = trpc.loyalty.getSettings.useQuery();
  const updateSettings = trpc.loyalty.updateSettings.useMutation();

  const [formData, setFormData] = useState({
    isEnabled: settings?.isEnabled || 1,
    pointsPerCurrency: settings?.pointsPerCurrency || 1,
    currencyPerPoint: settings?.currencyPerPoint || 10,
    enableReferralBonus: settings?.enableReferralBonus || 1,
    referralBonusPoints: settings?.referralBonusPoints || 50,
    enableReviewBonus: settings?.enableReviewBonus || 1,
    reviewBonusPoints: settings?.reviewBonusPoints || 10,
    enableBirthdayBonus: settings?.enableBirthdayBonus || 0,
    birthdayBonusPoints: settings?.birthdayBonusPoints || 20,
    pointsExpiryDays: settings?.pointsExpiryDays || 365,
  });

  // تحديث formData عند تحميل البيانات
  useState(() => {
    if (settings) {
      setFormData({
        isEnabled: settings.isEnabled,
        pointsPerCurrency: settings.pointsPerCurrency,
        currencyPerPoint: settings.currencyPerPoint,
        enableReferralBonus: settings.enableReferralBonus,
        referralBonusPoints: settings.referralBonusPoints,
        enableReviewBonus: settings.enableReviewBonus,
        reviewBonusPoints: settings.reviewBonusPoints,
        enableBirthdayBonus: settings.enableBirthdayBonus,
        birthdayBonusPoints: settings.birthdayBonusPoints,
        pointsExpiryDays: settings.pointsExpiryDays,
      });
    }
  });

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync(formData);
      await refetch();
      toast({
        title: "تم الحفظ بنجاح",
        description: "تم تحديث إعدادات نظام الولاء",
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل حفظ الإعدادات",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">{t('loyaltySettingsPage.text0')}</h1>
          <p className="text-muted-foreground">{t('loyaltySettingsPage.text1')}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* تفعيل النظام */}
        <Card>
          <CardHeader>
            <CardTitle>{t('loyaltySettingsPage.text2')}</CardTitle>
            <CardDescription>{t('loyaltySettingsPage.text3')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="isEnabled" className="text-base">{t('loyaltySettingsPage.text4')}</Label>
              <Switch
                id="isEnabled"
                checked={formData.isEnabled === 1}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isEnabled: checked ? 1 : 0 })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* إعدادات النقاط */}
        <Card>
          <CardHeader>
            <CardTitle>{t('loyaltySettingsPage.text5')}</CardTitle>
            <CardDescription>{t('loyaltySettingsPage.text6')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pointsPerCurrency">{t('loyaltySettingsPage.text7')}</Label>
                <Input
                  id="pointsPerCurrency"
                  type="number"
                  min="1"
                  value={formData.pointsPerCurrency}
                  onChange={(e) =>
                    setFormData({ ...formData, pointsPerCurrency: parseInt(e.target.value) })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  كم نقطة يحصل عليها العميل مقابل كل 1 ريال
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currencyPerPoint">{t('loyaltySettingsPage.text8')}</Label>
                <Input
                  id="currencyPerPoint"
                  type="number"
                  min="1"
                  value={formData.currencyPerPoint}
                  onChange={(e) =>
                    setFormData({ ...formData, currencyPerPoint: parseInt(e.target.value) })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  قيمة النقطة بالريال عند الاستبدال
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pointsExpiryDays">{t('loyaltySettingsPage.text9')}</Label>
              <Input
                id="pointsExpiryDays"
                type="number"
                min="0"
                value={formData.pointsExpiryDays}
                onChange={(e) =>
                  setFormData({ ...formData, pointsExpiryDays: parseInt(e.target.value) })
                }
              />
              <p className="text-sm text-muted-foreground">
                0 = لا تنتهي صلاحية النقاط
              </p>
            </div>
          </CardContent>
        </Card>

        {/* مكافآت إضافية */}
        <Card>
          <CardHeader>
            <CardTitle>{t('loyaltySettingsPage.text10')}</CardTitle>
            <CardDescription>{t('loyaltySettingsPage.text11')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* مكافأة الإحالة */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="enableReferralBonus" className="text-base">
                  مكافأة الإحالة
                </Label>
                <Switch
                  id="enableReferralBonus"
                  checked={formData.enableReferralBonus === 1}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enableReferralBonus: checked ? 1 : 0 })
                  }
                />
              </div>
              {formData.enableReferralBonus === 1 && (
                <div className="space-y-2">
                  <Label htmlFor="referralBonusPoints">{t('loyaltySettingsPage.text12')}</Label>
                  <Input
                    id="referralBonusPoints"
                    type="number"
                    min="0"
                    value={formData.referralBonusPoints}
                    onChange={(e) =>
                      setFormData({ ...formData, referralBonusPoints: parseInt(e.target.value) })
                    }
                  />
                </div>
              )}
            </div>

            {/* مكافأة التقييم */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="enableReviewBonus" className="text-base">
                  مكافأة التقييم
                </Label>
                <Switch
                  id="enableReviewBonus"
                  checked={formData.enableReviewBonus === 1}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enableReviewBonus: checked ? 1 : 0 })
                  }
                />
              </div>
              {formData.enableReviewBonus === 1 && (
                <div className="space-y-2">
                  <Label htmlFor="reviewBonusPoints">{t('loyaltySettingsPage.text13')}</Label>
                  <Input
                    id="reviewBonusPoints"
                    type="number"
                    min="0"
                    value={formData.reviewBonusPoints}
                    onChange={(e) =>
                      setFormData({ ...formData, reviewBonusPoints: parseInt(e.target.value) })
                    }
                  />
                </div>
              )}
            </div>

            {/* مكافأة عيد الميلاد */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="enableBirthdayBonus" className="text-base">
                  مكافأة عيد الميلاد
                </Label>
                <Switch
                  id="enableBirthdayBonus"
                  checked={formData.enableBirthdayBonus === 1}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enableBirthdayBonus: checked ? 1 : 0 })
                  }
                />
              </div>
              {formData.enableBirthdayBonus === 1 && (
                <div className="space-y-2">
                  <Label htmlFor="birthdayBonusPoints">{t('loyaltySettingsPage.text14')}</Label>
                  <Input
                    id="birthdayBonusPoints"
                    type="number"
                    min="0"
                    value={formData.birthdayBonusPoints}
                    onChange={(e) =>
                      setFormData({ ...formData, birthdayBonusPoints: parseInt(e.target.value) })
                    }
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* زر الحفظ */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            size="lg"
          >
            {updateSettings.isPending ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="ml-2 h-4 w-4" />
                حفظ الإعدادات
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
