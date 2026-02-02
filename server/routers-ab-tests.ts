/**
 * A/B Tests Router Module
 * Handles A/B testing experiments
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const abTestsRouter = router({
    // Create new A/B test
    create: protectedProcedure
        .input(z.object({
            testName: z.string(),
            keyword: z.string(),
            variantAText: z.string(),
            variantBText: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const existing = await db.getActiveABTestForKeyword(merchant.id, input.keyword);
            if (existing) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'There is already an active A/B test for this keyword'
                });
            }

            const testId = await db.createABTest({
                merchantId: merchant.id,
                testName: input.testName,
                keyword: input.keyword,
                variantAText: input.variantAText,
                variantBText: input.variantBText,
            });

            return { testId, success: true };
        }),

    // Get all tests
    list: protectedProcedure
        .input(z.object({
            status: z.enum(['running', 'completed', 'paused']).optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await db.getABTests(merchant.id, input.status);
        }),

    // Get specific test
    getById: protectedProcedure
        .input(z.object({
            testId: z.number(),
        }))
        .query(async ({ input }) => {
            return await db.getABTestById(input.testId);
        }),

    // Declare winner
    declareWinner: protectedProcedure
        .input(z.object({
            testId: z.number(),
            winner: z.enum(['variant_a', 'variant_b', 'no_winner']),
        }))
        .mutation(async ({ input }) => {
            const test = await db.getABTestById(input.testId);
            if (!test) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Test not found' });
            }

            const totalA = test.variantAUsageCount;
            const totalB = test.variantBUsageCount;
            const successRateA = totalA > 0 ? (test.variantASuccessCount / totalA) * 100 : 0;
            const successRateB = totalB > 0 ? (test.variantBSuccessCount / totalB) * 100 : 0;
            const difference = Math.abs(successRateA - successRateB);
            const sampleSize = totalA + totalB;

            let confidence = 0;
            if (sampleSize >= 100 && difference >= 10) {
                confidence = 95;
            } else if (sampleSize >= 50 && difference >= 15) {
                confidence = 90;
            } else if (sampleSize >= 30 && difference >= 20) {
                confidence = 80;
            } else {
                confidence = 50;
            }

            await db.declareABTestWinner(input.testId, input.winner, confidence);

            return { success: true, confidence };
        }),

    // Pause test
    pause: protectedProcedure
        .input(z.object({
            testId: z.number(),
        }))
        .mutation(async ({ input }) => {
            await db.pauseABTest(input.testId);
            return { success: true };
        }),

    // Resume test
    resume: protectedProcedure
        .input(z.object({
            testId: z.number(),
        }))
        .mutation(async ({ input }) => {
            await db.resumeABTest(input.testId);
            return { success: true };
        }),
});

export type ABTestsRouter = typeof abTestsRouter;
