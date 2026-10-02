import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { merchantProcedure, permissionProcedure, router } from './_core/trpc';
import {checkRateLimit} from './_core/rateLimiter';
function limitInvitation(actorId:number,merchantId:number){if(!checkRateLimit(`merchant-invitation:${actorId}:${merchantId}`,20,60000).allowed)throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'انتظر قليلًا قبل مراجعة دعوة أخرى.'});}
import { referralWorkspaceInput } from '../shared/referral-workspace';
import { readReferralWorkspace, ReferralWorkspaceError } from './referral-workspace-store';
import { referralCreateInput, referralClaimInput, referralInvitationInput, referralApplyInput } from '../shared/referral-program';
import { getMerchantInvitation, createMerchantInvitation, recordMerchantRewardClaim, readReferralLegacy, readReferralLegacyStats, reviewMerchantInvitation, applyMerchantInvitation, ReferralProgramError } from './referral-program-store';
async function guarded<T>(operation: () => Promise<T>) {
 try { return await operation(); } catch (error) {
  const reason = error instanceof ReferralProgramError || error instanceof ReferralWorkspaceError ? error.reason : 'unavailable';
  const messages = { forbidden: 'تعذر الوصول إلى برنامج الإحالات لهذا المتجر.', unavailable: 'تعذر تأكيد النتيجة. حدّث البيانات قبل المحاولة مجددًا.', stale: 'تغيرت البيانات أو سُجلت إحالة أخرى. حدّث البيانات وراجعها مجددًا.', missing: 'السجل غير موجود في هذا المتجر.', invalid: 'السجل غير مؤهل لهذا الإجراء. راجع حالته ومصدره.' };
  throw new TRPCError({ code: reason === 'forbidden' ? 'FORBIDDEN' : reason === 'stale' ? 'CONFLICT' : reason === 'missing' ? 'NOT_FOUND' : reason === 'invalid' ? 'PRECONDITION_FAILED' : 'INTERNAL_SERVER_ERROR', message: messages[reason] });
 }
}
export const referralsRouter = router({
 workspace: merchantProcedure.input(referralWorkspaceInput).query(({ctx,input}) => guarded(() => readReferralWorkspace(ctx.user.id,ctx.merchantId,input))),
 getMyCode: merchantProcedure.input(z.undefined()).query(({ctx}) => guarded(() => getMerchantInvitation(ctx.user.id,ctx.merchantId))),
 getMyReferrals: merchantProcedure.input(z.undefined()).query(({ctx}) => guarded(() => readReferralLegacy(ctx.user.id,ctx.merchantId,'referrals'))),
 getMyRewards: merchantProcedure.input(z.undefined()).query(({ctx}) => guarded(() => readReferralLegacy(ctx.user.id,ctx.merchantId,'rewards'))),
 getStats: merchantProcedure.input(z.undefined()).query(({ctx}) => guarded(() => readReferralLegacyStats(ctx.user.id,ctx.merchantId))),
 createInvitation: permissionProcedure('subscription.manage').input(referralCreateInput).mutation(({ctx,input}) => guarded(() => createMerchantInvitation(ctx.user.id,ctx.merchantId,input))),
 reviewInvitation: permissionProcedure('subscription.manage').input(referralInvitationInput).mutation(({ctx,input}) => {limitInvitation(ctx.user.id,ctx.merchantId);return guarded(() => reviewMerchantInvitation(ctx.user.id,ctx.merchantId,input));}),
 applyReferralCode: permissionProcedure('subscription.manage').input(referralApplyInput).mutation(async({ctx,input}) => {
  limitInvitation(ctx.user.id,ctx.merchantId);
  const result = await guarded(() => applyMerchantInvitation(ctx.user.id,ctx.merchantId,input));
  // Preserve the existing post-commit best-effort notice once; replay never resends it.
  if (!result.replayed) try {
   const { getMerchantById, getUserById } = await import('./db');
   const [referrer, referred] = await Promise.all([getMerchantById(result.referrerMerchantId), getMerchantById(ctx.merchantId)]);
   if (referrer && referred) {
    const { notifyOwner } = await import('./_core/notification'), { notifyNewReferral } = await import('./_core/emailNotifications');
    await notifyOwner({ title: 'إحالة جديدة!', content: `${referrer.businessName} حصل على إحالة جديدة من ${referred.businessName}` });
    const user = await getUserById(referred.userId);
    await notifyNewReferral({ referrerName: referrer.businessName, referrerBusiness: referrer.businessName, newMerchantName: referred.businessName, newMerchantEmail: user?.email || '', referralCode: input.code, referredAt: new Date() });
   }
  } catch { console.warn('[referrals] Post-commit notification unavailable'); }
  return result;
 }),
 claimReward: permissionProcedure('subscription.manage').input(referralClaimInput).mutation(({ctx,input}) => guarded(() => recordMerchantRewardClaim(ctx.user.id,ctx.merchantId,input))),
});
export type ReferralsRouter = typeof referralsRouter;
