/**
 * Public Sari Router Module
 * Handles public demo AI chat for website visitors
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, adminProcedure, router } from "./_core/trpc";
import {
  getMerchantById,
  getTrySariAnalyticsBySessionId,
  // @ts-ignore
  getTrySariStats,
  markSignupPromptShown,
  // @ts-ignore
  markTrySariConverted,
  releaseTrySariMessageSlot,
  reserveTrySariMessageSlot,
  upsertTrySariAnalytics,
} from './db';

export const publicSariRouter = router({
    // Send a message and get AI response (public, no auth)
    chat: publicProcedure
        .input(z.object({
            message: z.string().trim().min(1).max(1000),
            sessionId: z.string().regex(/^[A-Za-z0-9-]{16,100}$/),
            exampleUsed: z.string().max(500).optional(),
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

            const demoMerchantId = Number(process.env.PUBLIC_DEMO_MERCHANT_ID || 0);
            if (!Number.isInteger(demoMerchantId) || demoMerchantId <= 0) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Public demo is not configured' });
            }
            const demoMerchant = await getMerchantById(demoMerchantId);

            if (!demoMerchant) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Demo merchant not configured' });
            }

            const session = await getTrySariAnalyticsBySessionId(input.sessionId);
            if (!session) {
                const created = await upsertTrySariAnalytics({
                    sessionId: input.sessionId,
                    exampleUsed: input.exampleUsed,
                    ipAddress: clientIp.slice(0, 64),
                    userAgent: String((ctx as any).req?.headers?.['user-agent'] || '').slice(0, 500),
                });
                if (!created && !(await getTrySariAnalyticsBySessionId(input.sessionId))) {
                    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Public demo analytics unavailable' });
                }
            } else if (input.exampleUsed && !session.exampleUsed) {
                await upsertTrySariAnalytics({ sessionId: input.sessionId, exampleUsed: input.exampleUsed });
            }

            if (!(await reserveTrySariMessageSlot(input.sessionId, 5))) {
                throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'وصلت للحد الأقصى من الرسائل في هذه الجلسة. سجل حساب لتجربة كاملة!' });
            }

            try {
                const { chatWithSari } = await import('./ai/sari-personality');
                const response = await chatWithSari({
                    merchantId: demoMerchant.id,
                    customerPhone: input.sessionId,
                    customerName: 'زائر',
                    message: input.message,
                });
                return { response };
            } catch (error) {
                await releaseTrySariMessageSlot(input.sessionId);
                throw error;
            }
        }),

    // Track signup prompt shown — SEC-10 FIX: Rate limited
    trackSignupPrompt: publicProcedure
        .input(z.object({
            sessionId: z.string().max(100),
        }))
        .mutation(async ({ input, ctx }) => {
            const { checkRateLimit } = await import('./_core/rateLimiter');
            const clientIp = (ctx as any).req?.ip || (ctx as any).req?.socket?.remoteAddress || 'unknown';
            const check = checkRateLimit(`track_prompt:${clientIp}`, 30, 60000);
            if (!check.allowed) return { success: true }; // Silent drop
            await markSignupPromptShown(input.sessionId);
            return { success: true };
        }),

    // Track conversion to signup — SEC-10 FIX: Rate limited
    trackConversion: publicProcedure
        .input(z.object({
            sessionId: z.string().max(100),
        }))
        .mutation(async ({ input, ctx }) => {
            const { checkRateLimit } = await import('./_core/rateLimiter');
            const clientIp = (ctx as any).req?.ip || (ctx as any).req?.socket?.remoteAddress || 'unknown';
            const check = checkRateLimit(`track_convert:${clientIp}`, 30, 60000);
            if (!check.allowed) return { success: true }; // Silent drop
            await markTrySariConverted(input.sessionId);
            return { success: true };
        }),

    // Get demo stats — SEC-09 FIX: Use proper adminProcedure
    getDemoStats: adminProcedure.query(async () => {
        return await getTrySariStats();
    }),
});

export type PublicSariRouter = typeof publicSariRouter;
