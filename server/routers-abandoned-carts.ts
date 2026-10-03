/**
 * Abandoned Carts Router Module
 * Handles abandoned cart recovery management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {cartWorkspaceInput,cartRecoveryReviewInput,cartRecoveryRecordInput} from '../shared/abandoned-cart-workspace';
import {readCartWorkspace,reviewCartRecovery,recordCartRecovery,CartWorkspaceError} from './abandoned-cart-workspace-store';
import {cartReminderReviewInput,cartReminderReceiptInput} from '../shared/abandoned-cart-reminder';
import {reviewCartReminder,readCartReminderReceipt} from './abandoned-cart-reminder';
import {
  getAbandonedCartById,
  getAbandonedCartsByMerchantId,
  getMerchantById,
  markAbandonedCartRecovered,
} from './db';

async function recoveryGuard<T>(operation:()=>Promise<T>){try{return await operation();}catch(error){const reason=error instanceof CartWorkspaceError?error.reason:'unavailable';throw new TRPCError({code:reason==='forbidden'?'FORBIDDEN':reason==='missing'?'NOT_FOUND':reason==='stale'?'CONFLICT':reason==='invalid'?'PRECONDITION_FAILED':'INTERNAL_SERVER_ERROR',message:reason==='stale'?'تغير السجل. حدّثه وراجعه مجددًا.':'تعذر تأكيد تسجيل الاستعادة. حدّث البيانات وراجع الحالة قبل المحاولة مجددًا.'});}}
export const abandonedCartsRouter = router({
    reviewReminder:permissionProcedure('campaigns.manage').input(cartReminderReviewInput).mutation(({ctx,input})=>recoveryGuard(()=>reviewCartReminder(ctx.user.id,ctx.merchantId,input))),
    reminderReceipt:merchantProcedure.input(cartReminderReceiptInput).query(({ctx,input})=>recoveryGuard(()=>readCartReminderReceipt(ctx.user.id,ctx.merchantId,input))),
    reviewRecovery:permissionProcedure('campaigns.manage').input(cartRecoveryReviewInput).mutation(({ctx,input})=>recoveryGuard(()=>reviewCartRecovery(ctx.user.id,ctx.merchantId,input))),
    recordRecovery:permissionProcedure('campaigns.manage').input(cartRecoveryRecordInput).mutation(({ctx,input})=>recoveryGuard(()=>recordCartRecovery(ctx.user.id,ctx.merchantId,input))),
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
