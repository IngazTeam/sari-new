import React from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import merchantUx from '../../../client/src/locales/merchant-ux.ar';
import merchantUxEn from '../../../client/src/locales/merchant-ux.en';
import { FollowupPolicySettings } from '../../../client/src/components/FollowupPolicySettings';
import { LearningEvidenceCard } from '../../../client/src/components/LearningEvidenceCard';
import { CheckoutInvoiceReview } from '../../../client/src/components/CheckoutInvoiceReview';
import { ZidCheckoutReconciliation } from '../../../client/src/components/ZidCheckoutReconciliation';
import { SalesSectorSettings } from '../../../client/src/components/SalesSectorSettings';
async function render() {
  const lng = new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'ar';
  document.documentElement.lang = lng; document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  await i18n.use(initReactI18next).init({ lng, resources: { ar: { translation: { merchantUx } }, en: { translation: { merchantUx: merchantUxEn } } }, interpolation: { escapeValue: false } });
  createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-5xl space-y-6 p-4" dir={lng === 'ar' ? 'rtl' : 'ltr'}>
    <LearningEvidenceCard /><div id="invoice-fixture"><CheckoutInvoiceReview orderId={123} totalAmount={23000} onApproved={() => { (window as any).__approved = true; }} /></div>
    <div id="zid-fixture"><ZidCheckoutReconciliation /></div><div id="sector-fixture"><SalesSectorSettings /></div>
    <div id="followup-fixture"><FollowupPolicySettings /></div>
  </main>);
}
void render();
