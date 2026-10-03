import { z } from 'zod';

const id = z.number().int().positive().max(2147483647);
const count = z.number().int().nonnegative().safe();
const rating = z.number().int().min(1).max(5);
const date = z.string().datetime().nullable();
export const reviewKind = z.enum(['order', 'booking']);
export type ReviewKind = z.infer<typeof reviewKind>;
export const reviewSelection = z.object({
  query: z.string().trim().max(100).default(''), rating: rating.nullable().default(null),
  reply: z.enum(['all', 'pending', 'replied']).default('all'),
  visibility: z.enum(['all', 'public', 'private', 'unknown']).default('all'),
  integrity: z.enum(['all', 'linked', 'unlinked']).default('all'),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).default('newest'),
  page: z.number().int().min(1).max(1000000).default(1),
}).strict();
export type ReviewSelection = z.infer<typeof reviewSelection>;
export const reviewDetailInput = z.object({ id }).strict();
export const reviewRow = z.object({
  id, kind: reviewKind, revision: z.string().regex(/^[a-f0-9]{64}$/),
  integrity: z.enum(['linked', 'unlinked']),
  customerName: z.string().max(255).nullable(), customerPhone: z.string().max(50).nullable(),
  rating: rating.nullable(), comment: z.string().max(65535).nullable(),
  merchantReply: z.string().max(65535).nullable(), replyState: z.enum(['pending', 'replied', 'unknown']),
  isPublic: z.boolean().nullable(), createdAt: date, updatedAt: date, repliedAt: date,
  record: z.object({ id, label: z.string().max(255).nullable() }).strict().nullable(),
  product: z.object({ id, name: z.string().max(255) }).strict().nullable(),
  service: z.object({ id, name: z.string().max(255) }).strict().nullable(),
  staff: z.object({ id, name: z.string().max(255) }).strict().nullable(),
  dimensions: z.object({ quality: rating.nullable(), professionalism: rating.nullable(), value: rating.nullable() }).strict().nullable(),
  issues: z.array(z.enum(['reference', 'rating', 'visibility', 'quality', 'professionalism', 'value', 'createdAt', 'updatedAt', 'repliedAt'])),
  replyDelivery: z.literal('not_verified'), purchaseVerification: z.literal('not_verified'),
}).strict().superRefine((v, ctx) => {
  if (v.integrity === 'unlinked' && ([v.customerName, v.customerPhone, v.rating, v.comment, v.merchantReply, v.isPublic,
    v.repliedAt, v.record, v.product, v.service, v.staff, v.dimensions].some(x => x !== null) || v.replyState !== 'unknown')) {
    ctx.addIssue({ code: 'custom', message: 'Unlinked review must be redacted' });
  }
  if (v.integrity === 'linked' && (!v.record || v.replyState === 'unknown')) ctx.addIssue({ code: 'custom', message: 'Missing review reference' });
});
export type ReviewRow = z.infer<typeof reviewRow>;
export const reviewStats = z.object({
  total: count, linked: count, unlinked: count, rated: count, invalidRatings: count,
  average: z.number().min(1).max(5).nullable(), pending: count, replied: count,
  public: count, private: count, unknownVisibility: count,
  distribution: z.object({ '1': count, '2': count, '3': count, '4': count, '5': count }).strict(),
}).strict().superRefine((v, c) => {
  if (v.total !== v.linked + v.unlinked || v.linked !== v.rated + v.invalidRatings || v.linked !== v.pending + v.replied
    || v.linked !== v.public + v.private + v.unknownVisibility || v.rated !== Object.values(v.distribution).reduce((a, b) => a + b, 0)
    || (v.average === null) !== (v.rated === 0)) c.addIssue({ code: 'custom', message: 'Inconsistent review statistics' });
});
const scope = { actorId: id, merchantId: id, kind: reviewKind, checkedAt: z.string().datetime(), canReply: z.boolean() };
export const reviewWorkspace = z.object({
  ...scope, selection: reviewSelection, stats: reviewStats, matched: count, pages: count,
  currentPage: z.number().int().positive(), pageSize: z.literal(25), rows: z.array(reviewRow).max(25),
  evidence: z.literal('recorded_reviews'), salesAttribution: z.literal('not_verified'),
}).strict();
export type ReviewWorkspace = z.infer<typeof reviewWorkspace>;
export const reviewDetail = z.object({ ...scope, row: reviewRow }).strict();
