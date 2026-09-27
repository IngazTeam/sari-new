import { z } from 'zod';

const id = z.number().int().positive().max(2147483647);
const time = z.string().datetime({ precision: 3 });
export const sallaEffectKind = z.enum(['owner_notice', 'merchant_notice', 'sheets']);
export const sallaEffectState = z.enum(['pending', 'processing', 'dispatching', 'accepted', 'review']);
export const sallaEffectReviewReason = z.enum(['delivery_check', 'incident_review']);
export const sallaEffectListInput = z.object({
  orderId: id.optional(), state: sallaEffectState.optional(), kind: sallaEffectKind.optional(), beforeId: id.optional(),
}).strict();
export const sallaEffectCheckInput = z.object({ effectId: id, requestId: z.string().uuid(), reason: sallaEffectReviewReason }).strict();
export const sallaEffectItem = z.object({
  id, orderId: id, kind: sallaEffectKind, state: sallaEffectState, attempts: z.number().int().min(0).max(8),
  createdAt: time, updatedAt: time, dispatchStartedAt: time.nullable(), acceptedAt: time.nullable(),
  contextValid: z.boolean(),
  diagnostic: z.enum(['queued', 'preparing', 'preparation_expired', 'in_flight', 'outcome_unknown', 'accepted', 'review_before_send']),
}).strict().superRefine((v, ctx) => {
  const accepted = v.state === 'accepted';
  if (accepted !== (v.acceptedAt !== null) || accepted !== (v.diagnostic === 'accepted')
    || accepted && !v.dispatchStartedAt
    || ['pending', 'processing'].includes(v.state) && v.dispatchStartedAt !== null
    || v.state === 'dispatching' && v.dispatchStartedAt === null
    || v.state === 'pending' && v.diagnostic !== 'queued'
    || v.state === 'processing' && !['preparing', 'preparation_expired'].includes(v.diagnostic)
    || v.state === 'dispatching' && !['in_flight', 'outcome_unknown'].includes(v.diagnostic)
    || v.state === 'review' && v.diagnostic !== (v.dispatchStartedAt ? 'outcome_unknown' : 'review_before_send')) {
    ctx.addIssue({ code: 'custom', message: 'Contradictory effect state' });
  }
});
export const sallaEffectAuditItem = z.object({
  id, reviewerUserId: id, reason: sallaEffectReviewReason, observedAt: time, effect: sallaEffectItem,
}).strict();
function ordered(p: { items: Array<{ id: number }>; nextCursor: number | null }) {
  return p.items.every((v, i) => i === 0 || v.id < p.items[i - 1].id)
    && (p.nextCursor === null || p.items.length === 20 && p.nextCursor === p.items.at(-1)?.id);
}
export const sallaEffectPage = z.object({ items: z.array(sallaEffectItem).max(20), nextCursor: id.nullable() }).strict().refine(ordered);
export const sallaEffectAuditPage = z.object({ items: z.array(sallaEffectAuditItem).max(20), nextCursor: id.nullable() }).strict().refine(ordered);
export const sallaEffectAuditListInput = z.object({ orderId: id.optional(), beforeId: id.optional() }).strict();
