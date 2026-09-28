/**
 * Personality Router Module
 * Handles Sari AI personality settings
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import { getOrCreatePersonalitySettings, updateSariPersonalitySettings } from './db';

export const personalityRouter = router({
    // Get personality settings
    get: merchantProcedure.query(async ({ ctx }) => {
        return await getOrCreatePersonalitySettings(ctx.merchantId);
    }),

    // Update personality settings
    update: permissionProcedure('bot_settings.manage')
        .input(z.object({
            tone: z.enum(['friendly', 'professional', 'casual', 'enthusiastic']).optional(),
            style: z.enum(['saudi_dialect', 'formal_arabic', 'english', 'bilingual']).optional(),
            emojiUsage: z.enum(['none', 'minimal', 'moderate', 'frequent']).optional(),
            // SEC-PENTEST-LOW06: Max length prevents storage abuse
            customInstructions: z.string().max(2000).optional(),
            brandVoice: z.string().max(2000).optional(),
        }).strict())
        .mutation(async ({ ctx, input }) => {
            try { return await updateSariPersonalitySettings(ctx.merchantId, input); }
            catch { throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unable to save personality settings' }); }
        }),
});

export type PersonalityRouter = typeof personalityRouter;
