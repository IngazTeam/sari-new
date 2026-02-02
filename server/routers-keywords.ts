/**
 * Keywords Router Module
 * Handles keyword analysis
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const keywordsRouter = router({
    // Get keyword statistics
    getStats: protectedProcedure
        .input(z.object({
            category: z.enum(['product', 'price', 'shipping', 'complaint', 'question', 'other']).optional(),
            status: z.enum(['new', 'reviewed', 'response_created', 'ignored']).optional(),
            minFrequency: z.number().optional(),
            limit: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await db.getKeywordStats(merchant.id, input);
        }),

    // Get new keywords that need review
    getNew: protectedProcedure
        .input(z.object({
            limit: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await db.getNewKeywords(merchant.id, input.limit || 20);
        }),

    // Get suggested responses based on frequent questions
    getSuggested: protectedProcedure
        .query(async ({ ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const keywords = await db.getKeywordStats(merchant.id, {
                status: 'new',
                minFrequency: 3,
                limit: 10,
            });

            if (keywords.length === 0) {
                return [];
            }

            const { suggestQuickResponses } = await import('./ai/keyword-analysis');

            const frequentQuestions = keywords.map((k: any) => ({
                question: k.keyword,
                frequency: k.frequency,
                category: k.category,
            }));

            const suggestions = await suggestQuickResponses(frequentQuestions, {
                businessName: merchant.businessName,
            });

            return suggestions;
        }),

    // Update keyword status
    updateStatus: protectedProcedure
        .input(z.object({
            keywordId: z.number(),
            status: z.enum(['new', 'reviewed', 'response_created', 'ignored']),
        }))
        .mutation(async ({ input }) => {
            await db.updateKeywordStatus(input.keywordId, input.status);
            return { success: true };
        }),

    // Delete keyword
    delete: protectedProcedure
        .input(z.object({
            keywordId: z.number(),
        }))
        .mutation(async ({ input }) => {
            await db.deleteKeywordAnalysis(input.keywordId);
            return { success: true };
        }),
});

export type KeywordsRouter = typeof keywordsRouter;
