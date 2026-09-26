import { z } from 'zod';
import { salesStaffTransportReadout } from '../../shared/sales-staff-transport-readout';
import { readStaffAcceptance } from './sales-staff-acceptance-contract';
import { readDashboardStaffAcceptance, staffActorKey } from './staff-dashboard-reply-contract';
import { readStaffVoiceAcceptance } from './staff-dashboard-voice-contract';
import type { readSalesExperimentAssignmentRow } from './sales-experiment-assignment';

type Assignment = ReturnType<typeof readSalesExperimentAssignmentRow>;
const id = z.number().int().positive().safe();
const conflict = (): never => { throw Error('Staff transport readout unavailable'); };

/** The durable acceptance snapshot remains usable after source/message/outbox deletion. */
export function readStaffReadoutAcceptance(row: any) {
  const source = row.source_kind;
  const s = source==='escalation_relay' ? readStaffAcceptance(row)
    : source==='dashboard_text' ? readDashboardStaffAcceptance(row)
    : source==='dashboard_voice' ? readStaffVoiceAcceptance(row) : conflict();
  const b = s.version==='sales-staff-voice-acceptance.v1' ? s.basis.intent : s.basis;
  if ('actorUserId' in b && b.authorKey!==staffActorKey(b.merchantId,b.actorUserId)) conflict();
  return {id:Number(row.id),digest:String(row.acceptance_digest),source:b.source,sourceId:b.sourceId,
    merchantId:b.merchantId,customerKey:b.customerKey,conversationId:b.conversationId,provider:b.provider,
    outboxId:s.outboxId,providerMessageDigest:s.providerMessageDigest,reservedAt:b.reservedAt,
    acceptanceObservedAt:s.acceptanceObservedAt,observationTiming:s.observationTiming};
}
type Acceptance = ReturnType<typeof readStaffReadoutAcceptance>;

/** Descriptive local chronology only: never a human-authorship or assisted-sales attribution. */
export function buildSalesReadoutStaffTransport(merchantId:number, assignments:Assignment[], bindingRows:any[], rows:any[],
  captures:Array<{assignmentId:number;capturedAt:string}>, blocked:boolean, now:number) {
  id.parse(merchantId);
  const byCustomer = new Map(assignments.map(a=>[a.snapshot.customerKey,a]));
  const byAssignment = new Map(assignments.map(a=>[a.assignmentId,a]));
  const bindings = new Map<number,number>(), bindingIds = new Set<number>();
  for (const b of bindingRows) {
    const a=byAssignment.get(b.assignment_id);
    if(!a || !id.safeParse(b.id).success || !id.safeParse(b.conversation_reference).success
      || b.merchant_id!==merchantId || b.protocol_id!==a.snapshot.protocolId || b.customer_key!==a.snapshot.customerKey
      || bindingIds.has(b.id) || bindings.has(b.conversation_reference)) conflict();
    bindingIds.add(b.id); bindings.set(b.conversation_reference,b.assignment_id);
  }
  const ids=new Set<number>(),sources=new Set<string>(),outboxes=new Set<number>(),receipts=new Set<string>();
  const byAssigned = new Map<number,Array<{fact:Acceptance;category:'eligible'|'synthetic'|'unbound'|'outsideWindow'|'uncertainTiming'}>>();
  let otherCustomerFacts=0;
  const evidence=rows.map(row=>{
    const f=readStaffReadoutAcceptance(row),key=`${f.source}:${f.sourceId}`;
    if(f.merchantId!==merchantId || ids.has(f.id) || sources.has(key) || outboxes.has(f.outboxId)
      || receipts.has(f.providerMessageDigest) || Date.parse(f.acceptanceObservedAt)>now) conflict();
    ids.add(f.id);sources.add(key);outboxes.add(f.outboxId);receipts.add(f.providerMessageDigest);
    const a=byCustomer.get(f.customerKey);
    if(!a) otherCustomerFacts++;
    else {
      const start=a.snapshot.assignedAt,end=a.snapshot.observationEndsAt;
      // A delayed recovery after enrollment must never pull an older reservation into the window.
      const category=f.provider==='mock'?'synthetic'
        :bindings.get(f.conversationId)!==a.assignmentId?'unbound'
        :f.observationTiming==='clock_regression'?'uncertainTiming'
        :f.acceptanceObservedAt<start || f.reservedAt>=end?'outsideWindow'
        :f.reservedAt>=start && f.acceptanceObservedAt<end?'eligible':'uncertainTiming';
      const group=byAssigned.get(a.assignmentId)??[];group.push({fact:f,category});byAssigned.set(a.assignmentId,group);
    }
    return [f.id,f.digest] as const;
  }).sort((a,b)=>a[0]-b[0]);
  const first=new Map<number,string>();
  for(const c of captures){if(!byAssignment.has(c.assignmentId))conflict();const prior=first.get(c.assignmentId);if(!prior||c.capturedAt<prior)first.set(c.assignmentId,c.capturedAt);}
  const arms=(['baseline','candidate'] as const).map(arm=>{
    const group=assignments.filter(a=>a.snapshot.arm===arm);
    const result={arm,assignedCustomers:group.length,customersWithEligibleAcceptance:0,customersWithoutEligibleAcceptance:0,
      receipts:{recorded:0,eligible:0,synthetic:0,unbound:0,outsideWindow:0,uncertainTiming:0},
      eligibleSources:{escalation_relay:0,dashboard_text:0,dashboard_voice:0},
      firstCapture:blocked?null:{customers:0,acceptanceBefore:0,acceptanceAt:0,reservationBefore:0,reservationAtOrAfter:0,noEligibleAcceptance:0}};
    for(const a of group){
      const all=byAssigned.get(a.assignmentId)??[],eligible=all.filter(f=>f.category==='eligible').map(f=>f.fact);
      result.receipts.recorded+=all.length;for(const f of all)result.receipts[f.category]++;
      for(const f of eligible)result.eligibleSources[f.source]++;
      if(eligible.length)result.customersWithEligibleAcceptance++;else result.customersWithoutEligibleAcceptance++;
      const paid=first.get(a.assignmentId),c=result.firstCapture;if(!paid||!c)continue;c.customers++;
      if(eligible.some(f=>f.acceptanceObservedAt<paid))c.acceptanceBefore++;
      else if(eligible.some(f=>f.acceptanceObservedAt===paid))c.acceptanceAt++;
      else if(eligible.some(f=>f.reservedAt<paid))c.reservationBefore++;
      else if(eligible.length)c.reservationAtOrAfter++;else c.noEligibleAcceptance++;
    }
    return result;
  });
  return {evidence,summary:salesStaffTransportReadout.parse({scope:'recorded_staff_transport_chronology',
    identityBasis:'frozen_customer_and_registered_conversation',timeBasis:'reservation_and_local_receipt_observation',
    completeness:'not_established',contentAuthorship:'unmeasured',delivery:'not_measured',salesAttribution:'not_established',
    chronologyBasis:'first_recorded_canonical_capture_per_customer',chronologyStatus:blocked?'unresolved_attribution':first.size?'observed':'unmeasured',
    merchantLedgerFacts:rows.length,otherCustomerFacts,arms})};
}
