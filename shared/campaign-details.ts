import {z} from 'zod';
import {campaignStatuses,campaignQueueSchema} from './campaign-workspace';
import {campaignAudienceSchema} from './campaign-audience';
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),id=count.min(1);
export const campaignDetailsInput=z.object({id}).strict();
export const campaignDetailsSchema=z.object({
  actorId:id,merchantId:id,canManage:z.boolean(),checkedAt:z.string().datetime(),timezone:z.string().nullable(),
  campaign:z.object({id,name:z.string().max(255),message:z.string().max(65535),imageUrl:z.string().max(2048).nullable(),status:z.enum(campaignStatuses),
    createdAt:z.string().datetime(),scheduledAt:z.string().datetime().nullable(),recipients:count,accepted:count,basis:z.literal('stored_campaign_counters'),
    definitionKey:z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  audience:z.discriminatedUnion('status',[
    z.object({status:z.literal('valid'),filters:campaignAudienceSchema}).strict(),
    z.object({status:z.literal('invalid')}).strict(),
  ]),
  queue:campaignQueueSchema.nullable(),excludedRecipients:count,
}).strict().superRefine((value,ctx)=>{
  const q=value.queue;
  if(value.campaign.accepted>value.campaign.recipients || q&&(q.total===0||q.total!==q.accepted+q.awaiting+q.suppressed+q.needsReview))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Inconsistent campaign details'});
});
export type CampaignDetailsSnapshot=z.infer<typeof campaignDetailsSchema>;
