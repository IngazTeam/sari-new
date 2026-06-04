import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, User, Store, CreditCard, Save, Bot, DollarSign, FileText, Upload, Trash2, RefreshCw, CheckCircle2, XCircle, Loader2, Image } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [logoUrl, setLogoUrl] = useState('');

  // Knowledge doc state
  const { data: knowledgeDoc, refetch: refetchKnowledgeDoc } = trpc.knowledgeDocs.getCurrent.useQuery();
  const deleteKnowledgeDocMutation = trpc.knowledgeDocs.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف الملف التعريفي بنجاح');
      refetchKnowledgeDoc();
    },
    onError: (err) => toast.error(err.message || 'فشل حذف الملف'),
  });
  const reprocessMutation = trpc.knowledgeDocs.reprocess.useMutation({
    onSuccess: () => {
      toast.success('تم إعادة معالجة الملف بنجاح');
      refetchKnowledgeDoc();
    },
    onError: (err) => toast.error(err.message || 'فشل إعادة المعالجة'),
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (file: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error('نوع الملف غير مدعوم. يرجى رفع PDF أو Word أو Excel فقط.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الملف أكبر من 5 ميجابايت.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/knowledge-docs/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل رفع الملف');
      toast.success(data.isUpdate
        ? `تم تحديث الملف بنجاح! ✅ — المعرفة تطورت ${data.evolveStats ? `(+${data.evolveStats.added} جديد، ↗${data.evolveStats.evolved} تطوير)` : ''}`
        : 'تم رفع الملف بنجاح! ✅ — اذهب لصفحة "عقل ساري" لمراجعة التأثير', {
        action: {
          label: '🧠 مراجعة',
          onClick: () => window.location.assign('/merchant/sari-brain'),
        },
        duration: 8000,
      });
      refetchKnowledgeDoc();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء رفع الملف');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [refetchKnowledgeDoc]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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

      {/* Knowledge Document Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />{t('settings.auto_0')}</CardTitle>
          <CardDescription>{t('settings.auto_1')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current doc display */}
          {knowledgeDoc && (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium text-sm">{knowledgeDoc.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(knowledgeDoc.fileSize)} • {knowledgeDoc.fileType.toUpperCase()}
                  </p>
                </div>
                {knowledgeDoc.extractionStatus === 'completed' && (
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950 px-2 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />{t('settings.auto_2')}</span>
                )}
                {knowledgeDoc.extractionStatus === 'failed' && (
                  <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 dark:bg-red-950 px-2 py-1 rounded-full">
                    <XCircle className="w-3 h-3" />{t('settings.auto_3')}</span>
                )}
                {knowledgeDoc.extractionStatus === 'processing' && (
                  <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-950 px-2 py-1 rounded-full">
                    <Loader2 className="w-3 h-3 animate-spin" />{t('settings.auto_4')}</span>
                )}
              </div>
              <div className="flex gap-2">
                {knowledgeDoc.extractionStatus === 'failed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reprocessMutation.mutate()}
                    disabled={reprocessMutation.isPending}
                  >
                    <RefreshCw className={`w-4 h-4 ml-1 ${reprocessMutation.isPending ? 'animate-spin' : ''}`} />{t('settings.auto_5')}</Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { if (confirm('هل تريد حذف الملف التعريفي؟')) deleteKnowledgeDocMutation.mutate(); }}
                  disabled={deleteKnowledgeDocMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 ml-1" />{t('settings.auto_6')}</Button>
              </div>
            </div>
          )}

          {/* Upload area */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFileUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-sm font-medium">{t('settings.auto_7')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {knowledgeDoc ? 'اسحب ملفاً جديداً هنا أو اضغط للاستبدال' : 'اسحب الملف هنا أو اضغط لاختيار ملف'}
                </p>
                <p className="text-xs text-muted-foreground">PDF, DOCX, XLSX — {t('settings.auto_8')}</p>
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              💡 <strong>{t('settings.auto_9')}</strong>{t('settings.auto_10')}</p>
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