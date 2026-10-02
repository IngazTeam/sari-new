import { z } from 'zod';
import { bookingReadId } from './booking-read';
export const byaanDataPageSize = 25;
export const byaanDataKinds = ['trainees', 'faqs', 'site'] as const;
export const byaanDataStates = {
  trainees: ['active', 'archived', 'unknown'],
  faqs: ['included', 'excluded', 'disabled', 'unknown'],
  site: ['content', 'empty'],
} as const;
const filters = { search: z.string().trim().max(100).default(''), page: z.number().int().min(1).max(1_000_000).default(1) };
export const byaanDataInput = z.discriminatedUnion('kind', [
  z.object({ ...filters, kind: z.literal('trainees'), state: z.enum(['all', ...byaanDataStates.trainees]).default('all') }).strict(),
  z.object({ ...filters, kind: z.literal('faqs'), state: z.enum(['all', ...byaanDataStates.faqs]).default('all') }).strict(),
  z.object({ ...filters, kind: z.literal('site'), state: z.enum(['all', ...byaanDataStates.site]).default('all') }).strict(),
]);
const stamp = z.string().datetime().nullable();
const count = z.number().int().nonnegative().safe();
const base = { id: bookingReadId, merchantId: bookingReadId, syncedAt: stamp };
export const byaanTraineeRow = z.object({
  ...base, kind: z.literal('trainees'), state: z.enum(byaanDataStates.trainees), externalId: z.string(), name: z.string(), phone: z.string().nullable(), email: z.string().nullable(),
  courses: z.array(z.string().max(255)).max(100), coursesTruncated: z.boolean(), courseDataInvalid: z.boolean(), createdAt: stamp,
}).strict();
export const byaanFaqRow = z.object({
  ...base, kind: z.literal('faqs'), state: z.enum(byaanDataStates.faqs), question: z.string(), answer: z.string(), category: z.string().nullable(),
  isActive: z.boolean().nullable(), useInBot: z.boolean().nullable(), revision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const byaanSiteRow = z.object({
  ...base, kind: z.literal('site'), state: z.enum(byaanDataStates.site), pageType: z.enum(['about','vision','mission','policies','custom','unknown']), title: z.string().nullable(), content: z.string(),
}).strict();
export const byaanDataRow = z.discriminatedUnion('kind', [byaanTraineeRow, byaanFaqRow, byaanSiteRow]);
export const byaanDataWorkspaceSchema = z.object({
  actorId: bookingReadId, merchantId: bookingReadId, checkedAt: z.string().datetime(), selection: byaanDataInput,
  summary: z.object({ stored: count, matched: count, groups: z.array(z.object({ key: z.string(), count }).strict()).max(4) }).strict(),
  pagination: z.object({ page: count.min(1), pageSize: z.literal(byaanDataPageSize), total: count, pages: count }).strict(),
  rows: z.array(byaanDataRow).max(byaanDataPageSize),
}).strict().superRefine((value, ctx) => {
  const { selection: s, pagination: p, summary: total } = value;
  const keys = byaanDataStates[s.kind] as readonly string[];
  const selected = s.state === 'all' ? total.matched : total.groups.find(group => group.key === s.state)?.count;
  if (total.stored < total.matched || total.groups.length !== keys.length || total.groups.some((g, i) => g.key !== keys[i])
    || total.groups.reduce((sum, group) => sum + group.count, 0) !== total.matched || p.total !== selected
    || p.page !== s.page || p.pages !== Math.ceil(p.total / byaanDataPageSize)
    || value.rows.length !== Math.min(byaanDataPageSize, Math.max(0, p.total - (p.page - 1) * byaanDataPageSize))
    || new Set(value.rows.map(row => row.id)).size !== value.rows.length
    || value.rows.some(row => row.merchantId !== value.merchantId || row.kind !== s.kind || s.state !== 'all' && row.state !== s.state)) {
    ctx.addIssue({ code: 'custom', message: 'Inconsistent Byaan data workspace' });
  }
});
export const byaanFaqChangeInput = z.object({ faqId: bookingReadId, field: z.enum(['is_active','use_in_bot']), value: z.boolean(), revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type ByaanDataSelection = z.infer<typeof byaanDataInput>;
export type ByaanDataRow = z.infer<typeof byaanDataRow>;
export type ByaanFaqRow = z.infer<typeof byaanFaqRow>;
export type ByaanDataWorkspace = z.infer<typeof byaanDataWorkspaceSchema>;
