/**
 * Merchants Router Module
 * Handles merchant profile and management operations
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 * The original code in routers.ts remains unchanged.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { syncGreenAPIData } from "./data-sync/green-api-sync";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
    }
    return next({ ctx });
});

export const merchantsRouter = router({
    // Get current merchant for logged-in user
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        return merchant;
    }),

    // Create merchant profile
    create: protectedProcedure
        .input(z.object({
            businessName: z.string().min(1),
            phone: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const existing = await db.getMerchantByUserId(ctx.user.id);
            if (existing) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Merchant profile already exists' });
            }

            const merchant = await db.createMerchant({
                userId: ctx.user.id,
                businessName: input.businessName,
                phone: input.phone || null,
                status: 'pending',
            });

            return merchant;
        }),

    // Update merchant profile
    update: protectedProcedure
        .input(z.object({
            businessName: z.string().optional(),
            phone: z.string().optional(),
            autoReplyEnabled: z.boolean().optional(),
            currency: z.enum(['SAR', 'USD']).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            await db.updateMerchant(merchant.id, input);
            return { success: true };
        }),

    // Get all merchants (Admin only)
    list: adminProcedure.query(async () => {
        return await db.getAllMerchants();
    }),

    // Update merchant status (Admin only)
    updateStatus: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            status: z.enum(['active', 'suspended', 'pending']),
        }))
        .mutation(async ({ input }) => {
            await db.updateMerchant(input.merchantId, { status: input.status });
            return { success: true };
        }),

    // Get merchant by ID (Admin only)
    getById: adminProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input }) => {
            return await db.getMerchantById(input.merchantId);
        }),

    // Get merchant subscriptions (Admin only)
    getSubscriptions: adminProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input }) => {
            const subscription = await db.getActiveSubscriptionByMerchantId(input.merchantId);
            return subscription ? [subscription] : [];
        }),

    // Get merchant campaigns (Admin only)
    getCampaigns: adminProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input }) => {
            return await db.getCampaignsByMerchantId(input.merchantId);
        }),

    // Sync Green API data (Admin only)
    syncGreenAPIData: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            instanceId: z.string(),
            token: z.string(),
            syncChats: z.boolean().default(true),
            syncMessages: z.boolean().default(true),
            limit: z.number().default(100),
        }))
        .mutation(async ({ input }) => {
            try {
                const result = await syncGreenAPIData(
                    input.merchantId.toString(),
                    input.instanceId,
                    input.token,
                    {
                        syncChats: input.syncChats,
                        syncMessages: input.syncMessages,
                        limit: input.limit,
                    }
                );
                return result;
            } catch (error) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: `Failed to sync Green API data: ${error}`,
                });
            }
        }),

    // Get current plan for merchant
    getCurrentPlan: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const subscription = await db.getActiveSubscriptionByMerchantId(merchant.id);
        if (!subscription) {
            return null;
        }

        const plan = await db.getPlanById(subscription.planId);
        return {
            subscription,
            plan,
        };
    }),

    // Request plan upgrade
    requestUpgrade: protectedProcedure
        .input(z.object({ planId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            if (merchant.status !== 'active') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant account is not active' });
            }

            const plan = await db.getPlanById(input.planId);
            if (!plan || !plan.isActive) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found or inactive' });
            }

            const currentSubscription = await db.getActiveSubscriptionByMerchantId(merchant.id);

            if (!currentSubscription) {
                const startDate = new Date();
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 30);

                await db.createSubscription({
                    merchantId: merchant.id,
                    planId: input.planId,
                    status: 'active',
                    startDate,
                    endDate,
                });

                const { notifyOwner } = await import('./_core/notification');
                const { notifyNewSubscription } = await import('./_core/emailNotifications');
                const user = await db.getUserById(merchant.userId);

                try {
                    await notifyNewSubscription({
                        merchantName: user?.name || merchant.businessName,
                        businessName: merchant.businessName,
                        planName: plan?.name || 'Unknown Plan',
                        planPrice: plan?.price || 0,
                        billingCycle: plan?.billingCycle || 'monthly',
                        subscribedAt: new Date(),
                    });
                } catch (error) {
                    console.error('Failed to send new subscription notification:', error);
                }

                await notifyOwner({
                    title: 'اشتراك جديد',
                    content: `التاجر ${merchant.businessName} اشترك في الباقة ${plan.nameAr}`,
                });

                return { success: true, message: 'تم الاشتراك بنجاح' };
            }

            if (currentSubscription.planId === input.planId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'You are already subscribed to this plan' });
            }

            await db.updateSubscription(currentSubscription.id, {
                planId: input.planId,
                startDate: new Date(),
            });

            const currentPlan = await db.getPlanById(currentSubscription.planId);
            const { notifyOwner } = await import('./_core/notification');
            await notifyOwner({
                title: 'ترقية باقة',
                content: `التاجر ${merchant.businessName} قام بالترقية من ${currentPlan?.nameAr} إلى ${plan.nameAr}`,
            });

            return { success: true, message: 'تم الترقية بنجاح' };
        }),

    // Get onboarding status
    getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return await db.getOnboardingStatus(merchant.id);
    }),

    // Update onboarding step
    updateOnboardingStep: protectedProcedure
        .input(z.object({ step: z.number().min(0).max(4) }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            await db.updateOnboardingStep(merchant.id, input.step);
            return { success: true };
        }),

    // Complete onboarding
    completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        await db.completeOnboarding(merchant.id);
        return { success: true };
    }),
});

export type MerchantsRouter = typeof merchantsRouter;
