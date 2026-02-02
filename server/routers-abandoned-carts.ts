/**
 * Abandoned Carts Router Module
 * Handles abandoned cart recovery management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const abandonedCartsRouter = router({
    // List abandoned carts for merchant
    list: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await db.getAbandonedCartsByMerchantId(input.merchantId);
        }),

    // Get statistics
    getStats: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
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
            const cart = await db.getAbandonedCartById(input.cartId);
            if (!cart) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart not found' });
            }

            const merchant = await db.getMerchantById(cart.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await db.markAbandonedCartRecovered(input.cartId);
        }),

    // Send reminder manually
    sendReminder: protectedProcedure
        .input(z.object({ cartId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const cart = await db.getAbandonedCartById(input.cartId);
            if (!cart) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart not found' });
            }

            const merchant = await db.getMerchantById(cart.merchantId);
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
