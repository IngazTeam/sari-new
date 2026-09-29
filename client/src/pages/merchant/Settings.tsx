import { trpc } from '@/lib/trpc';
import { KnowledgeDocumentUpload } from '@/components/KnowledgeDocumentUpload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, User, Store, CreditCard, Save, Bot, DollarSign, Trash2, CheckCircle2, Loader2, Image, Globe, MailCheck } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
import SetupWizardReset from '@/components/SetupWizardReset';

export default function MerchantSettings() {
  const { t } = useTranslation();

  const { data: user, refetch: refetchUser } = trpc.auth.me.useQuery();
  const { data: merchant, refetch: refetchMerchant } = trpc.merchants.getCurrent.useQuery();

  // User profile state
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // Merchant profile state
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [currency, setCurrency] = useState<'SAR' | 'USD'>('SAR');
  const [timezone, setTimezone] = useState('Asia/Riyadh');
  const [logoUrl, setLogoUrl] = useState('');

  // Initialize form data
  useEffect(() => {
    if (user) {
      setUserName(user.name || '');
      setUserEmail(user.email || '');
    }
  }, [user]);

  useEffect(() => {
    if (merchant) {
      setBusinessName(merchant.businessName || '');
      setPhone(merchant.phone || '');
      // @ts-ignore
      setAutoReplyEnabled((merchant as any).autoReplyEnabled != null ? !!(merchant as any).autoReplyEnabled : true);
      setCurrency(merchant.currency || 'SAR');
      setTimezone((merchant as any).timezone || 'Asia/Riyadh');
      setLogoUrl((merchant as any).logoUrl || (merchant as any).logo_url || '');
    }
  }, [merchant]);

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success(t('toast.settings.msg1'));
      refetchUser();
    },
    onError: (error: any) => {
      toast.error(error.message || t('settingsPage.failedUpdateAccount'));
    },
  });

  const sendVerificationMutation = trpc.auth.emailVerification.sendVerificationEmail.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      if (result.alreadyVerified) refetchUser();
    },
    onError: (error) => {
      toast.error(error.message || 'تعذر إرسال رابط التحقق حالياً');
    },
  });

  const updateMerchantMutation = trpc.merchants.update.useMutation({
    onSuccess: () => {
      toast.success(t('toast.settings.msg3'));
      refetchMerchant();
    },
    onError: (error: any) => {
      toast.error(error.message || t('settingsPage.failedUpdateStore'));
    },
  });

  const handleUpdateProfile = () => {
    if (!userName.trim()) {
      toast.error(t('toast.settings.msg5'));
      return;
    }

    updateProfileMutation.mutate({
      name: userName,
    });
  };

  const handleUpdateMerchant = () => {
    if (!businessName.trim()) {
      toast.error(t('toast.settings.msg6'));
      return;
    }

    updateMerchantMutation.mutate({
      businessName,
      phone: phone || undefined,
      autoReplyEnabled,
      currency,
      timezone,
      logoUrl: logoUrl.trim() || null,
    });
  };

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">{t('settingsPage.title')}</h1>
          <p className="text-muted-foreground">{t('settingsPage.description')}</p>
        </div>
      </div>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {t('settingsPage.accountInfo')}
          </CardTitle>
          <CardDescription>
            {t('settingsPage.accountInfoDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">{t('settingsPage.name')}</Label>
              <Input
                id="user-name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder={t('settingsPage.namePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email">{t('settingsPage.email')}</Label>
              <Input
                id="user-email"
                type="email"
                value={userEmail}
                placeholder="example@email.com"
                readOnly
                disabled
                aria-describedby="email-verification-status"
              />
              <div id="email-verification-status" className="flex flex-wrap items-center gap-2 text-xs">
                {user?.emailVerifiedAt ? (
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <CheckCircle2 className="h-4 w-4" /> البريد مؤكد
                  </span>
                ) : (
                  <>
                    <span className="text-amber-700">البريد غير مؤكد</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => sendVerificationMutation.mutate()}
                      disabled={sendVerificationMutation.isPending || !userEmail}
                    >
                      {sendVerificationMutation.isPending ? (
                        <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                      ) : (
                        <MailCheck className="ml-1 h-4 w-4" />
                      )}
                      إرسال رابط التحقق
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                تغيير البريد عملية حساسة وتتم عبر الدعم بعد التحقق من ملكية الحساب.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleUpdateProfile}
              disabled={updateProfileMutation.isPending}
            >
              <Save className="w-4 h-4 ml-2" />
              {updateProfileMutation.isPending ? t('settingsPage.saving') : t('settingsPage.saveChanges')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Business Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="w-5 h-5" />
            {t('settingsPage.storeInfo')}
          </CardTitle>
          <CardDescription>
            {t('settingsPage.storeInfoDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="business-name">{t('settingsPage.storeName')}</Label>
              <Input
                id="business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={t('settingsPage.storeNamePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('settingsPage.phone')}</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 5X XXX XXXX"
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">{t('settingsPage.currency')}</Label>
              <Select value={currency} onValueChange={(value: 'SAR' | 'USD') => setCurrency(value)}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAR">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      {t('settingsPage.sarLabel')}
                    </div>
                  </SelectItem>
                  <SelectItem value="USD">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      {t('settingsPage.usdLabel')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('settingsPage.currencyDesc')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                المنطقة الزمنية
              </Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* الخليج والشرق الأوسط */}
                  <SelectItem value="Asia/Riyadh">🇸🇦 السعودية (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Dubai">🇦🇪 الإمارات (UTC+4)</SelectItem>
                  <SelectItem value="Asia/Kuwait">🇰🇼 الكويت (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Qatar">🇶🇦 قطر (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Bahrain">🇧🇭 البحرين (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Muscat">🇴🇲 عُمان (UTC+4)</SelectItem>
                  <SelectItem value="Asia/Amman">🇯🇴 الأردن (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Baghdad">🇮🇶 العراق (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Beirut">🇱🇧 لبنان (UTC+2)</SelectItem>
                  {/* أفريقيا */}
                  <SelectItem value="Africa/Cairo">🇪🇬 مصر (UTC+2)</SelectItem>
                  <SelectItem value="Africa/Casablanca">🇲🇦 المغرب (UTC+1)</SelectItem>
                  <SelectItem value="Africa/Lagos">🇳🇬 نيجيريا (UTC+1)</SelectItem>
                  <SelectItem value="Africa/Nairobi">🇰🇪 كينيا (UTC+3)</SelectItem>
                  <SelectItem value="Africa/Johannesburg">🇿🇦 جنوب أفريقيا (UTC+2)</SelectItem>
                  {/* أوروبا */}
                  <SelectItem value="Europe/London">🇬🇧 لندن (UTC+0)</SelectItem>
                  <SelectItem value="Europe/Paris">🇫🇷 باريس (UTC+1)</SelectItem>
                  <SelectItem value="Europe/Berlin">🇩🇪 برلين (UTC+1)</SelectItem>
                  <SelectItem value="Europe/Istanbul">🇹🇷 تركيا (UTC+3)</SelectItem>
                  <SelectItem value="Europe/Moscow">🇷🇺 موسكو (UTC+3)</SelectItem>
                  {/* الأمريكتين */}
                  <SelectItem value="America/New_York">🇺🇸 نيويورك (UTC-5)</SelectItem>
                  <SelectItem value="America/Chicago">🇺🇸 شيكاغو (UTC-6)</SelectItem>
                  <SelectItem value="America/Los_Angeles">🇺🇸 لوس أنجلوس (UTC-8)</SelectItem>
                  <SelectItem value="America/Sao_Paulo">🇧🇷 ساو باولو (UTC-3)</SelectItem>
                  <SelectItem value="America/Argentina/Buenos_Aires">🇦🇷 الأرجنتين (UTC-3)</SelectItem>
                  <SelectItem value="America/Bogota">🇨🇴 كولومبيا (UTC-5)</SelectItem>
                  {/* آسيا */}
                  <SelectItem value="Asia/Karachi">🇵🇰 باكستان (UTC+5)</SelectItem>
                  <SelectItem value="Asia/Kolkata">🇮🇳 الهند (UTC+5:30)</SelectItem>
                  <SelectItem value="Asia/Jakarta">🇮🇩 إندونيسيا (UTC+7)</SelectItem>
                  <SelectItem value="Asia/Kuala_Lumpur">🇲🇾 ماليزيا (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Tokyo">🇯🇵 اليابان (UTC+9)</SelectItem>
                  <SelectItem value="Australia/Sydney">🇦🇺 أستراليا (UTC+10)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                💡 يُستخدم لعرض أوقات الرسائل وساعات العمل بشكل صحيح
              </p>
            </div>
          </div>

          {/* Logo for PDF Branding */}
          <div className="space-y-3 pt-2">
            <Label htmlFor="logo-url" className="flex items-center gap-2">
              <Image className="w-4 h-4" />
              شعار المتجر (لعروض الأسعار PDF)
            </Label>
            <div className="flex items-start gap-4">
              {/* Logo Preview */}
              <div className="flex-shrink-0">
                {logoUrl ? (
                  <div className="relative group">
                    <img
                      src={logoUrl}
                      alt="شعار المتجر"
                      className="w-20 h-20 rounded-xl object-contain border-2 border-primary/20 bg-muted/30 p-1"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        toast.error('رابط الشعار غير صالح');
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/20">
                    <Image className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  id="logo-url"
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  dir="ltr"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  💡 ألصق رابط شعار متجرك (PNG أو JPG). يظهر في ملفات PDF لعروض الأسعار.
                  {' '}يمكنك رفع الشعار في{' '}
                  <a href="/merchant/media-library" className="text-primary hover:underline">مكتبة الوسائط</a>
                  {' '}ونسخ الرابط.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleUpdateMerchant}
              disabled={updateMerchantMutation.isPending}
            >
              <Save className="w-4 h-4 ml-2" />
              {updateMerchantMutation.isPending ? t('settingsPage.saving') : t('settingsPage.saveChanges')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <KnowledgeDocumentUpload />

      {/* AI Auto-Reply Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            {t('settingsPage.autoReplySettings')}
          </CardTitle>
          <CardDescription>
            {t('settingsPage.autoReplyDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium">{t('settingsPage.enableAutoReply')}</div>
              <div className="text-sm text-muted-foreground">
                {t('settingsPage.autoReplyDetail')}
              </div>
            </div>
            <Switch
              checked={autoReplyEnabled}
              onCheckedChange={setAutoReplyEnabled}
            />
          </div>

          {autoReplyEnabled && (
            <div className="bg-primary/10 dark:bg-blue-950 p-4 rounded-lg">
              <h4 className="font-semibold text-primary dark:text-blue-100 mb-2">{t('settingsPage.autoReplyFeatures')}</h4>
              <ul className="text-sm text-primary dark:text-blue-200 space-y-1">
                <li>• {t('settingsPage.feature1')}</li>
                <li>• {t('settingsPage.feature2')}</li>
                <li>• {t('settingsPage.feature3')}</li>
                <li>• {t('settingsPage.feature4')}</li>
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleUpdateMerchant}
              disabled={updateMerchantMutation.isPending}
            >
              <Save className="w-4 h-4 ml-2" />
              {updateMerchantMutation.isPending ? t('settingsPage.saving') : t('settingsPage.saveChanges')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t('settingsPage.paymentMethods')}
          </CardTitle>
          <CardDescription>
            {t('settingsPage.paymentMethodsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <CreditCard className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Tap Payments</h3>
            <p className="text-muted-foreground mb-4">
              {t('settingsPage.paymentMethodsDesc')}
            </p>
            <Button asChild>
              <a href="/merchant/payment-settings">
                {t('sidebar.merchant.paymentSettings')}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Setup Wizard Reset */}
      <SetupWizardReset />
    </div>
  );
}
