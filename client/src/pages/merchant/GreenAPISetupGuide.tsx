import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ExternalLink, Copy, AlertCircle, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function GreenAPISetupGuide() {
  const { t } = useTranslation();
  const [copiedText, setCopiedText] = useState<string>("");

  const webhookUrl = `${window.location.origin}/api/webhooks/greenapi`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    toast.success(t('greenApiGuidePage.copied', { label }));
    setTimeout(() => setCopiedText(""), 2000);
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('greenApiGuidePage.title')}</h1>
        <p className="text-muted-foreground">
          {t('greenApiGuidePage.subtitle')}
        </p>
      </div>

      {/* الخطوة 1: التسجيل */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground">{t('greenApiGuidePage.step1')}</Badge>
            <CardTitle>{t('greenApiGuidePage.step1Title')}</CardTitle>
          </div>
          <CardDescription>
            {t('greenApiGuidePage.step1Desc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s1Step1')}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("https://green-api.com", "_blank")}
              >
                <ExternalLink className="w-4 h-4 ml-2" />
                {t('greenApiGuidePage.openGreenApi')}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s1Step2')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s1Step2Desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s1Step3')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s1Step3Desc')}
              </p>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('greenApiGuidePage.note')}</strong> {t('greenApiGuidePage.trialNote')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* الخطوة 2: إنشاء Instance */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground">{t('greenApiGuidePage.step2')}</Badge>
            <CardTitle>{t('greenApiGuidePage.step2Title')}</CardTitle>
          </div>
          <CardDescription>
            {t('greenApiGuidePage.step2Desc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s2Step1')}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("https://console.green-api.com", "_blank")}
              >
                <ExternalLink className="w-4 h-4 ml-2" />
                {t('greenApiGuidePage.openConsole')}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s2Step2')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s2Step2Desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s2Step3')}</p>
              <p className="text-sm text-muted-foreground mb-2">
                {t('greenApiGuidePage.s2Step3Desc')}
              </p>
              <div className="bg-muted p-3 rounded-md text-sm font-mono">
                <div className="mb-2">
                  <span className="text-muted-foreground">Instance ID:</span> 1234567890
                </div>
                <div>
                  <span className="text-muted-foreground">API Token:</span> abc123def456...
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* الخطوة 3: إعداد Webhooks */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground">{t('greenApiGuidePage.step3')}</Badge>
            <CardTitle>{t('greenApiGuidePage.step3Title')}</CardTitle>
          </div>
          <CardDescription>
            {t('greenApiGuidePage.step3Desc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s3Step1')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s3Step1Desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s3Step2')}</p>
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Incoming</Badge>
                  <span className="text-sm">{t('greenApiGuidePage.webhookIncoming')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Outgoing</Badge>
                  <span className="text-sm">{t('greenApiGuidePage.webhookOutgoing')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">State</Badge>
                  <span className="text-sm">{t('greenApiGuidePage.webhookState')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s3Step3')}</p>
              <div className="bg-muted p-3 rounded-md">
                <div className="flex items-center justify-between">
                  <code className="text-sm break-all">{webhookUrl}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {copiedText === "Webhook URL" && (
                <p className="text-sm text-primary mt-1">✓ {t('greenApiGuidePage.copiedMsg')}</p>
              )}
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('greenApiGuidePage.important')}</strong> {t('greenApiGuidePage.webhookImportant')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* الخطوة 4: ربط رقم الواتساب */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground">{t('greenApiGuidePage.step4')}</Badge>
            <CardTitle>{t('greenApiGuidePage.step4Title')}</CardTitle>
          </div>
          <CardDescription>
            {t('greenApiGuidePage.step4Desc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s4Step1')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s4Step1Desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s4Step2')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s4Step2Desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s4Step3')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s4Step3Desc')}
              </p>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>{t('greenApiGuidePage.tip')}</strong> {t('greenApiGuidePage.personalNumberTip')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* الخطوة 5: الاختبار */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground">{t('greenApiGuidePage.step5')}</Badge>
            <CardTitle>{t('greenApiGuidePage.step5Title')}</CardTitle>
          </div>
          <CardDescription>
            {t('greenApiGuidePage.step5Desc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s5Step1')}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = "/merchant/whatsapp-test"}
              >
                {t('greenApiGuidePage.openTestPage')}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s5Step2')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s5Step2Desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s5Step3')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s5Step3Desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s5Step4')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s5Step4Desc')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-2">{t('greenApiGuidePage.s5Step5')}</p>
              <p className="text-sm text-muted-foreground">
                {t('greenApiGuidePage.s5Step5Desc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* روابط مفيدة */}
      <Card>
        <CardHeader>
          <CardTitle>{t('greenApiGuidePage.usefulLinks')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => window.open("https://green-api.com/docs/", "_blank")}
          >
            <ExternalLink className="w-4 h-4 ml-2" />
            {t('greenApiGuidePage.officialDocs')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => window.open("https://console.green-api.com", "_blank")}
          >
            <ExternalLink className="w-4 h-4 ml-2" />
            {t('greenApiGuidePage.consoleLink')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => window.location.href = "/merchant/whatsapp-test"}
          >
            {t('greenApiGuidePage.testPageLink')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => window.location.href = "/merchant/whatsapp-instances"}
          >
            {t('greenApiGuidePage.instancesLink')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
