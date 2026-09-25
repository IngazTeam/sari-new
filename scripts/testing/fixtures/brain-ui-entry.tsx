import { LearningAnalysisStatusCard } from '../../../client/src/components/LearningAnalysisStatusCard';
import { LearningPolicyReviewPanel } from '../../../client/src/components/LearningPolicyReview';
import { LearningPolicyEvaluation, LearningPolicyEvaluationPanel } from '../../../client/src/components/LearningPolicyEvaluation';
import { BookingReschedule } from '../../../client/src/components/BookingReschedule';
import { AiCapabilityCard } from '../../../client/src/components/admin/AiCapabilityCard';
import { buildAiCapabilityManifest } from '../../../shared/ai-capabilities';
import { BookingCalendarSync } from '../../../client/src/components/BookingCalendarSync';
import { BookingCancellation } from '../../../client/src/components/BookingCancellation';
import { DiscountPolicySettings } from '../../../client/src/components/DiscountPolicySettings';
import CalendarPage from '../../../client/src/pages/CalendarPage';
import { AppointmentSyncReview } from '../../../client/src/components/AppointmentSyncReview';
import { AppointmentReminderReview } from '../../../client/src/components/AppointmentReminderReview';
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
import { SalesExperimentProtocol } from '../../../client/src/components/SalesExperimentProtocol';
function AiCapabilitiesFixture(){
  const mode=new URL(location.href).searchParams.get('case')||'';
  const [failed,setFailed]=useState(mode==='ai-capabilities-error'),[refreshing,setRefreshing]=useState(false);
  const manifest=buildAiCapabilityManifest({enabled:mode!=='ai-capabilities-disabled',textProvider:mode==='ai-capabilities-openai'?'openai':'zahypi',textModel:mode==='ai-capabilities-xss'?'<img src=x onerror=window.__capabilityXss=1>'+('long-model/'.repeat(12)):'fixture-text-model',openaiCredential:mode==='ai-capabilities-missing'?'missing':mode==='ai-capabilities-unreadable'?'unreadable':'configured',zahypiCredential:'configured'});
  return <AiCapabilityCard manifest={manifest} loading={mode==='ai-capabilities-loading'} failed={failed} refreshing={refreshing} onRefresh={()=>{setRefreshing(true);(window as any).__capabilityRefreshCount=((window as any).__capabilityRefreshCount||0)+1;setTimeout(()=>{setRefreshing(false);setFailed(false);},500);}}/>;
}
function BookingOperationsFixture(){
  const mode=new URL(location.href).searchParams.get('case')||'';
  const initial:BookingStatus=mode.startsWith('booking-ops-calendar-')?'confirmed':mode==='booking-ops-cancelled'?'cancelled':mode==='booking-ops-completed'?'completed':mode==='booking-ops-no-show'?'no_show':mode==='booking-ops-paid'?'confirmed':'pending';
  const [status,setStatus]=useState<BookingStatus>(initial),[deleted,setDeleted]=useState(false);
  useEffect(()=>{(window as any).__changeOperationalBooking=()=>setStatus('cancelled');},[]);
  return deleted?<p data-booking-deleted>Booking removed from the list</p>:<BookingOperations booking={{id:321,status,paymentStatus:mode==='booking-ops-refunded'?'refunded':mode==='booking-ops-paid'?'paid':'unpaid'}} onChanged={async(isDeleted)=>{
    if(['booking-ops-parent-error','booking-ops-consent-parent-error'].includes(mode))throw Error('private parent failure');
    (window as any).__operationParentRefreshed=true;if(isDeleted)setDeleted(true);else if((window as any).__operationSaved&&mode!=='booking-ops-stale')setStatus((window as any).__operationInput.status);
  }}/>;
}
async function render() {
  const lng = new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'ar';
  const mode=new URL(location.href).searchParams.get('case')||'';
  document.documentElement.lang = lng; document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  await i18n.use(initReactI18next).init({ lng, resources: { ar: { translation: { merchantUx, common: ar.common } }, en: { translation: { merchantUx: merchantUxEn, common: en.common } } }, interpolation: { escapeValue: false } });
  if(mode.startsWith('protocol-') || (mode.startsWith('cohort-') || mode.startsWith('inspection-') || mode.startsWith('plan-review-') || mode.startsWith('launch-'))){createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-6xl p-3">{(mode==='protocol-standalone'||(mode.startsWith('cohort-') || mode.startsWith('inspection-') || mode.startsWith('plan-review-') || mode.startsWith('launch-')))?<SalesExperimentProtocol/>:<LearningPolicyEvaluationPanel proposalId={16}/>}</main>);return;}
  if(mode.startsWith('evaluation-')){createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-6xl p-3">{mode==='evaluation-close'?<LearningPolicyEvaluation proposalId={16}/>:<LearningPolicyEvaluationPanel proposalId={16}/>}</main>);return;}
  if(mode.startsWith('learning-review-')){createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-5xl p-3">{mode==='learning-review-card'?<LearningEvidenceCard/>:<LearningPolicyReviewPanel proposalId={16}/>}</main>);return;}
  if(mode.startsWith('learning-status-')){createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-3"><LearningAnalysisStatusCard/></main>);return;}
  if(mode.startsWith('appointment-reminders-')){createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-3"><AppointmentReminderReview appointmentId={501}/></main>);return;}
  if(mode.startsWith('ai-capabilities-')){createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-4xl p-3"><AiCapabilitiesFixture/></main>);return;}
  if(mode.startsWith('booking-reschedule-')) { createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-3"><BookingReschedule bookingId={321} onChanged={async()=>{if(mode==='booking-reschedule-parent-error')throw Error('private parent failure');(window as any).__rescheduleParentRefreshed=true;}} /></main>); return; }
  if(mode.startsWith('booking-cancellation-')) { createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-3"><BookingCancellation bookingId={321} onChanged={async()=>{if(mode==='booking-cancellation-parent-error')throw Error('private parent failure');(window as any).__cancellationParentRefreshed=true;}} /></main>); return; }
  if(mode.startsWith('booking-calendar-')) { createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-3"><BookingCalendarSync bookingId={321} onChanged={async()=>{if(mode==='booking-calendar-parent-error')throw Error('private parent failure');(window as any).__bookingCalendarParentRefreshed=true;}} /></main>); return; }
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
