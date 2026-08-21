/**
 * Subscription Signup API
 * Handles new user registration and subscription creation with payment
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  activateUserTrial,
  createMerchant,
  createPaymentTransaction,
  createUser,
  getMerchantByUserId,
  getSubscriptionPlanById,
  getTapSettings,
  getUserByEmail,
  getUserById,
  updatePaymentTransaction,
} from '../db';
import { createCharge } from "../_core/tap";
import { publicPaymentUrls } from '../utils/public-url';
import { startCanonicalTrial } from '../subscriptions/canonical-state';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

function normalizeBillableAmount(amount: number, currency: string): { amount: number; currency: string } {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid billable amount' });
  }
  if (!['SAR', 'USD'].includes(normalizedCurrency)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported billing currency' });
  }
  return { amount: Math.round(amount * 100) / 100, currency: normalizedCurrency };
}

export const subscriptionSignupRouter = router({
  /**
   * Create subscription with payment
   * This endpoint is called after user registration/login
   */
  createSubscriptionWithPayment: protectedProcedure
    .input(z.object({
      planId: z.number(),
      billingCycle: z.enum(['monthly', 'yearly']),
      // PEN-02 FIX: Removed userId from input — use ctx.user.id only
    }))
    .mutation(async ({ input, ctx }) => {
      let transactionId: number | null = null;
      try {
        // PEN-02 FIX: Only use authenticated user ID, never accept from input
        const userId = ctx.user.id;

        // Get user details
        const user = await getUserById(userId);
        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found'
          });
        }

        // Get merchant
        const merchant = await getMerchantByUserId(userId);
        if (!merchant) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Merchant not found'
          });
        }

        // Get plan details
        const plan = await getSubscriptionPlanById(input.planId);
        if (!plan || plan.isActive !== 1) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Plan not found'
          });
        }

        // Calculate amount based on billing cycle
        const selectedAmount = input.billingCycle === 'monthly'
          ? parseFloat(plan.monthlyPrice)
          : parseFloat(plan.yearlyPrice);
        const { amount, currency } = normalizeBillableAmount(selectedAmount, plan.currency || 'SAR');

        // Create payment transaction
        const createdTransactionId = await createPaymentTransaction({
          merchantId: merchant.id,
          subscriptionId: null,
          type: 'subscription',
          amount: amount.toFixed(2),
          currency,
          status: 'pending',
          paymentMethod: 'tap',
          metadata: JSON.stringify({
            planId: input.planId,
            billingCycle: input.billingCycle,
          }),
        });
        transactionId = createdTransactionId;

        // Get Tap settings
        const tapSettings = await getTapSettings();
        if (!tapSettings || !tapSettings.isActive) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Payment gateway not configured'
          });
        }

        // Create Tap charge
        const charge = await createCharge({
          amount,
          currency,
          customer: {
            first_name: merchant.businessName,
            // @ts-ignore
            email: user.email,
            phone: merchant.phone ? {
              country_code: '966',
              number: merchant.phone.replace(/^\+?966/, '').replace(/^0/, ''),
            } : undefined,
          },
          source: { id: 'src_all' },
          redirect: {
            url: publicPaymentUrls.callback(),
          },
          post: { url: publicPaymentUrls.webhook() },
          description: `Subscription: ${plan.name} (${input.billingCycle})`,
          metadata: {
            merchantId: merchant.id,
            transactionId: createdTransactionId,
            type: 'subscription',
            planId: input.planId,
            billingCycle: input.billingCycle,
          },
        });

        // Update transaction with Tap charge ID
        await updatePaymentTransaction(createdTransactionId, {
          tapChargeId: charge.id,
          tapResponse: JSON.stringify(charge),
        });

        return {
          success: true,
          transactionId: createdTransactionId,
          paymentUrl: charge.transaction?.url,
          chargeId: charge.id,
        };
      } catch (error: any) {
        if (transactionId) {
          await updatePaymentTransaction(transactionId, { status: 'failed' }).catch(() => undefined);
        }
        console.error('[Subscription Signup] Error:', error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'حدث خطأ أثناء إنشاء الاشتراك. يرجى المحاولة لاحقاً.',
        });
      }
    }),

  /**
   * Register new user and create merchant
   */
  registerUser: publicProcedure
    .input(z.object({
      email: z.string().email().max(255),
      password: z.string().min(8).max(128), // SEC-08 FIX: stronger minimum (was 6)
      businessName: z.string().min(2).max(200).transform(v => v.trim()),
      phone: z.string().min(9).max(15).regex(/^[\d+]+$/, 'رقم الهاتف غير صالح'),
    }))
    .mutation(async ({ input }) => {
      try {
        // Check if user exists
        const existingUser = await getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Email already registered'
          });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, 10);

        // Create user
        const user = await createUser({
          openId: `local_${crypto.randomUUID().replaceAll('-', '')}`,
          email: input.email,
          password: passwordHash,
          loginMethod: 'email',
          role: 'user',
        });
        if (!user) throw new Error('USER_CREATE_FAILED');

        // Create merchant
        const merchant = await createMerchant({
          userId: user.id,
          businessName: input.businessName,
          phone: input.phone,
          subscriptionStatus: 'trial',
        });
        if (!merchant) throw new Error('MERCHANT_CREATE_FAILED');

        // Auto-start 7-day trial
        await startCanonicalTrial(merchant.id);

        // Activate trial on user record
        await activateUserTrial(user.id);

        return {
          success: true,
          userId: user.id,
          merchantId: merchant.id,
        };
      } catch (error: any) {
        console.error('[Register User] Error:', error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'حدث خطأ أثناء تسجيل الحساب. يرجى المحاولة لاحقاً.',
        });
      }
    }),
});
