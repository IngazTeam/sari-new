import type { SalesExperimentDesign } from '../../shared/sales-experiment-protocol';
import { calculateSalesExperimentSample } from '../../shared/sales-experiment-sample';
import { salesOutcomeReadout,salesOutcomeBlockers } from '../../shared/sales-experiment-outcome-readout';

/** Counts unique customers from already validated canonical captures; never adds currency-group customer totals. */
export function buildSalesReadoutOutcomes(design:SalesExperimentDesign,withdrawn:boolean,
  arms:Array<{arm:'baseline'|'candidate';assignedCustomers:number;observationPending:number}>,
  captures:Array<{assignmentId:number;arm:'baseline'|'candidate';targetKind:'order'|'booking';refundedBeforeCutoff:boolean}>,
  enrollmentClosed:boolean,decisionTimeReached:boolean,unresolved:boolean){
  const calculation=calculateSalesExperimentSample(design.sample),{calculationReference,...sample}=design.sample;
  const showRates=!withdrawn&&!unresolved&&enrollmentClosed&&decisionTimeReached&&arms.every(a=>a.observationPending===0);
  const result=arms.map(a=>{
    const orders=new Set<number>(),retained=new Set<number>(),bookings=new Set<number>();
    for(const c of captures.filter(c=>c.arm===a.arm)){
      if(c.targetKind==='booking'){bookings.add(c.assignmentId);continue;}
      orders.add(c.assignmentId);if(!c.refundedBeforeCutoff)retained.add(c.assignmentId);
    }
    return {arm:a.arm,assignedCustomers:a.assignedCustomers,
      outcomes:unresolved?null:{customersWithOrderCapture:orders.size,customersWithRetainedOrderAtCutoff:retained.size,
        customersWithOnlyFullyRefundedOrdersAtCutoff:orders.size-retained.size,customersWithoutRecordedOrderCapture:a.assignedCustomers-orders.size,
        customersWithBookingCaptureOnly:Array.from(bookings).filter(id=>!orders.has(id)).length},
      recordedRatio:showRates&&a.assignedCustomers>0?{numerator:retained.size,denominator:a.assignedCustomers}:null};
  });
  return salesOutcomeReadout.parse({metric:design.measurement.primaryMetric,conversion:design.measurement.conversion,
    scope:'descriptive_recorded_order_outcomes_only',denominator:design.measurement.denominator,targetKind:'order',refundCutoff:'fixed_decision_time_exclusive',
    status:unresolved?'unresolved_attribution':'counted',rates:showRates?'descriptive_recorded_only':'withheld',planning:{...sample,calculation},arms:result,
    decision:{status:'not_eligible',blockers:salesOutcomeBlockers({withdrawn,enrollmentClosed,decisionTimeReached,unresolved,arms,
      minimum:sample.minimumCustomersPerArm,calculatedMinimum:calculation.requiredPerArm}),statisticalInference:'not_evaluated',winner:null,activationAllowed:false}});
}
