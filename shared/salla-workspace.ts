import { z } from 'zod';
import { bookingReadId } from './booking-read';
const count = z.number().int().nonnegative().safe(), stamp = z.string().datetime().nullable();
export const sallaWorkspaceSchema = z.object({
  actorId: bookingReadId, merchantId: bookingReadId, checkedAt: z.string().datetime(), revision: z.string().regex(/^[a-f0-9]{64}$/),
  present: z.boolean(), state: z.enum(['unlinked','configured','syncing','paused','error','unknown']),
  storeId: z.string().regex(/^[1-9][0-9]{0,19}$/).nullable(), storeUrl: z.string().max(2048).nullable(), credentialsStored: z.boolean(),
  createdAt: stamp, lastSyncAt: stamp, hasSyncErrors: z.boolean(),
  counts: z.object({ catalog: count, linkedProducts: count, syncLogs: count }).strict(),
  webhooks: z.object({ recentTotal: count, recentCompleted: count, awaiting: count, manualReview: count, oldestPendingSeconds: count.nullable() }).strict(),
}).strict().superRefine((value,ctx) => {
  if (value.present === (value.state === 'unlinked') || !value.present && (value.storeId !== null || value.storeUrl !== null || value.credentialsStored || value.createdAt !== null || value.lastSyncAt !== null || value.hasSyncErrors || value.counts.linkedProducts !== 0)
    || value.webhooks.recentCompleted > value.webhooks.recentTotal) ctx.addIssue({code:'custom',message:'Inconsistent Salla workspace'});
});
export type SallaWorkspace = z.infer<typeof sallaWorkspaceSchema>;
export const sallaLogStates = ['success','failed','in_progress','unknown'] as const;
export const sallaLogKinds = ['full_sync','stock_sync','single_product','unknown'] as const;
export const sallaLogsInput = z.object({ search:z.string().trim().max(100).default(''), state:z.enum(['all',...sallaLogStates]).default('all'), kind:z.enum(['all',...sallaLogKinds]).default('all'), page:z.number().int().min(1).max(1_000_000).default(1) }).strict();
export const sallaLogRow = z.object({ id:bookingReadId, merchantId:bookingReadId, kind:z.enum(sallaLogKinds), state:z.enum(sallaLogStates), itemsSynced:count.nullable(), hasErrors:z.boolean(), startedAt:stamp, completedAt:stamp, invalidData:z.boolean() }).strict();
export const sallaLogsWorkspaceSchema = z.object({
  actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),selection:sallaLogsInput,
  summary:z.object({stored:count,matched:count,groups:z.array(z.object({key:z.enum(sallaLogStates),count}).strict()).length(4)}).strict(),
  pagination:z.object({page:count.min(1),pageSize:z.literal(25),total:count,pages:count}).strict(),rows:z.array(sallaLogRow).max(25),
}).strict().superRefine((value,ctx) => {
  const {selection:s,summary:total,pagination:p}=value,selected=s.state==='all'?total.matched:total.groups.find(g=>g.key===s.state)?.count;
  if (total.stored<total.matched || total.groups.some((g,i)=>g.key!==sallaLogStates[i]) || total.groups.reduce((n,g)=>n+g.count,0)!==total.matched || p.total!==selected || p.page!==s.page || p.pages!==Math.ceil(p.total/25)
    || value.rows.length!==Math.min(25,Math.max(0,p.total-(p.page-1)*25)) || value.rows.some((row,i)=>row.merchantId!==value.merchantId || s.state!=='all'&&row.state!==s.state || s.kind!=='all'&&row.kind!==s.kind || i>0&&row.id>=value.rows[i-1].id)) ctx.addIssue({code:'custom',message:'Inconsistent Salla log page'});
});
export type SallaLogsWorkspace = z.infer<typeof sallaLogsWorkspaceSchema>;
