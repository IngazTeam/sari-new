import { policyArtifactDigest as hash } from '../../ai/learning-policy-evaluation-bundle';
import { getSalesSectorPlaybook } from '../../../shared/sales-sector-playbooks';
import { syntheticSalesExperimentDesign } from './sales-experiment-design';

export const readoutDates = { registered:'2026-09-01T00:00:00.000Z',assigned:'2026-09-03T00:00:01.000Z',paid:'2026-09-04T00:00:00.000Z',read:'2026-10-18T00:00:00.000Z' };
export function readoutFixture() {
  const d='a'.repeat(64),playbook=getSalesSectorPlaybook('general');
  const phone=(n:number)=>'966500'+String(n).padStart(6,'0');
  const p={ version:'sales-experiment-protocol.v1',merchantId:1,registeredAt:readoutDates.registered,
    candidate:{id:2,artifactDigest:d,baselineDigest:d,sourceDigest:d,preparationReviewId:3},
    sector:{revision:0,playbook,digest:hash(playbook)},design:syntheticSalesExperimentDesign(Date.parse(readoutDates.registered)),
    sampleAdequacy:'not_independently_verified',cohortExecution:'not_implemented',activationAllowed:false };
  const protocol={id:4,merchant_id:1,candidate_id:2,artifact_digest:d,protocol_digest:hash(p),protocol:p,state:'registered'};
  function assignment(n=1,arm:'baseline'|'candidate'='baseline') {
    const s={version:'sales-experiment-assignment.v1',merchantId:1,protocolId:4,protocolDigest:protocol.protocol_digest,
      launchId:5,launchDigest:d,cohortId:6,cohortDigest:d,customerKey:hash({version:'sales-experiment-customer.v1',merchantId:1,phone:phone(n)}),candidateId:2,artifactDigest:d,baselineDigest:d,sectorDigest:hash(playbook),
      arm,allocation:'server_crypto_random_50_50.v1',conversationId:n,incomingMessageId:n,messageDigest:d,sourceDigest:d,population:'new',
      messageReceivedAt:'2026-09-03T00:00:00.000Z',qualifiedAt:readoutDates.assigned,assignedAt:readoutDates.assigned,
      ...p.design.window,observationEndsAt:'2026-09-17T00:00:01.000Z',scope:'enrollment_only',dispatchAllowed:false,exposureRecorded:false};
    return {id:n,merchant_id:1,protocol_id:4,launch_id:5,customer_key:s.customerKey,arm,conversation_reference:n,message_reference:n,
      observation_utc:s.observationEndsAt,assignment_digest:hash(s),snapshot:s};
  }
  function capture(a=assignment(),n=1,extra:Record<string,unknown>={}) {
    const s={version:'tap-sales-payment-fact.v1',merchantId:1,paymentId:n,event:'captured',targetKind:'order',targetId:n,
      customerKey:a.customer_key,amountMinor:15000,currency:'SAR',verifiedAt:readoutDates.paid,timeBasis:'local_verified_transition',refundExtent:'none',source:'canonical_tap_payment',...extra};
    const t={version:'sales-payment-attribution.v1',merchantId:1,factId:n,factDigest:hash(s),captureFactId:n,captureFactDigest:hash(s),
      assignmentId:a.id,assignmentDigest:a.assignment_digest,protocolId:4,protocolDigest:protocol.protocol_digest,customerKey:s.customerKey,arm:a.arm,
      artifactDigest:d,baselineDigest:d,sectorDigest:hash(playbook),event:s.event,paymentId:n,targetKind:s.targetKind,targetId:s.targetId,amountMinor:s.amountMinor,currency:s.currency,
      assignedAt:a.snapshot.assignedAt,capturedAt:s.verifiedAt,verifiedAt:s.verifiedAt,observationEndsAt:a.snapshot.observationEndsAt,refundCutoff:p.design.window.decisionNotBefore,
      includedAtCutoff:true,signedNetMinor:s.amountMinor,timeBasis:'local_verified_transition',humanAssistance:'unmeasured',scope:'intention_to_treat_only',winner:null};
    return {id:n,merchant_id:1,payment_id:n,event_type:s.event,target_kind:s.targetKind,target_id:s.targetId,customer_key:s.customerKey,
      snapshot:s,fact_digest:hash(s),attribution_state:'attributed',attribution:t,attribution_digest:hash(t)};
  }
  function refund(c:ReturnType<typeof capture>,at='2026-10-01T00:00:00.000Z') {
    const s={...c.snapshot,event:'refunded',refundExtent:'full',verifiedAt:at},included=Date.parse(at)<Date.parse(p.design.window.decisionNotBefore);
    const t={...c.attribution,event:'refunded',factId:c.id+10000,factDigest:hash(s),verifiedAt:at,includedAtCutoff:included,signedNetMinor:included ? -Number(s.amountMinor) : 0};
    return {...c,id:t.factId,event_type:'refunded',snapshot:s,fact_digest:hash(s),attribution:t,attribution_digest:hash(t)};
  }
  function exposure(a=assignment(),n=1,start=-2000,accept=-1000,extra:Record<string,unknown>={}){
    const dispatch=new Date(Date.parse(readoutDates.paid)+start).toISOString();
    const b={version:'sales-reply-delivery-basis.v1',merchantId:1,generationId:n,actorUserId:1,reviewId:n,reviewDigest:d,
      reviewBasisDigest:d,reviewRevision:1,conversationId:a.id,incomingMessageId:n,responseText:'Synthetic reviewed reply',
      recipient:phone(a.id),instanceRecordId:1,provider:extra.provider??'green_api',accountDigest:d,
      observationEndsAt:a.snapshot.observationEndsAt,inboundReceivedAt:new Date(Date.parse(dispatch)-60000).toISOString()};
    const authorization={version:'sales-reply-delivery-authorization.v1',basis:b,basisDigest:hash(b),requestId:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,
      reason:'Explicit authorization of a synthetic reviewed response.',authorizedAt:new Date(Date.parse(dispatch)-1000).toISOString(),
      expiresAt:new Date(Date.parse(dispatch)+110000).toISOString(),allowSendCustomerMessage:true,reviewedExactRecipientAndResponse:true,scope:'one_reviewed_text_reply'};
    const authorizationDigest=hash(authorization);
    const s={version:'sales-experiment-transport-exposure.v1',merchantId:1,protocolId:4,assignmentId:a.id,assignmentDigest:a.assignment_digest,
      customerKey:a.customer_key,arm:a.arm,turnId:n,turnDigest:d,artifactDigest:d,baselineDigest:d,sectorDigest:hash(playbook),
      styleApplied:a.arm==='candidate',styleReason:a.arm==='candidate'?'candidate_style':'baseline_arm',
      generationId:n,generationDigest:d,responseDigest:d,reviewId:n,reviewDigest:d,deliveryId:n,authorizationDigest,outboxId:n,requestDigest:hash({to:b.recipient,kind:'text',text:b.responseText,salesReplyGuard:{deliveryId:n,authorizationDigest}}),
      provider:b.provider,providerMessageDigest:d,conversationId:a.id,incomingMessageId:n,assignmentAt:a.snapshot.assignedAt,dispatchStartedAt:dispatch,
      observationEndsAt:a.snapshot.observationEndsAt,acceptanceObservedAt:new Date(Date.parse(readoutDates.paid)+accept).toISOString(),
      observationTiming:accept<start?'clock_regression':'ordered',humanReviewed:true,scope:'provider_acceptance_only',...extra};
    return {row:{id:n,merchant_id:1,protocol_id:4,assignment_id:a.id,delivery_id:n,outbox_id:n,exposure_digest:hash(s),snapshot:s},
      delivery:{id:n,merchant_id:1,generation_id:n,message_reference:n,actor_user_id:1,request_id:authorization.requestId,basis_digest:authorization.basisDigest,
        authorization_digest:authorizationDigest,state:'dispatching',dispatch_started_at:dispatch,snapshot:authorization}};
  }
  function binding(a=assignment(),conversation=a.id,n=conversation){
    return {id:n,merchant_id:1,protocol_id:4,conversation_reference:conversation,assignment_id:a.id,customer_key:a.customer_key,
      current_conversation_id:conversation,current_customer_phone:phone(a.id)};
  }
  function staffMessage(n=1,conversation=1,sender='merchant',at='2026-09-04T00:00:00.000Z'){
    return {id:n,conversationId:conversation,direction:'outgoing',sender_type:sender,created_utc:at};
  }
  return {protocol,assignment,capture,refund,exposure,binding,staffMessage,rows:{protocol,withdrawals:[] as any[],assignments:[assignment()],payments:[] as any[],exposures:[] as any[],deliveries:[] as any[],conversationBindings:[] as any[],staffMessages:[] as any[],staffAcceptances:[] as any[]}};
}
