import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, Check, Sparkles, Loader2, Languages, PackageOpen } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface TemplatesStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
  skipStep: () => void;
}

export default function TemplatesStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  skipStep,
}: TemplatesStepProps) {
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(
    wizardData.templateId || null
  );
  const [isApplying, setIsApplying] = useState(false);
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');

  const { data: templates, isLoading } = trpc.setupWizard.getTemplates.useQuery({
    businessType: wizardData.businessType,
    language,
  });

  const applyTemplateMutation = trpc.setupWizard.applyTemplate.useMutation();

  const handleSelectTemplate = (templateId: number) => {
    setSelectedTemplate(templateId);
    updateWizardData({ templateId });
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplate) return;

    setIsApplying(true);
    try {
      await applyTemplateMutation.mutateAsync({ templateId: selectedTemplate });
      toast.success(t('wizardTemplatesStepPage.text0'));
      goToNextStep();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ أثناء تطبيق القالب');
    } finally {
      setIsApplying(false);
    }
  };

  const handleSkip = () => {
    updateWizardData({ templateId: null });
    skipStep();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const hasTemplates = templates && templates.length > 0;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-gray-600">{t('templatesStep.auto_0')}</p>
      </div>

      {/* Language Switcher */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <Languages className="h-5 w-5 text-muted-foreground" />
        <Tabs value={language} onValueChange={(value) => setLanguage(value as 'ar' | 'en')}>
          <TabsList>
            <TabsTrigger value="ar">{t('wizardTemplatesStepPage.text1')}</TabsTrigger>
            <TabsTrigger value="en">🇬🇧 English</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Templates Grid */}
      {hasTemplates && (
        <div className="grid md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
          {templates.map((template) => {
            const isSelected = selectedTemplate === template.id;

            return (
              <Card
                key={template.id}
                className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg ${isSelected
                    ? 'ring-2 ring-emerald-500 shadow-lg'
                    : 'hover:scale-102'
                  }`}
                onClick={() => handleSelectTemplate(template.id)}
              >
                {isSelected && (
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg z-10">
                    <Check className="h-5 w-5 text-white" />
                  </div>
                )}

                <div className="p-5 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <span className="text-2xl">{template.icon}</span>
                      <h3 className="text-lg font-bold text-gray-900">
                        {template.templateName}
                      </h3>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {template.usageCount || 0} استخدام
                    </Badge>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600">{template.description}</p>

                  {/* Suitable For */}
                  {template.suitableFor && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-semibold text-gray-500 mb-1">{t('templatesStep.auto_1')}</p>
                      <p className="text-xs text-gray-600">{template.suitableFor}</p>
                    </div>
                  )}

                  {/* What's Included */}
                  <div className="flex items-center space-x-2 space-x-reverse text-xs text-gray-500">
                    <Sparkles className="h-3 w-3 text-emerald-500" />
                    <span>{t('wizardTemplatesStepPage.text2')}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State - No Templates */}
      {!hasTemplates && (
        <div className="text-center py-12 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 mb-2">
            <PackageOpen className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <p className="text-gray-600 font-medium mb-1">{t('wizardTemplatesStepPage.text3')}</p>
            <p className="text-sm text-gray-400">{t('wizardTemplatesStepPage.text4')}</p>
          </div>
          <Button
            onClick={handleSkip}
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
          >{t('templatesStep.auto_2')}<ArrowRight className="mr-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Actions - only show if templates exist */}
      {hasTemplates && (
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" onClick={handleSkip}>{t('templatesStep.auto_3')}</Button>

          <Button
            size="lg"
            onClick={handleApplyTemplate}
            disabled={!selectedTemplate || isApplying}
            className="px-8 bg-emerald-600 hover:bg-emerald-700"
          >
            {isApplying ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('templatesStep.auto_4')}</>
            ) : (
              <>{t('templatesStep.auto_5')}<ArrowRight className="mr-2 h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <p className="text-sm text-emerald-800">
          💡 <strong>{t('wizardTemplatesStepPage.text5')}</strong>{t('templatesStep.auto_6')}</p>
      </div>
    </div>
  );
}
