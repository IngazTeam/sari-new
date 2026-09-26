import { z } from 'zod';
import { salesSampleCalculation,matchesSalesSampleCalculation } from './sales-experiment-sample';

const count=z.number().int().nonnegative().max(10000);
export const salesDecisionBlocker=z.enum(['withdrawn','enrollment_open','observation_pending','decision_time_pending',
  'empty_arm','sample_below_registered_minimum','sample_plan_below_calculated_floor','sample_below_calculated_floor',
  'attribution_unresolved','source_completeness_unverified','partial_refunds_unsupported','human_assistance_unmeasured',
  'guardrails_unmeasured','statistical_inference_missing','independent_result_review_required']);
export type SalesDecisionBlocker=z.infer<typeof salesDecisionBlocker>;
export function salesOutcomeBlockers(input:{withdrawn:boolean;enrollmentClosed:boolean;decisionTimeReached:boolean;unresolved:boolean;
  arms:Array<{assignedCustomers:number;observationPending:number}>;minimum:number;calculatedMinimum:number}):SalesDecisionBlocker[]{
  const reasons:SalesDecisionBlocker[]=[];
  if(input.withdrawn)reasons.push('withdrawn');
  if(!input.enrollmentClosed)reasons.push('enrollment_open');
  if(input.arms.some(a=>a.observationPending>0))reasons.push('observation_pending');
  if(!input.decisionTimeReached)reasons.push('decision_time_pending');
  if(input.arms.some(a=>a.assignedCustomers===0))reasons.push('empty_arm');
  if(input.arms.some(a=>a.assignedCustomers<input.minimum))reasons.push('sample_below_registered_minimum');
  if(input.minimum<input.calculatedMinimum)reasons.push('sample_plan_below_calculated_floor');
  if(input.arms.some(a=>a.assignedCustomers<input.calculatedMinimum))reasons.push('sample_below_calculated_floor');
  if(input.unresolved)reasons.push('attribution_unresolved');
  // This source cannot establish these gates. Numerical sufficiency never approves a policy.
  return [...reasons,'source_completeness_unverified','partial_refunds_unsupported','human_assistance_unmeasured',
    'guardrails_unmeasured','statistical_inference_missing','independent_result_review_required'];
}
export const salesOutcomeReadout=z.object({
  metric:z.literal('verified_payment_conversion'),conversion:z.literal('at_least_one_captured_not_fully_refunded_order'),
  scope:z.literal('descriptive_recorded_order_outcomes_only'),denominator:z.literal('all_assigned_qualified_customers'),
  targetKind:z.literal('order'),refundCutoff:z.literal('fixed_decision_time_exclusive'),
  status:z.enum(['counted','unresolved_attribution']),rates:z.enum(['withheld','descriptive_recorded_only']),
  planning:z.object({minimumCustomersPerArm:z.number().int().min(30).max(1000000),baselineConversionBps:z.number().int().min(1).max(9999),
    minimumAbsoluteLiftBps:z.number().int().min(1).max(9999),alphaBps:z.literal(500),powerBps:z.literal(8000),calculation:salesSampleCalculation}),
  arms:z.array(z.object({arm:z.enum(['baseline','candidate']),assignedCustomers:count,
    outcomes:z.object({customersWithOrderCapture:count,customersWithRetainedOrderAtCutoff:count,
      customersWithOnlyFullyRefundedOrdersAtCutoff:count,customersWithoutRecordedOrderCapture:count,customersWithBookingCaptureOnly:count}).nullable(),
    recordedRatio:z.object({numerator:count,denominator:count.positive()}).nullable(),
  })).length(2),
  decision:z.object({status:z.literal('not_eligible'),blockers:z.array(salesDecisionBlocker).min(1),
    statisticalInference:z.literal('not_evaluated'),winner:z.null(),activationAllowed:z.literal(false)}),
}).superRefine((r,ctx)=>{
  const bad=()=>ctx.addIssue({code:'custom',message:'Inconsistent recorded order outcomes'});
  const {calculation,...sample}=r.planning;
  if(!matchesSalesSampleCalculation(calculation,{...sample,calculationReference:'Frozen numerical design; not independent verification.'}))bad();
  if(new Set(r.arms.map(a=>a.arm)).size!==2||r.arms.reduce((n,a)=>n+a.assignedCustomers,0)>10000
    ||new Set(r.decision.blockers).size!==r.decision.blockers.length||r.status==='unresolved_attribution'&&r.rates!=='withheld')bad();
  for(const a of r.arms){const o=a.outcomes,p=a.recordedRatio;
    if((r.status==='unresolved_attribution')!==(o===null))bad();
    if(o&&(o.customersWithOrderCapture+o.customersWithoutRecordedOrderCapture!==a.assignedCustomers
      ||o.customersWithRetainedOrderAtCutoff+o.customersWithOnlyFullyRefundedOrdersAtCutoff!==o.customersWithOrderCapture
      ||o.customersWithBookingCaptureOnly>o.customersWithoutRecordedOrderCapture))bad();
    if((r.rates==='descriptive_recorded_only'&&a.assignedCustomers>0)!==(p!==null)
      ||p&&(!o||p.denominator!==a.assignedCustomers||p.numerator!==o.customersWithRetainedOrderAtCutoff))bad();
  }
});
export type SalesOutcomeReadout=z.infer<typeof salesOutcomeReadout>;
