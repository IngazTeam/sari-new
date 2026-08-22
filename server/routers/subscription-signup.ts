/**
 * Subscription Signup API
 * Handles new user registration and subscription creation with payment
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createOrReusePaymentTransactionForCheckout,
  getMerchantByUserId,
  getSubscriptionPlanById,
  getUserById,
} from '../db';
import {
  createPlatformSubscriptionTapCharge,
  SubscriptionTapCheckoutError,
} from '../payment/subscription-tap-checkout';

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
      planId: z.number().int().positive(),
      billingCycle: z.enum(['monthly', 'yearly']),
      checkoutAttemptId: z.string().uuid(),
      // PEN-02 FIX: Removed userId from input — use ctx.user.id only
    }).strict())
    .mutation(async ({ input, ctx }) => {
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
          customerEmail: user.email,
          customerPhone: merchant.phone,
          description: `Subscription: ${plan.name} (${input.billingCycle})`,
        });

        return {
          success: true,
          transactionId: transaction.id,
          paymentUrl: checkout.paymentUrl,
          chargeId: checkout.chargeId,
        };
      } catch (error: any) {
        if (error instanceof TRPCError) {
          throw error;
        }
        if (error instanceof Error && error.message === 'CHECKOUT_ATTEMPT_CONFLICT') {
          throw new TRPCError({ code: 'CONFLICT', message: 'محاولة الدفع مرتبطة بطلب مختلف؛ أعد تحميل الصفحة' });
        }
        if (error instanceof SubscriptionTapCheckoutError) {
          const code = error.failure === 'gateway_not_ready' ? 'BAD_REQUEST'
            : error.failure === 'attempt_already_finished' || error.failure === 'charge_identity_conflict'
              ? 'CONFLICT'
              : 'BAD_GATEWAY';
          throw new TRPCError({ code, message: 'تعذر إنشاء جلسة الدفع؛ حاول مرة أخرى' });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'حدث خطأ أثناء إنشاء الاشتراك. يرجى المحاولة لاحقاً.',
        });
      }
    }),

  /**
   * Legacy registration was non-atomic and created partial accounts on failure.
   * New clients must use auth.signup, which records legal consent and creates the
   * account, merchant and canonical trial in one database transaction.
   */
  registerUser: publicProcedure
    .input(z.object({}).passthrough())
    .mutation(() => {
      throw new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message: 'استخدم مسار التسجيل الآمن والمحدث',
      });
    }),
});
