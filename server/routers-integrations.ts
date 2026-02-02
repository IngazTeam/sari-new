/**
 * Integrations Router Module
 * Handles platform integrations management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

export const integrationsRouter = router({
    // Get current connected platform
    getCurrentPlatform: protectedProcedure.query(async ({ ctx }) => {
        const { getCurrentPlatform } = await import('./integrations/platform-checker');
        const merchantId = ctx.user.merchantId || ctx.user.id;
        return await getCurrentPlatform(merchantId);
    }),

    // Get all connected platforms (for debugging)
    getAllConnectedPlatforms: protectedProcedure.query(async ({ ctx }) => {
        const { getAllConnectedPlatforms } = await import('./integrations/platform-checker');
        const merchantId = ctx.user.merchantId || ctx.user.id;
        return await getAllConnectedPlatforms(merchantId);
    }),
});

export type IntegrationsRouter = typeof integrationsRouter;
