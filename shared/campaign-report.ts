import {z} from 'zod';
import {campaignStatuses} from './campaign-workspace';

const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),id=count.min(1);
const reportInputBase=z.object({
  id, view:z.enum(['recipients','results']).default('recipients'),
  status:z.enum(['all','pending','processing','sent','failed','suppressed','manual_review','success']).default('all'),
  search:z.string().trim().max(200).default(''),page:z.number().int().min(1).max(1_000_000).default(1),
}).strict();
const validStatus=(value:{view:string;status:string})=>value.view==='results'?['all','pending','success','failed'].includes(value.status):value.status!=='success';
export const campaignReportInput=reportInputBase.refine(validStatus,{message:'Status does not match this report section'});
export const campaignReportExportLimit=10_000;
export const campaignReportExportInput=reportInputBase.omit({page:true}).refine(validStatus,{message:'Status does not match this report section'});
export const campaignReportReasons=['none','consent','quiet_hours','capacity','rate_limit','inactive','acknowledged','uncertain','retry_exhausted','unavailable','provider_rejected','other'] as const;
const base={id,phone:z.string().max(50),name:z.string().max(255).nullable(),reason:z.enum(campaignReportReasons),recordedAt:z.string().datetime()};
export const campaignReportRow=z.discriminatedUnion('kind',[
  z.object({...base,kind:z.literal('result'),status:z.enum(['pending','success','failed'])}).strict(),
  z.object({...base,kind:z.literal('recipient'),status:z.enum(['pending','processing','sent','failed','suppressed','manual_review']),attempts:count.max(8),quotaHeld:z.boolean(),acceptedAt:z.string().datetime().nullable()}).strict(),
]);
const reportBase=z.object({
  actorId:id,merchantId:id,canManage:z.boolean(),selection:campaignReportInput,checkedAt:z.string().datetime(),timezone:z.string().nullable(),
  campaign:z.object({id,name:z.string().max(255),message:z.string().max(65535),imageUrl:z.string().max(2048).nullable(),status:z.enum(campaignStatuses),createdAt:z.string().datetime(),scheduledAt:z.string().datetime().nullable(),recipients:count,accepted:count,basis:z.literal('stored_campaign_counters')}).strict(),
  summary:z.object({
    results:z.object({total:count,success:count,failed:count,pending:count,successRate:z.number().min(0).max(100),excludedLinks:count}).strict(),
    recipients:z.object({total:count,pending:count,processing:count,sent:count,failed:count,suppressed:count,manualReview:count}).strict(),
  }).strict(),
  pagination:z.object({page:id,pageSize:z.literal(25),total:count,pages:count}).strict(),
  rows:z.array(campaignReportRow).max(25),
}).strict();
function consistentReport(value:z.infer<typeof reportBase>|z.infer<typeof exportBase>,ctx:z.RefinementCtx){
  const invalid=()=>ctx.addIssue({code:z.ZodIssueCode.custom,message:'Inconsistent campaign report'}),p=value.pagination,r=value.summary.results,q=value.summary.recipients;
  if(value.campaign.id!==value.selection.id||value.campaign.accepted>value.campaign.recipients||p.page!==value.selection.page||p.pages!==Math.ceil(p.total/p.pageSize))invalid();
  if(r.total!==r.success+r.failed+r.pending||r.successRate!==(r.total?Math.round(r.success/r.total*1000)/10:0)||q.total!==q.pending+q.processing+q.sent+q.failed+q.suppressed+q.manualReview)invalid();
  const datasetTotal=value.selection.view==='results'?r.total:q.total;
  if(p.total>datasetTotal||(!value.selection.search&&value.selection.status==='all'&&p.total!==datasetTotal))invalid();
  if(value.rows.some(row=>row.kind!==(value.selection.view==='results'?'result':'recipient')))invalid();
  if(value.selection.status!=='all'&&value.rows.some(row=>row.status!==value.selection.status))invalid();
  if(value.rows.length!==Math.max(0,Math.min(p.pageSize,p.total-(p.page-1)*p.pageSize))||new Set(value.rows.map(row=>row.id)).size!==value.rows.length)invalid();
}
const exportBase=reportBase.extend({
  pagination:z.object({page:z.literal(1),pageSize:z.literal(campaignReportExportLimit),total:count.max(campaignReportExportLimit),pages:z.number().int().min(0).max(1)}).strict(),
  rows:z.array(campaignReportRow).max(campaignReportExportLimit),
});
export const campaignReportSchema=reportBase.superRefine(consistentReport);
export const campaignReportExportSchema=exportBase.superRefine(consistentReport);
export type CampaignReportSelection=z.infer<typeof campaignReportInput>;
export type CampaignReportSnapshot=z.infer<typeof campaignReportSchema>;
export type CampaignReportExport=z.infer<typeof campaignReportExportSchema>;
