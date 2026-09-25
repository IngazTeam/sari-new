import { z } from 'zod';

const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
export const cohortPhone = z.string().regex(/^\+?[1-9][0-9]{7,14}$/).transform(value => value.replace(/^\+/, ''));
const text = z.string().trim().min(30).max(3000);
const utc = z.string().datetime({ precision: 3 }).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const term = z.string().trim().transform(value => value.normalize('NFC').toLowerCase()).pipe(z.string().min(2).max(80));
const terms = z.array(term).max(20).transform(values => Array.from(new Set(values)).sort());

/** Deliberately finite predicates, never SQL, regex, model instructions or a free-text classifier. */
export const salesCohortRules = z.object({
  version: z.literal('sales-cohort-rules.v1'),
  historyDefinition: z.literal('owned_inbound_before_enrollment'),
  messageType: z.literal('text'), minimumCharacters: z.number().int().min(1).max(4000), maximumCharacters: z.number().int().min(1).max(4000),
  requiredAnyTerms: terms,
  allowedDealStages: z.array(z.enum(['new', 'interested', 'qualified', 'ready', 'payment_link_sent', 'payment_failed', 'stalled'])).min(1).max(7)
    .transform(values => Array.from(new Set(values)).sort()),
  excludedPhones: z.array(cohortPhone).max(200).transform(values => Array.from(new Set(values)).sort()),
  requireActiveConversation: z.literal(true), excludeHumanTakeover: z.literal(true),
  requireLatestInbound: z.literal(true), requirePostHandoffInbound: z.literal(true),
}).strict().refine(value => value.minimumCharacters <= value.maximumCharacters, 'Invalid character interval');
export const freezeSalesCohortInput = z.object({
  protocolId: id, protocolDigest: digest, requestId: z.string().uuid().transform(value => value.toLowerCase()), rules: salesCohortRules,
  matchesRegisteredDefinition: z.literal(true), mappingReview: text,
}).strict();
export const readSalesCohortInput = z.object({ protocolId: id }).strict();
export const inspectSalesCohortInput = z.object({ protocolId: id, cohortDigest: digest, conversationId: id, incomingMessageId: id }).strict();
export const salesCohortSnapshot = z.object({
  version: z.literal('sales-cohort-snapshot.v1'), merchantId: id, protocolId: id, protocolDigest: digest, frozenAt: utc,
  population: z.enum(['all', 'new', 'returning']),
  enrollmentStartsAt: utc, enrollmentEndsAt: utc, rules: salesCohortRules,
  matchesRegisteredDefinition: z.literal(true), mappingReview: text,
  mappingApproval: z.literal('operator_attestation_only'), activationAllowed: z.literal(false),
}).strict().refine(value => Date.parse(value.frozenAt) < Date.parse(value.enrollmentStartsAt) && Date.parse(value.enrollmentStartsAt) < Date.parse(value.enrollmentEndsAt));
export type SalesCohortRules = z.infer<typeof salesCohortRules>;
export type SalesCohortSnapshot = z.infer<typeof salesCohortSnapshot>;
export type FreezeSalesCohortInput = z.infer<typeof freezeSalesCohortInput>;

export type CohortFacts = {
  phone: string; status: string; humanTakeover: boolean; dealStage: string | null; postHandoff: boolean; latestInbound: boolean;
  messageType: string; content: string; messageReceivedAt: string; inspectedAt: string; priorInbound: boolean;
};
export function evaluateSalesCohort(snapshot: SalesCohortSnapshot, facts: CohortFacts) {
  const s = salesCohortSnapshot.parse(snapshot), reasons: string[] = [], phone = cohortPhone.safeParse(facts.phone);
  if (!phone.success) reasons.push('unsupported_customer_identity');
  else if (s.rules.excludedPhones.includes(phone.data)) reasons.push('excluded_customer');
  if (facts.status !== 'active') reasons.push('inactive_conversation');
  if (facts.humanTakeover) reasons.push('human_takeover');
  if (!facts.postHandoff) reasons.push('before_handoff_boundary');
  if (!facts.latestInbound) reasons.push('superseded_inbound');
  if (!(s.rules.allowedDealStages as readonly (string | null)[]).includes(facts.dealStage)) reasons.push('excluded_deal_stage');
  if (facts.messageType !== s.rules.messageType) reasons.push('unsupported_message_type');
  const content = facts.content.trim().normalize('NFC'), length = Array.from(content).length;
  if (length < s.rules.minimumCharacters || length > s.rules.maximumCharacters) reasons.push('message_length');
  if (s.rules.requiredAnyTerms.length && !s.rules.requiredAnyTerms.some(term => content.toLowerCase().includes(term))) reasons.push('required_term_missing');
  if (s.population === 'new' && facts.priorInbound || s.population === 'returning' && !facts.priorInbound) reasons.push('population_mismatch');
  const received = Date.parse(facts.messageReceivedAt), now = Date.parse(facts.inspectedAt), start = Date.parse(s.enrollmentStartsAt), end = Date.parse(s.enrollmentEndsAt);
  if (!utc.safeParse(facts.messageReceivedAt).success || !utc.safeParse(facts.inspectedAt).success || received > now) reasons.push('invalid_source_time');
  if (received < start || received >= end) reasons.push('message_outside_enrollment');
  if (now < start || now >= end) reasons.push('inspection_outside_enrollment');
  return { qualifiesAtRead: reasons.length === 0, reasons, population: facts.priorInbound ? 'returning' as const : 'new' as const,
    assignmentCreated: false as const, activationAllowed: false as const, scope: 'point_in_time_inspection' as const };
}
