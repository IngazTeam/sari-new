export const pricingCopyKeys = [
  'heroTitle', 'heroDescription', 'loading', 'errorTitle', 'errorDescription',
  'retry', 'retrying', 'contactSales', 'emptyTitle', 'emptyDescription',
  'monthly', 'customerLimit', 'choosePlan', 'vatNotice',
  'faqTitle', 'faqSubtitle', 'faqTrialQuestion', 'faqTrialAnswer',
  'faqSourceQuestion', 'faqSourceAnswer', 'faqCancelQuestion', 'faqCancelAnswer',
  'faqTaxQuestion', 'faqTaxAnswer', 'ctaTitle', 'ctaDescription', 'ctaButton',
] as const;

export const supportCopyKeys = [
  'heroTitle', 'heroDescription', 'statusTitle', 'statusDescription',
  'statusChecking', 'statusOperational', 'statusDegraded', 'statusUnknown',
  'statusCheckedAt', 'statusRetry', 'channelsTitle', 'channelsDescription',
  'emailTitle', 'emailDescription', 'emailAction', 'helpTitle',
  'helpDescription', 'helpAction', 'hoursTitle', 'hoursDescription',
  'slaNotice', 'formTitle', 'formDescription', 'nameLabel', 'namePlaceholder',
  'emailLabel', 'emailPlaceholder', 'subjectLabel', 'subjectPlaceholder',
  'messageLabel', 'messagePlaceholder', 'privacyNotice', 'privacyLink',
  'submit', 'submitting', 'successTitle', 'successDescription', 'referenceLabel',
  'errorTitle', 'errorDescription', 'rateLimitError', 'emailFallback',
  'resourcesTitle', 'resourcesDescription', 'pricingTitle', 'pricingDescription',
  'pricingAction', 'faqTitle', 'faqDescription', 'faqStartQuestion',
  'faqStartAnswer', 'faqResponseQuestion', 'faqResponseAnswer',
  'faqWhatsappQuestion', 'faqWhatsappAnswer', 'faqSecurityQuestion',
  'faqSecurityAnswer',
] as const;

type CopySection<Keys extends readonly string[]> = Record<Keys[number], string>;

export type PublicUxCopy = {
  pricing: CopySection<typeof pricingCopyKeys>;
  support: CopySection<typeof supportCopyKeys>;
};

export function flattenPublicUxKeys(copy: PublicUxCopy): string[] {
  return Object.entries(copy).flatMap(([section, values]) =>
    Object.keys(values).map((key) => `${section}.${key}`),
  ).sort();
}
