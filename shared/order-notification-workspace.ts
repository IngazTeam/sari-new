import { z } from 'zod';
const id = z.number().int().positive().max(2147483647), count = z.number().int().nonnegative().safe();
const date = z.string().datetime().nullable(), revision = z.string().regex(/^[a-f0-9]{64}$/);
export const orderNoticeStatus = z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']);
export const orderNoticeState = z.enum(['pending', 'processing', 'sent', 'failed', 'manual_review', 'suppressed', 'unknown']);
export const orderNoticeEvidence = z.enum(['unverified', 'accepted', 'delivered', 'read', 'failed', 'simulated']);
export const orderNoticeSelection = z.object({
  query: z.string().trim().max(100).default(''), status: orderNoticeStatus.nullable().default(null),
  state: orderNoticeState.nullable().default(null), evidence: orderNoticeEvidence.nullable().default(null),
  integrity: z.enum(['all', 'linked', 'unlinked']).default('all'),
  sort: z.enum(['newest', 'oldest']).default('newest'), page: z.number().int().min(1).max(1000000).default(1),
}).strict();
export type OrderNoticeSelection = z.infer<typeof orderNoticeSelection>;
export const orderNoticeDetailInput = z.object({ id }).strict();
export const orderNoticeTemplate = z.object({
  id: id.nullable(), status: z.string().max(50), canonicalStatus: orderNoticeStatus.nullable(), stored: z.boolean(),
  template: z.string().max(65535), enabled: z.boolean().nullable(), revision, updatedAt: date,
  issues: z.array(z.enum(['status', 'template', 'enabled', 'updatedAt'])),
}).strict();
export const orderNoticeRow = z.object({
  id, revision, integrity: z.enum(['linked', 'unlinked']), status: orderNoticeStatus.nullable(), state: orderNoticeState,
  order: z.object({ id, number: z.string().max(100).nullable() }).strict().nullable(),
  customerPhone: z.string().max(50).nullable(), message: z.string().max(65535).nullable(),
  attempts: count.nullable(), evidence: orderNoticeEvidence,
  provider: z.enum(['green_api', 'meta_cloud', 'mock']).nullable(), providerMessageId: z.string().max(255).nullable(),
  evidenceAt: date, createdAt: date, updatedAt: date, availableAt: date, claimedAt: date, sentAt: date, reviewedAt: date,
  reviewedByUserId: id.nullable(), hasEvent: z.boolean(),
  issues: z.array(z.enum(['reference', 'status', 'state', 'attempts', 'event', 'timestamp', 'receipt', 'missing_receipt'])),
  // This is a local order-status message record. It proves neither payment nor order delivery nor a sale.
  salesVerification: z.literal('not_verified'),
}).strict().superRefine((v, c) => {
  if (v.integrity === 'unlinked' && ([v.order, v.customerPhone, v.message, v.provider, v.providerMessageId, v.evidenceAt, v.reviewedByUserId].some(x => x !== null) || v.evidence !== 'unverified')) c.addIssue({ code: 'custom', message: 'Unlinked notification must be redacted' });
  if (v.integrity === 'linked' && !v.order) c.addIssue({ code: 'custom', message: 'Missing order reference' });
  if (v.evidence !== 'unverified' && (!v.provider || !v.providerMessageId || !v.evidenceAt)) c.addIssue({ code: 'custom', message: 'Missing receipt evidence' });
  if ((v.evidence === 'simulated') !== (v.provider === 'mock')) c.addIssue({ code: 'custom', message: 'Simulation is not live delivery' });
});
export type OrderNoticeRow = z.infer<typeof orderNoticeRow>;
export const orderNoticeStats = z.object({ total: count, linked: count, unlinked: count,
  states: z.object({ pending: count, processing: count, sent: count, failed: count, manual_review: count, suppressed: count, unknown: count }).strict(),
  evidence: z.object({ unverified: count, accepted: count, delivered: count, read: count, failed: count, simulated: count }).strict(),
}).strict().superRefine((v, c) => {
  if (v.total !== v.linked + v.unlinked || v.total !== Object.values(v.states).reduce((a,b) => a+b,0) || v.total !== Object.values(v.evidence).reduce((a,b) => a+b,0)) c.addIssue({ code: 'custom', message: 'Inconsistent notification totals' });
});
const scope = { actorId: id, merchantId: id, canManage: z.boolean(), checkedAt: z.string().datetime() };
export const orderNoticeWorkspace = z.object({ ...scope, selection: orderNoticeSelection, templates: z.array(orderNoticeTemplate), stats: orderNoticeStats,
  rows: z.array(orderNoticeRow).max(25), matched: count, pages: count, currentPage: z.number().int().positive(), pageSize: z.literal(25),
  evidenceScope: z.literal('matching_provider_receipts'),
}).strict();
export type OrderNoticeWorkspace = z.infer<typeof orderNoticeWorkspace>;
export const orderNoticeDetail = z.object({ ...scope, row: orderNoticeRow }).strict();
