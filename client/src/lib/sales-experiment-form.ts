import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { salesExperimentDesign, salesExperimentProtocolSnapshot, salesExperimentWithdrawalSnapshot } from '../../../shared/sales-experiment-protocol';

export type ProtocolRecord = inferRouterOutputs<AppRouter>['sariBrain']['getSalesExperimentProtocol'];
export type ProtocolDraft = {
  title: string; hypothesis: string; population: 'all' | 'new' | 'returning'; qualificationRule: string; exclusions: string;
  minimumCustomersPerArm: string; baselinePercent: string; liftPercentagePoints: string; calculationReference: string;
  enrollmentStartsAt: string; enrollmentEndsAt: string; observationDays: string; decisionNotBefore: string; safetyTriggers: string;
};
export const emptyProtocolDraft = (): ProtocolDraft => ({ title: '', hypothesis: '', population: 'all', qualificationRule: '', exclusions: '',
  minimumCustomersPerArm: '', baselinePercent: '', liftPercentagePoints: '', calculationReference: '',
  enrollmentStartsAt: '', enrollmentEndsAt: '', observationDays: '', decisionNotBefore: '', safetyTriggers: '' });
export const protocolStepFields: Array<Array<keyof ProtocolDraft>> = [
  ['title', 'hypothesis', 'population', 'qualificationRule', 'exclusions'],
  ['minimumCustomersPerArm', 'baselinePercent', 'liftPercentagePoints', 'calculationReference'],
  ['enrollmentStartsAt', 'enrollmentEndsAt', 'observationDays', 'decisionNotBefore', 'safetyTriggers'],
];
const digits = (value: string) => value.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/٫/g, '.');
export function percentToBasisPoints(value: string) {
  const normalized = digits(value);
  if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(normalized)) return NaN;
  const [whole, fraction = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
const integer = (value: string) => /^\d{1,7}$/.test(digits(value)) ? Number(digits(value)) : NaN;
/** The input is explicitly labelled UTC. Never let browser timezone/DST reinterpret it. */
export const protocolUtcInput = (value: string) => /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00.000Z` : '';
export function validateProtocolDraft(draft: ProtocolDraft, now = Date.now()) {
  const result = salesExperimentDesign.safeParse({
    version: 'sales-experiment-design.v1', title: draft.title, hypothesis: draft.hypothesis,
    cohort: { channel: 'whatsapp', population: draft.population, qualificationRule: draft.qualificationRule, exclusions: draft.exclusions, qualificationTiming: 'before_assignment' },
    allocation: { unit: 'customer_within_merchant', candidatePercent: 50, persistence: 'same_customer_same_arm' },
    measurement: { primaryMetric: 'verified_payment_conversion', denominator: 'all_assigned_qualified_customers',
      conversion: 'at_least_one_captured_not_fully_refunded_order', paymentWindow: 'within_customer_observation_window', refundCutoff: 'fixed_decision_time',
      netRevenue: 'captured_minus_verified_refunds', analysis: 'intention_to_treat_by_merchant_and_sector', refunds: 'deduct_from_net_revenue',
      humanAssistance: 'report_separately', currencies: 'report_separately', orderDeduplication: 'canonical_order_across_sources' },
    sample: { minimumCustomersPerArm: integer(draft.minimumCustomersPerArm), baselineConversionBps: percentToBasisPoints(draft.baselinePercent),
      minimumAbsoluteLiftBps: percentToBasisPoints(draft.liftPercentagePoints), alphaBps: 500, powerBps: 8000, calculationReference: draft.calculationReference },
    window: { enrollmentStartsAt: protocolUtcInput(draft.enrollmentStartsAt), enrollmentEndsAt: protocolUtcInput(draft.enrollmentEndsAt),
      observationDays: integer(draft.observationDays), decisionNotBefore: protocolUtcInput(draft.decisionNotBefore) },
    stopping: { success: 'fixed_window_and_minimum_sample', insufficientSample: 'inconclusive_no_extension', safety: 'withdraw_without_winner', safetyTriggers: draft.safetyTriggers },
  });
  const invalid = new Set<keyof ProtocolDraft>();
  for (const issue of result.success ? [] : result.error.issues) {
    const last = String(issue.path.at(-1));
    if (last === 'window') protocolStepFields[2].slice(0, 4).forEach(key => invalid.add(key));
    else if (last === 'sample') { invalid.add('baselinePercent'); invalid.add('liftPercentagePoints'); }
    else invalid.add((last === 'baselineConversionBps' ? 'baselinePercent' : last === 'minimumAbsoluteLiftBps' ? 'liftPercentagePoints' : last) as keyof ProtocolDraft);
  }
  if (Date.parse(protocolUtcInput(draft.enrollmentStartsAt)) <= now) invalid.add('enrollmentStartsAt');
  return { design: result.success && invalid.size === 0 ? result.data : null, invalid };
}
export function compatibleProtocolRecord(value: ProtocolRecord | undefined, id: number): value is ProtocolRecord {
  if (!value || value.protocolId !== id || !Number.isSafeInteger(id) || id < 1 || !/^[a-f0-9]{64}$/.test(value.protocolDigest)
    || value.activationAllowed !== false || value.experimentStarted !== false || value.eligibility !== 'not_checked'
    || !salesExperimentProtocolSnapshot.safeParse(value.protocol).success) return false;
  if (value.state === 'registered') return value.withdrawal === null;
  if (value.state !== 'withdrawn' || !value.withdrawal) return false;
  const { actorUserId: _actor, createdAt: _created, ...withdrawal } = value.withdrawal;
  return salesExperimentWithdrawalSnapshot.safeParse(withdrawal).success && withdrawal.protocolId === id
    && withdrawal.protocolDigest === value.protocolDigest && withdrawal.merchantId === value.protocol.merchantId;
}
