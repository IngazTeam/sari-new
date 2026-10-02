/**
 * Abandoned Carts Router Module
 * Handles abandoned cart recovery management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, merchantProcedure, router } from "./_core/trpc";
import {cartWorkspaceInput} from '../shared/abandoned-cart-workspace';
import {readCartWorkspace,CartWorkspaceError} from './abandoned-cart-workspace-store';
import {
  getAbandonedCartById,
  getAbandonedCartsByMerchantId,
  getMerchantById,
  markAbandonedCartRecovered,
} from './db';

export const abandonedCartsRouter = router({
    workspace: merchantProcedure.input(cartWorkspaceInput).query(async({ctx,input})=>{try{return await readCartWorkspace(ctx.user.id,ctx.merchantId,input);}catch(error){throw new TRPCError({code:error instanceof CartWorkspaceError&&error.reason==='forbidden'?'FORBIDDEN':'INTERNAL_SERVER_ERROR',message:'تعذر قراءة السلات لهذا المتجر. حدّث الصفحة وحاول مجددًا.'});}}),
    // List abandoned carts for merchant
    list: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await getAbandonedCartsByMerchantId(input.merchantId);
        }),

    // Get statistics
    getStats: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const { getCartRecoveryStats } = await import('./automation/abandoned-cart-recovery');
            return await getCartRecoveryStats(input.merchantId);
        }),

    // Mark cart as recovered
    markRecovered: protectedProcedure
        .input(z.object({ cartId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const cart = await getAbandonedCartById(input.cartId);
            if (!cart) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart not found' });
            }

            const merchant = await getMerchantById(cart.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await markAbandonedCartRecovered(input.cartId);
        }),

    // Send reminder manually
    sendReminder: protectedProcedure
        .input(z.object({ cartId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const cart = await getAbandonedCartById(input.cartId);
            if (!cart) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart not found' });
            }

            const merchant = await getMerchantById(cart.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const { sendCartReminder } = await import('./automation/abandoned-cart-recovery');
            const success = await sendCartReminder(input.cartId);

            if (!success) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send reminder' });
            }

            return { success: true };
        }),
});

export type AbandonedCartsRouter = typeof abandonedCartsRouter;
