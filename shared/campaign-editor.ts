import { z } from 'zod';
import { campaignAudienceSchema, campaignRecipientLimit } from './campaign-audience';
import { campaignStatuses } from './campaign-workspace';
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), id = count.min(1);
export const campaignEditorInput = z.object({ id: id.optional() }).strict();
export const campaignEditorSchema = z.object({
  actorId: id, merchantId: id, canManage: z.boolean(), checkedAt: z.string().datetime(),
  timezone: z.string().nullable(), merchantStatus: z.enum(['active', 'pending', 'suspended']),
  campaign: z.object({
    id, name: z.string().max(255), message: z.string().max(65535), imageUrl: z.string().max(2048).nullable(),
    status: z.enum(campaignStatuses), scheduledAt: z.string().datetime().nullable(), definitionKey: z.string().regex(/^[a-f0-9]{64}$/),
    audience: z.discriminatedUnion('status', [
      z.object({ status: z.literal('valid'), filters: campaignAudienceSchema }).strict(),
      z.object({ status: z.literal('invalid') }).strict(),
    ]),
  }).strict().nullable(),
}).strict();
export const campaignAudiencePreviewSchema = z.object({
  actorId: id, merchantId: id, checkedAt: z.string().datetime(), filters: campaignAudienceSchema,
  count, recipientCount: count, invalidPhoneCount: count, duplicateCount: count,
  recipientLimit: z.literal(campaignRecipientLimit), exceedsLimit: z.boolean(),
  basis: z.literal('matched_conversations_before_consent'),
}).strict().superRefine((value, ctx) => {
  if (value.count !== value.recipientCount + value.invalidPhoneCount + value.duplicateCount
    || value.exceedsLimit !== (value.recipientCount > value.recipientLimit)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inconsistent audience preview' });
});
export type CampaignEditorSnapshot = z.infer<typeof campaignEditorSchema>;
export type CampaignAudiencePreview = z.infer<typeof campaignAudiencePreviewSchema>;
