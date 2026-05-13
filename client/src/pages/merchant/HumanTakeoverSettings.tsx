import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  UserCheck, Clock, MessageSquare, Save, CheckCircle2,
  Pause, Play, Info, Hash, Smartphone, Timer
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

const TIMEOUT_OPTIONS = [5, 15, 30, 60];

export default function HumanTakeoverSettings() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();

  const { data: settings, isLoading } = trpc.botSettings.get.useQuery();
  const { data: takeoverConvs } = trpc.botSettings.getTakeoverConversations.useQuery(undefined, {
    refetchInterval: 15000, // refresh every 15s
  });

  const updateMutation = trpc.botSettings.update.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ إعدادات التدخل البشري');
      utils.botSettings.get.invalidate();
    },
    onError: (error) => {
      toast.error('خطأ في الحفظ: ' + error.message);
    },
  });

  const [timeoutMinutes, setTimeoutMinutes] = useState(15);
  const [resumeMessage, setResumeMessage] = useState('مرحباً! عدت لخدمتك 😊');
  const [commandsEnabled, setCommandsEnabled] = useState(true);

  useEffect(() => {
    if (settings) {
      setTimeoutMinutes(settings.takeoverTimeoutMinutes ?? 15);
      setResumeMessage(settings.takeoverResumeMessage || 'مرحباً! عدت لخدمتك 😊');
      setCommandsEnabled(settings.takeoverCommandsEnabled ?? true);
    }
  }, [settings]);

  const handleSave = () => {
    updateMutation.mutate({
      takeoverTimeoutMinutes: timeoutMinutes,
      takeoverResumeMessage: resumeMessage,
      takeoverCommandsEnabled: commandsEnabled,
    });
  };

  const activeCount = takeoverConvs?.length || 0;

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse space-y-4 w-full max-w-lg">
            <div className="h-8 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <UserCheck className="h-6 w-6" />
          </div>
          التدخل البشري
        </h1>
        <p className="text-muted-foreground">
          عندما ترد على عميل من الواتساب مباشرة، ساري يكتشف ذلك ويصمت تلقائياً حتى تنتهي
        </p>
      </div>

      {/* Status Banner */}
      <Card className={`border-2 ${activeCount > 0 ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'}`}>
        <CardContent className="py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full animate-pulse ${activeCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <div>
                <p className="font-semibold text-lg">
                  {activeCount > 0 ? `${activeCount} محادثة تحت إدارتك` : 'ساري نشط — جميع المحادثات تلقائية'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {activeCount > 0
                    ? 'ساري صامت في هذه المحادثات حتى انتهاء المدة'
                    : 'رد على أي عميل من الواتساب وساري سيصمت تلقائياً'}
                </p>
              </div>
            </div>
            <Badge variant={activeCount > 0 ? 'secondary' : 'default'} className="text-base px-4 py-1.5">
              {activeCount > 0 ? '🟡 تدخل بشري' : '🟢 تلقائي'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* How It Works — Interactive Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            كيف يعمل؟
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute right-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-500 via-amber-500 to-emerald-500" />

            <div className="space-y-6 pr-12">
              {[
                { icon: '📨', title: 'عميل يرسل رسالة', desc: 'ساري يرد تلقائياً كالمعتاد', color: 'bg-emerald-100 dark:bg-emerald-900/30' },
                { icon: '📱', title: 'أنت ترد من الواتساب', desc: 'ساري يكتشف ردك ويصمت فوراً', color: 'bg-amber-100 dark:bg-amber-900/30' },
                { icon: '⏱️', title: `مرت ${timeoutMinutes} دقيقة بدون رد منك`, desc: 'ساري يستأنف تلقائياً', color: 'bg-emerald-100 dark:bg-emerald-900/30' },
                { icon: '🤖', title: 'ساري يرجع للعمل', desc: `يرسل: "${resumeMessage}"`, color: 'bg-emerald-100 dark:bg-emerald-900/30' },
              ].map((step, i) => (
                <div key={i} className="relative flex items-start gap-4">
                  <div className="absolute right-[-2.25rem] w-6 h-6 rounded-full bg-background border-2 border-muted-foreground/20 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                  <div className={`flex-1 p-4 rounded-xl ${step.color} transition-all hover:scale-[1.01]`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{step.icon}</span>
                      <span className="font-semibold">{step.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            إعدادات التدخل
          </CardTitle>
          <CardDescription>
            تحكم في مدة صمت ساري ورسالة العودة
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timeout Duration — Radio Chips */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              مدة الصمت التلقائي
            </Label>
            <p className="text-sm text-muted-foreground">
              بعد آخر رد منك، ساري ينتظر هذه المدة ثم يرجع تلقائياً
            </p>
            <div className="flex flex-wrap gap-3">
              {TIMEOUT_OPTIONS.map(min => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setTimeoutMinutes(min)}
                  className={`px-5 py-2.5 rounded-full border-2 transition-all font-medium text-sm
                    ${timeoutMinutes === min
                      ? 'border-primary bg-primary text-primary-foreground shadow-lg scale-105'
                      : 'border-muted hover:border-primary/50 hover:bg-muted'
                    }`}
                >
                  {min} دقيقة
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Resume Message */}
          <div className="space-y-3">
            <Label htmlFor="resumeMessage" className="text-base font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              رسالة الاستئناف
            </Label>
            <p className="text-sm text-muted-foreground">
              الرسالة التي يرسلها ساري عند عودته بعد انتهاء مدة الصمت
            </p>
            <Textarea
              id="resumeMessage"
              value={resumeMessage}
              onChange={(e) => setResumeMessage(e.target.value)}
              placeholder="مرحباً! عدت لخدمتك 😊"
              rows={2}
              maxLength={500}
              className="resize-none"
            />
            <div className="text-xs text-muted-foreground text-left">
              {resumeMessage.length}/500
            </div>
          </div>

          <Separator />

          {/* Quick Commands */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  أوامر التدخل البشري
                </Label>
                <p className="text-sm text-muted-foreground">
                  عبارات طبيعية ترسلها للعميل — ساري يكتشفها ويتصرف تلقائياً
                </p>
              </div>
              <Switch
                checked={commandsEnabled}
                onCheckedChange={setCommandsEnabled}
              />
            </div>

            {commandsEnabled && (
              <div className="space-y-3">
                {/* Stop Command */}
                <div className="p-4 rounded-xl border-2 border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Pause className="h-4 w-4 text-red-500" />
                    <span className="font-semibold text-red-700 dark:text-red-400">إيقاف ساري (بدون مدة)</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-sm px-3">سأتولى المحادثة</Badge>
                      <span className="text-xs text-muted-foreground">🇸🇦 عربي</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-sm px-3" dir="ltr">I'll take over</Badge>
                      <span className="text-xs text-muted-foreground">🇬🇧 English</span>
                    </div>
                  </div>
                </div>

                {/* Start Command */}
                <div className="p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Play className="h-4 w-4 text-emerald-500" />
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">إعادة تشغيل ساري</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-sm px-3">يسعدنا خدمتكم</Badge>
                      <span className="text-xs text-muted-foreground">🇸🇦 عربي</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-sm px-3" dir="ltr">Sari resume</Badge>
                      <span className="text-xs text-muted-foreground">🇬🇧 English</span>
                    </div>
                  </div>
                </div>

                <Alert className="bg-muted/50">
                  <Smartphone className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <span className="font-semibold">💡 نصيحة:</span> العبارات تظهر للعميل كرسالة طبيعية ومهذبة — لا يعرف أنها أمر تقني لساري
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Takeover Conversations */}
      {takeoverConvs && takeoverConvs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pause className="h-5 w-5 text-amber-500" />
              المحادثات تحت إدارتك ({takeoverConvs.length})
            </CardTitle>
            <CardDescription>
              ساري صامت في هذه المحادثات — أرسل <code className="font-mono">يسعدنا خدمتكم</code> أو <code className="font-mono">Sari resume</code> لإعادته
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {takeoverConvs.map((conv: any) => {
                const expiresAt = conv.humanExpiresAt ? new Date(conv.humanExpiresAt) : null;
                const now = new Date();
                const minutesLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 60000)) : null;

                return (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <UserCheck className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium">{conv.customerName || conv.customerPhone}</p>
                        <p className="text-xs text-muted-foreground">{conv.customerPhone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {conv.isPermanent ? (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <Pause className="h-3 w-3" />
                          إيقاف يدوي
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {minutesLeft} دقيقة متبقية
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end sticky bottom-4">
        <Button
          onClick={handleSave}
          size="lg"
          disabled={updateMutation.isPending}
          className="shadow-lg px-8"
        >
          <Save className="h-4 w-4 ml-2" />
          {updateMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
        </Button>
      </div>
    </div>
  );
}
