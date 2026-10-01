import { z } from 'zod';

export const campaignPerformanceInput = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
}).strict();
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const campaignPerformanceSchema = z.object({
  actorId: count.min(1), merchantId: count.min(1),
  days: campaignPerformanceInput.shape.days,
  checkedAt: z.string().datetime(), timezone: z.literal('UTC'),
  stats: z.object({
    completed: count, accepted: count, recipients: count, unconfirmed: count,
    acceptanceRate: z.number().min(0).max(100),
    basis: z.literal('stored_campaign_counters'),
  }).strict(),
  timeline: z.object({
    start: day, end: day, total: count, basis: z.literal('campaign_success_logs'),
    rows: z.array(z.object({date: day, acceptedByProvider: count}).strict()).min(7).max(90),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const invalid = () => ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Inconsistent campaign performance snapshot'});
  const stats = value.stats, timeline = value.timeline;
  const rate = stats.recipients ? Math.round(stats.accepted / stats.recipients * 1000) / 10 : 0;
  if (stats.accepted + stats.unconfirmed !== stats.recipients || stats.acceptanceRate !== rate) invalid();
  if (timeline.rows.length !== value.days || timeline.total !== timeline.rows.reduce((sum,row) => sum + row.acceptedByProvider,0)) invalid();
  const end = new Date(value.checkedAt);
  if (!Number.isFinite(end.getTime())) { invalid(); return; }
  end.setUTCHours(0,0,0,0);
  if (timeline.end !== end.toISOString().slice(0,10)) invalid();
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - value.days + 1);
  if (timeline.start !== start.toISOString().slice(0,10)) invalid();
  timeline.rows.forEach((row,index) => {const date = new Date(start); date.setUTCDate(date.getUTCDate() + index); if (row.date !== date.toISOString().slice(0,10)) invalid();});
});
export type CampaignPerformanceSnapshot = z.infer<typeof campaignPerformanceSchema>;
