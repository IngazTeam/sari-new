/**
 * Referrals Router Module
 * Handles referral code and rewards management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const referralsRouter = router({
    // Get my referral code (auto-generate if doesn't exist)
    getMyCode: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        let code = await db.getReferralCodeByMerchantId(merchant.id);

        if (!code) {
            code = await db.generateReferralCode(
                merchant.id,
                merchant.businessName,
                merchant.phone || ''
            );
        }

        return code;
    }),

    // Get my referrals list
    getMyReferrals: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getReferralsWithDetails(merchant.id);
    }),

    // Get my rewards
    getMyRewards: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getRewardsByMerchantId(merchant.id);
    }),

    // Get referral statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getReferralStats(merchant.id);
    }),

    // Apply referral code during signup
    applyReferralCode: publicProcedure
        .input(z.object({
            code: z.string(),
            referredMerchantId: z.number(),
        }))
        .mutation(async ({ input }) => {
            const referralCode = await db.getReferralCodeByCode(input.code);
            if (!referralCode || !referralCode.isActive) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'كود الإحالة غير صحيح' });
            }

            const referredMerchant = await db.getMerchantById(input.referredMerchantId);
            if (!referredMerchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const referral = await db.createReferral({
                referralCodeId: referralCode.id,
                referredPhone: referredMerchant.phone || '',
                referredName: referredMerchant.businessName,
                orderCompleted: false,
            });

            if (!referral) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل تسجيل الإحالة' });
            }

            await db.incrementReferralCount(referralCode.id);

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 90);

            await db.createReward({
                merchantId: referralCode.merchantId,
                referralId: referral.id,
                rewardType: 'discount_10',
                status: 'pending',
                expiresAt,
                description: `خصم 10% على الاشتراك القادم لإحالة ${referredMerchant.businessName}`,
            });

            // Notifications
            try {
                const { notifyOwner } = await import('./_core/notification');
                const { notifyNewReferral } = await import('./_core/emailNotifications');
                const referrer = await db.getMerchantById(referralCode.merchantId);
                if (referrer) {
                    await notifyOwner({
                        title: 'إحالة جديدة!',
                        content: `${referrer.businessName} حصل على إحالة جديدة من ${referredMerchant.businessName}`,
                    });

                    const referredUser = await db.getUserById(referredMerchant.userId);
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
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const reward = await db.getRewardById(input.rewardId);
            if (!reward || reward.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            if (reward.status !== 'pending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'المكافأة غير متاحة' });
            }

            if (new Date() > new Date(reward.expiresAt)) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'المكافأة منتهية الصلاحية' });
            }

            await db.claimReward(input.rewardId);

            return { success: true, message: 'تم استخدام المكافأة بنجاح' };
        }),
});

export type ReferralsRouter = typeof referralsRouter;
