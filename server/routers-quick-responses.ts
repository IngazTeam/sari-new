/**
 * Quick Responses Router Module
 * Handles quick/canned responses management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const quickResponsesRouter = router({
    // List all quick responses
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getQuickResponses(merchant.id);
    }),

    // Create quick response
    create: protectedProcedure
        .input(z.object({
            trigger: z.string().min(1),
            response: z.string().min(1),
            keywords: z.string().optional(),
            priority: z.number().min(1).max(10).optional(),
            category: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await db.createQuickResponse({
                ...input,
                merchantId: merchant.id,
            });
        }),

    // Update quick response
    update: protectedProcedure
        .input(z.object({
            id: z.number(),
            trigger: z.string().min(1).optional(),
            response: z.string().min(1).optional(),
            keywords: z.string().optional(),
            priority: z.number().min(1).max(10).optional(),
            category: z.string().optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const { id, ...data } = input;
            return await db.updateQuickResponse(id, data);
        }),

    // Delete quick response
    delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            await db.deleteQuickResponse(input.id);
            return { success: true };
        }),

    // Get statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const responses = await db.getQuickResponses(merchant.id);
        return {
            total: responses.length,
            active: responses.filter(r => r.isActive).length,
            inactive: responses.filter(r => !r.isActive).length,
        };
    }),
});

export type QuickResponsesRouter = typeof quickResponsesRouter;
