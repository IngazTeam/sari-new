import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, XCircle, ExternalLink, Store, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';

export default function WooCommerceSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [storeUrl, setStoreUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [autoSyncProducts, setAutoSyncProducts] = useState(true);
  const [autoSyncOrders, setAutoSyncOrders] = useState(true);
  const [syncInterval, setSyncInterval] = useState(60);

  // Queries
  const { data: settings, isLoading, refetch } = trpc.woocommerce.getSettings.useQuery();

  // Mutations
  const saveSettings = trpc.woocommerce.saveSettings.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم الحفظ',
        description: 'تم حفظ إعدادات WooCommerce بنجاح',
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'خطأ',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const testConnection = trpc.woocommerce.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'نجح الاتصال',
          description: data.message,
        });
        refetch();
      } else {
        toast({
          title: 'فشل الاتصال',
          description: data.message,
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'خطأ',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const disconnect = trpc.woocommerce.disconnect.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم الفصل',
        description: 'تم فصل الاتصال بـ WooCommerce بنجاح',
      });
      setStoreUrl('');
      setConsumerKey('');
      setConsumerSecret('');
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'خطأ',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Load settings when available
  useState(() => {
    if (settings) {
      setStoreUrl(settings.storeUrl || '');
      setAutoSyncProducts(settings.autoSyncProducts === 1);
      setAutoSyncOrders(settings.autoSyncOrders === 1);
      setSyncInterval(settings.syncInterval || 60);
    }
  });

  const handleSave = () => {
    if (!storeUrl || !consumerKey || !consumerSecret) {
      toast({
        title: 'خطأ',
        description: 'يرجى ملء جميع الحقول المطلوبة',
        variant: 'destructive',
      });
      return;
    }

    saveSettings.mutate({
      storeUrl,
      consumerKey,
      consumerSecret,
      autoSyncProducts,
      autoSyncOrders,
      syncInterval,
    });
  };

  const handleTestConnection = () => {
    testConnection.mutate();
  };

  const handleDisconnect = () => {
    if (confirm('هل أنت متأكد من فصل الاتصال بـ WooCommerce؟ سيتم حذف جميع البيانات المزامنة.')) {
      disconnect.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isConnected = settings?.connectionStatus === 'connected';

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('wooCommerceSettingsPage.text0')}</h1>
          <p className="text-muted-foreground mt-2">
            ربط متجر WooCommerce الخاص بك مع ساري لمزامنة المنتجات والطلبات تلقائياً
          </p>
        </div>
        <Store className="w-12 h-12 text-primary" />
      </div>

      {/* Connection Status */}
      {settings && (
        <Alert className={isConnected ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'}>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-yellow-600" />
            )}
            <AlertDescription className={isConnected ? 'text-green-800' : 'text-yellow-800'}>
              {isConnected ? (
                <>
                  <strong>{t('wooCommerceSettingsPage.text1')}</strong> - متجرك مربوط بنجاح
                  {settings.storeName && ` (${settings.storeName})`}
                </>
              ) : (
                <><strong>{t('wooCommerceSettingsPage.text2')}</strong> - يرجى اختبار الاتصال</>
              )}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Store Information */}
      {isConnected && settings && (
        <Card>
          <CardHeader>
            <CardTitle>{t('wooCommerceSettingsPage.text3')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('wooCommerceSettingsPage.text4')}</p>
                <p className="font-medium">{settings.storeName || 'غير متوفر'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('wooCommerceSettingsPage.text5')}</p>
                <p className="font-medium">{settings.storeVersion || 'غير متوفر'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('wooCommerceSettingsPage.text6')}</p>
                <p className="font-medium">{settings.storeCurrency || 'غير متوفر'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('wooCommerceSettingsPage.text7')}</p>
                <p className="font-medium">
                  {settings.lastSyncAt
                    ? new Date(settings.lastSyncAt).toLocaleString('ar-SA')
                    : 'لم تتم المزامنة بعد'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connection Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('wooCommerceSettingsPage.text8')}</CardTitle>
          <CardDescription>
            أدخل بيانات الاتصال بمتجر WooCommerce الخاص بك
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storeUrl">{t('wooCommerceSettingsPage.text9')}</Label>
            <Input
              id="storeUrl"
              type="url"
              placeholder="https://yourstore.com"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              disabled={saveSettings.isPending}
            />
            <p className="text-xs text-muted-foreground">
              مثال: https://yourstore.com
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="consumerKey">Consumer Key *</Label>
            <Input
              id="consumerKey"
              type="text"
              placeholder="ck_xxxxxxxxxxxxxxxxxxxxx"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              disabled={saveSettings.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="consumerSecret">Consumer Secret *</Label>
            <Input
              id="consumerSecret"
              type="password"
              placeholder="cs_xxxxxxxxxxxxxxxxxxxxx"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              disabled={saveSettings.isPending}
            />
          </div>

          <Alert>
            <AlertDescription>
              <strong>{t('wooCommerceSettingsPage.text10')}</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                <li>{t('wooCommerceSettingsPage.text11')}</li>
                <li>{t('wooCommerceSettingsPage.text12')}</li>
                <li>{t('wooCommerceSettingsPage.text13')}</li>
                <li>{t('wooCommerceSettingsPage.text14')}</li>
              </ol>
              <a
                href="https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 mt-2"
              >
                دليل الاستخدام الكامل <ExternalLink className="w-3 h-3" />
              </a>
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saveSettings.isPending}
              className="flex-1"
            >
              {saveSettings.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ الإعدادات
            </Button>
            <Button
              onClick={handleTestConnection}
              disabled={testConnection.isPending || !settings}
              variant="outline"
            >
              {testConnection.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              اختبار الاتصال
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sync Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('wooCommerceSettingsPage.text15')}</CardTitle>
          <CardDescription>
            تحكم في كيفية مزامنة البيانات بين ساري و WooCommerce
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('wooCommerceSettingsPage.text16')}</Label>
              <p className="text-sm text-muted-foreground">
                مزامنة المنتجات من WooCommerce بشكل دوري
              </p>
            </div>
            <Switch
              checked={autoSyncProducts}
              onCheckedChange={setAutoSyncProducts}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('wooCommerceSettingsPage.text17')}</Label>
              <p className="text-sm text-muted-foreground">
                مزامنة الطلبات من WooCommerce بشكل دوري
              </p>
            </div>
            <Switch
              checked={autoSyncOrders}
              onCheckedChange={setAutoSyncOrders}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="syncInterval">{t('wooCommerceSettingsPage.text18')}</Label>
            <Input
              id="syncInterval"
              type="number"
              min="5"
              max="1440"
              value={syncInterval}
              onChange={(e) => setSyncInterval(parseInt(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              الحد الأدنى: 5 دقائق، الحد الأقصى: 1440 دقيقة (24 ساعة)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      {settings && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">{t('wooCommerceSettingsPage.text19')}</CardTitle>
            <CardDescription>
              إجراءات لا يمكن التراجع عنها
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleDisconnect}
              disabled={disconnect.isPending}
              variant="destructive"
            >
              {disconnect.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              فصل الاتصال وحذف جميع البيانات
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
