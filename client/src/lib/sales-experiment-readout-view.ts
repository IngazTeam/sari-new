import { z } from 'zod';
import { parseSalesEvidenceId } from './sales-order-report-view';
import { salesExposureReadout } from '../../../shared/sales-experiment-exposure-readout';
import { salesOutcomeReadout,salesOutcomeBlockers } from '../../../shared/sales-experiment-outcome-readout';

const id=z.number().int().positive().safe(), count=z.number().int().nonnegative().safe();
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const utc=z.string().datetime({precision:3}).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v);
const arm=z.enum(['baseline','candidate']);
const view=z.object({
  version:z.literal('sales-experiment-readout.v3'),merchantId:id,protocolId:id,protocolDigest:digest,
  protocolState:z.enum(['registered','withdrawn']),sector:z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),sectorDigest:digest,readAt:utc,
  population:z.literal('all_recorded_assigned_qualified_customers'),completeWithinRecordedPopulation:z.literal(true),
  limits:z.object({assignments:z.literal(10000),merchantPaymentFacts:z.literal(20000),exposures:z.literal(20000)}),
  window:z.object({enrollmentStartsAt:utc,enrollmentEndsAt:utc,observationDays:z.number().int().min(1).max(180),decisionNotBefore:utc}),
  enrollmentClosed:z.boolean(),decisionTimeReached:z.boolean(),
  arms:z.array(z.object({arm,assignedCustomers:count.max(10000),observationComplete:count,observationPending:count,
    minimumCustomers:z.number().int().min(30).max(1000000),sampleShortfall:count})).length(2),
  sampleStatus:z.enum(['accruing','insufficient_no_extension','recorded_minimum_reached']),
  paymentEvidence:z.object({status:z.enum(['unresolved_attribution','observed','unmeasured']),
    unresolved:z.object({pending:count.max(20000),review:count.max(20000),unassigned:count.max(20000)}),
    groups:z.array(z.object({arm,currency:z.string().regex(/^[A-Z]{3}$/),targetKind:z.enum(['order','booking']),
      capturedPayments:id.max(20000),customersWithCapture:id.max(10000),customersWithRetainedCaptureAtCutoff:count.max(10000),
      capturedMinor:id,refundedBeforeCutoffMinor:id.nullable(),refundedAtOrAfterCutoffMinor:id.nullable(),
      netAtCutoffObservedMinor:count,netCurrentlyObservedMinor:count})).max(20000)}),
  financialSource:z.literal('recorded_canonical_tap_payment_facts'),sourceCompleteness:z.literal('unmeasured'),
  partialRefunds:z.literal('not_supported_by_source'),humanAssistance:z.literal('unmeasured'),exposure:z.literal('recorded_transport_chronology'),
  exposureEvidence:salesExposureReadout,
  outcomeEvidence:salesOutcomeReadout,
  primaryMetric:z.literal('not_established'),causality:z.literal('unmeasured'),winner:z.null(),learningAllowed:z.literal(false),activationAllowed:z.literal(false),
  evidenceSetDigest:digest,consistency:z.literal('single_database_snapshot'),
});
export type SalesReadoutRequest={merchantId:number;protocolId:number};
export type SalesReadoutView=z.infer<typeof view>;
export function parseSalesReadoutForm(merchant:string,protocol:string):SalesReadoutRequest|null {
  const merchantId=parseSalesEvidenceId(merchant),protocolId=parseSalesEvidenceId(protocol);
  return merchantId!==null&&protocolId!==null?{merchantId,protocolId}:null;
}
/** Display validation only; SQL still owns authority, identity and digest verification. */
export function readSalesReadoutView(value:unknown,request:SalesReadoutRequest):SalesReadoutView|null {
  const parsed=view.safeParse(value);if(!parsed.success)return null;const r=parsed.data;
  if(r.merchantId!==request.merchantId||r.protocolId!==request.protocolId)return null;
  const start=Date.parse(r.window.enrollmentStartsAt),end=Date.parse(r.window.enrollmentEndsAt),decision=Date.parse(r.window.decisionNotBefore),now=Date.parse(r.readAt),day=86400000;
  if(end-start<day||end-start>180*day||decision<end+r.window.observationDays*day||r.enrollmentClosed!==(now>=end)||r.decisionTimeReached!==(now>=decision))return null;
  if(new Set(r.arms.map(a=>a.arm)).size!==2||r.arms[0].minimumCustomers!==r.arms[1].minimumCustomers
    ||r.arms.reduce((n,a)=>n+a.assignedCustomers,0)>10000)return null;
  for(const a of r.arms)if(a.observationComplete+a.observationPending!==a.assignedCustomers
    ||a.sampleShortfall!==Math.max(0,a.minimumCustomers-a.assignedCustomers)
    ||now<start&&a.assignedCustomers!==0||now<start+r.window.observationDays*day&&a.observationComplete!==0||r.decisionTimeReached&&a.observationPending!==0)return null;
  const expected=r.arms.some(a=>a.sampleShortfall>0)?r.enrollmentClosed?'insufficient_no_extension':'accruing':'recorded_minimum_reached';
  if(r.sampleStatus!==expected)return null;
  if(r.exposureEvidence.chronologyStatus!==r.paymentEvidence.status)return null;
  for(const e of r.exposureEvidence.arms){
    if(e.assignedCustomers!==r.arms.find(a=>a.arm===e.arm)?.assignedCustomers)return null;
    const groups=r.paymentEvidence.groups.filter(g=>g.arm===e.arm),customers=e.firstCapture?.customers??0;
    if(customers>groups.reduce((n,g)=>n+g.customersWithCapture,0)||groups.some(g=>g.customersWithCapture>customers))return null;
  }
  const unresolved=Object.values(r.paymentEvidence.unresolved).reduce((n,v)=>n+v,0),groups=r.paymentEvidence.groups;
  if(unresolved>20000||(r.paymentEvidence.status==='unresolved_attribution')!==(unresolved>0)
    ||r.paymentEvidence.status==='observed'&&groups.length===0||r.paymentEvidence.status!=='observed'&&groups.length>0)return null;
  const identities=new Set<string>();let captures=0;
  for(const g of groups){
    const key=`${g.arm}:${g.currency}:${g.targetKind}`,a=r.arms.find(a=>a.arm===g.arm)!;
    if(identities.has(key)||g.customersWithCapture>a.assignedCustomers||g.customersWithCapture>g.capturedPayments||g.customersWithRetainedCaptureAtCutoff>g.customersWithCapture)return null;
    identities.add(key);captures+=g.capturedPayments;
    if(BigInt(g.capturedMinor)-BigInt(g.refundedBeforeCutoffMinor??0)!==BigInt(g.netAtCutoffObservedMinor)
      ||BigInt(g.netAtCutoffObservedMinor)-BigInt(g.refundedAtOrAfterCutoffMinor??0)!==BigInt(g.netCurrentlyObservedMinor))return null;
  }
  const m=r.outcomeEvidence,unresolvedMetric=r.paymentEvidence.status==='unresolved_attribution';
  if((m.status==='unresolved_attribution')!==unresolvedMetric||m.planning.minimumCustomersPerArm!==r.arms[0].minimumCustomers)return null;
  const showRates=r.protocolState!=='withdrawn'&&!unresolvedMetric&&r.enrollmentClosed&&r.decisionTimeReached&&r.arms.every(a=>a.observationPending===0);
  if((m.rates==='descriptive_recorded_only')!==showRates)return null;
  const blockers=salesOutcomeBlockers({withdrawn:r.protocolState==='withdrawn',enrollmentClosed:r.enrollmentClosed,decisionTimeReached:r.decisionTimeReached,
    unresolved:unresolvedMetric,arms:r.arms,minimum:m.planning.minimumCustomersPerArm,calculatedMinimum:m.planning.calculation.requiredPerArm});
  if(JSON.stringify(m.decision.blockers)!==JSON.stringify(blockers))return null;
  for(const a of m.arms){
    if(a.assignedCustomers!==r.arms.find(g=>g.arm===a.arm)?.assignedCustomers)return null;
    const o=a.outcomes;if(!o)continue;
    const orders=groups.filter(g=>g.arm===a.arm&&g.targetKind==='order');
    if(orders.some(g=>g.customersWithCapture>o.customersWithOrderCapture||g.customersWithRetainedCaptureAtCutoff>o.customersWithRetainedOrderAtCutoff)
      ||o.customersWithOrderCapture>orders.reduce((n,g)=>n+g.customersWithCapture,0)
      ||o.customersWithRetainedOrderAtCutoff>orders.reduce((n,g)=>n+g.customersWithRetainedCaptureAtCutoff,0)
      ||o.customersWithOrderCapture+o.customersWithBookingCaptureOnly!==r.exposureEvidence.arms.find(g=>g.arm===a.arm)?.firstCapture?.customers)return null;
  }
  return captures<=20000?r:null;
}
