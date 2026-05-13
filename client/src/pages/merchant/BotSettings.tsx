import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Clock,
  MessageSquare,
  Zap,
  Save,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  Eye,
  Send,
  Users,
  AtSign,
  KeyRound,
  ArrowUpRight,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { BOT_TEMPLATE_DEFINITIONS, resolveTemplate } from '@/constants/botTemplates';

export default function BotSettings() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();

  // Get current settings
  const { data: settings, isLoading } = trpc.botSettings.get.useQuery();
  const { data: shouldRespond } = trpc.botSettings.shouldRespond.useQuery();

  // Update mutation
  const updateMutation = trpc.botSettings.update.useMutation({
    onSuccess: () => {
      toast.success(t('botSettingsPage.saveSuccess'));
      utils.botSettings.get.invalidate();
      utils.botSettings.shouldRespond.invalidate();
    },
    onError: (error) => {
      toast.error(t('botSettingsPage.saveError') + error.message);
    },
  });

  // Send test message mutation
  const sendTestMutation = trpc.botSettings.sendTestMessage.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Form state
  const [formData, setFormData] = useState({
    autoReplyEnabled: true,
    workingHoursEnabled: false,
    workingHoursStart: '09:00',
    workingHoursEnd: '18:00',
    workingDays: '1,2,3,4,5',
    welcomeMessage: '',
    outOfHoursMessage: '',
    responseDelay: 2,
    maxResponseLength: 200,
    tone: 'friendly' as 'friendly' | 'professional' | 'casual',
    language: 'ar' as 'ar' | 'en' | 'both',
  });

  // Group settings state
  const [groupMode, setGroupMode] = useState<'disabled' | 'mention_only' | 'keyword_only' | 'private_redirect'>('disabled');
  const [groupKeywords, setGroupKeywords] = useState<string[]>([]);
  const [groupRedirectMessage, setGroupRedirectMessage] = useState('');
  const [keywordInput, setKeywordInput] = useState('');

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setFormData({
        autoReplyEnabled: settings.autoReplyEnabled,
        workingHoursEnabled: settings.workingHoursEnabled,
        workingHoursStart: settings.workingHoursStart || '09:00',
        workingHoursEnd: settings.workingHoursEnd || '18:00',
        workingDays: settings.workingDays || '1,2,3,4,5',
        welcomeMessage: settings.welcomeMessage || '',
        outOfHoursMessage: settings.outOfHoursMessage || '',
        responseDelay: settings.responseDelay ?? 2,
        maxResponseLength: settings.maxResponseLength ?? 200,
        tone: settings.tone,
        language: settings.language,
      });
      setGroupMode((settings as any).groupMode || 'disabled');
      try {
        setGroupKeywords((settings as any).groupKeywords ? JSON.parse((settings as any).groupKeywords) : []);
      } catch { setGroupKeywords([]); }
      setGroupRedirectMessage((settings as any).groupRedirectMessage || '');
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      ...formData,
      groupMode,
      groupKeywords: JSON.stringify(groupKeywords),
      groupRedirectMessage,
    } as any);
  };

  const handleWorkingDayToggle = (day: number) => {
    const days = formData.workingDays.split(',').map(d => parseInt(d));
    const newDays = days.includes(day)
      ? days.filter(d => d !== day)
      : [...days, day].sort();
    setFormData({ ...formData, workingDays: newDays.join(',') });
  };

  const isWorkingDay = (day: number) => {
    return formData.workingDays.split(',').map(d => parseInt(d)).includes(day);
  };

  const weekDays = [
    { value: 0, label: t('botSettingsPage.sunday') },
    { value: 1, label: t('botSettingsPage.monday') },
    { value: 2, label: t('botSettingsPage.tuesday') },
    { value: 3, label: t('botSettingsPage.wednesday') },
    { value: 4, label: t('botSettingsPage.thursday') },
    { value: 5, label: t('botSettingsPage.friday') },
    { value: 6, label: t('botSettingsPage.saturday') },
  ];

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="text-center">{t('botSettingsPage.loading')}</div>
      </div>
    );
  }

  // Templates resolved from constants
  const allTemplates = BOT_TEMPLATE_DEFINITIONS.map((def) => resolveTemplate(def, t));
  const generalTemplates = allTemplates.filter((tpl) => tpl.category === 'general');
  const industryTemplates = allTemplates.filter((tpl) => tpl.category === 'industry');

  const applyTemplate = (template: typeof allTemplates[0]) => {
    setFormData({
      ...formData,
      ...template.settings,
    });
    toast.success(t('botSettingsPage.templateApplied', { name: template.name }));
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('botSettingsPage.title')}</h1>
        <p className="text-muted-foreground">
          {t('botSettingsPage.subtitle')}
        </p>
      </div>

      {/* Templates Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t('botSettingsPage.templatesTitle')}
          </CardTitle>
          <CardDescription>
            {t('botSettingsPage.templatesDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* General Templates */}
          <div>
            <h3 className="text-sm font-semibold mb-3">{t('botSettingsPage.generalTemplates')}</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {generalTemplates.map((template) => (
                <Card key={template.id} className={`border-2 transition-colors ${formData.tone === template.settings.tone ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}>
                  <CardHeader className="pb-3">
                    <div className="text-3xl mb-2">{template.icon}</div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {/* Live example */}
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">
                      <p className="text-xs text-muted-foreground mb-1 font-semibold">💬 مثال على الرد:</p>
                      {template.settings.tone === 'professional' && (
                        <p className="text-foreground leading-relaxed">"نشكرك على تواصلك معنا. نودّ إعلامك بأن المنتج متوفر حالياً. هل تودّ الاطلاع على مزيد من التفاصيل؟"</p>
                      )}
                      {template.settings.tone === 'friendly' && (
                        <p className="text-foreground leading-relaxed">"أهلاً وسهلاً! 😊 أكيد المنتج موجود عندنا. تبي أرسلك الأسعار والصور؟"</p>
                      )}
                      {template.settings.tone === 'casual' && (
                        <p className="text-foreground leading-relaxed">"هلا! ✌️ إيه موجود. أرسلك التفاصيل الحين؟"</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant={formData.tone === template.settings.tone ? 'default' : 'outline'}
                      className="w-full"
                      onClick={() => applyTemplate(template)}
                    >
                      {formData.tone === template.settings.tone ? '✓ مُطبّق' : t('botSettingsPage.apply')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Separator />

          {/* Industry Templates */}
          <div>
            <h3 className="text-sm font-semibold mb-3">{t('botSettingsPage.industryTemplates')}</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {industryTemplates.map((template) => (
                <Card key={template.id} className="border-2 hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="text-3xl mb-2">{template.icon}</div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => applyTemplate(template)}
                    >
                      {t('botSettingsPage.text0')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Alert */}
      {shouldRespond && (
        <Alert className="mb-6" variant={shouldRespond.shouldRespond ? "default" : "destructive"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {shouldRespond.shouldRespond ? (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <strong>{t('botSettingsPage.botActive')}</strong> - {t('botSettingsPage.botActiveDesc')}
              </span>
            ) : (
              <span>
                <strong>{t('botSettingsPage.botStopped')}</strong> - {shouldRespond.reason === 'Auto-reply is disabled' ? t('botSettingsPage.reasonDisabled') : shouldRespond.reason === 'Outside working hours' ? t('botSettingsPage.reasonOutsideHours') : t('botSettingsPage.reasonOutsideDays')}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Auto-Reply Toggle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {t('botSettingsPage.autoReplyTitle')}
            </CardTitle>
            <CardDescription>
              {t('botSettingsPage.autoReplyDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="autoReply">{t('botSettingsPage.enableAutoReply')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('botSettingsPage.enableAutoReplyDesc')}
                </p>
              </div>
              <Switch
                id="autoReply"
                checked={formData.autoReplyEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, autoReplyEnabled: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Working Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('botSettingsPage.workingHoursTitle')}
            </CardTitle>
            <CardDescription>
              {t('botSettingsPage.workingHoursDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="workingHours">{t('botSettingsPage.enableWorkingHours')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('botSettingsPage.enableWorkingHoursDesc')}
                </p>
              </div>
              <Switch
                id="workingHours"
                checked={formData.workingHoursEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, workingHoursEnabled: checked })}
              />
            </div>

            {formData.workingHoursEnabled && (
              <>
                <Separator />

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startTime">{t('botSettingsPage.startTime')}</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={formData.workingHoursStart}
                      onChange={(e) => setFormData({ ...formData, workingHoursStart: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">{t('botSettingsPage.endTime')}</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={formData.workingHoursEnd}
                      onChange={(e) => setFormData({ ...formData, workingHoursEnd: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('botSettingsPage.workingDays')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {weekDays.map(day => (
                      <Badge
                        key={day.value}
                        variant={isWorkingDay(day.value) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => handleWorkingDayToggle(day.value)}
                      >
                        {day.label}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('botSettingsPage.clickDayToggle')}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('botSettingsPage.messagesTitle')}
            </CardTitle>
            <CardDescription>
              {t('botSettingsPage.messagesDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="welcomeMessage">{t('botSettingsPage.welcomeMessage')}</Label>
              <Textarea
                id="welcomeMessage"
                placeholder={t('botSettingsPage.welcomeMessagePlaceholder')}
                value={formData.welcomeMessage}
                onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                rows={3}
              />
              <p className="text-sm text-muted-foreground">
                {t('botSettingsPage.welcomeMessageDesc')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="outOfHoursMessage">{t('botSettingsPage.outOfHoursMessage')}</Label>
              <Textarea
                id="outOfHoursMessage"
                placeholder={t('botSettingsPage.outOfHoursMessagePlaceholder')}
                value={formData.outOfHoursMessage}
                onChange={(e) => setFormData({ ...formData, outOfHoursMessage: e.target.value })}
                rows={3}
              />
              <p className="text-sm text-muted-foreground">
                {t('botSettingsPage.outOfHoursMessageDesc')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Behavior */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {t('botSettingsPage.aiBehaviorTitle')}
            </CardTitle>
            <CardDescription>
              {t('botSettingsPage.aiBehaviorDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tone">{t('botSettingsPage.tone')}</Label>
                <Select
                  value={formData.tone}
                  onValueChange={(value: 'friendly' | 'professional' | 'casual') =>
                    setFormData({ ...formData, tone: value })
                  }
                >
                  <SelectTrigger id="tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">{t('botSettingsPage.toneFriendly')}</SelectItem>
                    <SelectItem value="professional">{t('botSettingsPage.toneProfessional')}</SelectItem>
                    <SelectItem value="casual">{t('botSettingsPage.toneCasual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">{t('botSettingsPage.language')}</Label>
                <Select
                  value={formData.language}
                  onValueChange={(value: 'ar' | 'en' | 'both') =>
                    setFormData({ ...formData, language: value })
                  }
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">{t('botSettingsPage.langArabic')}</SelectItem>
                    <SelectItem value="en">{t('botSettingsPage.langEnglish')}</SelectItem>
                    <SelectItem value="both">{t('botSettingsPage.langBoth')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="responseDelay">{t('botSettingsPage.responseDelay')}</Label>
                <Input
                  id="responseDelay"
                  type="number"
                  min={1}
                  max={10}
                  value={formData.responseDelay}
                  onChange={(e) => setFormData({ ...formData, responseDelay: parseInt(e.target.value) })}
                />
                <p className="text-sm text-muted-foreground">
                  {t('botSettingsPage.responseDelayDesc')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxLength">{t('botSettingsPage.maxResponseLength')}</Label>
                <Input
                  id="maxLength"
                  type="number"
                  min={50}
                  max={500}
                  value={formData.maxResponseLength}
                  onChange={(e) => setFormData({ ...formData, maxResponseLength: parseInt(e.target.value) })}
                />
                <p className="text-sm text-muted-foreground">
                  {t('botSettingsPage.maxResponseLengthDesc')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t('botSettingsPage.previewTitle')}
            </CardTitle>
            <CardDescription>
              {t('botSettingsPage.previewDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg p-6 space-y-4">
              {/* WhatsApp-style messages */}
              <div className="space-y-3">
                {/* Customer message */}
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-gray-800 rounded-lg rounded-tl-none px-4 py-2 max-w-[80%] shadow-sm">
                    <p className="text-sm">{t('botSettingsPage.previewCustomerMsg')}</p>
                    <span className="text-xs text-muted-foreground">{t('merchantBotSettingsPage.text0')}</span>
                  </div>
                </div>

                {/* Sari welcome message */}
                <div className="flex justify-end">
                  <div className="bg-green-500 text-white rounded-lg rounded-tr-none px-4 py-2 max-w-[80%] shadow-sm">
                    <div className="flex items-start gap-2 mb-1">
                      <Bot className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium mb-1">{t('botSettingsPage.sari')}</p>
                        <p className="text-sm whitespace-pre-wrap">
                          {formData.welcomeMessage || t('botSettingsPage.previewDefaultWelcome')}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs opacity-90">{t('merchantBotSettingsPage.text1')}</span>
                  </div>
                </div>

                {/* Separator */}
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700"></div>
                  <span className="text-xs text-muted-foreground">{t('botSettingsPage.previewOutsideHours')}</span>
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700"></div>
                </div>

                {/* Customer message after hours */}
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-gray-800 rounded-lg rounded-tl-none px-4 py-2 max-w-[80%] shadow-sm">
                    <p className="text-sm">{t('botSettingsPage.previewAfterHoursMsg')}</p>
                    <span className="text-xs text-muted-foreground">{t('merchantBotSettingsPage.text2')}</span>
                  </div>
                </div>

                {/* Sari out of hours message */}
                <div className="flex justify-end">
                  <div className="bg-green-500 text-white rounded-lg rounded-tr-none px-4 py-2 max-w-[80%] shadow-sm">
                    <div className="flex items-start gap-2 mb-1">
                      <Bot className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium mb-1">{t('merchantBotSettingsPage.text3')}</p>
                        <p className="text-sm whitespace-pre-wrap">
                          {formData.outOfHoursMessage || t('botSettingsPage.previewDefaultOutOfHours')}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs opacity-90">{t('merchantBotSettingsPage.text4')}</span>
                  </div>
                </div>
              </div>

              {/* Settings summary */}
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 mt-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">{t('botSettingsPage.toneLabel')}</span>
                    <Badge variant="outline" className="mr-2">
                      {formData.tone === 'professional' ? t('botSettingsPage.toneFormalLabel') : formData.tone === 'friendly' ? t('botSettingsPage.toneFriendlyLabel') : t('botSettingsPage.toneModernLabel')}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('botSettingsPage.responseDelayLabel')}</span>
                    <Badge variant="outline" className="mr-2">
                      {formData.responseDelay} {t('botSettingsPage.seconds')}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>{t('botSettingsPage.note')}</strong> {t('botSettingsPage.infoNote')}
          </AlertDescription>
        </Alert>

        {/* Smart Groups Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 text-white">
                <Users className="h-4 w-4" />
              </div>
              سلوك الجروبات
            </CardTitle>
            <CardDescription>
              تحكم في كيفية تعامل ساري مع رسائل الجروبات المشترك بها
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { value: 'disabled', icon: '🔴', label: 'إيقاف كامل', desc: 'لا يرد على أي رسالة في الجروبات' },
              { value: 'mention_only', icon: '🟡', label: 'رد عند المنشن فقط', desc: 'يرد فقط عندما يُذكر بـ @' },
              { value: 'keyword_only', icon: '🟢', label: 'رد على كلمات مفتاحية', desc: 'يرد عند ذكر كلمات محددة' },
              { value: 'private_redirect', icon: '🔵', label: 'رد خاص', desc: 'يراسل العميل في محادثة خاصة' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGroupMode(opt.value as any)}
                className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                  groupMode === opt.value
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-muted hover:border-primary/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{opt.icon}</span>
                  <div>
                    <p className="font-semibold">{opt.label}</p>
                    <p className="text-sm text-muted-foreground">{opt.desc}</p>
                  </div>
                </div>
              </button>
            ))}

            {/* Keywords Input — shown when keyword_only */}
            {groupMode === 'keyword_only' && (
              <div className="space-y-3 p-4 rounded-xl bg-muted/50 animate-in slide-in-from-top-2">
                <Label className="font-semibold flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  الكلمات المفتاحية
                </Label>
                <div className="flex flex-wrap gap-2 min-h-[40px]">
                  {groupKeywords.map((kw, i) => (
                    <Badge key={i} variant="secondary" className="text-sm flex items-center gap-1 px-3 py-1">
                      {kw}
                      <button
                        type="button"
                        onClick={() => setGroupKeywords(prev => prev.filter((_, idx) => idx !== i))}
                        className="hover:text-destructive ml-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && keywordInput.trim()) {
                        e.preventDefault();
                        setGroupKeywords(prev => [...prev, keywordInput.trim()]);
                        setKeywordInput('');
                      }
                    }}
                    placeholder="اكتب كلمة ثم Enter..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (keywordInput.trim()) {
                        setGroupKeywords(prev => [...prev, keywordInput.trim()]);
                        setKeywordInput('');
                      }
                    }}
                  >
                    أضف
                  </Button>
                </div>
              </div>
            )}

            {/* Redirect Message — shown when private_redirect */}
            {groupMode === 'private_redirect' && (
              <div className="space-y-3 p-4 rounded-xl bg-muted/50 animate-in slide-in-from-top-2">
                <Label className="font-semibold flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4" />
                  رسالة التوجيه الخاص
                </Label>
                <Textarea
                  value={groupRedirectMessage}
                  onChange={(e) => setGroupRedirectMessage(e.target.value)}
                  placeholder="مرحباً! شفت رسالتك في الجروب. أقدر أساعدك هنا بشكل أفضل 😊"
                  rows={2}
                  maxLength={500}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => sendTestMutation.mutate()}
            disabled={sendTestMutation.isPending}
          >
            <Send className="h-4 w-4 ml-2" />
            {sendTestMutation.isPending ? t('botSettingsPage.sendingTest') : t('botSettingsPage.sendTestMessage')}
          </Button>

          <Button
            type="submit"
            size="lg"
            disabled={updateMutation.isPending}
          >
            <Save className="h-4 w-4 ml-2" />
            {updateMutation.isPending ? t('botSettingsPage.saving') : t('botSettingsPage.saveSettings')}
          </Button>
        </div>
      </form>
    </div>
  );
}
