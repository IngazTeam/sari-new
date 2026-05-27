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
import { Loader2, Store, CheckCircle2, XCircle, ExternalLink, AlertTriangle, FileSpreadsheet, Calendar, GraduationCap, RefreshCw, Users, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';

// ═══════════════════════════════════════════════════════════════
// Byaan Sync Status Panel — Shows connection stats + test button
// ═══════════════════════════════════════════════════════════════

function ByaanSyncStatusPanel() {
  const { data: status, isLoading } = trpc.integrations.getByaanStatus.useQuery();
  const testMutation = trpc.integrations.testByaanConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جاري فحص حالة الربط...</div>;
  if (!status?.isConnected) return null;

  return (
    <div className="space-y-3">
      {/* Connection info */}
      {status.byaan?.tenantDomain && (
        <div className="flex items-center gap-2 text-sm bg-white/50 dark:bg-white/5 rounded-lg px-3 py-2 border">
          <GraduationCap className="h-4 w-4 text-indigo-500" />
          <span className="text-muted-foreground">النطاق:</span>
          <code className="text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded" dir="ltr">{status.byaan.tenantDomain}</code>
          {status.byaan.lastSyncAt && (
            <span className="text-xs text-muted-foreground mr-auto">
              آخر مزامنة: {new Date(status.byaan.lastSyncAt).toLocaleString('ar-SA')}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>📦 {status.stats.products} {status.terminology?.products || 'منتج'}</span>
        <span>👥 {status.stats.customers} {status.terminology?.customers || 'عميل'}</span>
      </div>

      {/* Test connection button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => testMutation.mutate()}
        disabled={testMutation.isPending}
        className="gap-1.5"
      >
        {testMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {testMutation.isPending ? 'جاري الفحص...' : 'اختبار الاتصال'}
      </Button>
    </div>
  );
}

interface PlatformInfo {
  platform: 'salla' | 'zid' | 'woocommerce' | 'shopify' | 'byaan';
  name: string;
  storeUrl?: string;
  connectedAt?: Date | null;
}

export default function PlatformIntegrations() {
  const { t } = useTranslation();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const utils = trpc.useUtils();

  // استعلام حالة Google Services
  const { data: sheetsStatus } = trpc.sheets.getStatus.useQuery();
  const { data: calendarStatus } = trpc.calendar.getStatus.useQuery();

  // استعلام المنصة المربوطة حالياً
  const { data: currentPlatform, isLoading } = trpc.integrations.getCurrentPlatform.useQuery();

  // استعلام حالة كل منصة
  const { data: sallaConnection } = trpc.salla.getConnection.useQuery(
    { merchantId: 1 }, // TODO: استخدام merchantId الحقيقي
    { enabled: !currentPlatform || currentPlatform.platform === 'salla' }
  );

  const { data: zidStatus } = trpc.zid.getConnection.useQuery(
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
    onError: (error: any) => {
      toast.error(error.message || 'فشل فصل سلة');
    },
  });

  const disconnectZid = trpc.zid.disconnect.useMutation({
    onSuccess: () => {
      toast.success(t('platformIntegrationsPage.text1'));
      utils.integrations.getCurrentPlatform.invalidate();
      utils.zid.getConnection.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل فصل زد');
    },
  });

  const disconnectWoo = trpc.woocommerce.disconnect.useMutation({
    onSuccess: () => {
      toast.success(t('platformIntegrationsPage.text2'));
      utils.integrations.getCurrentPlatform.invalidate();
      utils.woocommerce.getSettings.invalidate();
    },
    onError: (error: any) => {
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
          await disconnectZid.mutateAsync({} as any);
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
    {
      id: 'byaan',
      name: 'بيان',
      description: 'منصة إدارة المراكز التدريبية — دورات، متدربين، تسجيلات',
      logo: '🎓',
      connected: currentPlatform?.platform === 'byaan',
      storeUrl: currentPlatform?.platform === 'byaan' ? currentPlatform.storeUrl : undefined,
      setupUrl: '/merchant/integrations/byaan',
    },
  ];

  const connectedPlatform = platforms.find((p) => p.connected);
  const availablePlatforms = platforms.filter((p) => !p.connected);

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t('platformIntegrationsPage.text12')}</h1>
        <p className="text-muted-foreground mt-2">{t('platformIntegrations.auto_0')}</p>
      </div>

      {/* تنبيه: منصة واحدة فقط */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>{t('platformIntegrationsPage.text4')}</strong>{t('platformIntegrations.auto_1')}</AlertDescription>
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
                      <CheckCircle2 className="h-3 w-3 mr-1" />{t('platformIntegrations.auto_2')}</Badge>
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

            {/* Byaan-specific: sync stats and resync */}
            {connectedPlatform.id === 'byaan' && <ByaanSyncStatusPanel />}

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
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('platformIntegrations.auto_3')}</>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />{t('platformIntegrations.auto_4')}</>
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

      {/* ═══════════════ خدمات Google ═══════════════ */}
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('platformIntegrations.auto_5')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Google Sheets */}
          <Card className={sheetsStatus?.isConnected ? 'border-green-500 bg-green-50 dark:bg-green-950' : ''}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Google Sheets
                    {sheetsStatus?.isConnected && (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />{t('platformIntegrations.auto_6')}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{t('platformIntegrations.auto_7')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Link href="/merchant/sheets/settings">
                <Button variant={sheetsStatus?.isConnected ? 'outline' : 'default'} className="w-full">
                  {sheetsStatus?.isConnected ? 'إدارة الإعدادات' : 'ربط Google Sheets'}
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Google Calendar */}
          <Card className={calendarStatus?.connected ? 'border-green-500 bg-green-50 dark:bg-green-950' : ''}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-blue-600" />
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Google Calendar
                    {calendarStatus?.connected && (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />{t('platformIntegrations.auto_8')}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{t('platformIntegrations.auto_9')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Link href="/merchant/calendar/settings">
                <Button variant={calendarStatus?.connected ? 'outline' : 'default'} className="w-full">
                  {calendarStatus?.connected ? 'إدارة الإعدادات' : 'ربط Google Calendar'}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* معلومات إضافية */}
      <Card>
        <CardHeader>
          <CardTitle>{t('platformIntegrationsPage.text5')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>{t('platformIntegrationsPage.text6')}</strong>{t('platformIntegrations.auto_10')}</p>
          <p>
            <strong>{t('platformIntegrationsPage.text7')}</strong>{t('platformIntegrations.auto_11')}</p>
          <p>
            <strong>{t('platformIntegrationsPage.text8')}</strong>{t('platformIntegrations.auto_12')}</p>
        </CardContent>
      </Card>
    </div>
  );
}