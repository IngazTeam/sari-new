import { z } from 'zod';

export const campaignStatuses = ['draft','scheduled','sending','completed','failed'] as const;
export const campaignPageSize = 25;
export const campaignListInput = z.object({
  search:z.string().trim().max(200).default(''),
  status:z.enum(['all',...campaignStatuses]).default('all'),
  page:z.number().int().min(1).max(1_000_000).default(1),
}).strict();
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id=count.min(1);
export const campaignSummarySchema=z.object({
  total:count,draft:count,scheduled:count,sending:count,completed:count,failed:count,
  accepted:count,recipients:count,unconfirmed:count,acceptanceRate:z.number().min(0).max(100),
  acceptanceBasis:z.literal('stored_campaign_counters'),
}).strict();
export const campaignQueueSchema=z.object({total:count,accepted:count,awaiting:count,suppressed:count,needsReview:count}).strict();
export const campaignListRowSchema=z.object({
  id,name:z.string(),status:z.enum(campaignStatuses),
  createdAt:z.string().datetime(),scheduledAt:z.string().datetime().nullable(),
  recipients:count,accepted:count,queue:campaignQueueSchema.nullable(),
}).strict();
export const campaignWorkspaceSchema=z.object({
  actorId:id,merchantId:id,canManage:z.boolean(),selection:campaignListInput,checkedAt:z.string().datetime(),timezone:z.string().nullable(),
  summary:campaignSummarySchema,needsReview:count,
  pagination:z.object({page:id,pageSize:z.literal(25),total:count,pages:count}).strict(),
  rows:z.array(campaignListRowSchema).max(campaignPageSize),
}).strict();
export type CampaignListSelection=z.infer<typeof campaignListInput>;
export type CampaignWorkspace=z.infer<typeof campaignWorkspaceSchema>;
