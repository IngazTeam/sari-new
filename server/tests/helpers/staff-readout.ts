import { policyArtifactDigest as hash } from '../../ai/learning-policy-evaluation-bundle';
import { staffActorKey } from '../../ai/staff-dashboard-reply-contract';

/** App-valid, explicitly synthetic acceptance fixtures. No real transport or customer data. */
export function staffReadoutFact(a:any,n=1,source:'escalation_relay'|'dashboard_text'|'dashboard_voice'='dashboard_text',
  options:{reservedAt?:string;acceptedAt?:string;provider?:'green_api'|'meta_cloud'|'mock';conversationId?:number}={}) {
  const d='a'.repeat(64),reservedAt=options.reservedAt??'2026-09-03T23:59:59.000Z',at=options.acceptedAt??'2026-09-03T23:59:59.500Z';
  const common={sourceId:n,merchantId:a.snapshot.merchantId,conversationId:options.conversationId??a.snapshot.conversationId,
    ownershipVersion:1,instanceRecordId:1,provider:options.provider??'green_api',accountDigest:d,customerKey:a.snapshot.customerKey,
    authorKey:staffActorKey(a.snapshot.merchantId,1),reservedAt,scope:'staff_reply_attempt_only'};
  const text={...common,version:'sales-staff-dashboard-basis.v1',source:'dashboard_text',actorUserId:1,
    requestId:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,authorBasis:'authenticated_submitter',compositionBasis:'unmeasured',replyDigest:d};
  let basis:any,version:string;
  if(source==='dashboard_voice'){
    const {replyDigest,...rest}=text;
    const intent={...rest,version:'sales-staff-voice-intent.v1',source,audioDigest:d,byteLength:16,mimeType:'audio/ogg',duration:1.5,
      durationBasis:'client_reported',contentBasis:'uploaded_bytes_signature_checked'};
    basis={version:'sales-staff-voice-basis.v1',intent,intentDigest:hash(intent),mediaUrlDigest:d,fileName:'voice-message.ogg'};
    version='sales-staff-voice-acceptance.v1';
  }else if(source==='escalation_relay'){
    basis={...common,version:'sales-staff-relay-basis.v1',source,escalationId:n,incomingMessageId:n,
      authorBasis:'sourced_escalation_chain_phone',replyDigest:d,quotedMessageDigest:d,alertOutboxId:n+1000,alertRequestDigest:d};
    version='sales-staff-transport-acceptance.v1';
  }else{basis=text;version='sales-staff-dashboard-acceptance.v1';}
  const snapshot={version,basis,basisDigest:hash(basis),outboxId:n,requestDigest:hash({n,kind:'synthetic_request'}),
    providerMessageDigest:hash({n,kind:'synthetic_receipt'}),acceptanceObservedAt:at,
    observationTiming:at<reservedAt?'clock_regression':'ordered',timeBasis:'local_receipt_verification',scope:'provider_acceptance_only'};
  return {id:n,merchant_id:a.snapshot.merchantId,source_kind:source,source_id:n,customer_key:a.snapshot.customerKey,outbox_id:n,
    provider_message_digest:snapshot.providerMessageDigest,acceptance_digest:hash(snapshot),snapshot,acceptance_observed_at:new Date(at)};
}
