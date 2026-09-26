import { z } from 'zod';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';

export const salesReplyDeliveryId = z.number().int().positive().safe();
const id = salesReplyDeliveryId, digest = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ precision: 3 }).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
export const prepareSalesReplyDeliveryInput = z.object({ generationId: id, instanceRecordId: id }).strict();
export const authorizeSalesReplyDeliveryInput = prepareSalesReplyDeliveryInput.extend({
  requestId: z.string().uuid().transform(v => v.toLowerCase()), basisDigest: digest, reason: z.string().trim().min(20).max(1200),
  allowSendCustomerMessage: z.literal(true), reviewedExactRecipientAndResponse: z.literal(true),
}).strict();
export const salesReplyDeliveryIdentity = z.object({ deliveryId: id, authorizationDigest: digest }).strict();
export const salesReplyDeliveryBasis = z.object({
  version: z.literal('sales-reply-delivery-basis.v1'), merchantId: id, generationId: id, actorUserId: id,
  reviewId: id, reviewDigest: digest, reviewBasisDigest: digest, reviewRevision: id,
  conversationId: id, incomingMessageId: id, responseText: z.string().min(1).max(4096).refine(v => !!v.trim()),
  recipient: z.string().regex(/^[1-9][0-9]{7,14}$/), instanceRecordId: id,
  provider: z.enum(['green_api', 'meta_cloud', 'mock']), accountDigest: digest,
  observationEndsAt: instant, inboundReceivedAt: instant,
}).strict();
export const salesReplyDeliveryAuthorization = z.object({
  version: z.literal('sales-reply-delivery-authorization.v1'), basis: salesReplyDeliveryBasis, basisDigest: digest,
  requestId: z.string().uuid(), reason: z.string().trim().min(20).max(1200), authorizedAt: instant, expiresAt: instant,
  allowSendCustomerMessage: z.literal(true), reviewedExactRecipientAndResponse: z.literal(true),
  scope: z.literal('one_reviewed_text_reply'),
}).strict().superRefine((s, ctx) => {
  const start = Date.parse(s.authorizedAt), end = Date.parse(s.expiresAt), received = Date.parse(s.basis.inboundReceivedAt);
  if (s.basisDigest !== policyArtifactDigest(s.basis) || end <= start || end - start > 120_000
    || end > Date.parse(s.basis.observationEndsAt) || received > start || end > received + 86_400_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid bounded delivery authorization' });
  }
});
export type SalesReplyDeliveryIdentity = z.infer<typeof salesReplyDeliveryIdentity>;
export const salesReplyDeliveryKey = (merchant: number, deliveryId: number) => {
  const key = `sales_reply:${merchant}:${deliveryId}`;
  // Preserve every previously valid key; single-digit identities never met the channel minimum.
  return key.length < 16 ? `${key}:v1` : key;
};
