import { z } from 'zod';
import { salesSectorPlaybookSchema } from '../../shared/sales-sector-playbooks';

const identity = z.number().int().positive().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const requestId = z.string().uuid().transform(value => value.toLowerCase());
const rationale = z.string().trim().min(30).max(3000);
const utcInstant = z.string().regex(/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}, 'A real, canonical UTC instant is required');

/** A frozen prospective design, not an executable cohort filter or a launch approval. */
export const salesExperimentDesign = z.object({
  version: z.literal('sales-experiment-design.v1'),
  title: z.string().trim().min(5).max(160), hypothesis: rationale,
  cohort: z.object({
    channel: z.literal('whatsapp'), population: z.enum(['all', 'new', 'returning']),
    qualificationRule: rationale, exclusions: rationale,
    qualificationTiming: z.literal('before_assignment'),
  }).strict(),
  allocation: z.object({ unit: z.literal('customer_within_merchant'), candidatePercent: z.literal(50),
    persistence: z.literal('same_customer_same_arm'), }).strict(),
  measurement: z.object({
    primaryMetric: z.literal('verified_payment_conversion'), denominator: z.literal('all_assigned_qualified_customers'),
    conversion: z.literal('at_least_one_captured_not_fully_refunded_order'),
    paymentWindow: z.literal('within_customer_observation_window'), refundCutoff: z.literal('fixed_decision_time'),
    netRevenue: z.literal('captured_minus_verified_refunds'),
    analysis: z.literal('intention_to_treat_by_merchant_and_sector'),
    refunds: z.literal('deduct_from_net_revenue'), humanAssistance: z.literal('report_separately'),
    currencies: z.literal('report_separately'), orderDeduplication: z.literal('canonical_order_across_sources'),
  }).strict(),
  sample: z.object({
    minimumCustomersPerArm: z.number().int().min(30).max(1_000_000),
    baselineConversionBps: z.number().int().min(1).max(9999),
    minimumAbsoluteLiftBps: z.number().int().min(1).max(9999),
    alphaBps: z.literal(500), powerBps: z.literal(8000), calculationReference: rationale,
  }).strict(),
  window: z.object({
    enrollmentStartsAt: utcInstant, enrollmentEndsAt: utcInstant,
    observationDays: z.number().int().min(1).max(180), decisionNotBefore: utcInstant,
  }).strict(),
  stopping: z.object({
    success: z.literal('fixed_window_and_minimum_sample'),
    insufficientSample: z.literal('inconclusive_no_extension'),
    safety: z.literal('withdraw_without_winner'), safetyTriggers: rationale,
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const start = Date.parse(value.window.enrollmentStartsAt), end = Date.parse(value.window.enrollmentEndsAt);
  const day = 86_400_000;
  if (end - start < day || end - start > 180 * day) ctx.addIssue({ code: 'custom', path: ['window'], message: 'Enrollment must span 1–180 days' });
  if (Date.parse(value.window.decisionNotBefore) < end + value.window.observationDays * day) ctx.addIssue({ code: 'custom', path: ['window'], message: 'Every enrolled customer needs the full observation window' });
  if (value.sample.baselineConversionBps + value.sample.minimumAbsoluteLiftBps >= 10000) ctx.addIssue({ code: 'custom', path: ['sample'], message: 'Baseline plus lift must be below 100%' });
});

export const registerSalesExperimentProtocolInput = z.object({
  candidateId: identity, artifactDigest: digest, expectedSectorRevision: z.number().int().nonnegative().safe(),
  requestId, design: salesExperimentDesign,
}).strict();
export const salesExperimentProtocolInput = z.object({ protocolId: identity }).strict();
export const salesExperimentProtocolHistoryInput = z.object({
  beforeId: identity.optional(), limit: z.number().int().min(1).max(50).default(20),
}).strict();
export const withdrawSalesExperimentProtocolInput = z.object({
  protocolId: identity, protocolDigest: digest, requestId, reason: rationale,
}).strict();
export const salesExperimentProtocolSnapshot = z.object({
  version: z.literal('sales-experiment-protocol.v1'), merchantId: identity, registeredAt: utcInstant,
  candidate: z.object({ id: identity, artifactDigest: digest, baselineDigest: digest, sourceDigest: digest, preparationReviewId: identity }).strict(),
  sector: z.object({ revision: z.number().int().nonnegative().safe(), playbook: salesSectorPlaybookSchema, digest }).strict(),
  design: salesExperimentDesign, sampleAdequacy: z.literal('not_independently_verified'),
  cohortExecution: z.literal('not_implemented'), activationAllowed: z.literal(false),
}).strict().refine(value => Date.parse(value.registeredAt) < Date.parse(value.design.window.enrollmentStartsAt), 'Registration must precede enrollment');
export const salesExperimentWithdrawalSnapshot = z.object({
  version: z.literal('sales-experiment-withdrawal.v1'), merchantId: identity, protocolId: identity, protocolDigest: digest,
  reason: rationale, winner: z.null(),
}).strict();
export type SalesExperimentDesign = z.infer<typeof salesExperimentDesign>;
export type RegisterSalesExperimentProtocolInput = z.infer<typeof registerSalesExperimentProtocolInput>;
export type WithdrawSalesExperimentProtocolInput = z.infer<typeof withdrawSalesExperimentProtocolInput>;
