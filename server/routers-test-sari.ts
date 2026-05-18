/**
 * Test Sari Router Module
 * Handles AI playground for testing conversations
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createTestConversation,
  getMerchantByUserId,
  getTestConversationById,
  markTestConversationAsDeal,
  saveTestMessage,
} from './db';

export const testSariRouter = router({
    // Send a test message and get AI response — PEN-NEW-2: Rate limited
    sendMessage: protectedProcedure
        .input(z.object({
            message: z.string().max(2000),
            conversationHistory: z.array(z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string(),
            })).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const { checkRateLimit } = await import('./_core/rateLimiter');
            const rlCheck = checkRateLimit(`test_sari:${ctx.user.id}`, 15, 60000);
            if (!rlCheck.allowed) {
                throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'حاول بعد قليل.' });
            }

            const merchant = await getMerchantByUserId(ctx.user.id);
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

    // Save test message to database — PEN-NEW-1: Tenant isolation enforced
    saveMessage: protectedProcedure
        .input(z.object({
            conversationId: z.number(),
            sender: z.enum(['user', 'sari']),
            content: z.string().max(5000),
            responseTime: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            // PEN-NEW-1 FIX: Verify conversation belongs to this merchant
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            const conversation = await getTestConversationById(input.conversationId);
            if (conversation && conversation.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            await saveTestMessage(input);
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
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const dealId = await markTestConversationAsDeal({
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
            const merchant = await getMerchantByUserId(ctx.user.id);
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
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const conversationId = await createTestConversation(merchant.id);
            return { conversationId };
        }),
});

export type TestSariRouter = typeof testSariRouter;
