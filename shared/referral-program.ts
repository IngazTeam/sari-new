import { z } from 'zod';
export const referralEntityId = z.number().int().positive().max(2147483647);
export const referralVersion = z.string().regex(/^[a-f0-9]{64}$/);
export const referralCreateInput = z.object({ confirm: z.literal(true) }).strict();
export const referralClaimInput = z.object({ rewardId: referralEntityId, expectedRevision: referralVersion, recordOnly: z.literal(true) }).strict();
export const referralInvitationInput = z.object({ code: z.string().trim().toUpperCase().min(4).max(50).regex(/^[A-Z0-9-]+$/) }).strict();
export const referralApplyInput = referralInvitationInput.extend({ expectedRevision: referralVersion, acknowledgePendingReward: z.literal(true) }).strict();
export const referralInvitationReview = z.object({actorId:referralEntityId,merchantId:referralEntityId,code:referralInvitationInput.shape.code,referrerName:z.string().max(255),expectedRevision:referralVersion,alreadyApplied:z.boolean(),effect:z.literal('pending_reward_record'),benefitGranted:z.literal(false)}).strict();
export type ReferralInvitationReview = z.infer<typeof referralInvitationReview>;
export function referralProgramProfile(raw: unknown): { codeId: number | null; applied: null | { codeId: number; referralId: number; rewardId: number } } {
 if (raw == null) return { codeId: null, applied: null };
 const value = z.object({ code_id: referralEntityId.nullable(), applied_code_id: referralEntityId.nullable(), applied_referral_id: referralEntityId.nullable(), applied_reward_id: referralEntityId.nullable() }).parse(raw);
 const applied = value.applied_code_id === null && value.applied_referral_id === null && value.applied_reward_id === null ? null : z.object({ codeId: referralEntityId, referralId: referralEntityId, rewardId: referralEntityId }).parse({ codeId: value.applied_code_id, referralId: value.applied_referral_id, rewardId: value.applied_reward_id });
 return { codeId: value.code_id, applied };
}
