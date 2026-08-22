import type { PublicUxCopy } from './public-ux.schema';

const publicUxEn: PublicUxCopy = {
  pricing: {
    heroTitle: 'Clear, current pricing',
    heroDescription: 'Compare plans currently published by the platform and choose the fit for your store.',
    loading: 'Loading current prices...',
    errorTitle: 'Current pricing is unavailable',
    errorDescription: 'We will not show cached or estimated prices. Try again, or contact us about available plans.',
    retry: 'Try again',
    retrying: 'Trying again...',
    contactSales: 'Contact us',
    emptyTitle: 'No plans are currently published',
    emptyDescription: 'The platform has not published an active plan. Contact us instead of relying on an old price.',
    monthly: 'per month',
    customerLimit: 'Up to {{count}} customers',
    choosePlan: 'Choose {{name}}',
    vatNotice: 'Prices use each plan’s listed currency and exclude VAT where applicable. The final total is shown before payment.',
    faqTitle: 'Frequently asked questions',
    faqSubtitle: 'Clear answers about price sources, trials, and billing.',
    faqTrialQuestion: 'Is there a trial?',
    faqTrialAnswer: 'A new account starts with a 7-day trial without requesting a card at signup. Your account shows its status and limits.',
    faqSourceQuestion: 'Where do the displayed prices come from?',
    faqSourceAnswer: 'Plans and prices come directly from active plans published by the platform; this page does not use fixed or estimated prices.',
    faqCancelQuestion: 'How do I manage or cancel a subscription?',
    faqCancelAnswer: 'Manage the subscription from your account. The change or cancellation terms and their effect are shown before confirmation.',
    faqTaxQuestion: 'Is the listed price the final total?',
    faqTaxAnswer: 'The plan price excludes tax where applicable. Checkout shows the price, VAT, and final total before creating a payment.',
    ctaTitle: 'Ready to start?',
    ctaDescription: 'Create your account and start the trial, then choose a plan when you are ready.',
    ctaButton: 'Start your trial',
  },
};

export default publicUxEn;
