/**
 * Weekly Report Router Module
 * Handles weekly report sending
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const weeklyReportRouter = router({
    // Send manual weekly report
    sendManual: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const { sendManualWeeklyReport } = await import('./weeklyReportCron');
            const success = await sendManualWeeklyReport(input.merchantId);

            if (!success) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send weekly report' });
            }

            return { success: true };
        }),
});

export type WeeklyReportRouter = typeof weeklyReportRouter;
