/**
 * Sentiment Router Module
 * Handles sentiment analysis
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const sentimentRouter = router({
    // Get sentiment statistics
    getStats: protectedProcedure
        .input(z.object({
            days: z.number().min(1).max(365).optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await db.getMerchantSentimentStats(merchant.id, input.days || 30);
        }),

    // Get sentiment distribution
    getDistribution: protectedProcedure
        .input(z.object({
            days: z.number().min(1).max(365).optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const stats = await db.getMerchantSentimentStats(merchant.id, input.days || 30);
            return {
                positive: stats.positive,
                negative: stats.negative,
                neutral: stats.neutral,
                angry: stats.angry,
                happy: stats.happy,
                sad: stats.sad,
                frustrated: stats.frustrated,
            };
        }),
});

export type SentimentRouter = typeof sentimentRouter;
