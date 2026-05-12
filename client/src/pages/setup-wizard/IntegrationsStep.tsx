import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowRight, Calendar, FileSpreadsheet, Check, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface IntegrationsStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
  skipStep: () => void;
}

export default function IntegrationsStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  skipStep,
}: IntegrationsStepProps) {
  const { t } = useTranslation();
  const [enableCalendar, setEnableCalendar] = useState(
    wizardData.enableCalendar || false
  );
  const [enableSheets, setEnableSheets] = useState(
    wizardData.enableSheets || false
  );

  const handleNext = () => {
    updateWizardData({
      enableCalendar,
      enableSheets,
    });
    goToNextStep();
  };

  const handleSkip = () => {
    updateWizardData({
      enableCalendar: false,
      enableSheets: false,
    });
    skipStep();
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-gray-600">{t('integrationsStep.auto_0')}</p>
        <p className="text-sm text-gray-500 mt-1">{t('integrationsStep.auto_1')}</p>
      </div>

      <div className="space-y-4">
        {/* Google Calendar */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4 space-x-reverse flex-1">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-6 w-6 text-white" />
              </div>

              <div className="flex-1">
                <div className="flex items-center space-x-2 space-x-reverse mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Google Calendar
                  </h3>
                  {enableCalendar && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">{t('integrationsStep.auto_2')}</span>
                  )}
                </div>

                <p className="text-sm text-gray-600 mb-1">{t('integrationsStep.auto_3')}</p>

                <ul className="space-y-1 text-xs text-gray-500">
                  <li className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-3 w-3 text-green-600" />
                    <span>{t('wizardIntegrationsStepPage.text0')}</span>
                  </li>
                  <li className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-3 w-3 text-green-600" />
                    <span>{t('wizardIntegrationsStepPage.text1')}</span>
                  </li>
                  <li className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-3 w-3 text-green-600" />
                    <span>{t('wizardIntegrationsStepPage.text2')}</span>
                  </li>
                </ul>

                {enableCalendar && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-800 mb-2">{t('integrationsStep.auto_4')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      <ExternalLink className="h-3 w-3 ml-1" />{t('integrationsStep.auto_5')}</Button>
                  </div>
                )}
              </div>
            </div>

            <Switch
              checked={enableCalendar}
              onCheckedChange={setEnableCalendar}
              className="mt-1"
            />
          </div>
        </Card>

        {/* Google Sheets */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4 space-x-reverse flex-1">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="h-6 w-6 text-white" />
              </div>

              <div className="flex-1">
                <div className="flex items-center space-x-2 space-x-reverse mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Google Sheets
                  </h3>
                  {enableSheets && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">{t('integrationsStep.auto_6')}</span>
                  )}
                </div>

                <p className="text-sm text-gray-600 mb-1">{t('integrationsStep.auto_7')}</p>

                <ul className="space-y-1 text-xs text-gray-500">
                  <li className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-3 w-3 text-green-600" />
                    <span>{t('wizardIntegrationsStepPage.text3')}</span>
                  </li>
                  <li className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-3 w-3 text-green-600" />
                    <span>{t('wizardIntegrationsStepPage.text4')}</span>
                  </li>
                  <li className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-3 w-3 text-green-600" />
                    <span>{t('wizardIntegrationsStepPage.text5')}</span>
                  </li>
                </ul>

                {enableSheets && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-green-800 mb-2">{t('integrationsStep.auto_8')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      <ExternalLink className="h-3 w-3 ml-1" />{t('integrationsStep.auto_9')}</Button>
                  </div>
                )}
              </div>
            </div>

            <Switch
              checked={enableSheets}
              onCheckedChange={setEnableSheets}
              className="mt-1"
            />
          </div>
        </Card>
      </div>

      {/* Info Box */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          💡 <strong>{t('wizardIntegrationsStepPage.text6')}</strong>{t('integrationsStep.auto_10')}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="ghost" onClick={handleSkip}>{t('integrationsStep.auto_11')}</Button>

        <Button size="lg" onClick={handleNext} className="px-8">{t('integrationsStep.auto_12')}<ArrowRight className="mr-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
