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
  Send
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

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
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
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

  // General Templates
  const generalTemplates = [
    {
      id: 'formal',
      name: t('botSettingsPage.templateFormal'),
      description: t('botSettingsPage.templateFormalDesc'),
      icon: '💼',
      category: 'general',
      settings: {
        welcomeMessage: t('botSettingsPage.text1'),
        outOfHoursMessage: t('botSettingsPage.text2'),
        tone: 'professional' as const,
        responseDelay: 3,
      },
    },
    {
      id: 'friendly',
      name: t('botSettingsPage.templateFriendly'),
      description: t('botSettingsPage.templateFriendlyDesc'),
      icon: '😊',
      category: 'general',
      settings: {
        welcomeMessage: t('botSettingsPage.text3'),
        outOfHoursMessage: t('botSettingsPage.text4'),
        tone: 'friendly' as const,
        responseDelay: 2,
      },
    },
    {
      id: 'modern',
      name: t('botSettingsPage.templateModern'),
      description: t('botSettingsPage.templateModernDesc'),
      icon: '⚡',
      category: 'general',
      settings: {
        welcomeMessage: t('botSettingsPage.text5'),
        outOfHoursMessage: t('botSettingsPage.text6'),
        tone: 'casual' as const,
        responseDelay: 1,
      },
    },
  ];

  // Industry-Specific Templates
  const industryTemplates = [
    {
      id: 'restaurant',
      name: t('botSettingsPage.templateRestaurant'),
      description: t('botSettingsPage.templateRestaurantDesc'),
      icon: '🍴',
      category: 'industry',
      settings: {
        welcomeMessage: t('botSettingsPage.text7'),
        outOfHoursMessage: t('botSettingsPage.text8'),
        tone: 'friendly' as const,
        responseDelay: 2,
      },
    },
    {
      id: 'fashion',
      name: t('botSettingsPage.templateFashion'),
      description: t('botSettingsPage.templateFashionDesc'),
      icon: '👗',
      category: 'industry',
      settings: {
        welcomeMessage: t('botSettingsPage.text9'),
        outOfHoursMessage: t('botSettingsPage.text10'),
        tone: 'friendly' as const,
        responseDelay: 2,
      },
    },
    {
      id: 'electronics',
      name: t('botSettingsPage.templateElectronics'),
      description: t('botSettingsPage.templateElectronicsDesc'),
      icon: '📱',
      category: 'industry',
      settings: {
        welcomeMessage: t('botSettingsPage.text11'),
        outOfHoursMessage: t('botSettingsPage.text12'),
        tone: 'professional' as const,
        responseDelay: 2,
      },
    },
    {
      id: 'beauty',
      name: t('botSettingsPage.templateBeauty'),
      description: t('botSettingsPage.templateBeautyDesc'),
      icon: '💄',
      category: 'industry',
      settings: {
        welcomeMessage: t('botSettingsPage.text13'),
        outOfHoursMessage: t('botSettingsPage.text14'),
        tone: 'friendly' as const,
        responseDelay: 2,
      },
    },
    {
      id: 'realestate',
      name: t('botSettingsPage.templateRealEstate'),
      description: t('botSettingsPage.templateRealEstateDesc'),
      icon: '🏠',
      category: 'industry',
      settings: {
        welcomeMessage: t('botSettingsPage.text15'),
        outOfHoursMessage: t('botSettingsPage.text16'),
        tone: 'professional' as const,
        responseDelay: 3,
      },
    },
    {
      id: 'services',
      name: t('botSettingsPage.templateServices'),
      description: t('botSettingsPage.templateServicesDesc'),
      icon: '🛠️',
      category: 'industry',
      settings: {
        welcomeMessage: t('botSettingsPage.text17'),
        outOfHoursMessage: t('botSettingsPage.text18'),
        tone: 'professional' as const,
        responseDelay: 2,
      },
    },
  ];

  const allTemplates = [...generalTemplates, ...industryTemplates];

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
                      {t('botSettingsPage.apply')}
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
