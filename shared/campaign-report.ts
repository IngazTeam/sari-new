import {z} from 'zod';
import {campaignStatuses} from './campaign-workspace';

const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),id=count.min(1);
export const campaignReportInput=z.object({
  id, view:z.enum(['recipients','results']).default('recipients'),
  status:z.enum(['all','pending','processing','sent','failed','suppressed','manual_review','success']).default('all'),
  search:z.string().trim().max(200).default(''),page:z.number().int().min(1).max(1_000_000).default(1),
}).strict().refine(value=>value.view==='results'?['all','pending','success','failed'].includes(value.status):value.status!=='success',{message:'Status does not match this report section'});
export const campaignReportReasons=['none','consent','quiet_hours','capacity','rate_limit','inactive','acknowledged','uncertain','retry_exhausted','unavailable','provider_rejected','other'] as const;
const base={id,phone:z.string(),name:z.string().nullable(),reason:z.enum(campaignReportReasons),recordedAt:z.string().datetime()};
export const campaignReportRow=z.discriminatedUnion('kind',[
  z.object({...base,kind:z.literal('result'),status:z.enum(['pending','success','failed'])}).strict(),
  z.object({...base,kind:z.literal('recipient'),status:z.enum(['pending','processing','sent','failed','suppressed','manual_review']),attempts:count.max(8),quotaHeld:z.boolean(),acceptedAt:z.string().datetime().nullable()}).strict(),
]);
export const campaignReportSchema=z.object({
  actorId:id,merchantId:id,canManage:z.boolean(),selection:campaignReportInput,checkedAt:z.string().datetime(),timezone:z.string().nullable(),
  campaign:z.object({id,name:z.string(),message:z.string(),imageUrl:z.string().nullable(),status:z.enum(campaignStatuses),createdAt:z.string().datetime(),scheduledAt:z.string().datetime().nullable(),recipients:count,accepted:count,basis:z.literal('stored_campaign_counters')}).strict(),
  summary:z.object({
    results:z.object({total:count,success:count,failed:count,pending:count,successRate:z.number().min(0).max(100),excludedLinks:count}).strict(),
    recipients:z.object({total:count,pending:count,processing:count,sent:count,failed:count,suppressed:count,manualReview:count}).strict(),
  }).strict(),
  pagination:z.object({page:id,pageSize:z.literal(25),total:count,pages:count}).strict(),
  rows:z.array(campaignReportRow).max(25),
}).strict().superRefine((value,ctx)=>{
  const invalid=()=>ctx.addIssue({code:z.ZodIssueCode.custom,message:'Inconsistent campaign report'}),p=value.pagination,r=value.summary.results,q=value.summary.recipients;
  if(value.campaign.id!==value.selection.id||value.campaign.accepted>value.campaign.recipients||p.page!==value.selection.page||p.pages!==Math.ceil(p.total/25))invalid();
  if(r.total!==r.success+r.failed+r.pending||r.successRate!==(r.total?Math.round(r.success/r.total*1000)/10:0)||q.total!==q.pending+q.processing+q.sent+q.failed+q.suppressed+q.manualReview)invalid();
  if(value.rows.some(row=>row.kind!==(value.selection.view==='results'?'result':'recipient')))invalid();
  if(value.rows.length!==Math.max(0,Math.min(25,p.total-(p.page-1)*25))||new Set(value.rows.map(row=>row.id)).size!==value.rows.length)invalid();
});
export type CampaignReportSelection=z.infer<typeof campaignReportInput>;
export type CampaignReportSnapshot=z.infer<typeof campaignReportSchema>;
