/**
 * Personality Router Module
 * Handles Sari AI personality settings
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const personalityRouter = router({
    // Get personality settings
    get: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getOrCreatePersonalitySettings(merchant.id);
    }),

    // Update personality settings
    update: protectedProcedure
        .input(z.object({
            tone: z.enum(['friendly', 'professional', 'casual', 'enthusiastic']).optional(),
            style: z.enum(['saudi_dialect', 'formal_arabic', 'english', 'bilingual']).optional(),
            emojiUsage: z.enum(['none', 'minimal', 'moderate', 'frequent']).optional(),
            customInstructions: z.string().optional(),
            brandVoice: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await db.updateSariPersonalitySettings(merchant.id, input);
        }),
});

export type PersonalityRouter = typeof personalityRouter;
