/**
 * Subscription Management APIs
 * 
 * This module contains all tRPC procedures related to subscription management,
 * including plans, addons, merchant subscriptions, and payments.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  TAP_CHARGE_ID_PATTERN,
  toPublicSubscriptionPaymentStatus,
} from '@shared/subscription-payment-status';
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  cancelMerchantAddon,
  cancelMerchantSubscription,
  checkMerchantSubscriptionStatus,
  createMerchantAddon,
  createOrReusePaymentTransactionForCheckout,
  createSubscriptionAddon,
  createSubscriptionPlan,
  createTapSettings,
  deleteSubscriptionAddon,
  deleteSubscriptionPlan,
  extendMerchantSubscription,
  getActiveSubscriptionAddons,
  getActiveSubscriptionPlans,
  getAllPaymentTransactions,
  getAllSubscriptionPlans,
  getMerchantActiveAddons,
  getMerchantAddonById,
  getMerchantByUserId,
  getMerchantCurrentSubscription,
  getMerchantDaysRemaining,
  getMerchantPaymentTransactions,
  getMerchantSubscriptionStats,
  getPaymentStats,
  getPaymentTransactionById,
  getPaymentTransactionByTapChargeId,
  getSubscriptionAddonById,
  getSubscriptionPlanById,
  getTapSettings,
  getUserById,
  reorderSubscriptionPlans,
  updateSubscriptionAddon,
  updateSubscriptionPlan,
  updateTapSettings,
} from '../db';
import { calculateProration } from "../_core/subscriptionManager";
import {
  completeImmediateCanonicalPlanChange,
  startCanonicalTrial,
} from '../subscriptions/canonical-state';
import { tapKeyMatchesMode, tapPublicKeyMatchesMode } from '../payment/payment-link-policy';
import {
  toPlatformTapSettingsView,
  verifyPlatformTapCredentialsSnapshot,
} from '../payment/platform-tap-settings';
import {
  createPlatformSubscriptionTapCharge,
  SubscriptionTapCheckoutError,
} from '../payment/subscription-tap-checkout';

function assertBillableAmount(amount: number, currency: string): { amount: number; currency: string } {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid billable amount' });
  }
  if (!['SAR', 'USD'].includes(normalizedCurrency)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported billing currency' });
  }
  return { amount: Math.round(amount * 100) / 100, currency: normalizedCurrency };
}

function subscriptionCheckoutError(error: unknown): TRPCError {
  if (error instanceof Error && error.message === 'CHECKOUT_ATTEMPT_CONFLICT') {
    return new TRPCError({ code: 'CONFLICT', message: 'محاولة الدفع مرتبطة بطلب مختلف؛ أعد تحميل الصفحة' });
  }
  if (error instanceof SubscriptionTapCheckoutError) {
    if (error.failure === 'gateway_not_ready') {
      return new TRPCError({ code: 'BAD_REQUEST', message: 'بوابة الدفع غير جاهزة حالياً' });
    }
    if (error.failure === 'attempt_already_finished' || error.failure === 'charge_identity_conflict') {
      return new TRPCError({ code: 'CONFLICT', message: 'تعذر إعادة استخدام محاولة الدفع؛ أعد تحميل الصفحة' });
    }
    return new TRPCError({ code: 'BAD_GATEWAY', message: 'تعذر إنشاء جلسة الدفع؛ حاول مرة أخرى' });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر بدء عملية الدفع' });
}

// ============================================
// Subscription Plans Router
// ============================================

export const subscriptionPlansRouter = router({
  // List all plans (public - for display)
  listPlans: publicProcedure.query(async () => {
    return await getActiveSubscriptionPlans();
  }),

  // List all plans (admin - with all details)
  adminListPlans: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .query(async () => {
      return await getAllSubscriptionPlans();
    }),

  // Create plan
  createPlan: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      name: z.string(),
      nameEn: z.string(),
      description: z.string().optional(),
      descriptionEn: z.string().optional(),
      monthlyPrice: z.string(),
      yearlyPrice: z.string(),
      currency: z.string().default('SAR'),
      maxCustomers: z.number(),
      maxWhatsAppNumbers: z.number().default(1),
      features: z.string().optional(),
      isActive: z.number().default(1),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const planId = await createSubscriptionPlan(input);
      return { success: true, planId };
    }),

  // Update plan
  updatePlan: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      nameEn: z.string().optional(),
      description: z.string().optional(),
      descriptionEn: z.string().optional(),
      monthlyPrice: z.string().optional(),
      yearlyPrice: z.string().optional(),
      currency: z.string().optional(),
      maxCustomers: z.number().optional(),
      maxWhatsAppNumbers: z.number().optional(),
      features: z.string().optional(),
      isActive: z.number().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateSubscriptionPlan(id, data);
      return { success: true };
    }),

  // Delete plan
  deletePlan: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteSubscriptionPlan(input.id);
      return { success: true };
    }),

  // Toggle plan status
  togglePlanStatus: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      id: z.number(),
      isActive: z.number(),
    }))
    .mutation(async ({ input }) => {
      await updateSubscriptionPlan(input.id, { isActive: input.isActive });
      return { success: true };
    }),

  // Reorder plans
  reorderPlans: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      planIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      await reorderSubscriptionPlans(input.planIds);
      return { success: true };
    }),
});

// ============================================
// Subscription Addons Router
// ============================================

export const subscriptionAddonsRouter = router({
  // List all addons
  listAddons: publicProcedure.query(async () => {
    return await getActiveSubscriptionAddons();
  }),

  // Create addon
  createAddon: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      name: z.string(),
      nameEn: z.string(),
      description: z.string().optional(),
      descriptionEn: z.string().optional(),
      type: z.enum(['extra_whatsapp', 'extra_customers', 'custom']),
      monthlyPrice: z.string(),
      yearlyPrice: z.string(),
      currency: z.string().default('SAR'),
      value: z.number(),
      isActive: z.number().default(1),
    }))
    .mutation(async ({ input }) => {
      const addonId = await createSubscriptionAddon(input);
      return { success: true, addonId };
    }),

  // Update addon
  updateAddon: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      nameEn: z.string().optional(),
      description: z.string().optional(),
      descriptionEn: z.string().optional(),
      type: z.enum(['extra_whatsapp', 'extra_customers', 'custom']).optional(),
      monthlyPrice: z.string().optional(),
      yearlyPrice: z.string().optional(),
      currency: z.string().optional(),
      value: z.number().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateSubscriptionAddon(id, data);
      return { success: true };
    }),

  // Delete addon
  deleteAddon: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteSubscriptionAddon(input.id);
      return { success: true };
    }),

  // Toggle addon status
  toggleAddonStatus: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      id: z.number(),
      isActive: z.number(),
    }))
    .mutation(async ({ input }) => {
      await updateSubscriptionAddon(input.id, { isActive: input.isActive });
      return { success: true };
    }),

  // Get addon by ID
  getAddonById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getSubscriptionAddonById(input.id);
    }),
});

// ============================================
// Merchant Subscriptions Router
// ============================================

export const merchantSubscriptionRouter = router({
  // Get current subscription
  getCurrentSubscription: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    const subscription = await getMerchantCurrentSubscription(merchant.id);
    
    if (!subscription) {
      return null;
    }

    // Get plan details
    const plan = subscription.planId ? await getSubscriptionPlanById(subscription.planId) : null;

    // Calculate days remaining
    const daysRemaining = await getMerchantDaysRemaining(merchant.id);

    return {
      ...subscription,
      plan,
      daysRemaining,
    };
  }),

  // Start trial
  startTrial: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    try {
      const trial = await startCanonicalTrial(merchant.id);
      return { success: true, ...trial };
    } catch (error) {
      if (error instanceof Error && error.message === 'TRIAL_ALREADY_USED_OR_SUBSCRIBED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trial already used or subscription active' });
      }
      throw error;
    }
  }),

  // Subscribe to a plan
  subscribe: protectedProcedure
    .input(z.object({
      planId: z.number().int().positive(),
      billingCycle: z.enum(['monthly', 'yearly']),
      checkoutAttemptId: z.string().uuid(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get plan details
      const plan = await getSubscriptionPlanById(input.planId);
      if (!plan || plan.isActive !== 1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      // Calculate amount
      const selectedAmount = input.billingCycle === 'monthly'
        ? parseFloat(plan.monthlyPrice)
        : parseFloat(plan.yearlyPrice);
      const { amount, currency } = assertBillableAmount(selectedAmount, plan.currency);

      try {
        const { transaction } = await createOrReusePaymentTransactionForCheckout({
          merchantId: merchant.id,
          subscriptionId: null,
          type: 'subscription',
          amount: amount.toFixed(2),
          currency,
          status: 'pending',
          paymentMethod: 'tap',
          checkoutAttemptId: input.checkoutAttemptId,
          metadata: JSON.stringify({
            planId: input.planId,
            billingCycle: input.billingCycle,
          }),
        });
        const checkout = await createPlatformSubscriptionTapCharge({
          transaction,
          merchantId: merchant.id,
          checkoutAttemptId: input.checkoutAttemptId,
          amount,
          currency,
          customerName: merchant.businessName,
          customerEmail: ctx.user.email,
          customerPhone: merchant.phone,
          description: `Subscription to ${plan.name} (${input.billingCycle})`,
        });

        return {
          success: true,
          transactionId: transaction.id,
          paymentUrl: checkout.paymentUrl,
          chargeId: checkout.chargeId,
        };
      } catch (error) {
        throw subscriptionCheckoutError(error);
      }
    }),

  // Upgrade plan
  upgradePlan: protectedProcedure
    .input(z.object({
      newPlanId: z.number().int().positive(),
      newBillingCycle: z.enum(['monthly', 'yearly']),
      checkoutAttemptId: z.string().uuid(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get current subscription
      const currentSubscription = await getMerchantCurrentSubscription(merchant.id);
      if (!currentSubscription) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active subscription found' });
      }

      const newPlan = await getSubscriptionPlanById(input.newPlanId);
      if (!newPlan || newPlan.isActive !== 1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      // Calculate proration
      const selectedPrice = input.newBillingCycle === 'monthly'
        ? Number(newPlan.monthlyPrice)
        : Number(newPlan.yearlyPrice);
      const proration = currentSubscription.planId
        ? await calculateProration(currentSubscription.id, input.newPlanId, input.newBillingCycle)
        : {
            proratedAmount: selectedPrice,
            daysUsed: 0,
            daysRemaining: 0,
            oldPlanDailyRate: 0,
            newPlanDailyRate: selectedPrice / (input.newBillingCycle === 'monthly' ? 30 : 365),
            creditAmount: 0,
            chargeAmount: selectedPrice,
          };
      const currency = newPlan.currency.trim().toUpperCase();
      if (!['SAR', 'USD'].includes(currency)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported billing currency' });
      }
      const payable = proration.chargeAmount > 0
        ? assertBillableAmount(proration.chargeAmount, currency)
        : { amount: 0, currency };

      try {
        const { transaction } = await createOrReusePaymentTransactionForCheckout({
          merchantId: merchant.id,
          subscriptionId: currentSubscription.id,
          type: payable.amount === 0 ? 'downgrade' : 'upgrade',
          amount: payable.amount.toFixed(2),
          currency: payable.currency,
          status: 'pending',
          paymentMethod: 'tap',
          checkoutAttemptId: input.checkoutAttemptId,
          metadata: JSON.stringify({
            newPlanId: input.newPlanId,
            newBillingCycle: input.newBillingCycle,
            proration,
            previousPlanId: currentSubscription.planId,
            previousBillingCycle: currentSubscription.billingCycle,
            previousStartDate: currentSubscription.startDate,
            previousEndDate: currentSubscription.endDate,
            previousStatus: currentSubscription.status,
          }),
        });

        if (payable.amount === 0) {
          if (transaction.status === 'pending') {
            await completeImmediateCanonicalPlanChange(transaction.id, merchant.id);
          } else if (transaction.status !== 'completed') {
            throw new SubscriptionTapCheckoutError('attempt_already_finished');
          }
          return { success: true, immediate: true };
        }

        const checkout = await createPlatformSubscriptionTapCharge({
          transaction,
          merchantId: merchant.id,
          checkoutAttemptId: input.checkoutAttemptId,
          amount: payable.amount,
          currency: payable.currency,
          customerName: merchant.businessName,
          customerEmail: ctx.user.email,
          customerPhone: merchant.phone,
          description: `Upgrade to ${newPlan.name} (${input.newBillingCycle})`,
        });

        return {
          success: true,
          transactionId: transaction.id,
          paymentUrl: checkout.paymentUrl,
          chargeId: checkout.chargeId,
          proratedAmount: payable.amount,
        };
      } catch (error) {
        throw subscriptionCheckoutError(error);
      }
    }),

  // Cancel subscription
  cancelSubscription: protectedProcedure
    .input(z.object({
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const subscription = await getMerchantCurrentSubscription(merchant.id);
      if (!subscription) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active subscription found' });
      }

      await cancelMerchantSubscription(subscription.id, input.reason);

      return { success: true };
    }),

  // Get days remaining
  getDaysRemaining: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    const daysRemaining = await getMerchantDaysRemaining(merchant.id);
    return { daysRemaining };
  }),

  // Check subscription status (including trial)
  checkStatus: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    const subscription = await getMerchantCurrentSubscription(merchant.id);
    const isActive = Boolean(subscription);
    return {
      isActive,
      reason: isActive
        ? subscription?.status === 'trial' ? 'الفترة التجريبية نشطة' : 'اشتراك نشط'
        : 'لا يوجد اشتراك نشط. يرجى الاشتراك في باقة للوصول إلى هذه الميزة.',
      isTrial: subscription?.status === 'trial',
    };
  }),
});

// ============================================
// Merchant Addons Router
// ============================================

export const merchantAddonsRouter = router({
  // List my addons
  listMyAddons: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    const addons = await getMerchantActiveAddons(merchant.id);

    // Get addon details for each
    const addonsWithDetails = await Promise.all(
      addons.map(async (addon) => {
        const addonDetails = await getSubscriptionAddonById(addon.addonId);
        return {
          ...addon,
          addonDetails,
        };
      })
    );

    return addonsWithDetails;
  }),

  // Purchase addon
  purchaseAddon: protectedProcedure
    .input(z.object({
      addonId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(100).default(1),
      billingCycle: z.enum(['monthly', 'yearly']),
      checkoutAttemptId: z.string().uuid(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get addon details
      const addon = await getSubscriptionAddonById(input.addonId);
      if (!addon || addon.isActive !== 1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Addon not found' });
      }

      // Calculate amount
      const unitPrice = input.billingCycle === 'monthly'
        ? parseFloat(addon.monthlyPrice)
        : parseFloat(addon.yearlyPrice);
      const totalAmount = unitPrice * input.quantity;
      const billable = assertBillableAmount(totalAmount, addon.currency);

      // Get current subscription
      const subscription = await getMerchantCurrentSubscription(merchant.id);
      if (!subscription) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Active subscription required' });
      }

      try {
        const { transaction } = await createOrReusePaymentTransactionForCheckout({
          merchantId: merchant.id,
          subscriptionId: subscription.id,
          type: 'addon',
          amount: billable.amount.toFixed(2),
          currency: billable.currency,
          status: 'pending',
          paymentMethod: 'tap',
          checkoutAttemptId: input.checkoutAttemptId,
          metadata: JSON.stringify({
            addonId: input.addonId,
            quantity: input.quantity,
            billingCycle: input.billingCycle,
          }),
        });
        const checkout = await createPlatformSubscriptionTapCharge({
          transaction,
          merchantId: merchant.id,
          checkoutAttemptId: input.checkoutAttemptId,
          amount: billable.amount,
          currency: billable.currency,
          customerName: merchant.businessName,
          customerEmail: ctx.user.email,
          customerPhone: merchant.phone,
          description: `Purchase ${addon.name} x${input.quantity}`,
        });

        return {
          success: true,
          transactionId: transaction.id,
          paymentUrl: checkout.paymentUrl,
          chargeId: checkout.chargeId,
        };
      } catch (error) {
        throw subscriptionCheckoutError(error);
      }
    }),

  // Cancel addon
  cancelAddon: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Verify addon belongs to merchant
      const addon = await getMerchantAddonById(input.id);
      if (!addon || addon.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Addon not found or access denied' });
      }

      await cancelMerchantAddon(input.id);
      return { success: true };
    }),
});

// ============================================
// Payment Router
// ============================================

export const paymentRouter = router({
  // Browser redirects are presentation-only. The signed Tap webhook is the
  // sole authority allowed to commit payment and entitlement transitions.
  getPaymentCallbackStatus: publicProcedure
    .input(z.object({
      tap_id: z.string().trim().regex(TAP_CHARGE_ID_PATTERN),
    }).strict())
    .query(async ({ input }) => {
      const transaction = await getPaymentTransactionByTapChargeId(input.tap_id);
      return {
        status: toPublicSubscriptionPaymentStatus(transaction?.status),
      };
    }),

  // List transactions (merchant)
  listTransactions: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    return await getMerchantPaymentTransactions(merchant.id);
  }),

  // Get transaction details
  getTransactionDetails: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const transaction = await getPaymentTransactionById(input.id);
      if (!transaction || transaction.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Transaction not found or access denied' });
      }

      return transaction;
    }),
});

// ============================================
// Tap Settings Router (Admin)
// ============================================

export const tapSettingsRouter = router({
  // Get settings
  getTapSettings: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .query(async () => {
      const settings = await getTapSettings();
      return settings ? toPlatformTapSettingsView(settings) : null;
    }),

  // Update settings
  updateTapSettings: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      secretKey: z.string().trim().min(12).max(500).optional(),
      publicKey: z.string().trim().min(12).max(500),
      isLive: z.union([z.literal(0), z.literal(1)]),
      webhookUrl: z.union([z.string().trim().url().max(500), z.literal('')]).optional(),
      isActive: z.union([z.literal(0), z.literal(1)]),
    }).strict())
    .mutation(async ({ input }) => {
      const existingSettings = await getTapSettings();
      const effectiveSecret = input.secretKey ?? existingSettings?.secretKey ?? '';
      const testMode = !Boolean(input.isLive);
      if (!tapKeyMatchesMode(effectiveSecret, testMode)
        || !tapPublicKeyMatchesMode(input.publicKey, testMode)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع المفتاح لا يطابق وضع Tap المحدد' });
      }

      const credentialsChanged = !existingSettings
        || effectiveSecret !== existingSettings.secretKey
        || input.publicKey !== existingSettings.publicKey
        || Boolean(input.isLive) !== Boolean(existingSettings.isLive);
      const update = {
        publicKey: input.publicKey,
        isLive: input.isLive,
        webhookUrl: input.webhookUrl || null,
        isActive: input.isActive,
        ...(input.secretKey !== undefined && { secretKey: input.secretKey }),
        ...(credentialsChanged && {
          lastTestAt: null,
          lastTestStatus: null,
          lastTestMessage: null,
        }),
      };

      if (existingSettings) {
        await updateTapSettings(existingSettings.id, update);
      } else {
        if (!input.secretKey) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'مفتاح Tap السري مطلوب عند الإعداد الأول' });
        }
        await createTapSettings({ ...update, secretKey: input.secretKey });
      }

      const saved = await getTapSettings();
      return { success: true, settings: saved ? toPlatformTapSettingsView(saved) : null };
    }),

  // Test connection
  testTapConnection: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .mutation(async () => {
      const settings = await getTapSettings();
      if (!settings) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'إعدادات Tap غير مكتملة' });
      }
      const testMode = !Boolean(settings.isLive);
      if (!tapKeyMatchesMode(settings.secretKey, testMode)
        || !tapPublicKeyMatchesMode(settings.publicKey, testMode)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع المفتاح لا يطابق وضع Tap المحدد' });
      }

      const result = await verifyPlatformTapCredentialsSnapshot({
        id: settings.id,
        publicKey: settings.publicKey,
        secretKey: settings.secretKey,
        isLive: Boolean(settings.isLive),
      });
      if (result.outcome === 'verified') return { success: true, message: 'verified' };
      if (result.outcome === 'changed') {
        throw new TRPCError({ code: 'CONFLICT', message: 'تغيرت إعدادات Tap أثناء الاختبار؛ أعد المحاولة' });
      }
      if (result.outcome === 'rejected') return { success: false, message: 'rejected' };
      console.warn('[PlatformTapCredentials] Credential probe unavailable', { failure: result.failure });
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'تعذر الاتصال بـ Tap؛ حاول لاحقاً' });
    }),
});

// ============================================
// Admin Subscriptions Router
// ============================================

export const adminSubscriptionsRouter = router({
  // List all subscriptions
  listAllSubscriptions: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .query(async () => {
      // This would need a new db function to get all subscriptions across all merchants
      // For now, we'll return an empty array
      return [];
    }),

  // Get subscription stats
  getSubscriptionStats: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .query(async () => {
      return await getMerchantSubscriptionStats();
    }),

  // Extend subscription
  extendSubscription: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      subscriptionId: z.number(),
      days: z.number(),
    }))
    .mutation(async ({ input }) => {
      await extendMerchantSubscription(input.subscriptionId, input.days);
      return { success: true };
    }),

  // Cancel merchant subscription
  cancelMerchantSubscription: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .input(z.object({
      subscriptionId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await cancelMerchantSubscription(input.subscriptionId, input.reason);
      return { success: true };
    }),

  // Get payment stats
  getPaymentStats: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .query(async () => {
      return await getPaymentStats();
    }),

  // List all transactions
  listAllTransactions: protectedProcedure
    .use(async ({ ctx, next }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return next({ ctx });
    })
    .query(async () => {
      return await getAllPaymentTransactions();
    }),
});
