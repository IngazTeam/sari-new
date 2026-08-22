export const pricingCopyKeys = [
  'heroTitle', 'heroDescription', 'loading', 'errorTitle', 'errorDescription',
  'retry', 'retrying', 'contactSales', 'emptyTitle', 'emptyDescription',
  'monthly', 'customerLimit', 'choosePlan', 'vatNotice',
  'faqTitle', 'faqSubtitle', 'faqTrialQuestion', 'faqTrialAnswer',
  'faqSourceQuestion', 'faqSourceAnswer', 'faqCancelQuestion', 'faqCancelAnswer',
  'faqTaxQuestion', 'faqTaxAnswer', 'ctaTitle', 'ctaDescription', 'ctaButton',
] as const;

type CopySection<Keys extends readonly string[]> = Record<Keys[number], string>;

export type PublicUxCopy = {
  pricing: CopySection<typeof pricingCopyKeys>;
};

export function flattenPublicUxKeys(copy: PublicUxCopy): string[] {
  return Object.entries(copy).flatMap(([section, values]) =>
    Object.keys(values).map((key) => `${section}.${key}`),
  ).sort();
}
