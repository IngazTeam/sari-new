/**
 * Google OAuth Settings Router Module
 * Handles Google OAuth configuration (Super Admin only)
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const googleOAuthSettingsRouter = router({
    // Get Google OAuth settings
    get: adminProcedure.query(async () => {
        const settings = await db.getGoogleOAuthSettings();
        return { settings };
    }),

    // Update Google OAuth settings
    update: adminProcedure
        .input(z.object({
            clientId: z.string().min(1),
            clientSecret: z.string().min(1),
            isEnabled: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
            const settings = await db.upsertGoogleOAuthSettings({
                clientId: input.clientId,
                clientSecret: input.clientSecret,
                isEnabled: input.isEnabled ? 1 : 0,
            });

            return { success: true, settings };
        }),

    // Toggle enabled status
    toggleEnabled: adminProcedure
        .input(z.object({ isEnabled: z.boolean() }))
        .mutation(async ({ input }) => {
            const settings = await db.toggleGoogleOAuthEnabled(input.isEnabled);
            return { success: true, settings };
        }),
});

export type GoogleOAuthSettingsRouter = typeof googleOAuthSettingsRouter;
