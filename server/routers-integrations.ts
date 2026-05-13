/**
 * Integrations Router Module
 * Handles platform integrations management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "./db";

export const integrationsRouter = router({
    // Get current connected platform
    getCurrentPlatform: protectedProcedure.query(async ({ ctx }) => {
        const { getCurrentPlatform } = await import('./integrations/platform-checker');
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        return await getCurrentPlatform(merchant.id);
    }),

    // Get all connected platforms (for debugging)
    getAllConnectedPlatforms: protectedProcedure.query(async ({ ctx }) => {
        const { getAllConnectedPlatforms } = await import('./integrations/platform-checker');
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        return await getAllConnectedPlatforms(merchant.id);
    }),
});

export type IntegrationsRouter = typeof integrationsRouter;
