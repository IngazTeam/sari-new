/**
 * Subscriptions Router Module
 * Handles subscription management and usage tracking
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import {
  createSubscription,
  getActiveSubscriptionByMerchantId,
  getMerchantByUserId,
  getPlanById,
  updateSubscription,
} from './db';

export const subscriptionsRouter = router({
    // Get current subscription
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            return null;
        }
        return getActiveSubscriptionByMerchantId(merchant.id);
    }),

    // Get usage statistics
    getUsage: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { getUsageStats } = await import('./usage-tracking');
        const stats = await getUsageStats(merchant.id);

        if (!stats) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found' });
        }

        return stats;
    }),

    // Create subscription (Admin only — SEC-01 FIX: was protectedProcedure, allowed free activation)
    create: adminProcedure
        .input(z.object({
            planId: z.number(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const plan = await getPlanById(input.planId);
            if (!plan) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
            }

            const existing = await getActiveSubscriptionByMerchantId(merchant.id);
            if (existing) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Active subscription already exists' });
            }

            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 1);

            const subscription = await createSubscription({
                merchantId: merchant.id,
                planId: input.planId,
                status: 'active', // FIX #6: was 'pending' with no activation path
                conversationsUsed: 0,
                voiceMessagesUsed: 0,
                startDate,
                endDate,
                autoRenew: true,
            });

            return subscription;
        }),

    // FIX #15: Cancel subscription
    cancel: protectedProcedure
        .mutation(async ({ ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const subscription = await getActiveSubscriptionByMerchantId(merchant.id);
            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found' });
            }

            await updateSubscription(subscription.id, {
                status: 'cancelled',
                autoRenew: false,
            });

            return { success: true, message: 'تم إلغاء الاشتراك' };
        }),

    // FIX #15: Upgrade/change plan (Admin only — SEC-02 FIX: was protectedProcedure, allowed free upgrades)
    changePlan: adminProcedure
        .input(z.object({ planId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const plan = await getPlanById(input.planId);
            if (!plan) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
            }

            const subscription = await getActiveSubscriptionByMerchantId(merchant.id);
            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found' });
            }

            await updateSubscription(subscription.id, {
                planId: input.planId,
            });

            return { success: true, message: 'تم تغيير الخطة' };
        }),
});

export type SubscriptionsRouter = typeof subscriptionsRouter;
