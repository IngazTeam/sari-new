import { DiscountPolicySettings } from '../../../client/src/components/DiscountPolicySettings';
import { CheckoutMarginPolicySettings } from '../../../client/src/components/CheckoutMarginPolicySettings';
import React from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import merchantUx from '../../../client/src/locales/merchant-ux.ar';
import merchantUxEn from '../../../client/src/locales/merchant-ux.en';
import ar from '../../../client/src/locales/ar.json';
import en from '../../../client/src/locales/en.json';
import { FollowupPolicySettings } from '../../../client/src/components/FollowupPolicySettings';
import { ConversationHandoff } from '../../../client/src/components/ConversationHandoff';
import { EscalationReconciliation } from '../../../client/src/components/EscalationReconciliation';
import { SalesOfferReview } from '../../../client/src/components/SalesOfferReview';
import { LearningEvidenceCard } from '../../../client/src/components/LearningEvidenceCard';
import { CheckoutInvoiceReview } from '../../../client/src/components/CheckoutInvoiceReview';
import { CheckoutMarginExceptionAudit } from '../../../client/src/components/CheckoutMarginExceptionAudit';
import { OrderCheckoutAttempts } from '../../../client/src/components/OrderCheckoutAttempts';
import { ZidCheckoutReconciliation } from '../../../client/src/components/ZidCheckoutReconciliation';
import { SalesSectorSettings } from '../../../client/src/components/SalesSectorSettings';
async function render() {
  const lng = new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'ar';
  const mode=new URL(location.href).searchParams.get('case')||'';
  document.documentElement.lang = lng; document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  await i18n.use(initReactI18next).init({ lng, resources: { ar: { translation: { merchantUx, common: ar.common } }, en: { translation: { merchantUx: merchantUxEn, common: en.common } } }, interpolation: { escapeValue: false } });
  createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-5xl space-y-6 p-4" dir={lng === 'ar' ? 'rtl' : 'ltr'}>
    <LearningEvidenceCard /><div id="invoice-fixture"><CheckoutInvoiceReview orderId={123} totalAmount={23000} onApproved={() => { (window as any).__approved = true; }}
      discount={mode.startsWith('discounted-')?{code:'SAVE_'+'X'.repeat(45),subtotalMinor:25000,discountMinor:mode==='discounted-invalid'?1000:2000}:undefined} /></div>
    <div id="margin-audit-fixture"><CheckoutMarginExceptionAudit orderId={124} /></div>
    <div id="checkout-attempts-fixture"><OrderCheckoutAttempts orderId={123} /></div>
    <div id="zid-fixture"><ZidCheckoutReconciliation /></div><div id="sector-fixture"><SalesSectorSettings /></div>
    <form id="discount-policy-fixture" onSubmit={event => { event.preventDefault(); (window as any).__unexpectedBotSubmit = true; }}><DiscountPolicySettings /></form>
    <form id="margin-policy-fixture" onSubmit={event=>{event.preventDefault();(window as any).__unexpectedMarginSubmit=true;}}><CheckoutMarginPolicySettings /></form>
    <div id="followup-fixture"><FollowupPolicySettings /></div>
    <div id="handoff-fixture"><ConversationHandoff conversationId={42} /></div>
    <div id="relay-fixture"><EscalationReconciliation conversationId={42} /></div>
    <div id="offer-fixture"><SalesOfferReview conversationId={42} /></div>
    <p id="conversation-message-81">رسالة العميل الأصلية</p><p id="conversation-message-82">رد الموظف الأصلي</p>
  </main>);
}
void render();
