import type { SalesExperimentDesign } from '../../ai/sales-experiment-protocol-contract';

/** Synthetic prospective design; its sample calculation is deliberately not a real power analysis. */
export function syntheticSalesExperimentDesign(now = Date.now()): SalesExperimentDesign {
  const day = 86_400_000, iso = (days: number) => new Date(now + days * day).toISOString();
  return {
    version: 'sales-experiment-design.v1', title: 'Synthetic value explanation comparison',
    hypothesis: 'A clearer explanation of the matching offer may improve verified purchase conversion.',
    cohort: { channel: 'whatsapp', population: 'all', qualificationRule: 'Customer has stated a relevant need before assignment.',
      exclusions: 'Exclude synthetic accounts, prior refusals and already paid opportunities before assignment.', qualificationTiming: 'before_assignment' },
    allocation: { unit: 'customer_within_merchant', candidatePercent: 50, persistence: 'same_customer_same_arm' },
    measurement: { primaryMetric: 'verified_payment_conversion', denominator: 'all_assigned_qualified_customers',
      conversion: 'at_least_one_captured_not_fully_refunded_order', paymentWindow: 'within_customer_observation_window',
      refundCutoff: 'fixed_decision_time', netRevenue: 'captured_minus_verified_refunds',
      analysis: 'intention_to_treat_by_merchant_and_sector', refunds: 'deduct_from_net_revenue', humanAssistance: 'report_separately',
      currencies: 'report_separately', orderDeduplication: 'canonical_order_across_sources' },
    sample: { minimumCustomersPerArm: 500, baselineConversionBps: 1000, minimumAbsoluteLiftBps: 300,
      alphaBps: 500, powerBps: 8000, calculationReference: 'Synthetic calculation reference, not validated statistical power evidence.' },
    window: { enrollmentStartsAt: iso(2), enrollmentEndsAt: iso(32), observationDays: 14, decisionNotBefore: iso(46) },
    stopping: { success: 'fixed_window_and_minimum_sample', insufficientSample: 'inconclusive_no_extension',
      safety: 'withdraw_without_winner', safetyTriggers: 'Withdraw if factual, consent, payment or privacy regressions are observed.' },
  };
}
