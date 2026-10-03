import { z } from 'zod';
import { scheduledDefinitionFields, scheduledAdmissionMinutes, scheduledDeliveryMinutes } from './scheduled-message-policy';
import { scheduledMessageRow } from './scheduled-message-workspace';
const id = z.number().int().positive().max(2147483647), hash = z.string().regex(/^[a-f0-9]{64}$/);
export const scheduledActionTarget = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), data: scheduledDefinitionFields }).strict(),
  z.object({ action: z.literal('update'), id, data: scheduledDefinitionFields }).strict(),
  z.object({ action: z.literal('toggle'), id, enabled: z.boolean() }).strict(),
  z.object({ action: z.literal('delete'), id }).strict(),
]);
export const scheduledActionReview = z.object({
  actorId: id, merchantId: id, target: scheduledActionTarget, reviewRevision: hash, checkedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  before: scheduledMessageRow.nullable(), proposed: scheduledDefinitionFields.nullable(), effect: z.enum(['create_paused', 'update_paused', 'enable', 'disable', 'delete']),
  nextDueAt: z.string().datetime().nullable(), instanceId: id.nullable(), channelPhone: z.string().max(20).nullable(), messagePreview: z.string().max(4096).nullable(),
  repeat: z.literal('weekly_until_paused'), audience: z.literal('current_consented_conversations'), audienceLimit: z.literal(2000),
  admissionMinutes: z.literal(scheduledAdmissionMinutes), deliveryMinutes: z.literal(scheduledDeliveryMinutes),
  sendsImmediately: z.literal(false), deliveryGuaranteed: z.literal(false), salesVerified: z.literal(false), retainsDeliveryHistory: z.literal(true),
}).strict();
export const scheduledActionApply = z.object({ target: scheduledActionTarget, reviewRevision: hash, checkedAt: z.string().datetime(), requestKey: z.string().uuid() }).strict();
export const scheduledReceiptInput = z.object({ requestKey: z.string().uuid() }).strict();
export const scheduledActionResult = z.object({ requestKey: z.string().uuid(), actorId: id, merchantId: id, id, action: z.enum(['create', 'update', 'toggle', 'delete']),
  enabled: z.boolean().nullable(), authorizationId: id.nullable(), nextDueAt: z.string().datetime().nullable(), savedAt: z.string().datetime() }).strict();
export const scheduledCancelledReceipt = z.object({ state: z.literal('cancelled'), requestKey: z.string().uuid(), actorId: id, merchantId: id, cancelledAt: z.string().datetime() }).strict();
export const scheduledReceiptResult = z.discriminatedUnion('state', [
  z.object({ state: z.literal('saved'), result: scheduledActionResult }).strict(),
  z.object({ state: z.literal('missing'), result: z.null() }).strict(),
  z.object({ state: z.literal('cancelled'), result: scheduledCancelledReceipt }).strict(),
]);
export type ScheduledActionTarget = z.infer<typeof scheduledActionTarget>;
export type ScheduledActionReview = z.infer<typeof scheduledActionReview>;
export type ScheduledActionResult = z.infer<typeof scheduledActionResult>;
