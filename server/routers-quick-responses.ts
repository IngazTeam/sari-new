/**
 * Quick Responses Router Module
 * Handles quick/canned responses management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { containsUnverifiedActionClaim } from './ai/transactional-truth';
import {
  createQuickResponse,
  deleteQuickResponse,
  getMerchantByUserId,
  getQuickResponseById,
  getQuickResponses,
  updateQuickResponse,
} from './db';

export const quickResponsesRouter = router({
    // List all quick responses
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getQuickResponses(merchant.id);
    }),

    // Create quick response
    create: protectedProcedure
        .input(z.object({
            trigger: z.string().trim().min(1).max(255),
            response: z.string().trim().min(1).max(2000).refine(response => !containsUnverifiedActionClaim(response), {
                message: 'لا يمكن حفظ رد يؤكد طلباً أو حجزاً أو تحويلاً دون عملية موثقة',
            }),
            keywords: z.string().max(2000).optional(),
            priority: z.number().min(1).max(10).optional(),
            category: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await createQuickResponse({
                ...input,
                merchantId: merchant.id,
            });
        }),

    // Update quick response
    update: protectedProcedure
        .input(z.object({
            id: z.number(),
            trigger: z.string().trim().min(1).max(255).optional(),
            response: z.string().trim().min(1).max(2000).refine(response => !containsUnverifiedActionClaim(response), {
                message: 'لا يمكن حفظ رد يؤكد طلباً أو حجزاً أو تحويلاً دون عملية موثقة',
            }).optional(),
            keywords: z.string().max(2000).optional(),
            priority: z.number().min(1).max(10).optional(),
            category: z.string().optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // IDOR-2 FIX: Verify response belongs to this merchant
            const response = await getQuickResponseById(input.id);
            if (!response || response.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const { id, isActive, ...data } = input;
            return await updateQuickResponse(id, {
                ...data,
                ...(isActive === undefined ? {} : { isActive: isActive ? 1 : 0 }),
            });
        }),

    // Delete quick response
    delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // IDOR-2 FIX: Verify response belongs to this merchant
            const response = await getQuickResponseById(input.id);
            if (!response || response.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            await deleteQuickResponse(input.id);
            return { success: true };
        }),

    // Get statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const responses = await getQuickResponses(merchant.id);
        return {
            total: responses.length,
            active: responses.filter(r => r.isActive).length,
            inactive: responses.filter(r => !r.isActive).length,
        };
    }),
});

export type QuickResponsesRouter = typeof quickResponsesRouter;
