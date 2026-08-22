import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export default function WooCommerceSettings() {
  const { t, i18n } = useTranslation();
  const arabic = i18n.language.startsWith("ar");
  const [storeUrl, setStoreUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");

  const settingsQuery = trpc.woocommerce.getSettings.useQuery();
  const settings = settingsQuery.data;

  useEffect(() => {
    setStoreUrl(settings?.storeUrl || "");
  }, [settings?.storeUrl]);

  const saveSettings = trpc.woocommerce.saveSettings.useMutation({
    onSuccess: async () => {
      setConsumerKey("");
      setConsumerSecret("");
      await settingsQuery.refetch();
      toast.success(arabic ? "تم التحقق من الاتصال وتسجيل التحديثات الفورية بأمان" : "Connection verified and secure live updates registered");
    },
    onError: error => toast.error(error.message),
  });

  const testConnection = trpc.woocommerce.testConnection.useMutation({
    onSuccess: async () => {
      await settingsQuery.refetch();
      toast.success(arabic ? "تم التحقق من الاتصال بنجاح" : "Connection verified successfully");
    },
    onError: error => toast.error(error.message),
  });

  const syncProducts = trpc.woocommerce.syncProducts.useMutation({
    onSuccess: data => toast.success(arabic ? `تمت مزامنة ${data.count} منتج` : `${data.count} products synchronized`),
    onError: error => toast.error(error.message),
  });

  const syncOrders = trpc.woocommerce.syncOrders.useMutation({
    onSuccess: data => toast.success(arabic ? `تمت مزامنة ${data.count} طلب` : `${data.count} orders synchronized`),
    onError: error => toast.error(error.message),
  });

  const disconnect = trpc.woocommerce.disconnect.useMutation({
    onSuccess: async () => {
      setStoreUrl("");
      setConsumerKey("");
      setConsumerSecret("");
      await settingsQuery.refetch();
      toast.success(arabic ? "تم فصل WooCommerce وحذف نسخه المحلية" : "WooCommerce disconnected and local copies deleted");
    },
    onError: error => toast.error(error.message),
  });

  const handleSave = () => {
    const keyMissing = !settings?.hasConsumerKey && !consumerKey.trim();
    const secretMissing = !settings?.hasConsumerSecret && !consumerSecret.trim();
    if (!storeUrl.trim() || keyMissing || secretMissing) {
      toast.error(arabic ? "أدخل رابط HTTPS والمفتاح والسر للاتصال الأول" : "Enter the HTTPS URL, key, and secret for the first connection");
      return;
    }

    saveSettings.mutate({
      storeUrl: storeUrl.trim(),
      consumerKey: consumerKey.trim() || undefined,
      consumerSecret: consumerSecret.trim() || undefined,
    });
  };

  const handleDisconnect = () => {
    const prompt = arabic
      ? "سيتم حذف المنتجات والطلبات المنسوخة محليًا. هل تريد المتابعة؟"
      : "Locally synchronized products and orders will be deleted. Continue?";
    if (window.confirm(prompt)) disconnect.mutate();
  };

  if (settingsQuery.isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const connected = settings?.connected === true;
  const credentialsStored = settings?.hasConsumerKey && settings?.hasConsumerSecret;

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{t("wooCommerceSettingsPage.text9")}</h1>
        <p className="text-muted-foreground">
          {settings?.webhook.ready
            ? (arabic
                ? "اتصال HTTPS موثّق وتحديثات تلقائية موقّعة للمنتجات والطلبات، مع مزامنة يدوية احتياطية."
                : "Verified HTTPS connection with signed automatic product and order updates, plus manual fallback sync.")
            : (arabic
                ? "اتصال HTTPS موثّق ومزامنة يدوية محدودة حتى يكتمل تسجيل التحديثات التلقائية."
                : "Verified HTTPS connection with bounded manual sync until automatic updates are registered.")}
        </p>
      </div>

      {connected && (
        <Alert className="mb-6 border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {arabic ? "الاتصال متحقق" : "Connection verified"}
            {settings.storeName ? ` — ${settings.storeName}` : ""}
            {settings.lastSyncAt ? ` · ${new Date(settings.lastSyncAt).toLocaleString(arabic ? "ar-SA" : "en-US")}` : ""}
            {settings.webhook.ready
              ? ` · ${arabic ? "التحديثات التلقائية مسجّلة" : "automatic updates registered"}`
              : ` · ${arabic ? "التحديثات التلقائية غير جاهزة" : "automatic updates not ready"}`}
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("wooCommerceSettingsPage.text10")}</CardTitle>
          <CardDescription>
            {arabic
              ? "نختبر الصلاحيات قبل الحفظ، ونشفّر المفتاح والسر ولا نعيدهما إلى المتصفح."
              : "Credentials are verified before saving, encrypted at rest, and never returned to the browser."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="woo-store-url">{t("wooCommerceSettingsPage.text11")}</Label>
            <Input id="woo-store-url" type="url" placeholder="https://example.com" value={storeUrl} onChange={event => setStoreUrl(event.target.value)} dir="ltr" autoComplete="url" />
            <p className="text-sm text-muted-foreground">
              {arabic ? "يلزم HTTPS ونطاق عام؛ لا تُقبل عناوين الشبكات المحلية." : "HTTPS and a public hostname are required; local network addresses are rejected."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="woo-consumer-key">Consumer Key {settings?.hasConsumerKey ? `(${arabic ? "محفوظ" : "saved"})` : ""}</Label>
            <Input id="woo-consumer-key" type="password" placeholder={settings?.hasConsumerKey ? "••••••••••••" : "ck_xxxxxxxxxxxxx"} value={consumerKey} onChange={event => setConsumerKey(event.target.value)} dir="ltr" autoComplete="new-password" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="woo-consumer-secret">Consumer Secret {settings?.hasConsumerSecret ? `(${arabic ? "محفوظ" : "saved"})` : ""}</Label>
            <Input id="woo-consumer-secret" type="password" placeholder={settings?.hasConsumerSecret ? "••••••••••••" : "cs_xxxxxxxxxxxxx"} value={consumerSecret} onChange={event => setConsumerSecret(event.target.value)} dir="ltr" autoComplete="new-password" />
          </div>

          <Alert>
            <ExternalLink className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">{arabic ? "إنشاء مفاتيح بصلاحية القراءة والكتابة" : "Create read/write API credentials"}</p>
              <p className="mt-1 text-sm">WooCommerce → Settings → Advanced → REST API</p>
              <a className="mt-2 inline-block text-sm text-primary underline" href="https://developer.woocommerce.com/docs/apis/rest-api/authentication" target="_blank" rel="noreferrer">
                {arabic ? "مرجع المصادقة الرسمي" : "Official authentication reference"}
              </a>
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={handleSave} disabled={saveSettings.isPending}>
              {saveSettings.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {arabic ? "تحقق واحفظ" : "Verify and save"}
            </Button>
            <Button variant="outline" onClick={() => testConnection.mutate()} disabled={!credentialsStored || testConnection.isPending}>
              {testConnection.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {arabic ? "أعد اختبار الاتصال" : "Retest connection"}
            </Button>
            {settings && (
              <Button variant="destructive" onClick={handleDisconnect} disabled={disconnect.isPending}>
                <Unplug className="me-2 h-4 w-4" />
                {arabic ? "فصل وحذف النسخ المحلية" : "Disconnect and delete local copies"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{arabic ? "حالة المزامنة" : "Synchronization status"}</CardTitle>
          <CardDescription>
            {settings?.webhook.ready
              ? (arabic
                  ? `سُجلت 6 أحداث موقّعة لاستقبال تغييرات WooCommerce تلقائيًا. المستلم ينتظر: ${settings.webhook.health?.awaiting ?? 0}، مراجعة يدوية: ${settings.webhook.health?.manualReview ?? 0}. أعد اختبار الاتصال للتحقق من حالتها لدى WooCommerce، واستخدم الأزرار أدناه للمصالحة الكاملة عند الحاجة.`
                  : `Six signed events are registered for automatic WooCommerce updates. Awaiting: ${settings.webhook.health?.awaiting ?? 0}; manual review: ${settings.webhook.health?.manualReview ?? 0}. Retest the connection to verify their current provider status, and use the buttons below for a full reconciliation when needed.`)
              : (arabic
                  ? "المزامنة التلقائية ليست جاهزة لهذا الاتصال. كل تشغيل يدوي يجلب لقطة مكتملة ومحدودة ثم يحدّث قاعدة البيانات ذريًا."
                  : "Automatic synchronization is not ready for this connection. Each manual run fetches a complete bounded snapshot before an atomic update.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => syncProducts.mutate()} disabled={!connected || syncProducts.isPending}>
            {syncProducts.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCw className="me-2 h-4 w-4" />}
            {t("wooCommerceSettingsPage.text30")}
          </Button>
          <Button variant="outline" onClick={() => syncOrders.mutate()} disabled={!connected || syncOrders.isPending}>
            {syncOrders.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCw className="me-2 h-4 w-4" />}
            {t("wooCommerceSettingsPage.text31")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
