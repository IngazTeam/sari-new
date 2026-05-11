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
            // Use merchant_subscriptions table (not legacy subscriptions table)
            const subscription = await db.getMerchantCurrentSubscription(input.merchantId);
            if (subscription) {
                // Enrich with plan name
                const plan = subscription.planId ? await db.getSubscriptionPlanById(subscription.planId) : null;
                return [{ ...subscription, planName: plan?.name || 'غير معروف' }];
            }
            return [];
        }),

    // ============================================
    // Admin Subscription Management
    // ============================================

    // Assign/Activate subscription for a merchant (Admin only)
    assignSubscription: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            planId: z.number(),
            durationDays: z.number().int().min(1).max(730).default(30),
            billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
        }))
        .mutation(async ({ input }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const plan = await db.getSubscriptionPlanById(input.planId);
            if (!plan) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
            }

            // PEN-04 FIX: Ensure plan is active
            if (!plan.isActive) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot assign an inactive plan' });
            }

            // Cancel any existing active subscription
            const existing = await db.getMerchantCurrentSubscription(input.merchantId);
            if (existing) {
                await db.cancelMerchantSubscription(existing.id, 'تم استبداله بتفعيل يدوي من الأدمن');
            }

            // Create new subscription
            const now = new Date();
            const endDate = new Date(now.getTime() + input.durationDays * 24 * 60 * 60 * 1000);

            const subscriptionId = await db.createMerchantSubscription({
                merchantId: input.merchantId,
                planId: input.planId,
                status: 'active',
                billingCycle: input.billingCycle,
                startDate: now.toISOString(),
                endDate: endDate.toISOString(),
                autoRenew: 0,
            });

            // Update merchant status and limits
            await db.updateMerchantSubscriptionStatus(input.merchantId, 'active');
            await db.updateMerchantCustomerLimit(input.merchantId, plan.maxCustomers);
            await db.updateMerchant(input.merchantId, { status: 'active' });

            console.log(`[Admin] Subscription assigned: merchant=${input.merchantId}, plan=${plan.name}, duration=${input.durationDays}d`);

            return {
                success: true,
                subscriptionId,
                planName: plan.name,
                startDate: now.toISOString(),
                endDate: endDate.toISOString(),
            };
        }),

    // Extend subscription duration (Admin only)
    extendSubscription: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            extraDays: z.number().min(1).max(365),
        }))
        .mutation(async ({ input }) => {
            const subscription = await db.getMerchantCurrentSubscription(input.merchantId);
            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found for this merchant' });
            }

            const currentEnd = new Date(subscription.endDate);
            const newEnd = new Date(currentEnd.getTime() + input.extraDays * 24 * 60 * 60 * 1000);

            await db.updateMerchantSubscription(subscription.id, {
                endDate: newEnd.toISOString(),
            });

            console.log(`[Admin] Subscription extended: merchant=${input.merchantId}, +${input.extraDays}d, new end=${newEnd.toISOString()}`);

            return {
                success: true,
                previousEndDate: currentEnd.toISOString(),
                newEndDate: newEnd.toISOString(),
            };
        }),

    // Cancel merchant subscription (Admin only)
    cancelMerchantSubscription: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            reason: z.string().max(500).optional(), // PEN-05 FIX: limit length
        }))
        .mutation(async ({ input }) => {
            const subscription = await db.getMerchantCurrentSubscription(input.merchantId);
            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found' });
            }

            await db.cancelMerchantSubscription(subscription.id, input.reason || 'تم الإلغاء بواسطة الأدمن');
            // SEC-07 FIX: DB enum is ['none','trial','active','expired'] — 'cancelled' doesn't exist
            await db.updateMerchantSubscriptionStatus(input.merchantId, 'expired');

            console.log(`[Admin] Subscription cancelled: merchant=${input.merchantId}, reason=${input.reason || 'admin action'}`);

            return { success: true };
        }),

    // Get all plans (Admin helper - for the assign dropdown)
    getAvailablePlans: adminProcedure.query(async () => {
        return await db.getActiveSubscriptionPlans();
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
                // SEC-06 FIX: Don't expose raw error details
                console.error('[Merchants] Green API sync failed:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'فشل مزامنة بيانات Green API. تحقق من بيانات الاتصال.',
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

    // Request plan upgrade — PEN-01/PEN-03 FIX: no free subscriptions
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

            // PEN-01 FIX: If no subscription, redirect to payment flow instead of free activation
            if (!currentSubscription) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'لا يوجد اشتراك نشط. يرجى الاشتراك عبر صفحة الباقات.',
                });
            }

            if (currentSubscription.planId === input.planId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'You are already subscribed to this plan' });
            }

            // PEN-03 FIX: Block free plan changes — must go through payment/admin
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'لتغيير الباقة، يرجى التواصل مع الدعم أو استخدام صفحة الترقية مع الدفع.',
            });
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
