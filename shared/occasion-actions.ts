import {z} from 'zod';
import {occasionTypes,occasionWorkspaceRow} from './occasion-workspace';

const id=z.number().int().positive().max(2147483647);
export const occasionActionTarget=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),occasionType:z.enum(occasionTypes),year:z.number().int().min(1900).max(9999)}).strict(),
  z.object({action:z.literal('toggle'),id,enabled:z.boolean()}).strict(),
]);
export type OccasionActionTarget=z.infer<typeof occasionActionTarget>;
export const occasionActionApply=z.object({target:occasionActionTarget,reviewRevision:z.string().regex(/^[a-f0-9]{64}$/),acknowledged:z.literal(true)}).strict();
export const occasionActionReview=z.object({
  actorId:id,merchantId:id,target:occasionActionTarget,reviewRevision:z.string().regex(/^[a-f0-9]{64}$/),
  checkedAt:z.string().datetime(),eligible:z.boolean(),reason:z.enum(['ready','duplicate','not_available','in_progress','invalid','no_change']),
  row:occasionWorkspaceRow.nullable(),
  terms:z.object({effect:z.enum(['save_disabled','allow_automatic_admission','disable_future_admission']),
    occasionType:z.string().nullable(),year:z.number().int().nullable(),discountPercent:z.number().int().nullable(),
    discountMaxUses:z.literal(2000),discountMinOrder:z.literal(0),discountExpiry:z.literal('occasion_end'),
    audience:z.literal('eligible_conversations'),audienceLimit:z.literal(2000),
    timezone:z.literal('Asia/Riyadh'),calendar:z.literal('gregory_and_islamic_umalqura'),
    sendsImmediately:z.literal(false),deliveryGuaranteed:z.literal(false),salesVerified:z.literal(false),
    messagePreview:z.string().max(100000).nullable(),messageSource:z.enum(['generated','linked_campaign','unavailable']),
    savedTemplateUsed:z.literal(false),
  }).strict(),
}).strict();
export type OccasionActionReview=z.infer<typeof occasionActionReview>;
export const occasionActionResult=z.object({actorId:id,merchantId:id,id,enabled:z.boolean(),effect:z.enum(['save_disabled','allow_automatic_admission','disable_future_admission']),sentImmediately:z.literal(false)}).strict();
