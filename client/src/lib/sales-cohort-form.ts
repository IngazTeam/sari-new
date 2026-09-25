import { z } from 'zod';
import { salesCohortRules, salesCohortSnapshot, type FreezeSalesCohortInput } from '../../../shared/sales-experiment-cohort';
import type { ProtocolRecord } from './sales-experiment-form';

export const cohortStages = ['new', 'interested', 'qualified', 'ready', 'payment_link_sent', 'payment_failed', 'stalled'] as const;
export type CohortDraft = { minimum: string; maximum: string; terms: string; phones: string; stages: Array<typeof cohortStages[number]>; review: string };
export const emptyCohortDraft = (): CohortDraft => ({ minimum: '', maximum: '', terms: '', phones: '', stages: [], review: '' });
const digits = (value: string) => value.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776));
const integer = (value: string) => /^\d{1,4}$/.test(digits(value)) ? Number(digits(value)) : NaN;
const lines = (value: string) => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
export function validateCohortDraft(draft: CohortDraft) {
  const rules = salesCohortRules.safeParse({ version: 'sales-cohort-rules.v1', historyDefinition: 'owned_inbound_before_enrollment', messageType: 'text',
    minimumCharacters: integer(draft.minimum), maximumCharacters: integer(draft.maximum), requiredAnyTerms: lines(draft.terms),
    allowedDealStages: draft.stages, excludedPhones: lines(draft.phones).map(digits), requireActiveConversation: true, excludeHumanTakeover: true,
    requireLatestInbound: true, requirePostHandoffInbound: true });
  return { rules: rules.success ? rules.data : null, review: draft.review.trim(), reviewValid: draft.review.trim().length >= 30 && draft.review.trim().length <= 3000 };
}
const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().datetime({ precision: 3 }).refine(value => new Date(value).toISOString() === value);
const receiptSchema = z.object({ cohortId: id, cohortDigest: digest, snapshot: salesCohortSnapshot, actorUserId: id.nullable(),
  createdAt: z.union([z.date(), z.string().min(1)]), eligibility: z.literal('not_checked'), activationAllowed: z.literal(false),
  experimentStarted: z.literal(false), reused: z.boolean().optional() }).strict();
export type CohortReceipt = z.infer<typeof receiptSchema>;
export function compatibleCohortReceipt(value: unknown, record: ProtocolRecord): value is CohortReceipt {
  const result = receiptSchema.safeParse(value); if (!result.success) return false;
  const s = result.data.snapshot, p = record.protocol;
  // Reject silently normalized stored rules as well as unrelated historical receipts.
  return JSON.stringify(s) === JSON.stringify((value as CohortReceipt).snapshot) && s.protocolId === record.protocolId && s.merchantId === p.merchantId
    && s.protocolDigest === record.protocolDigest && s.population === p.design.cohort.population && s.enrollmentStartsAt === p.design.window.enrollmentStartsAt
    && s.enrollmentEndsAt === p.design.window.enrollmentEndsAt && Date.parse(s.frozenAt) >= Date.parse(p.registeredAt);
}
export function matchingCohortReceipt(value: unknown, record: ProtocolRecord, request: FreezeSalesCohortInput): value is CohortReceipt {
  return compatibleCohortReceipt(value, record) && value.snapshot.protocolId === request.protocolId && value.snapshot.protocolDigest === request.protocolDigest
    && JSON.stringify(value.snapshot.rules) === JSON.stringify(salesCohortRules.parse(request.rules)) && value.snapshot.mappingReview === request.mappingReview;
}
const preparationSchema = z.object({ protocolId: id, protocolDigest: digest, preparedAt: utc, status: z.enum(['available', 'already_frozen', 'withdrawn', 'window_started', 'source_changed']),
  frozen: receiptSchema.nullable(), canFreeze: z.boolean(), activationAllowed: z.literal(false), experimentStarted: z.literal(false) }).strict();
export type CohortPreparation = z.infer<typeof preparationSchema>;
export function compatibleCohortPreparation(value: unknown, record: ProtocolRecord): value is CohortPreparation {
  const result = preparationSchema.safeParse(value); if (!result.success) return false;
  const p = result.data;
  return p.protocolId === record.protocolId && p.protocolDigest === record.protocolDigest && p.canFreeze === (p.status === 'available')
    && (p.status === 'already_frozen' ? !!p.frozen && compatibleCohortReceipt((value as CohortPreparation).frozen, record) : p.frozen === null)
    && (!p.canFreeze || record.state === 'registered' && Date.parse(p.preparedAt) < Date.parse(record.protocol.design.window.enrollmentStartsAt));
}
