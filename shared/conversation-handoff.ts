import { z } from 'zod';
import { memoryFields, memoryValueSchemas } from './customer-memory';

const id = z.number().int().positive().safe();
const revision = z.number().int().nonnegative().safe();
const at = z.string().datetime({ precision: 3 });
export const handoffReadInput = z.object({ conversationId: id }).strict();
export const handoffSourceInput = handoffReadInput.extend({ messageId: id }).strict();
const fact = z.object({ field: z.enum(memoryFields), value: z.unknown(), kind: z.enum(['explicit', 'inferred']),
  sourceMessageId: id, conversationId: id, observedAt: at, expiresAt: at, revision }).strict().superRefine((f, ctx) => {
  if (!memoryValueSchemas[f.field].safeParse(f.value).success) ctx.addIssue({ code: 'custom', message: 'Invalid handoff fact' });
});
const message = z.object({ id, role: z.string().max(32).nullable(), text: z.string(), at }).strict();
export const handoffSummary = z.object({
  conversationId: id, version: revision, lastMessageId: revision, humanOwned: z.boolean(), expiresAt: at.nullable(),
  dealStage: z.string().nullable(), lossReason: z.string().nullable(), facts: z.array(fact).max(memoryFields.length),
  messages: z.array(message.extend({ text: z.string().max(600) }).strict()).max(20),
  offers: z.array(z.object({ id, number: z.string(), status: z.string(), sourceMessageId: id, consentMessageId: id.nullable(),
    orderId: id.nullable(), provider: z.string().nullable(), current: z.boolean(),
    items: z.array(z.object({ name: z.string().max(100), quantity: id }).strict()).max(10) }).strict()).max(3),
}).strict().superRefine((s, ctx) => {
  if (s.facts.some(f => f.conversationId !== s.conversationId || f.sourceMessageId > s.lastMessageId)
    || new Set(s.facts.map(f => f.field)).size !== s.facts.length
    || s.messages.some((m, i) => m.id > s.lastMessageId || (i > 0 && m.id <= s.messages[i - 1].id))
    || s.offers.some((o, i) => o.sourceMessageId > s.lastMessageId || (i > 0 && o.id >= s.offers[i - 1].id))) {
    ctx.addIssue({ code: 'custom', message: 'Handoff evidence does not match its context' });
  }
});
export const handoffSnapshot = z.object({ merchantId: id, actorUserId: id, canManage: z.boolean(), summary: handoffSummary }).strict();
export const handoffSourceSnapshot = z.object({ merchantId: id, actorUserId: id, conversationId: id, message }).strict();
export const handoffOwnershipResult = z.object({ changed: z.boolean(), merchantId: id, version: revision }).strict();
