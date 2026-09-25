import { z } from 'zod';
const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().datetime({ precision: 3 }).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
export const listSalesCohortSourcesInput = z.object({ protocolId: id, cohortDigest: digest, search: z.string().trim().max(100).default(''), beforeId: id.optional(), limit: z.number().int().min(1).max(20).default(10) }).strict();
export const cohortInspectionReasons = ['unsupported_customer_identity', 'excluded_customer', 'inactive_conversation', 'human_takeover', 'before_handoff_boundary', 'superseded_inbound',
  'excluded_deal_stage', 'unsupported_message_type', 'message_length', 'required_term_missing', 'population_mismatch', 'invalid_source_time', 'message_outside_enrollment', 'inspection_outside_enrollment'] as const;
export const cohortSource = z.object({ conversationId: id, incomingMessageId: id, customerName: z.string().max(510).refine(value => Array.from(value).length <= 255).nullable(), customerPhone: z.string().max(100).refine(value => Array.from(value).length <= 50),
  messageType: z.enum(['text', 'voice', 'image', 'document']), preview: z.string().max(640), previewTruncated: z.boolean(), receivedAt: utc, messageDigest: digest }).strict();
export const cohortSourcePage = z.object({ protocolId: id, cohortDigest: digest, search: z.string().max(100), beforeId: id.nullable(), limit: z.number().int().min(1).max(20),
  listedAt: utc, items: z.array(cohortSource).max(20), nextBeforeId: id.nullable(), activationAllowed: z.literal(false) }).strict();
export const cohortInspectionResult = z.object({ protocolId: id, cohortDigest: digest, conversationId: id, incomingMessageId: id, messageDigest: digest,
  inspectedAt: utc, sourceDigest: digest, qualifiesAtRead: z.boolean(), reasons: z.array(z.enum(cohortInspectionReasons)).max(cohortInspectionReasons.length), population: z.enum(['new', 'returning']),
  assignmentCreated: z.literal(false), activationAllowed: z.literal(false), scope: z.literal('point_in_time_inspection') }).strict()
  .refine(value => new Set(value.reasons).size === value.reasons.length && value.qualifiesAtRead === (value.reasons.length === 0));
export type CohortSource = z.infer<typeof cohortSource>;
export type CohortSourcePage = z.infer<typeof cohortSourcePage>;
export type CohortInspectionResult = z.infer<typeof cohortInspectionResult>;
export type ListSalesCohortSourcesInput = z.infer<typeof listSalesCohortSourcesInput>;
