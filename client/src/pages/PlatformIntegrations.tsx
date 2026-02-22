/**
 * صفحة إدارة ربط منصات التجارة الإلكترونية
 * تعرض المنصة المربوطة حالياً وتسمح بالفصل أو التبديل
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Store, CheckCircle2, XCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface PlatformInfo {
  platform: 'salla' | 'zid' | 'woocommerce' | 'shopify';
  name: string;
  storeUrl?: string;
  connectedAt?: Date | null;
}

export default function PlatformIntegrations() {
  const { t } = useTranslation();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const utils = trpc.useUtils();

  // استعلام المنصة المربوطة حالياً
  const { data: currentPlatform, isLoading } = trpc.integrations.getCurrentPlatform.useQuery();

  // استعلام حالة كل منصة
  const { data: sallaConnection } = trpc.salla.getConnection.useQuery(
    { merchantId: 1 }, // TODO: استخدام merchantId الحقيقي
    { enabled: !currentPlatform || currentPlatform.platform === 'salla' }
  );

  const { data: zidStatus } = trpc.zid.getStatus.useQuery(
    undefined,
    { enabled: !currentPlatform || currentPlatform.platform === 'zid' }
  );

  const { data: wooSettings } = trpc.woocommerce.getSettings.useQuery(
    undefined,
    { enabled: !currentPlatform || currentPlatform.platform === 'woocommerce' }
  );

  // Mutations للفصل
  const disconnectSalla = trpc.salla.disconnect.useMutation({
    onSuccess: () => {
      toast.success(t('platformIntegrationsPage.text0'));
      utils.integrations.getCurrentPlatform.invalidate();
      utils.salla.getConnection.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل فصل سلة');
    },
  });

  const disconnectZid = trpc.zid.disconnect.useMutation({
    onSuccess: () => {
      toast.success(t('platformIntegrationsPage.text1'));
      utils.integrations.getCurrentPlatform.invalidate();
      utils.zid.getStatus.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل فصل زد');
    },
  });

  const disconnectWoo = trpc.woocommerce.disconnect.useMutation({
    onSuccess: () => {
      toast.success(t('platformIntegrationsPage.text2'));
      utils.integrations.getCurrentPlatform.invalidate();
      utils.woocommerce.getSettings.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل فصل ووكومرس');
    },
  });

  const handleDisconnect = async (platform: string) => {
    if (!confirm('هل أنت متأكد من فصل هذه المنصة؟ سيتم إيقاف المزامنة التلقائية.')) {
      return;
    }

    setIsDisconnecting(true);
    try {
      switch (platform) {
        case 'salla':
          await disconnectSalla.mutateAsync({ merchantId: 1 }); // TODO: merchantId الحقيقي
          break;
        case 'zid':
          await disconnectZid.mutateAsync();
          break;
        case 'woocommerce':
          await disconnectWoo.mutateAsync();
          break;
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const platforms = [
    {
      id: 'salla',
      name: 'سلة',
      description: 'منصة التجارة الإلكترونية السعودية الرائدة',
      logo: '🛍️',
      connected: sallaConnection?.connected,
      storeUrl: sallaConnection?.storeUrl,
      setupUrl: '/merchant/integrations/salla',
    },
    {
      id: 'zid',
      name: 'زد',
      description: 'منصة سعودية لإنشاء المتاجر الإلكترونية',
      logo: '🏪',
      connected: zidStatus?.connected,
      storeUrl: zidStatus?.storeUrl,
      setupUrl: '/merchant/integrations/zid',
    },
    {
      id: 'woocommerce',
      name: 'ووكومرس',
      description: 'إضافة ووردبريس للتجارة الإلكترونية',
      logo: '🛒',
      connected: wooSettings?.isActive === 1,
      storeUrl: wooSettings?.storeUrl,
      setupUrl: '/merchant/integrations/woocommerce',
    },
    {
      id: 'shopify',
      name: 'شوبيفاي',
      description: 'منصة عالمية للتجارة الإلكترونية',
      logo: '🏬',
      connected: false,
      setupUrl: '/merchant/integrations/shopify',
    },
  ];

  const connectedPlatform = platforms.find((p) => p.connected);
  const availablePlatforms = platforms.filter((p) => !p.connected);

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t('platformIntegrationsPage.text3')}</h1>
        <p className="text-muted-foreground mt-2">
          قم بربط متجرك الإلكتروني لمزامنة المنتجات والطلبات تلقائياً
        </p>
      </div>

      {/* تنبيه: منصة واحدة فقط */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>{t('platformIntegrationsPage.text4')}</strong> يمكنك ربط منصة واحدة فقط في نفس الوقت لتجنب تضارب البيانات.
          إذا أردت التبديل إلى منصة أخرى، يجب فصل المنصة الحالية أولاً.
        </AlertDescription>
      </Alert>

      {/* المنصة المربوطة حالياً */}
      {connectedPlatform && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-4xl">{connectedPlatform.logo}</div>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {connectedPlatform.name}
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      مربوط
                    </Badge>
                  </CardTitle>
                  <CardDescription>{connectedPlatform.description}</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {connectedPlatform.storeUrl && (
              <div className="flex items-center gap-2 text-sm">
                <Store className="h-4 w-4 text-muted-foreground" />
                <a
                  href={connectedPlatform.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  {connectedPlatform.storeUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => (window.location.href = connectedPlatform.setupUrl)}
              >
                إدارة الإعدادات
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDisconnect(connectedPlatform.id)}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    جاري الفصل...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    فصل المنصة
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* المنصات المتاحة */}
      <div>
        <h2 className="text-xl font-semibold mb-4">
          {connectedPlatform ? 'منصات أخرى متاحة' : 'اختر منصة للربط'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availablePlatforms.map((platform) => (
            <Card
              key={platform.id}
              className={connectedPlatform ? 'opacity-60' : ''}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{platform.logo}</div>
                  <div>
                    <CardTitle>{platform.name}</CardTitle>
                    <CardDescription>{platform.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!!connectedPlatform}
                  onClick={() => (window.location.href = platform.setupUrl)}
                >
                  {connectedPlatform ? 'غير متاح (افصل المنصة الحالية أولاً)' : 'ربط الآن'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* معلومات إضافية */}
      <Card>
        <CardHeader>
          <CardTitle>{t('platformIntegrationsPage.text5')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>{t('platformIntegrationsPage.text6')}</strong> ربط منصات متعددة قد يؤدي إلى تكرار المنتجات والطلبات
            وصعوبة التتبع.
          </p>
          <p>
            <strong>{t('platformIntegrationsPage.text7')}</strong> المزامنة مع منصة واحدة تضمن سرعة أفضل واستهلاك أقل للموارد.
          </p>
          <p>
            <strong>{t('platformIntegrationsPage.text8')}</strong> إدارة منصة واحدة أبسط وأكثر وضوحاً من إدارة منصات متعددة.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
