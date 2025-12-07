import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { useTranslation } from 'react-i18next';
export default function PaymentGateways() {
  const { t } = useTranslation();

  const { data: gateways, isLoading, refetch } = trpc.paymentGateways.list.useQuery();
  const upsertMutation = trpc.paymentGateways.upsert.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg1'));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Find existing gateways
  const tapGateway = gateways?.find(g => g.gateway === 'tap');
  const paypalGateway = gateways?.find(g => g.gateway === 'paypal');

  // State for Tap Payment
  const [tapEnabled, setTapEnabled] = useState(tapGateway?.isEnabled || false);
  const [tapTestMode, setTapTestMode] = useState(tapGateway?.testMode ?? true);
  const [tapPublicKey, setTapPublicKey] = useState(tapGateway?.publicKey || '');
  const [tapSecretKey, setTapSecretKey] = useState(tapGateway?.secretKey || '');
  const [tapWebhookSecret, setTapWebhookSecret] = useState(tapGateway?.webhookSecret || '');
  const [showTapSecret, setShowTapSecret] = useState(false);

  // State for PayPal
  const [paypalEnabled, setPaypalEnabled] = useState(paypalGateway?.isEnabled || false);
  const [paypalTestMode, setPaypalTestMode] = useState(paypalGateway?.testMode ?? true);
  const [paypalClientId, setPaypalClientId] = useState(paypalGateway?.publicKey || '');
  const [paypalSecret, setPaypalSecret] = useState(paypalGateway?.secretKey || '');
  const [paypalWebhookId, setPaypalWebhookId] = useState(paypalGateway?.webhookSecret || '');
  const [showPaypalSecret, setShowPaypalSecret] = useState(false);

  // Update state when data loads
  useState(() => {
    if (tapGateway) {
      setTapEnabled(tapGateway.isEnabled);
      setTapTestMode(tapGateway.testMode);
      setTapPublicKey(tapGateway.publicKey || '');
      setTapSecretKey(tapGateway.secretKey || '');
      setTapWebhookSecret(tapGateway.webhookSecret || '');
    }
    if (paypalGateway) {
      setPaypalEnabled(paypalGateway.isEnabled);
      setPaypalTestMode(paypalGateway.testMode);
      setPaypalClientId(paypalGateway.publicKey || '');
      setPaypalSecret(paypalGateway.secretKey || '');
      setPaypalWebhookId(paypalGateway.webhookSecret || '');
    }
  });

  const handleSaveTap = async () => {
    await upsertMutation.mutateAsync({
      gateway: 'tap',
      isEnabled: tapEnabled,
      publicKey: tapPublicKey,
      secretKey: tapSecretKey,
      webhookSecret: tapWebhookSecret,
      testMode: tapTestMode,
    });
  };

  const handleSavePayPal = async () => {
    await upsertMutation.mutateAsync({
      gateway: 'paypal',
      isEnabled: paypalEnabled,
      publicKey: paypalClientId,
      secretKey: paypalSecret,
      webhookSecret: paypalWebhookId,
      testMode: paypalTestMode,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map(i => (
              <div key={i} className="h-96 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إعدادات بوابات الدفع</h1>
        <p className="text-muted-foreground mt-1">
          قم بإعداد وإدارة بوابات الدفع المتاحة للتجار
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tap Payment */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle>Tap Payment</CardTitle>
                  <CardDescription>بوابة الدفع السعودية</CardDescription>
                </div>
              </div>
              {tapEnabled && (
                <Badge variant="default">مفعّلة</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="tap-enabled">تفعيل Tap Payment</Label>
              <Switch
                id="tap-enabled"
                checked={tapEnabled}
                onCheckedChange={setTapEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="tap-test-mode">وضع الاختبار (Sandbox)</Label>
              <Switch
                id="tap-test-mode"
                checked={tapTestMode}
                onCheckedChange={setTapTestMode}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tap-public-key">Public Key</Label>
              <Input
                id="tap-public-key"
                placeholder="pk_test_..."
                value={tapPublicKey}
                onChange={(e) => setTapPublicKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                احصل عليه من لوحة تحكم Tap
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tap-secret-key">Secret Key</Label>
              <div className="relative">
                <Input
                  id="tap-secret-key"
                  type={showTapSecret ? "text" : "password"}
                  placeholder="sk_test_..."
                  value={tapSecretKey}
                  onChange={(e) => setTapSecretKey(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3"
                  onClick={() => setShowTapSecret(!showTapSecret)}
                >
                  {showTapSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tap-webhook-secret">Webhook Secret</Label>
              <Input
                id="tap-webhook-secret"
                placeholder="whsec_..."
                value={tapWebhookSecret}
                onChange={(e) => setTapWebhookSecret(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSaveTap}
              disabled={upsertMutation.isPending}
            >
              حفظ إعدادات Tap
            </Button>

            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">روابط مفيدة:</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <a
                  href="https://tap.company"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:text-primary"
                >
                  • الموقع الرسمي
                </a>
                <a
                  href="https://developers.tap.company"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:text-primary"
                >
                  • وثائق المطورين
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PayPal */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="h-8 w-8 text-blue-500" />
                <div>
                  <CardTitle>PayPal</CardTitle>
                  <CardDescription>بوابة الدفع الدولية</CardDescription>
                </div>
              </div>
              {paypalEnabled && (
                <Badge variant="default">مفعّلة</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="paypal-enabled">تفعيل PayPal</Label>
              <Switch
                id="paypal-enabled"
                checked={paypalEnabled}
                onCheckedChange={setPaypalEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="paypal-test-mode">وضع الاختبار (Sandbox)</Label>
              <Switch
                id="paypal-test-mode"
                checked={paypalTestMode}
                onCheckedChange={setPaypalTestMode}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paypal-client-id">Client ID</Label>
              <Input
                id="paypal-client-id"
                placeholder="AYSq3RDGsmBLJE-otTkBtM-jBc..."
                value={paypalClientId}
                onChange={(e) => setPaypalClientId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                احصل عليه من لوحة تحكم PayPal
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paypal-secret">Secret</Label>
              <div className="relative">
                <Input
                  id="paypal-secret"
                  type={showPaypalSecret ? "text" : "password"}
                  placeholder="EGnHDxD_qRPdaLdZz8iCr8N7_MzF-YHPTkjs6NKYQvQSBngp4PTTVWkPZRbL..."
                  value={paypalSecret}
                  onChange={(e) => setPaypalSecret(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3"
                  onClick={() => setShowPaypalSecret(!showPaypalSecret)}
                >
                  {showPaypalSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paypal-webhook-id">Webhook ID</Label>
              <Input
                id="paypal-webhook-id"
                placeholder="WH-..."
                value={paypalWebhookId}
                onChange={(e) => setPaypalWebhookId(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSavePayPal}
              disabled={upsertMutation.isPending}
            >
              حفظ إعدادات PayPal
            </Button>

            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">روابط مفيدة:</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <a
                  href="https://www.paypal.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:text-primary"
                >
                  • الموقع الرسمي
                </a>
                <a
                  href="https://developer.paypal.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:text-primary"
                >
                  • وثائق المطورين
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>تعليمات الإعداد</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">Tap Payment:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>سجل حساب في https://tap.company</li>
              <li>انتقل إلى "الإعدادات" ثم "API Keys"</li>
              <li>انسخ Public Key و Secret Key</li>
              <li>أنشئ Webhook وانسخ Webhook Secret</li>
              <li>الصق المفاتيح في الحقول أعلاه واحفظ</li>
            </ol>
          </div>

          <div>
            <h3 className="font-medium mb-2">PayPal:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>سجل حساب PayPal Business</li>
              <li>انتقل إلى https://developer.paypal.com</li>
              <li>أنشئ تطبيق جديد (App)</li>
              <li>انسخ Client ID و Secret</li>
              <li>أنشئ Webhook وانسخ Webhook ID</li>
              <li>الصق المفاتيح في الحقول أعلاه واحفظ</li>
            </ol>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded-lg">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              ⚠️ ملاحظة مهمة: استخدم وضع الاختبار (Sandbox) أثناء التطوير، وقم بتعطيله عند الإطلاق للإنتاج.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
