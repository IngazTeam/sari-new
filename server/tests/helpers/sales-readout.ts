import { policyArtifactDigest as hash } from '../../ai/learning-policy-evaluation-bundle';
import { getSalesSectorPlaybook } from '../../../shared/sales-sector-playbooks';
import { syntheticSalesExperimentDesign } from './sales-experiment-design';

export const readoutDates = { registered:'2026-09-01T00:00:00.000Z',assigned:'2026-09-03T00:00:01.000Z',paid:'2026-09-04T00:00:00.000Z',read:'2026-10-18T00:00:00.000Z' };
export function readoutFixture() {
  const d='a'.repeat(64),playbook=getSalesSectorPlaybook('general');
  const p={ version:'sales-experiment-protocol.v1',merchantId:1,registeredAt:readoutDates.registered,
    candidate:{id:2,artifactDigest:d,baselineDigest:d,sourceDigest:d,preparationReviewId:3},
    sector:{revision:0,playbook,digest:hash(playbook)},design:syntheticSalesExperimentDesign(Date.parse(readoutDates.registered)),
    sampleAdequacy:'not_independently_verified',cohortExecution:'not_implemented',activationAllowed:false };
  const protocol={id:4,merchant_id:1,candidate_id:2,artifact_digest:d,protocol_digest:hash(p),protocol:p,state:'registered'};
  function assignment(n=1,arm:'baseline'|'candidate'='baseline') {
    const s={version:'sales-experiment-assignment.v1',merchantId:1,protocolId:4,protocolDigest:protocol.protocol_digest,
      launchId:5,launchDigest:d,cohortId:6,cohortDigest:d,customerKey:hash({customer:n}),candidateId:2,artifactDigest:d,baselineDigest:d,sectorDigest:hash(playbook),
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
  return {protocol,assignment,capture,refund,rows:{protocol,withdrawals:[] as any[],assignments:[assignment()],payments:[] as any[]}};
}
