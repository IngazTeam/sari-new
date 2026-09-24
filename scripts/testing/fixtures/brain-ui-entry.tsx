import { DiscountPolicySettings } from '../../../client/src/components/DiscountPolicySettings';
import CalendarPage from '../../../client/src/pages/CalendarPage';
import { AppointmentSyncReview } from '../../../client/src/components/AppointmentSyncReview';
import { CheckoutMarginPolicySettings } from '../../../client/src/components/CheckoutMarginPolicySettings';
import React, { useEffect, useState } from 'react';
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
import { BookingCheckoutAttempts } from '../../../client/src/components/BookingCheckoutAttempts';
import { BookingPaymentLinkRenewal } from '../../../client/src/components/BookingPaymentLinkRenewal';
import { BookingOperations } from '../../../client/src/components/BookingOperations';
import type { BookingStatus } from '../../../shared/booking-operations';
import { CheckoutDiscountRelease } from '../../../client/src/components/CheckoutDiscountRelease';
import { CheckoutDiscountBreakdown } from '../../../client/src/components/CheckoutDiscountBreakdown';
import { ZidCheckoutReconciliation } from '../../../client/src/components/ZidCheckoutReconciliation';
import { SalesSectorSettings } from '../../../client/src/components/SalesSectorSettings';
function BookingOperationsFixture(){
  const mode=new URL(location.href).searchParams.get('case')||'';
  const initial:BookingStatus=mode==='booking-ops-cancelled'?'cancelled':mode==='booking-ops-completed'?'completed':mode==='booking-ops-no-show'?'no_show':mode==='booking-ops-paid'?'confirmed':'pending';
  const [status,setStatus]=useState<BookingStatus>(initial),[deleted,setDeleted]=useState(false);
  useEffect(()=>{(window as any).__changeOperationalBooking=()=>setStatus('cancelled');},[]);
  return deleted?<p data-booking-deleted>Booking removed from the list</p>:<BookingOperations booking={{id:321,status,paymentStatus:mode==='booking-ops-refunded'?'refunded':mode==='booking-ops-paid'?'paid':'unpaid'}} onChanged={async(isDeleted)=>{
    if(mode==='booking-ops-parent-error')throw Error('private parent failure');
    (window as any).__operationParentRefreshed=true;if(isDeleted)setDeleted(true);else if((window as any).__operationSaved&&mode!=='booking-ops-stale')setStatus((window as any).__operationInput.status);
  }}/>;
}
async function render() {
  const lng = new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'ar';
  const mode=new URL(location.href).searchParams.get('case')||'';
  document.documentElement.lang = lng; document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  await i18n.use(initReactI18next).init({ lng, resources: { ar: { translation: { merchantUx, common: ar.common } }, en: { translation: { merchantUx: merchantUxEn, common: en.common } } }, interpolation: { escapeValue: false } });
  if(mode.startsWith('calendar-page-')) { createRoot(document.getElementById('root')!).render(<CalendarPage />); return; }
  if(mode.startsWith('calendar-review-')) { createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-3"><AppointmentSyncReview appointmentId={501} onChanged={async()=>{if(mode==='calendar-review-parent-error')throw Error('private parent failure');(window as any).__calendarParentRefreshed=true;}} /></main>); return; }
  createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-5xl space-y-6 p-4" dir={lng === 'ar' ? 'rtl' : 'ltr'}>
    <LearningEvidenceCard /><div id="invoice-fixture"><CheckoutInvoiceReview orderId={123} totalAmount={23000} onApproved={() => { (window as any).__approved = true; }}
      discount={mode.startsWith('discounted-')?{code:'SAVE_'+'X'.repeat(45),subtotalMinor:25000,discountMinor:mode==='discounted-invalid'?1000:2000}:undefined} /></div>
    <div id="margin-audit-fixture"><CheckoutMarginExceptionAudit orderId={124} /></div>
    <div id="checkout-attempts-fixture"><OrderCheckoutAttempts orderId={123} /></div>
    <div id="booking-checkout-fixture"><BookingCheckoutAttempts bookingId={321} onReviewed={async()=>{(window as any).__bookingParentRefreshed=true;}} /></div>
    <div id="booking-renewal-fixture"><BookingPaymentLinkRenewal bookingId={321} onRenewed={async()=>{(window as any).__renewalParentRefreshed=true;}} /></div>
    <div id="booking-operations-fixture">{mode.startsWith('booking-ops-')&&<BookingOperationsFixture />}</div>
    <div id="coupon-release-fixture">{mode.startsWith('coupon-release-')&&<CheckoutDiscountBreakdown discount={{code:'LOCAL10',subtotalMinor:29997,discountMinor:2999}} totalMinor={26998} approved historical />}<CheckoutDiscountRelease orderId={123} /></div>
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
