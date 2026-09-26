import { z } from 'zod';

const customers=z.number().int().nonnegative().max(10000), receipts=z.number().int().nonnegative().max(20000);
export const salesExposureReadout=z.object({
  scope:z.literal('recorded_transport_chronology'),timeBasis:z.literal('local_observations_only'),
  completeness:z.literal('not_established'),delivery:z.literal('not_measured'),reading:z.literal('not_measured'),
  chronologyBasis:z.literal('first_recorded_canonical_capture_per_customer'),
  chronologyStatus:z.enum(['observed','unmeasured','unresolved_attribution']),
  arms:z.array(z.object({
    arm:z.enum(['baseline','candidate']),assignedCustomers:customers,
    customersWithOrderedRealAcceptance:customers,customersWithoutOrderedRealAcceptance:customers,
    customersWithCandidateStyleAcceptance:customers,
    receipts:z.object({recorded:receipts,orderedReal:receipts,clockRegressionReal:receipts,synthetic:receipts}),
    firstCapture:z.object({customers:customers,acceptanceBefore:customers,candidateStyleBefore:customers,
      acceptanceAt:customers,inFlight:customers,dispatchAtOrAfter:customers,noOrderedRealAcceptance:customers}).nullable(),
  })).length(2),
}).superRefine((r,ctx)=>{
  const bad=()=>ctx.addIssue({code:'custom',message:'Inconsistent exposure readout'});
  if(new Set(r.arms.map(a=>a.arm)).size!==2||r.arms.reduce((n,a)=>n+a.assignedCustomers,0)>10000
    ||r.arms.reduce((n,a)=>n+a.receipts.recorded,0)>20000)bad();
  for(const a of r.arms){
    const c=a.firstCapture,b=a.receipts;
    if(a.customersWithOrderedRealAcceptance+a.customersWithoutOrderedRealAcceptance!==a.assignedCustomers
      ||a.customersWithOrderedRealAcceptance>b.orderedReal||a.customersWithCandidateStyleAcceptance>a.customersWithOrderedRealAcceptance
      ||a.arm==='baseline'&&a.customersWithCandidateStyleAcceptance!==0
      ||b.recorded!==b.orderedReal+b.clockRegressionReal+b.synthetic
      ||a.assignedCustomers===0&&b.recorded!==0
      ||(r.chronologyStatus==='unresolved_attribution')!==(c===null))bad();
    if(c&&(c.customers>a.assignedCustomers||c.customers!==c.acceptanceBefore+c.acceptanceAt+c.inFlight+c.dispatchAtOrAfter+c.noOrderedRealAcceptance
      ||c.candidateStyleBefore>c.acceptanceBefore||c.candidateStyleBefore>a.customersWithCandidateStyleAcceptance
      ||c.customers-c.noOrderedRealAcceptance>a.customersWithOrderedRealAcceptance
      ||c.noOrderedRealAcceptance>a.customersWithoutOrderedRealAcceptance))bad();
  }
  const captures=r.arms.reduce((n,a)=>n+(a.firstCapture?.customers??0),0);
  if(r.chronologyStatus==='observed'&&captures===0||r.chronologyStatus==='unmeasured'&&captures!==0)bad();
});
export type SalesExposureReadout=z.infer<typeof salesExposureReadout>;
