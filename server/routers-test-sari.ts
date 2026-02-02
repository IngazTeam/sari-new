/**
 * Test Sari Router Module
 * Handles AI playground for testing conversations
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const testSariRouter = router({
    // Send a test message and get AI response
    sendMessage: protectedProcedure
        .input(z.object({
            message: z.string(),
            conversationHistory: z.array(z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string(),
            })).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const { chatWithSari } = await import('./ai/sari-personality');

            const response = await chatWithSari({
                merchantId: merchant.id,
                customerPhone: 'test-playground',
                customerName: 'عميل تجريبي',
                message: input.message,
            });

            return { response };
        }),

    // Reset test conversation
    resetConversation: protectedProcedure.mutation(async () => {
        return { success: true };
    }),

    // Save test message to database
    saveMessage: protectedProcedure
        .input(z.object({
            conversationId: z.number(),
            sender: z.enum(['user', 'sari']),
            content: z.string(),
            responseTime: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
            await db.saveTestMessage(input);
            return { success: true };
        }),

    // Mark conversation as deal
    markAsDeal: protectedProcedure
        .input(z.object({
            conversationId: z.number().optional(),
            dealValue: z.number().positive(),
            messageCount: z.number(),
            timeToConversion: z.number(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const dealId = await db.markTestConversationAsDeal({
                merchantId: merchant.id,
                conversationId: input.conversationId,
                dealValue: input.dealValue,
                messageCount: input.messageCount,
                timeToConversion: input.timeToConversion,
            });

            return { success: true, dealId };
        }),

    // Get all 15 metrics
    getMetrics: protectedProcedure
        .input(z.object({
            period: z.enum(['day', 'week', 'month']).default('day'),
        }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const { calculateAllMetrics } = await import('./metrics');
            const metrics = await calculateAllMetrics(merchant.id, input.period);

            return metrics;
        }),

    // Create test conversation
    createConversation: protectedProcedure
        .mutation(async ({ ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const conversationId = await db.createTestConversation(merchant.id);
            return { conversationId };
        }),
});

export type TestSariRouter = typeof testSariRouter;
