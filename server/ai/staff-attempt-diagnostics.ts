import type {PoolConnection} from 'mysql2/promise';
import {readDashboardStaffBasis,readDashboardStaffAcceptance,dashboardStaffTransport,staffDashboardKey} from './staff-dashboard-reply-contract';
import {readStaffVoiceIntent,readStaffVoiceBasis,readStaffVoiceAcceptance,staffVoiceTransport,staffVoiceKey} from './staff-dashboard-voice-contract';
import {readStaffTextCompatibility,isStaffTextCompatibility} from './staff-dashboard-compatibility';
import {readVoiceCompatibility} from './staff-voice-compatibility-contract';
import {compatibilityDeliveryKey,readCompatibilityDelivery,type CompatibilityDeliveryBasis} from './staff-compatibility-settlement-contract';
import {unresolvedStaffDelivery} from './staff-delivery-outcome';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';
import {staffReceiptDigest} from './sales-staff-acceptance-contract';

const unavailable=():never=>{throw Error('Staff diagnostic unavailable');};
const pending=(diagnostic:'upload_unconfirmed'|'transport_unconfirmed'|'outcome_unknown'|'settlement_available')=>({state:'pending',diagnostic} as const);
/** Read-only, under the authorized caller's SQL transaction. Exposes codes, never raw provider errors. */
export async function diagnoseUnsettledStaffAttempt(c:PoolConnection,kind:'text'|'voice',row:any){
  const merchant=Number(row.merchant_id),source=Number(row.id),compat=kind==='text'?isStaffTextCompatibility(row):Number(row.compatibility)===1;
  const [facts]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=? AND source_kind=? AND source_id=? FOR SHARE',
    [merchant,kind==='text'?'dashboard_text':'dashboard_voice',source]);
  if(compat){
    if(facts.length)return unavailable();
    const t=kind==='text'?readStaffTextCompatibility(row):null,v=kind==='voice'?readVoiceCompatibility(row):null;
    const text=t?.version==='staff-text-compatibility.v2'?t:null,voice=v?.intent.version==='staff-voice-compatibility.v2'?v.intent:null;
    const authority=text?.authority??voice?.authority;
    if(!authority)return pending('transport_unconfirmed');
    const basis:CompatibilityDeliveryBasis={kind,merchantId:merchant,sourceId:source,instanceRecordId:authority.recordId,basisDigest:row.basis_digest,
      phone:row.customer_phone,...(kind==='text'?{text:row.reply_text}:{mediaUrl:row.media_url,fileName:v?.basis?.fileName})};
    const [deliveries]=await c.execute<any[]>('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR SHARE',[merchant,compatibilityDeliveryKey(basis)]);
    if(deliveries.length>1)return unavailable();
    if(kind==='voice'&&!v?.basis){if(deliveries.length)return unavailable();return pending('upload_unconfirmed');}
    if(authority.source==='legacy'){
      if(deliveries.length)return unavailable();
      return pending((text?.legacyDelivery??v?.basis?.legacyDelivery)?'settlement_available':'transport_unconfirmed');
    }
    const d=deliveries[0];
    if(d&&readCompatibilityDelivery(basis,d,new Date().toISOString()))return pending('settlement_available');
    const result=unresolvedStaffDelivery(d,kind==='text'?'staff_compatibility_suppressed':'staff_compat_voice_suppressed');
    return {state:result.status,diagnostic:result.diagnostic};
  }
  if(kind==='text')readDashboardStaffBasis(row);else readStaffVoiceIntent(row);
  const [deliveries]=await c.execute<any[]>('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR SHARE',
    [merchant,kind==='text'?staffDashboardKey(merchant,source):staffVoiceKey(merchant,source)]);
  if(facts.length>1||deliveries.length>1)return unavailable();
  if(kind==='voice'&&row.basis==null){
    if(facts.length||deliveries.length||row.media_url!=null||row.basis_digest!=null)return unavailable();
    return pending('upload_unconfirmed');
  }
  const b=kind==='text'?readDashboardStaffBasis(row):readStaffVoiceBasis(row),d=deliveries[0];
  const s=facts.length?(kind==='text'?readDashboardStaffAcceptance(facts[0]):readStaffVoiceAcceptance(facts[0])):null;
  if(s&&s.basisDigest!==hash(b))return unavailable();
  if(d){
    // A transport row must match the entire frozen request before its status can influence UX.
    const proof=kind==='text'?dashboardStaffTransport(b as ReturnType<typeof readDashboardStaffBasis>,{...d,provider_message_id:d.provider_message_id||'pending-receipt'})
      :staffVoiceTransport(b as ReturnType<typeof readStaffVoiceBasis>,{...d,provider_message_id:d.provider_message_id||'pending-receipt'});
    if(s&&(s.outboxId!==proof.outboxId||s.requestDigest!==proof.requestDigest||s.providerMessageDigest!==proof.providerMessageDigest))return unavailable();
  }
  if(s){
    const account=kind==='text'?readDashboardStaffBasis(row):readStaffVoiceIntent(row);
    if(s.providerMessageDigest!==staffReceiptDigest(merchant,account.instanceRecordId,account.provider,d?.provider_message_id||row.provider_message_id))return unavailable();
    return pending('settlement_available');
  }
  const result=unresolvedStaffDelivery(d,kind==='text'?'staff_reply_suppressed':'staff_voice_suppressed');
  return {state:result.status,diagnostic:result.diagnostic};
}
