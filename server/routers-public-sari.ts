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
        .mutation(async ({ input }) => {
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

    // Get demo stats (for admin)
    getDemoStats: publicProcedure.query(async () => {
        return await db.getTrySariStats();
    }),
});

export type PublicSariRouter = typeof publicSariRouter;
