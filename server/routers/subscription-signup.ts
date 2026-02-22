/**
 * Subscription Signup API
 * Handles new user registration and subscription creation with payment
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { createCharge } from "../_core/tap";
import bcrypt from 'bcryptjs';

export const subscriptionSignupRouter = router({
  /**
   * Create subscription with payment
   * This endpoint is called after user registration/login
   */
  createSubscriptionWithPayment: publicProcedure
    .input(z.object({
      planId: z.number(),
      billingCycle: z.enum(['monthly', 'yearly']),
      userId: z.number().optional(), // If user is already logged in
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Get user ID from context or input
        const userId = ctx.user?.id || input.userId;
        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User not authenticated'
          });
        }

        // Get user details
        const user = await db.getUserById(userId);
        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found'
          });
        }

        // Get merchant
        const merchant = await db.getMerchantByUserId(userId);
        if (!merchant) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Merchant not found'
          });
        }

        // Get plan details
        const plan = await db.getSubscriptionPlanById(input.planId);
        if (!plan) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Plan not found'
          });
        }

        // Calculate amount based on billing cycle
        const amount = input.billingCycle === 'monthly'
          ? parseFloat(plan.monthlyPrice)
          : parseFloat(plan.yearlyPrice);

        // Create payment transaction
        const transactionId = await db.createPaymentTransaction({
          merchantId: merchant.id,
          subscriptionId: null,
          type: 'subscription',
          amount: amount.toString(),
          currency: plan.currency || 'SAR',
          status: 'pending',
          paymentMethod: 'tap',
          metadata: JSON.stringify({
            planId: input.planId,
            billingCycle: input.billingCycle,
          }),
        });

        // Get Tap settings
        const tapSettings = await db.getTapSettings();
        if (!tapSettings || !tapSettings.isActive) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Payment gateway not configured'
          });
        }

        // Create Tap charge
        const charge = await createCharge({
          amount,
          currency: plan.currency || 'SAR',
          customer: {
            first_name: merchant.businessName,
            email: user.email,
            phone: merchant.phone ? {
              country_code: '966',
              number: merchant.phone.replace(/^\+?966/, '').replace(/^0/, ''),
            } : undefined,
          },
          source: { id: 'src_all' },
          redirect: {
            url: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/payment/callback`,
          },
          description: `Subscription: ${plan.name} (${input.billingCycle})`,
          metadata: {
            merchantId: merchant.id,
            transactionId,
            type: 'subscription',
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
      } catch (error: any) {
        console.error('[Subscription Signup] Error:', error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create subscription',
        });
      }
    }),

  /**
   * Register new user and create merchant
   */
  registerUser: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6),
      businessName: z.string(),
      phone: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        // Check if user exists
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Email already registered'
          });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, 10);

        // Create user
        const userId = await db.createUser({
          email: input.email,
          passwordHash,
          role: 'merchant',
        });

        // Create merchant
        const merchantId = await db.createMerchant({
          userId,
          businessName: input.businessName,
          phone: input.phone,
          subscriptionStatus: 'trial',
        });

        // Auto-start 7-day trial
        const now = new Date();
        const trialEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        await db.createMerchantSubscription({
          merchantId,
          status: 'trial',
          billingCycle: 'monthly',
          startDate: now.toISOString(),
          endDate: trialEndDate.toISOString(),
          trialEndsAt: trialEndDate.toISOString(),
          autoRenew: 0,
        });

        // Activate trial on user record
        await db.activateUserTrial(userId);

        // Set trial customer limit
        await db.updateMerchantCustomerLimit(merchantId, 100);

        return {
          success: true,
          userId,
          merchantId,
        };
      } catch (error: any) {
        console.error('[Register User] Error:', error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to register user',
        });
      }
    }),
});
