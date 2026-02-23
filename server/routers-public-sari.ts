/**
 * Public Sari Router Module
 * Handles public demo AI chat for website visitors
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const publicSariRouter = router({
    // Send a message and get AI response (public, no auth)
    chat: publicProcedure
        .input(z.object({
            message: z.string(),
            sessionId: z.string(),
            exampleUsed: z.string().optional(),
            ipAddress: z.string().optional(),
            userAgent: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            // SECURITY: Rate limit public AI chat to prevent cost abuse
            const { checkRateLimit, TRPC_LIMITS } = await import('./_core/rateLimiter');
            const clientIp = (ctx as any).req?.ip || (ctx as any).req?.socket?.remoteAddress || 'unknown';

            const ipCheck = checkRateLimit(`chat_ip:${clientIp}`, TRPC_LIMITS.CHAT_PER_IP.max, TRPC_LIMITS.CHAT_PER_IP.windowMs);
            if (!ipCheck.allowed) {
                throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'عدد كبير من الرسائل. حاول مرة أخرى بعد قليل.' });
            }

            const sessionCheck = checkRateLimit(`chat_session:${input.sessionId}`, TRPC_LIMITS.CHAT_PER_SESSION.max, TRPC_LIMITS.CHAT_PER_SESSION.windowMs);
            if (!sessionCheck.allowed) {
                throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'وصلت للحد الأقصى من الرسائل في هذه الجلسة. سجل حساب لتجربة كاملة!' });
            }

            const demoMerchant = await db.getMerchantById(1);

            if (!demoMerchant) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Demo merchant not configured' });
            }

            const session = await db.getTrySariAnalyticsBySessionId(input.sessionId);
            if (!session) {
                await db.upsertTrySariAnalytics({
                    sessionId: input.sessionId,
                    messageCount: 1,
                    exampleUsed: input.exampleUsed,
                    ipAddress: input.ipAddress,
                    userAgent: input.userAgent,
                });
            } else {
                await db.incrementTrySariMessageCount(input.sessionId);

                if (input.exampleUsed && !session.exampleUsed) {
                    await db.upsertTrySariAnalytics({
                        sessionId: input.sessionId,
                        exampleUsed: input.exampleUsed,
                    });
                }
            }

            const { chatWithSari } = await import('./ai/sari-personality');

            const response = await chatWithSari({
                merchantId: demoMerchant.id,
                customerPhone: input.sessionId,
                customerName: 'زائر',
                message: input.message,
            });

            return { response };
        }),

    // Track signup prompt shown
    trackSignupPrompt: publicProcedure
        .input(z.object({
            sessionId: z.string(),
        }))
        .mutation(async ({ input }) => {
            await db.markSignupPromptShown(input.sessionId);
            return { success: true };
        }),

    // Track conversion to signup
    trackConversion: publicProcedure
        .input(z.object({
            sessionId: z.string(),
        }))
        .mutation(async ({ input }) => {
            await db.markTrySariConverted(input.sessionId);
            return { success: true };
        }),

    // Get demo stats (admin only — not public)
    getDemoStats: publicProcedure.query(async ({ ctx }) => {
        // Only allow authenticated admin users to see stats
        if (!(ctx as any).user || (ctx as any).user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        return await db.getTrySariStats();
    }),
});

export type PublicSariRouter = typeof publicSariRouter;
