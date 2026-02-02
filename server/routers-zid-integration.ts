/**
 * Zid Integration Router Module
 * Handles Zid e-commerce platform integration
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 * Note: This re-exports and extends functionalities from integrations/zid
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const zidIntegrationRouter = router({
    // Get Zid connection status
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const integration = await db.getZidIntegration(merchant.id);
        return {
            isConnected: !!integration?.accessToken,
            storeId: integration?.storeId,
            lastSyncAt: integration?.lastSyncAt,
        };
    }),

    // Disconnect Zid
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        await db.deleteZidIntegration(merchant.id);
        return { success: true };
    }),

    // Get sync logs
    getSyncLogs: protectedProcedure
        .input(z.object({ limit: z.number().default(50) }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const { getZidSyncLogs } = await import('./db_zid');
            return await getZidSyncLogs(merchant.id, input.limit);
        }),

    // Get sync stats
    getSyncStats: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const { getZidSyncStats } = await import('./db_zid');
        return await getZidSyncStats(merchant.id);
    }),
});

export type ZidIntegrationRouter = typeof zidIntegrationRouter;
