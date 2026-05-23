/**
 * Referrals Router Module
 * Handles referral code and rewards management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  claimReward,
  createReferral,
  createReward,
  generateReferralCode,
  getMerchantById,
  getMerchantByUserId,
  getReferralCodeByCode,
  getReferralCodeByMerchantId,
  getReferralStats,
  getReferralsWithDetails,
  getRewardById,
  getRewardsByMerchantId,
  getUserById,
  incrementReferralCount,
} from './db';

export const referralsRouter = router({
    // Get my referral code (auto-generate if doesn't exist)
    getMyCode: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        let code = await getReferralCodeByMerchantId(merchant.id);

        if (!code) {
            code = await generateReferralCode(
                merchant.id,
                merchant.businessName,
                merchant.phone || ''
            );
        }

        return code;
    }),

    // Get my referrals list
    getMyReferrals: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getReferralsWithDetails(merchant.id);
    }),

    // Get my rewards
    getMyRewards: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getRewardsByMerchantId(merchant.id);
    }),

    // Get referral statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getReferralStats(merchant.id);
    }),

    // Apply referral code during signup — SEC-W4 FIX: Now protectedProcedure, derives merchantId from auth
    applyReferralCode: protectedProcedure
        .input(z.object({
            code: z.string().max(50),
        }))
        .mutation(async ({ input, ctx }) => {
            // Rate limit
            const { checkRateLimit } = await import('./_core/rateLimiter');
            const clientIp = (ctx as any).req?.ip || (ctx as any).req?.socket?.remoteAddress || 'unknown';
            const check = checkRateLimit(`referral_apply:${clientIp}`, 5, 3600000); // 5 per hour
            if (!check.allowed) {
                throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'حاول لاحقاً.' });
            }

            // Derive merchant from authenticated user — not from client input
            const referredMerchant = await getMerchantByUserId(ctx.user.id);
            if (!referredMerchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const referralCode = await getReferralCodeByCode(input.code);
            if (!referralCode || !referralCode.isActive) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'كود الإحالة غير صحيح' });
            }

            // FIX #12: Prevent self-referral
            if (referralCode.merchantId === referredMerchant.id) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك إحالة نفسك' });
            }

            const referral = await createReferral({
                referralCodeId: referralCode.id,
                referredPhone: referredMerchant.phone || '',
                referredName: referredMerchant.businessName,
                orderCompleted: 0,
            });

            if (!referral) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل تسجيل الإحالة' });
            }

            await incrementReferralCount(referralCode.id);

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 90);

            await createReward({
                merchantId: referralCode.merchantId,
                referralId: referral.id,
                rewardType: 'discount_10',
                status: 'pending',
                expiresAt: expiresAt as any,
                description: `خصم 10% على الاشتراك القادم لإحالة ${referredMerchant.businessName}`,
            });

            // Notifications
            try {
                const { notifyOwner } = await import('./_core/notification');
                const { notifyNewReferral } = await import('./_core/emailNotifications');
                const referrer = await getMerchantById(referralCode.merchantId);
                if (referrer) {
                    await notifyOwner({
                        title: 'إحالة جديدة!',
                        content: `${referrer.businessName} حصل على إحالة جديدة من ${referredMerchant.businessName}`,
                    });

                    const referredUser = await getUserById(referredMerchant.userId);
                    await notifyNewReferral({
                        referrerName: referrer.businessName,
                        referrerBusiness: referrer.businessName,
                        newMerchantName: referredMerchant.businessName,
                        newMerchantEmail: referredUser?.email || '',
                        referralCode: input.code,
                        referredAt: new Date(),
                    });
                }
            } catch (error) {
                console.error('Failed to send referral notification:', error);
            }

            return { success: true, message: 'تم تطبيق كود الإحالة بنجاح' };
        }),

    // Claim a reward
    claimReward: protectedProcedure
        .input(z.object({ rewardId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const reward = await getRewardById(input.rewardId);
            if (!reward || reward.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            if (reward.status !== 'pending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'المكافأة غير متاحة' });
            }

            if (new Date() > new Date(reward.expiresAt)) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'المكافأة منتهية الصلاحية' });
            }

            await claimReward(input.rewardId);

            return { success: true, message: 'تم استخدام المكافأة بنجاح' };
        }),
});

export type ReferralsRouter = typeof referralsRouter;
