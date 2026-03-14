/**
 * Subscriptions Router Module
 * Handles subscription management and usage tracking
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const subscriptionsRouter = router({
    // Get current subscription
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            return null;
        }
        return db.getActiveSubscriptionByMerchantId(merchant.id);
    }),

    // Get usage statistics
    getUsage: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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

    // Create subscription
    create: protectedProcedure
        .input(z.object({
            planId: z.number(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const plan = await db.getPlanById(input.planId);
            if (!plan) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
            }

            const existing = await db.getActiveSubscriptionByMerchantId(merchant.id);
            if (existing) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Active subscription already exists' });
            }

            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 1);

            const subscription = await db.createSubscription({
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
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const subscription = await db.getActiveSubscriptionByMerchantId(merchant.id);
            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found' });
            }

            await db.updateSubscription(subscription.id, {
                status: 'cancelled',
                autoRenew: false,
            });

            return { success: true, message: 'تم إلغاء الاشتراك' };
        }),

    // FIX #15: Upgrade/change plan
    changePlan: protectedProcedure
        .input(z.object({ planId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const plan = await db.getPlanById(input.planId);
            if (!plan) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
            }

            const subscription = await db.getActiveSubscriptionByMerchantId(merchant.id);
            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found' });
            }

            await db.updateSubscription(subscription.id, {
                planId: input.planId,
            });

            return { success: true, message: 'تم تغيير الخطة' };
        }),
});

export type SubscriptionsRouter = typeof subscriptionsRouter;
