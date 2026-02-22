import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, User, Store, CreditCard, Save, Bot, DollarSign } from 'lucide-react';
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
      setAutoReplyEnabled(merchant.autoReplyEnabled ?? true);
      setCurrency(merchant.currency || 'SAR');
    }
  }, [merchant]);

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success(t('toast.settings.msg1'));
      refetchUser();
    },
    onError: (error) => {
      toast.error(error.message || t('settingsPage.failedUpdateAccount'));
    },
  });

  const updateMerchantMutation = trpc.merchants.update.useMutation({
    onSuccess: () => {
      toast.success(t('toast.settings.msg3'));
      refetchMerchant();
    },
    onError: (error) => {
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
      email: userEmail || undefined,
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
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="example@email.com"
              />
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
            <h3 className="text-lg font-semibold mb-2">{t('settingsPage.comingSoon')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('settingsPage.comingSoonDesc')}
            </p>
            <div className="flex flex-wrap justify-center gap-4 mt-6">
              <div className="px-4 py-2 bg-muted rounded-lg">
                <span className="font-semibold">Tap</span>
              </div>
              <div className="px-4 py-2 bg-muted rounded-lg">
                <span className="font-semibold">PayPal</span>
              </div>
              <div className="px-4 py-2 bg-muted rounded-lg">
                <span className="font-semibold">Link</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup Wizard Reset */}
      <SetupWizardReset />
    </div>
  );
}
