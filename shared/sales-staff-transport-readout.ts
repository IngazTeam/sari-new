import { z } from 'zod';

const customers = z.number().int().nonnegative().max(10000);
const facts = z.number().int().nonnegative().max(20000);
export const salesStaffTransportReadout = z.object({
  scope: z.literal('recorded_staff_transport_chronology'),
  identityBasis: z.literal('frozen_customer_and_registered_conversation'),
  timeBasis: z.literal('reservation_and_local_receipt_observation'),
  completeness: z.literal('not_established'), contentAuthorship: z.literal('unmeasured'),
  delivery: z.literal('not_measured'), salesAttribution: z.literal('not_established'),
  chronologyBasis: z.literal('first_recorded_canonical_capture_per_customer'),
  chronologyStatus: z.enum(['observed', 'unmeasured', 'unresolved_attribution']),
  merchantLedgerFacts: facts, otherCustomerFacts: facts,
  arms: z.array(z.object({
    arm: z.enum(['baseline', 'candidate']), assignedCustomers: customers,
    customersWithEligibleAcceptance: customers, customersWithoutEligibleAcceptance: customers,
    receipts: z.object({recorded: facts, eligible: facts, synthetic: facts, unbound: facts,
      outsideWindow: facts, uncertainTiming: facts}).strict(),
    eligibleSources: z.object({escalation_relay: facts, dashboard_text: facts, dashboard_voice: facts}).strict(),
    firstCapture: z.object({customers, acceptanceBefore: customers, acceptanceAt: customers,
      reservationBefore: customers, reservationAtOrAfter: customers, noEligibleAcceptance: customers}).strict().nullable(),
  }).strict()).length(2),
}).strict().superRefine((r, ctx) => {
  const bad = () => ctx.addIssue({code: 'custom', message: 'Inconsistent staff transport readout'});
  if (new Set(r.arms.map(a => a.arm)).size !== 2 || r.arms.reduce((n,a) => n+a.assignedCustomers,0)>10000
    || r.merchantLedgerFacts !== r.otherCustomerFacts+r.arms.reduce((n,a) => n+a.receipts.recorded,0)) bad();
  for (const a of r.arms) {
    const b=a.receipts,c=a.firstCapture;
    if (a.customersWithEligibleAcceptance+a.customersWithoutEligibleAcceptance!==a.assignedCustomers
      || a.customersWithEligibleAcceptance>b.eligible || (a.customersWithEligibleAcceptance===0)!==(b.eligible===0)
      || b.recorded!==b.eligible+b.synthetic+b.unbound+b.outsideWindow+b.uncertainTiming
      || b.eligible!==Object.values(a.eligibleSources).reduce((n,v)=>n+v,0)
      || a.assignedCustomers===0 && b.recorded!==0
      || (r.chronologyStatus==='unresolved_attribution')!==(c===null)) bad();
    if(c && (c.customers>a.assignedCustomers
      || c.customers!==c.acceptanceBefore+c.acceptanceAt+c.reservationBefore+c.reservationAtOrAfter+c.noEligibleAcceptance
      || c.customers-c.noEligibleAcceptance>a.customersWithEligibleAcceptance
      || c.noEligibleAcceptance>a.customersWithoutEligibleAcceptance)) bad();
  }
  const captures=r.arms.reduce((n,a)=>n+(a.firstCapture?.customers??0),0);
  if(r.chronologyStatus==='observed'&&captures===0 || r.chronologyStatus==='unmeasured'&&captures!==0) bad();
});
