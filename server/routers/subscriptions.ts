/**
 * Subscription Management APIs
 * 
 * This module contains all tRPC procedures related to subscription management,
 * including plans, addons, merchant subscriptions, and payments.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { createCharge, retrieveCharge, refundCharge, testConnection } from "../_core/tap";
import { calculateProration } from "../_core/subscriptionManager";

// ============================================
// Subscription Plans Router
// ============================================

export const subscriptionPlansRouter = router({
  // List all plans (public - for display)
  listPlans: publicProcedure.query(async () => {
    return await db.getActiveSubscriptionPlans();
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
      return await db.getAllSubscriptionPlans();
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
      const planId = await db.createSubscriptionPlan(input);
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
      await db.updateSubscriptionPlan(id, data);
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
      await db.deleteSubscriptionPlan(input.id);
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
      await db.updateSubscriptionPlan(input.id, { isActive: input.isActive });
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
      await db.reorderSubscriptionPlans(input.planIds);
      return { success: true };
    }),
});

// ============================================
// Subscription Addons Router
// ============================================

export const subscriptionAddonsRouter = router({
  // List all addons
  listAddons: publicProcedure.query(async () => {
    return await db.getActiveSubscriptionAddons();
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
      const addonId = await db.createSubscriptionAddon(input);
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
      await db.updateSubscriptionAddon(id, data);
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
      await db.deleteSubscriptionAddon(input.id);
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
      await db.updateSubscriptionAddon(input.id, { isActive: input.isActive });
      return { success: true };
    }),

  // Get addon by ID
  getAddonById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.getSubscriptionAddonById(input.id);
    }),
});

// ============================================
// Merchant Subscriptions Router
// ============================================

export const merchantSubscriptionRouter = router({
  // Get current subscription
  getCurrentSubscription: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    const subscription = await db.getMerchantCurrentSubscription(merchant.id);
    if (!subscription) {
      return null;
    }

    // Get plan details
    const plan = subscription.planId ? await db.getSubscriptionPlanById(subscription.planId) : null;

    // Calculate days remaining
    const daysRemaining = await db.getMerchantDaysRemaining(merchant.id);

    return {
      ...subscription,
      plan,
      daysRemaining,
    };
  }),

  // Start trial
  startTrial: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    // Check if already has a subscription
    const existingSubscription = await db.getMerchantCurrentSubscription(merchant.id);
    if (existingSubscription) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have an active subscription' });
    }

    // Create trial subscription (7 days)
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const subscriptionId = await db.createMerchantSubscription({
      merchantId: merchant.id,
      status: 'trial',
      billingCycle: 'monthly',
      startDate: now.toISOString(),
      endDate: trialEndDate.toISOString(),
      trialEndsAt: trialEndDate.toISOString(),
      autoRenew: 0,
    });

    // Update merchant status
    await db.updateMerchantSubscriptionStatus(merchant.id, 'trial');
    await db.updateMerchantCustomerLimit(merchant.id, 100); // Trial limit

    return { success: true, subscriptionId, trialEndsAt: trialEndDate };
  }),

  // Subscribe to a plan
  subscribe: protectedProcedure
    .input(z.object({
      planId: z.number(),
      billingCycle: z.enum(['monthly', 'yearly']),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get plan details
      const plan = await db.getSubscriptionPlanById(input.planId);
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      // Calculate amount
      const amount = input.billingCycle === 'monthly'
        ? parseFloat(plan.monthlyPrice)
        : parseFloat(plan.yearlyPrice);

      // Create payment transaction
      const transactionId = await db.createPaymentTransaction({
        merchantId: merchant.id,
        subscriptionId: null,
        type: 'subscription',
        amount: amount.toString(),
        currency: plan.currency,
        status: 'pending',
        paymentMethod: 'tap',
        metadata: JSON.stringify({
          planId: input.planId,
          billingCycle: input.billingCycle,
        }),
      });

      // Create Tap charge
      try {
        const charge = await createCharge({
          amount,
          currency: plan.currency,
          customer: {
            first_name: merchant.businessName,
            email: ctx.user.email,
            phone: merchant.phone ? {
              country_code: '966',
              number: merchant.phone.replace(/^\+?966/, ''),
            } : undefined,
          },
          source: { id: 'src_all' },
          redirect: {
            url: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/merchant/subscription/payment-callback`,
          },
          post: {
            url: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/trpc/payment.handleWebhook`,
          },
          description: `Subscription to ${plan.name} (${input.billingCycle})`,
          metadata: {
            merchantId: merchant.id,
            transactionId,
            planId: input.planId,
            billingCycle: input.billingCycle,
          },
        });

        // Update transaction with Tap charge ID
        await db.updatePaymentTransaction(transactionId, {
          tapChargeId: charge.id,
          tapResponse: JSON.stringify(charge),
        });

        return {
          success: true,
          transactionId,
          paymentUrl: charge.transaction?.url,
          chargeId: charge.id,
        };
      } catch (error) {
        // Update transaction status to failed
        await db.updatePaymentTransaction(transactionId, {
          status: 'failed',
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create payment charge',
        });
      }
    }),

  // Upgrade plan
  upgradePlan: protectedProcedure
    .input(z.object({
      newPlanId: z.number(),
      newBillingCycle: z.enum(['monthly', 'yearly']),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get current subscription
      const currentSubscription = await db.getMerchantCurrentSubscription(merchant.id);
      if (!currentSubscription) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active subscription found' });
      }

      // Calculate proration
      const proration = await calculateProration(
        currentSubscription.id,
        input.newPlanId,
        input.newBillingCycle
      );

      // Create payment transaction for upgrade
      const transactionId = await db.createPaymentTransaction({
        merchantId: merchant.id,
        subscriptionId: currentSubscription.id,
        type: 'upgrade',
        amount: proration.chargeAmount.toString(),
        currency: 'SAR',
        status: 'pending',
        paymentMethod: 'tap',
        metadata: JSON.stringify({
          newPlanId: input.newPlanId,
          newBillingCycle: input.newBillingCycle,
          proration,
        }),
      });

      // If charge amount is 0 or negative, upgrade immediately
      if (proration.chargeAmount <= 0) {
        // Update subscription
        const now = new Date();
        const endDate = new Date(
          now.getTime() + (input.newBillingCycle === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000
        );

        await db.updateMerchantSubscription(currentSubscription.id, {
          planId: input.newPlanId,
          billingCycle: input.newBillingCycle,
          startDate: now.toISOString(),
          endDate: endDate.toISOString(),
        });

        // Update merchant customer limit
        const newPlan = await db.getSubscriptionPlanById(input.newPlanId);
        if (newPlan) {
          await db.updateMerchantCustomerLimit(merchant.id, newPlan.maxCustomers);
        }

        // Mark transaction as completed
        await db.updatePaymentTransaction(transactionId, {
          status: 'completed',
          paidAt: now.toISOString(),
        });

        return { success: true, immediate: true };
      }

      // Create Tap charge for the difference
      const newPlan = await db.getSubscriptionPlanById(input.newPlanId);
      if (!newPlan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      try {
        const charge = await createCharge({
          amount: proration.chargeAmount,
          currency: 'SAR',
          customer: {
            first_name: merchant.businessName,
            email: ctx.user.email,
            phone: merchant.phone ? {
              country_code: '966',
              number: merchant.phone.replace(/^\+?966/, ''),
            } : undefined,
          },
          source: { id: 'src_all' },
          redirect: {
            url: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/merchant/subscription/payment-callback`,
          },
          description: `Upgrade to ${newPlan.name} (${input.newBillingCycle})`,
          metadata: {
            merchantId: merchant.id,
            transactionId,
            type: 'upgrade',
            newPlanId: input.newPlanId,
            newBillingCycle: input.newBillingCycle,
          },
        });

        // Update transaction with Tap charge ID
        await db.updatePaymentTransaction(transactionId, {
          tapChargeId: charge.id,
          tapResponse: JSON.stringify(charge),
        });

        return {
          success: true,
          transactionId,
          paymentUrl: charge.transaction?.url,
          chargeId: charge.id,
          proratedAmount: proration.chargeAmount,
        };
      } catch (error) {
        await db.updatePaymentTransaction(transactionId, { status: 'failed' });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create payment charge',
        });
      }
    }),

  // Cancel subscription
  cancelSubscription: protectedProcedure
    .input(z.object({
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const subscription = await db.getMerchantCurrentSubscription(merchant.id);
      if (!subscription) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active subscription found' });
      }

      await db.cancelMerchantSubscription(subscription.id, input.reason);

      return { success: true };
    }),

  // Get days remaining
  getDaysRemaining: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    const daysRemaining = await db.getMerchantDaysRemaining(merchant.id);
    return { daysRemaining };
  }),

  // Check subscription status (including trial)
  checkStatus: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    // Check if user has active trial
    const user = await db.getUserById(ctx.user.id);
    if (user && user.isTrialActive === 1 && user.trialEndDate) {
      const now = new Date();
      const trialEnd = new Date(user.trialEndDate);
      if (now <= trialEnd) {
        return {
          isActive: true,
          reason: 'الفترة التجريبية نشطة',
          isTrial: true
        };
      }
    }

    // Check regular subscription
    const isActive = await db.checkMerchantSubscriptionStatus(merchant.id);
    return {
      isActive,
      reason: isActive ? 'اشتراك نشط' : 'لا يوجد اشتراك نشط. يرجى الاشتراك في باقة للوصول إلى هذه الميزة.',
      isTrial: false
    };
  }),
});

// ============================================
// Merchant Addons Router
// ============================================

export const merchantAddonsRouter = router({
  // List my addons
  listMyAddons: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    const addons = await db.getMerchantActiveAddons(merchant.id);

    // Get addon details for each
    const addonsWithDetails = await Promise.all(
      addons.map(async (addon) => {
        const addonDetails = await db.getSubscriptionAddonById(addon.addonId);
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
      addonId: z.number(),
      quantity: z.number().default(1),
      billingCycle: z.enum(['monthly', 'yearly']),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get addon details
      const addon = await db.getSubscriptionAddonById(input.addonId);
      if (!addon) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Addon not found' });
      }

      // Calculate amount
      const unitPrice = input.billingCycle === 'monthly'
        ? parseFloat(addon.monthlyPrice)
        : parseFloat(addon.yearlyPrice);
      const totalAmount = unitPrice * input.quantity;

      // Get current subscription
      const subscription = await db.getMerchantCurrentSubscription(merchant.id);

      // Create payment transaction
      const transactionId = await db.createPaymentTransaction({
        merchantId: merchant.id,
        subscriptionId: subscription?.id || null,
        type: 'addon',
        amount: totalAmount.toString(),
        currency: addon.currency,
        status: 'pending',
        paymentMethod: 'tap',
        metadata: JSON.stringify({
          addonId: input.addonId,
          quantity: input.quantity,
          billingCycle: input.billingCycle,
        }),
      });

      // Create Tap charge
      try {
        const charge = await createCharge({
          amount: totalAmount,
          currency: addon.currency,
          customer: {
            first_name: merchant.businessName,
            email: ctx.user.email,
            phone: merchant.phone ? {
              country_code: '966',
              number: merchant.phone.replace(/^\+?966/, ''),
            } : undefined,
          },
          source: { id: 'src_all' },
          redirect: {
            url: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/merchant/subscription/payment-callback`,
          },
          description: `Purchase ${addon.name} x${input.quantity}`,
          metadata: {
            merchantId: merchant.id,
            transactionId,
            type: 'addon',
            addonId: input.addonId,
            quantity: input.quantity,
            billingCycle: input.billingCycle,
          },
        });

        // Update transaction with Tap charge ID
        await db.updatePaymentTransaction(transactionId, {
          tapChargeId: charge.id,
          tapResponse: JSON.stringify(charge),
        });

        return {
          success: true,
          transactionId,
          paymentUrl: charge.transaction?.url,
          chargeId: charge.id,
        };
      } catch (error) {
        await db.updatePaymentTransaction(transactionId, { status: 'failed' });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create payment charge',
        });
      }
    }),

  // Cancel addon
  cancelAddon: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Verify addon belongs to merchant
      const addon = await db.getMerchantAddonById(input.id);
      if (!addon || addon.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Addon not found or access denied' });
      }

      await db.cancelMerchantAddon(input.id);
      return { success: true };
    }),
});

// ============================================
// Payment Router
// ============================================

export const paymentRouter = router({
  // Handle payment callback
  handlePaymentCallback: publicProcedure
    .input(z.object({
      tap_id: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        // Retrieve charge from Tap
        const charge = await retrieveCharge(input.tap_id);

        // Get transaction by Tap charge ID
        const transaction = await db.getPaymentTransactionByTapChargeId(input.tap_id);
        if (!transaction) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
        }

        // Update transaction status
        if (charge.status === 'CAPTURED') {
          await db.updatePaymentTransaction(transaction.id, {
            status: 'completed',
            paidAt: new Date().toISOString(),
            tapResponse: JSON.stringify(charge),
          });

          // Process subscription/addon based on transaction type
          const metadata = transaction.metadata ? JSON.parse(transaction.metadata) : {};

          if (transaction.type === 'subscription') {
            // Create subscription
            const now = new Date();
            const endDate = new Date(
              now.getTime() + (metadata.billingCycle === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000
            );

            const subscriptionId = await db.createMerchantSubscription({
              merchantId: transaction.merchantId,
              planId: metadata.planId,
              status: 'active',
              billingCycle: metadata.billingCycle,
              startDate: now.toISOString(),
              endDate: endDate.toISOString(),
              trialEndsAt: null,
              autoRenew: 0,
            });

            // Update merchant status
            await db.updateMerchantSubscriptionStatus(transaction.merchantId, 'active');

            // Update merchant customer limit
            const plan = await db.getSubscriptionPlanById(metadata.planId);
            if (plan) {
              await db.updateMerchantCustomerLimit(transaction.merchantId, plan.maxCustomers);
            }

            // Update transaction with subscription ID
            await db.updatePaymentTransaction(transaction.id, {
              subscriptionId,
            });
          } else if (transaction.type === 'addon') {
            // Create merchant addon
            const now = new Date();
            const endDate = new Date(
              now.getTime() + (metadata.billingCycle === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000
            );

            await db.createMerchantAddon({
              merchantId: transaction.merchantId,
              addonId: metadata.addonId,
              subscriptionId: transaction.subscriptionId || null,
              quantity: metadata.quantity || 1,
              startDate: now.toISOString(),
              endDate: endDate.toISOString(),
              isActive: 1,
            });
          } else if (transaction.type === 'upgrade') {
            // Update subscription
            const now = new Date();
            const endDate = new Date(
              now.getTime() + (metadata.newBillingCycle === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000
            );

            if (transaction.subscriptionId) {
              await db.updateMerchantSubscription(transaction.subscriptionId, {
                planId: metadata.newPlanId,
                billingCycle: metadata.newBillingCycle,
                startDate: now.toISOString(),
                endDate: endDate.toISOString(),
              });

              // Update merchant customer limit
              const newPlan = await db.getSubscriptionPlanById(metadata.newPlanId);
              if (newPlan) {
                await db.updateMerchantCustomerLimit(transaction.merchantId, newPlan.maxCustomers);
              }
            }
          }

          return { success: true, status: 'completed' };
        } else if (charge.status === 'FAILED' || charge.status === 'CANCELLED') {
          await db.updatePaymentTransaction(transaction.id, {
            status: 'failed',
            tapResponse: JSON.stringify(charge),
          });

          return { success: false, status: 'failed' };
        }

        return { success: true, status: charge.status };
      } catch (error) {
        console.error('[Payment] Callback error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process payment callback',
        });
      }
    }),

  // List transactions (merchant)
  listTransactions: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    return await db.getMerchantPaymentTransactions(merchant.id);
  }),

  // Get transaction details
  getTransactionDetails: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const transaction = await db.getPaymentTransactionById(input.id);
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
      return await db.getTapSettings();
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
      secretKey: z.string(),
      publicKey: z.string(),
      isLive: z.number(),
      webhookUrl: z.string().optional(),
      webhookSecret: z.string().optional(),
      isActive: z.number(),
    }))
    .mutation(async ({ input }) => {
      const existingSettings = await db.getTapSettings();

      if (existingSettings) {
        await db.updateTapSettings(existingSettings.id, input);
      } else {
        await db.createTapSettings(input);
      }

      return { success: true };
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
      const result = await testConnection();

      // Update settings with test result
      const settings = await db.getTapSettings();
      if (settings) {
        await db.updateTapSettings(settings.id, {
          lastTestAt: new Date().toISOString(),
          lastTestStatus: result.success ? 'success' : 'failed',
          lastTestMessage: result.message,
        });
      }

      return result;
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
      return await db.getMerchantSubscriptionStats();
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
      await db.extendMerchantSubscription(input.subscriptionId, input.days);
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
      await db.cancelMerchantSubscription(input.subscriptionId, input.reason);
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
      return await db.getPaymentStats();
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
      return await db.getAllPaymentTransactions();
    }),
});
