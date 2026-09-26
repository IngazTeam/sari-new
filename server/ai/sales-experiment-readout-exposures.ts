import { salesExposureReadout } from '../../shared/sales-experiment-exposure-readout';
import { databaseTimeEpoch } from '../db/time';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { readSalesExperimentExposure, salesExposureCaptureTiming } from './sales-experiment-exposure-contract';
import { readSalesReplyDeliveryRecord } from './sales-reply-delivery';
import type { readSalesExperimentAssignmentRow } from './sales-experiment-assignment';

type Assignment=ReturnType<typeof readSalesExperimentAssignmentRow>;
type Exposure=ReturnType<typeof readSalesExperimentExposure>;
const conflict=():never=>{throw Error('Sales exposure evidence unavailable');};
/** Validate frozen records from the caller's single SQL snapshot. No live account or message reads. */
export function buildSalesReadoutExposures(assignments:Assignment[],exposureRows:any[],deliveryRows:any[],
  captures:Array<{assignmentId:number;capturedAt:string}>,blocked:boolean,now:number){
  const byAssignment=new Map(assignments.map(a=>[a.assignmentId,a])),deliveries=new Map<number,any>();
  if(deliveryRows.length!==exposureRows.length)conflict();
  for(const row of deliveryRows){const d=readSalesReplyDeliveryRecord(row);if(deliveries.has(d.deliveryId))conflict();deliveries.set(d.deliveryId,{row,d});}
  const ids=new Set<number>(),outboxes=new Set<number>(),seenDeliveries=new Set<number>(),byCustomer=new Map<number,Exposure[]>();
  const evidence=exposureRows.map(row=>{
    const s=readSalesExperimentExposure(row),a=byAssignment.get(s.assignmentId),bound=deliveries.get(s.deliveryId),exposureId=Number(row.id);
    if(!Number.isSafeInteger(exposureId)||exposureId<=0||!a||!bound||ids.has(exposureId)||outboxes.has(s.outboxId)||seenDeliveries.has(s.deliveryId))conflict();
    for(const key of ['merchantId','protocolId','customerKey','arm','artifactDigest','baselineDigest','sectorDigest','observationEndsAt'] as const)
      if(s[key]!==a!.snapshot[key])conflict();
    const {d,row:delivery}=bound,b=d.authorization.basis;
    if(s.assignmentDigest!==a!.assignmentDigest||s.assignmentAt!==a!.snapshot.assignedAt
      ||s.authorizationDigest!==d.authorizationDigest||d.state!=='dispatching'||s.merchantId!==b.merchantId
      ||s.generationId!==b.generationId||s.conversationId!==b.conversationId||s.incomingMessageId!==b.incomingMessageId
      ||s.reviewId!==b.reviewId||s.reviewDigest!==b.reviewDigest||s.provider!==b.provider||s.observationEndsAt!==b.observationEndsAt
      ||s.customerKey!==hash({version:'sales-experiment-customer.v1',merchantId:b.merchantId,phone:b.recipient})
      ||s.requestDigest!==hash({to:b.recipient,kind:'text',text:b.responseText,salesReplyGuard:{deliveryId:d.deliveryId,authorizationDigest:d.authorizationDigest}})
      ||Date.parse(s.dispatchStartedAt)!==databaseTimeEpoch(delivery.dispatch_started_at)
      ||Date.parse(s.dispatchStartedAt)>now||Date.parse(s.acceptanceObservedAt)>now)conflict();
    ids.add(exposureId);outboxes.add(s.outboxId);seenDeliveries.add(s.deliveryId);
    const group=byCustomer.get(s.assignmentId)??[];group.push(s);byCustomer.set(s.assignmentId,group);
    return [exposureId,String(row.exposure_digest),d.deliveryId,d.authorizationDigest] as const;
  }).sort((a,b)=>a[0]-b[0]);
  // One first capture per customer, regardless of currency, target type, later purchases or refunds.
  const first=new Map<number,string>();
  for(const c of captures){const at=first.get(c.assignmentId);if(!at||c.capturedAt<at)first.set(c.assignmentId,c.capturedAt);}
  const arms=(['baseline','candidate'] as const).map(arm=>{
    const group=assignments.filter(a=>a.snapshot.arm===arm);
    const result={arm,assignedCustomers:group.length,customersWithOrderedRealAcceptance:0,customersWithoutOrderedRealAcceptance:0,
      customersWithCandidateStyleAcceptance:0,receipts:{recorded:0,orderedReal:0,clockRegressionReal:0,synthetic:0},
      firstCapture:blocked?null:{customers:0,acceptanceBefore:0,candidateStyleBefore:0,acceptanceAt:0,inFlight:0,dispatchAtOrAfter:0,noOrderedRealAcceptance:0}};
    for(const a of group){
      const all=byCustomer.get(a.assignmentId)??[],ordered=all.filter(s=>s.provider!=='mock'&&s.observationTiming==='ordered');
      result.receipts.recorded+=all.length;result.receipts.orderedReal+=ordered.length;
      result.receipts.synthetic+=all.filter(s=>s.provider==='mock').length;
      result.receipts.clockRegressionReal+=all.filter(s=>s.provider!=='mock'&&s.observationTiming==='clock_regression').length;
      if(ordered.length)result.customersWithOrderedRealAcceptance++;else result.customersWithoutOrderedRealAcceptance++;
      if(ordered.some(s=>s.styleApplied))result.customersWithCandidateStyleAcceptance++;
      const paid=first.get(a.assignmentId),c=result.firstCapture;if(!paid||!c)continue;c.customers++;
      const timings=ordered.map(s=>({s,timing:salesExposureCaptureTiming(s,paid)}));
      // Mutually exclusive precedence categories, not a sum of reply/payment pairs.
      if(timings.some(t=>t.timing==='acceptance_before_capture')){
        c.acceptanceBefore++;if(timings.some(t=>t.timing==='acceptance_before_capture'&&t.s.styleApplied))c.candidateStyleBefore++;
      }else if(timings.some(t=>t.timing==='acceptance_at_capture'))c.acceptanceAt++;
      else if(timings.some(t=>t.timing==='in_flight_at_capture'))c.inFlight++;
      else if(timings.length)c.dispatchAtOrAfter++;else c.noOrderedRealAcceptance++;
    }
    return result;
  });
  return {evidence,summary:salesExposureReadout.parse({scope:'recorded_transport_chronology',timeBasis:'local_observations_only',
    completeness:'not_established',delivery:'not_measured',reading:'not_measured',chronologyBasis:'first_recorded_canonical_capture_per_customer',
    chronologyStatus:blocked?'unresolved_attribution':first.size?'observed':'unmeasured',arms})};
}
