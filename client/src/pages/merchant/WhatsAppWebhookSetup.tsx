import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, 
  Copy, 
  ExternalLink, 
  Webhook, 
  MessageSquare,
  Bot,
  Zap,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';

export default function WhatsAppWebhookSetup() {
  const { t } = useTranslation();
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);

  // Get current user
  const { data: user } = trpc.auth.me.useQuery();

  // Get webhook URL (based on current domain)
  const webhookUrl = `${window.location.origin}/api/webhooks/greenapi`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('whatsAppWebhookSetupPage.text0'));
  };

  const testWebhook = async () => {
    setIsTestingWebhook(true);
    try {
      // Simulate webhook test
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success(t('whatsAppWebhookSetupPage.text1'));
    } catch (error) {
      toast.error(t('whatsAppWebhookSetupPage.text2'));
    } finally {
      setIsTestingWebhook(false);
    }
  };

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('whatsAppWebhookSetupPage.text3')}</h1>
        <p className="text-muted-foreground">
          {t('whatsAppWebhookSetupPage.text25')}
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <Webhook className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Webhook URL</p>
                <p className="font-semibold text-green-600 dark:text-green-400">{t('whatsAppWebhookSetupPage.text4')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('whatsAppWebhookSetupPage.text5')}</p>
                <p className="font-semibold text-blue-600 dark:text-blue-400">{t('whatsAppWebhookSetupPage.text6')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('whatsAppWebhookSetupPage.text7')}</p>
                <p className="font-semibold text-purple-600 dark:text-purple-400">{t('whatsAppWebhookSetupPage.text8')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Setup Steps */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t('whatsAppWebhookSetupPage.text23')}
          </CardTitle>
          <CardDescription>
            {t('whatsAppWebhookSetupPage.text26')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                1
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">{t('whatsAppWebhookSetupPage.text9')}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t('whatsAppWebhookSetupPage.text27')}
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="https://console.green-api.com" target="_blank" rel="noopener noreferrer">
                  {t('whatsAppWebhookSetupPage.text28')}
                  <ExternalLink className="h-4 w-4 mr-2" />
                </a>
              </Button>
            </div>
          </div>

          <Separator />

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                2
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">{t('whatsAppWebhookSetupPage.text10')}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t('whatsAppWebhookSetupPage.text29')}
              </p>
              <div className="flex gap-2">
                <Input 
                  value={webhookUrl} 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(webhookUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                3
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">{t('whatsAppWebhookSetupPage.text11')}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t('whatsAppWebhookSetupPage.text30')}
              </p>
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Incoming webhook: <Badge variant="secondary">yes</Badge></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Outgoing webhook: <Badge variant="secondary">yes</Badge></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>State webhook: <Badge variant="secondary">yes</Badge></span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {t('whatsAppWebhookSetupPage.text31')}
              </p>
            </div>
          </div>

          <Separator />

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                4
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">{t('whatsAppWebhookSetupPage.text12')}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t('whatsAppWebhookSetupPage.text32')}
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="/merchant/whatsapp-instances">
                  {t('whatsAppWebhookSetupPage.text24')}
                  <ArrowRight className="h-4 w-4 mr-2" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How it Works */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('whatsAppWebhookSetupPage.text13')}</CardTitle>
          <CardDescription>
            {t('whatsAppWebhookSetupPage.text33')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">{t('whatsAppWebhookSetupPage.text14')}</h4>
                <p className="text-sm text-muted-foreground">
                  {t('whatsAppWebhookSetupPage.text34')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">{t('whatsAppWebhookSetupPage.text15')}</h4>
                <p className="text-sm text-muted-foreground">
                  {t('whatsAppWebhookSetupPage.text35')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">{t('whatsAppWebhookSetupPage.text16')}</h4>
                <p className="text-sm text-muted-foreground">
                  {t('whatsAppWebhookSetupPage.text36')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Important Notes */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>{t('whatsAppWebhookSetupPage.text17')}</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li>{t('whatsAppWebhookSetupPage.text18')}</li>
            <li>{t('whatsAppWebhookSetupPage.text19')}</li>
            <li>{t('whatsAppWebhookSetupPage.text20')}</li>
            <li>{t('whatsAppWebhookSetupPage.text21')}</li>
            <li>{t('whatsAppWebhookSetupPage.text22')}</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
