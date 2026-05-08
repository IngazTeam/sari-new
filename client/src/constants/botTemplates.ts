/**
 * Bot message template definitions.
 * Extracted from BotSettings.tsx for maintainability.
 * Each template uses i18n translation keys resolved at render time via the `t` function.
 */

export type BotTone = 'friendly' | 'professional' | 'casual';

export interface BotTemplateDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: string;
  category: 'general' | 'industry';
  settings: {
    welcomeMessageKey: string;
    outOfHoursMessageKey: string;
    tone: BotTone;
    responseDelay: number;
  };
}

export const BOT_TEMPLATE_DEFINITIONS: BotTemplateDefinition[] = [
  // General Templates
  { id: 'formal', nameKey: 'botSettingsPage.templateFormal', descriptionKey: 'botSettingsPage.templateFormalDesc', icon: '💼', category: 'general', settings: { welcomeMessageKey: 'botSettingsPage.text1', outOfHoursMessageKey: 'botSettingsPage.text2', tone: 'professional', responseDelay: 3 } },
  { id: 'friendly', nameKey: 'botSettingsPage.templateFriendly', descriptionKey: 'botSettingsPage.templateFriendlyDesc', icon: '😊', category: 'general', settings: { welcomeMessageKey: 'botSettingsPage.text3', outOfHoursMessageKey: 'botSettingsPage.text4', tone: 'friendly', responseDelay: 2 } },
  { id: 'modern', nameKey: 'botSettingsPage.templateModern', descriptionKey: 'botSettingsPage.templateModernDesc', icon: '⚡', category: 'general', settings: { welcomeMessageKey: 'botSettingsPage.text5', outOfHoursMessageKey: 'botSettingsPage.text6', tone: 'casual', responseDelay: 1 } },

  // Industry Templates
  { id: 'restaurant', nameKey: 'botSettingsPage.templateRestaurant', descriptionKey: 'botSettingsPage.templateRestaurantDesc', icon: '🍴', category: 'industry', settings: { welcomeMessageKey: 'botSettingsPage.text7', outOfHoursMessageKey: 'botSettingsPage.text8', tone: 'friendly', responseDelay: 2 } },
  { id: 'fashion', nameKey: 'botSettingsPage.templateFashion', descriptionKey: 'botSettingsPage.templateFashionDesc', icon: '👗', category: 'industry', settings: { welcomeMessageKey: 'botSettingsPage.text9', outOfHoursMessageKey: 'botSettingsPage.text10', tone: 'friendly', responseDelay: 2 } },
  { id: 'electronics', nameKey: 'botSettingsPage.templateElectronics', descriptionKey: 'botSettingsPage.templateElectronicsDesc', icon: '📱', category: 'industry', settings: { welcomeMessageKey: 'botSettingsPage.text11', outOfHoursMessageKey: 'botSettingsPage.text12', tone: 'professional', responseDelay: 2 } },
  { id: 'beauty', nameKey: 'botSettingsPage.templateBeauty', descriptionKey: 'botSettingsPage.templateBeautyDesc', icon: '💄', category: 'industry', settings: { welcomeMessageKey: 'botSettingsPage.text13', outOfHoursMessageKey: 'botSettingsPage.text14', tone: 'friendly', responseDelay: 2 } },
  { id: 'realestate', nameKey: 'botSettingsPage.templateRealEstate', descriptionKey: 'botSettingsPage.templateRealEstateDesc', icon: '🏠', category: 'industry', settings: { welcomeMessageKey: 'botSettingsPage.text15', outOfHoursMessageKey: 'botSettingsPage.text16', tone: 'professional', responseDelay: 3 } },
  { id: 'services', nameKey: 'botSettingsPage.templateServices', descriptionKey: 'botSettingsPage.templateServicesDesc', icon: '🛠️', category: 'industry', settings: { welcomeMessageKey: 'botSettingsPage.text17', outOfHoursMessageKey: 'botSettingsPage.text18', tone: 'professional', responseDelay: 2 } },
];

/**
 * Resolve a template definition to a runtime template using the i18n `t` function.
 */
export function resolveTemplate(def: BotTemplateDefinition, t: (key: string) => string) {
  return {
    id: def.id,
    name: t(def.nameKey),
    description: t(def.descriptionKey),
    icon: def.icon,
    category: def.category,
    settings: {
      welcomeMessage: t(def.settings.welcomeMessageKey),
      outOfHoursMessage: t(def.settings.outOfHoursMessageKey),
      tone: def.settings.tone,
      responseDelay: def.settings.responseDelay,
    },
  };
}
